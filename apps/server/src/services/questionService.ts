import { QuestionManager } from "@ai-creator/agent";

let _instance: QuestionManager | null = null;

/**
 * Returns the per-process QuestionManager singleton. The manager holds pending
 * `question` tool invocations across all live agent sessions, keyed by the
 * pi-agent-core toolCallId, until the corresponding client POSTs an answer.
 */
export function getQuestionManager(): QuestionManager {
  if (!_instance) _instance = new QuestionManager();
  return _instance;
}
