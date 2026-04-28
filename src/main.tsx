import React, { useMemo, useSyncExternalStore } from 'react';
import { Box, Text, render, useApp, useInput } from 'ink';
import { getDefaultLogPath, logDebug } from './log.js';
import { DEFAULT_MODEL } from './query.js';
import { readRuntimeConfig } from './querylib/auth.js';
import { dispatchCommand } from './commands/index.js';
import { evaluateSkillRouting, formatSkillRouteAnalysis } from './skills/index.js';
import { createQueryRuntime } from './runtime/QueryEngine.js';
import type { ChatMessage } from './query.js';

const SYSTEM_PROMPT =
  'You are a concise coding assistant in a terminal CLI. Give short, practical answers.';
const WELCOME_TEXT =
  'mini-claude-cli V3 ready. Type a prompt to query Claude, /help for commands, q to exit.';
const INITIAL_MESSAGES: ChatMessage[] = [
  { role: 'system', text: SYSTEM_PROMPT },
  { role: 'assistant', text: WELCOME_TEXT },
];

function App(): React.JSX.Element {
  const { exit } = useApp();
  const configuredModel = useMemo(() => readRuntimeConfig().model ?? null, []);
  const runtime = useMemo( () =>
      createQueryRuntime({
        exit,
        initialMessages: INITIAL_MESSAGES,
        dispatchCommandImpl: dispatchCommand,
        evaluateSkillRoutingImpl: evaluateSkillRouting,
        formatSkillRouteAnalysisImpl: formatSkillRouteAnalysis,
        logDebugImpl: logDebug,
      }),
    [exit],
  );

  const state = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.getSnapshot,
    runtime.store.getSnapshot,
  );

  useInput((input, key) => {
    logDebug(`input=${JSON.stringify(input)} key=${JSON.stringify(key)} streaming=${state.isStreaming}`);

    if ((input === 'q' || input === 'Q') && state.inputBuffer.length === 0 && !state.isStreaming) {
      logDebug('exit requested with q shortcut');
      exit();
      return;
    }

    if (key.return) {
      void runtime.engine.submitInput(state.inputBuffer);
      return;
    }

    if (key.backspace || key.delete) {
      if (state.isStreaming) {
        return;
      }
      runtime.store.setInputBuffer(state.inputBuffer.slice(0, -1));
      return;
    }

    if (input.length > 0 && !key.ctrl && !key.meta && !state.isStreaming) {
      runtime.store.setInputBuffer(state.inputBuffer + input);
    }
  });
//使用 useMemo 缓存 visibleMessages 的计算结果，避免重复计算。
//只要 state.messages 不变，visibleMessages 的计算结果就不会变，就不会重新计算。
//只要 state.messages 变了，visibleMessages 的计算结果就会变，就会重新计算。
  const visibleMessages = useMemo(
    () => state.messages.filter((message) => message.role !== 'system').slice(-14),
    [state.messages],
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        mini-claude-cli (V10 history persistence)
      </Text>
      <Text dimColor>Model: {configuredModel ?? DEFAULT_MODEL}</Text>
      <Text dimColor>Session: {state.session.meta.id}</Text>
      <Text dimColor>Log (UI + LLM): {getDefaultLogPath()}</Text>
      <Text dimColor>
        Total messages: {state.messages.length} {state.isStreaming ? ' | streaming...' : ''}
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
        <Text>{state.inputBuffer}</Text>
      </Box>

      <Text dimColor>
        [Enter] submit  [Backspace] delete  [q] quit(on empty input) {state.isStreaming ? '| input locked while streaming' : ''}
      </Text>
    </Box>
  );
}

export function main(): void {
  render(<App />);
}
