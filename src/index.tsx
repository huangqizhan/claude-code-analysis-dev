import React, { useMemo, useState } from 'react';
import { Box, Text, render, useApp, useInput } from 'ink';
import { getDefaultLogPath, logDebug } from './log.js';
import { DEFAULT_MODEL, submitMessage, type ChatMessage } from './query.js';
import { dispatchCommand, type CommandContext } from './commands/index.js';
import { evaluateSkillRouting, formatSkillRouteAnalysis } from './skills/index.js';

const SYSTEM_PROMPT =
  'You are a concise coding assistant in a terminal CLI. Give short, practical answers.';
const WELCOME_TEXT =
  'mini-claude-cli V3 ready. Type a prompt to query Claude, /help for commands, q to exit.';

function App(): React.JSX.Element {
  const { exit } = useApp();
  const [inputBuffer, setInputBuffer] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'system', text: SYSTEM_PROMPT },
    { role: 'assistant', text: WELCOME_TEXT },
  ]);

  const messageCount = messages.length;

  // Command context for dispatcher
  const commandContext: CommandContext = { exit };

  const streamPrompt = async (prompt: string): Promise<void> => {
    const userMessage: ChatMessage = { role: 'user', text: prompt };
    const historyForQuery = [...messages, userMessage];
    let assistantText = '';

    setMessages([...historyForQuery, { role: 'assistant', text: '' }]);
    setInputBuffer('');
    setIsStreaming(true);

    try {
      //流式输出
      for await (const deltaText of submitMessage(historyForQuery)) {
        assistantText += deltaText;
        setMessages([...historyForQuery, { role: 'assistant', text: assistantText }]);
      }

      if (assistantText.length === 0) {
        assistantText = '(no text response)';
        setMessages([...historyForQuery, { role: 'assistant', text: assistantText }]);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logDebug(`submitMessage failed: ${errorMessage}`);
      setMessages([
        ...historyForQuery,
        {
          role: 'assistant',
          text: `Error: ${errorMessage}`,
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSubmit = async (input: string): Promise<void> => {
    const trimmed = input.trim();
    if (trimmed.length === 0 || isStreaming) {
      setInputBuffer('');
      return;
    }

    const cmdResult = dispatchCommand(trimmed, commandContext);
    if (cmdResult.kind === 'append_assistant') {
      setMessages((prev) => [
        ...prev,
        { role: 'user', text: trimmed },
        { role: 'assistant', text: cmdResult.text },
      ]);
      setInputBuffer('');
      return;
    }
    if (cmdResult.kind === 'submit_prompt') {
      await streamPrompt(cmdResult.text);
      return;
    }
    if (cmdResult.kind === 'reset_messages') {
      setMessages([
        { role: 'system', text: SYSTEM_PROMPT },
        { role: 'assistant', text: WELCOME_TEXT },
      ]);
      setInputBuffer('');
      return;
    }
    if (cmdResult.kind === 'exit') {
      exit();
      return;
    }

    const routeDecision = evaluateSkillRouting(trimmed);
    logDebug(formatSkillRouteAnalysis(routeDecision));
    if (routeDecision.routed && routeDecision.prompt) {
      await streamPrompt(routeDecision.prompt);
      return;
    }

    await streamPrompt(trimmed);
  };

  useInput((input, key) => {
    logDebug(`input=${JSON.stringify(input)} key=${JSON.stringify(key)} streaming=${isStreaming}`);

    if ((input === 'q' || input === 'Q') && inputBuffer.length === 0 && !isStreaming) {
      logDebug('exit requested with q shortcut');
      exit();
      return;
    }

    if (key.return) {
      void handleSubmit(inputBuffer);
      return;
    }

    if (key.backspace || key.delete) {
      if (isStreaming) {
        return;
      }
      setInputBuffer((prev) => prev.slice(0, -1));
      return;
    }

    if (input.length > 0 && !key.ctrl && !key.meta && !isStreaming) {
      setInputBuffer((prev) => prev + input);
    }
  });

  const visibleMessages = useMemo(
    () => messages.filter((message) => message.role !== 'system').slice(-14),
    [messages],
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        mini-claude-cli (M1 streaming baseline)
      </Text>
      <Text dimColor>Model: {DEFAULT_MODEL}</Text>
      <Text dimColor>Log (UI + LLM): {getDefaultLogPath()}</Text>
      <Text dimColor>
        Total messages: {messageCount} {isStreaming ? ' | streaming...' : ''}
      </Text>

      <Box
        flexDirection="column"
        marginTop={1}
        borderStyle="round"
        borderColor="gray"
        paddingX={1}>
        {visibleMessages.map((message, index) => {
          const prefix = message.role === 'user' ? 'you' : 'bot';
          const color = message.role === 'user' ? 'green' : 'yellow';

          return (
            <Text key={`${message.role}-${index}`} color={color}>
              {prefix}&gt; {message.text}
            </Text>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text color="magenta">&gt; </Text>
        <Text>{inputBuffer}</Text>
      </Box>

      <Text dimColor>
        [Enter] submit  [Backspace] delete  [q] quit(on empty input) {isStreaming ? '| input locked while streaming' : ''}
      </Text>
    </Box>
  );
}

render(<App />);
