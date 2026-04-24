import type { CommandContext } from '../commands/index.js';
import { dispatchCommand } from '../commands/index.js';
import { createSession, createOrLoadCurrentSession, appendMessages, type SessionHistory } from '../history/index.js';
import { logDebug } from '../log.js';
import { submitMessage, type ChatMessage } from '../query.js';
import { evaluateSkillRouting, formatSkillRouteAnalysis } from '../skills/index.js';
import { createAppStateStore } from '../state/AppStateStore.js';
import type { AppStateStore } from '../state/AppStateStore.js';

export type QueryEngineDeps = {
  store: AppStateStore;
  exit: () => void;
  initialMessages: ChatMessage[];
  rootDir?: string;
  submitMessageImpl?: typeof submitMessage;
  dispatchCommandImpl?: typeof dispatchCommand;
  evaluateSkillRoutingImpl?: typeof evaluateSkillRouting;
  formatSkillRouteAnalysisImpl?: typeof formatSkillRouteAnalysis;
  logDebugImpl?: typeof logDebug;
};

export type QueryRuntime = {
  store: AppStateStore;
  engine: QueryEngine;
};

function persistTurn(session: SessionHistory, messages: ChatMessage[], rootDir?: string): SessionHistory | null {
  return appendMessages(session.meta.id, messages, { rootDir });
}
//从 QueryEngineDeps 这个对象类型里，移除 store 字段。也就是拿到一个“不包含 store”的 deps 类型
// 然后用一个对象类型 & { store?: AppStateStore } 来表示“可以包含 store”的 deps 类型
export function createQueryRuntime(deps: Omit<QueryEngineDeps, 'store'> & { store?: AppStateStore }): QueryRuntime {
  const initialSession = createOrLoadCurrentSession({
    rootDir: deps.rootDir,
    messages: deps.initialMessages,
  });
  const store = deps.store ?? createAppStateStore(initialSession);
  if (deps.store) {
    deps.store.hydrateSession(initialSession);
  }

  const engine = new QueryEngine({
    ...deps,
    store,
  });

  return { store, engine };
}

export class QueryEngine {
  private readonly store: AppStateStore;
  private readonly exit: () => void;
  private readonly initialMessages: ChatMessage[];
  private readonly rootDir?: string;
  private readonly submitMessageFn: typeof submitMessage;
  private readonly dispatchCommandFn: typeof dispatchCommand;
  private readonly evaluateSkillRoutingFn: typeof evaluateSkillRouting;
  private readonly formatSkillRouteAnalysisFn: typeof formatSkillRouteAnalysis;
  private readonly logDebugFn: typeof logDebug;

  constructor(deps: QueryEngineDeps) {
    this.store = deps.store;
    this.exit = deps.exit;
    this.initialMessages = deps.initialMessages;
    this.rootDir = deps.rootDir;
    this.submitMessageFn = deps.submitMessageImpl ?? submitMessage;
    this.dispatchCommandFn = deps.dispatchCommandImpl ?? dispatchCommand;
    this.evaluateSkillRoutingFn = deps.evaluateSkillRoutingImpl ?? evaluateSkillRouting;
    this.formatSkillRouteAnalysisFn = deps.formatSkillRouteAnalysisImpl ?? formatSkillRouteAnalysis;
    this.logDebugFn = deps.logDebugImpl ?? logDebug;
  }

  async submitInput(input: string): Promise<void> {
    const state = this.store.getSnapshot();
    const trimmed = input.trim();

    if (trimmed.length === 0 || state.isStreaming) {
      this.store.setInputBuffer('');
      return;
    }

    const commandContext: CommandContext = { exit: this.exit };
    const cmdResult = this.dispatchCommandFn(trimmed, commandContext);

    if (cmdResult.kind === 'append_assistant') {
      await this.appendAssistantReply(trimmed, cmdResult.text);
      return;
    }

    if (cmdResult.kind === 'submit_prompt') {
      await this.streamPrompt(cmdResult.text);
      return;
    }

    if (cmdResult.kind === 'reset_messages') {
      this.resetConversation();
      return;
    }

    if (cmdResult.kind === 'exit') {
      this.exit();
      return;
    }

    const routeDecision = this.evaluateSkillRoutingFn(trimmed);
    this.logDebugFn(this.formatSkillRouteAnalysisFn(routeDecision));
    if (routeDecision.routed && routeDecision.prompt) {
      await this.streamPrompt(routeDecision.prompt);
      return;
    }

    await this.streamPrompt(trimmed);
  }

  private resetConversation(): void {
    const freshSession = createSession({
      rootDir: this.rootDir,
      messages: this.initialMessages,
    });
    this.store.hydrateSession(freshSession);
  }

  private async appendAssistantReply(userText: string, assistantText: string): Promise<void> {
    const state = this.store.getSnapshot();
    const userMessage: ChatMessage = { role: 'user', text: userText };
    const assistantMessage: ChatMessage = { role: 'assistant', text: assistantText };
    const nextMessages = [...state.messages, userMessage, assistantMessage];
    this.store.setMessages(nextMessages);
    this.store.setInputBuffer('');
    this.store.setLastError(null);

    const persisted = persistTurn(state.session, [userMessage, assistantMessage], this.rootDir);
    if (persisted) {
      this.store.hydrateSession(persisted);
    }
  }

  private async streamPrompt(prompt: string): Promise<void> {
    const state = this.store.getSnapshot();
    const userMessage: ChatMessage = { role: 'user', text: prompt };
    const historyForQuery = [...state.messages, userMessage];
    let assistantText = '';

    this.store.setMessages([...historyForQuery, { role: 'assistant', text: '' }]);
    this.store.setInputBuffer('');
    this.store.setIsStreaming(true);
    this.store.setLastError(null);

    try {
      for await (const deltaText of this.submitMessageFn(historyForQuery)) {
        assistantText += deltaText;
        this.store.setMessages([...historyForQuery, { role: 'assistant', text: assistantText }]);
      }

      if (assistantText.length === 0) {
        assistantText = '(no text response)';
      }

      const assistantMessage: ChatMessage = { role: 'assistant', text: assistantText };
      const nextMessages = [...historyForQuery, assistantMessage];
      this.store.setMessages(nextMessages);

      const persisted = persistTurn(state.session, [userMessage, assistantMessage], this.rootDir);
      if (persisted) {
        this.store.hydrateSession(persisted);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logDebugFn(`submitMessage failed: ${errorMessage}`);
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        text: `Error: ${errorMessage}`,
      };
      const nextMessages = [...historyForQuery, assistantMessage];
      this.store.setMessages(nextMessages);

      const persisted = persistTurn(state.session, [userMessage, assistantMessage], this.rootDir);
      if (persisted) {
        this.store.hydrateSession(persisted);
      }
      this.store.setLastError(errorMessage);
    } finally {
      this.store.setIsStreaming(false);
    }
  }
}
