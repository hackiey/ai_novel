import { createContext } from "react";

/**
 * Hooks the QuestionCard uses to resolve a pending `question` tool call. The
 * provider lives in AgentChatPanel — when the user clicks an answer the panel
 * aborts whatever stream is currently feeding this session, POSTs the answer
 * to the server, and consumes the SSE response so the agent's continuation
 * (the question's tool_result + the next assistant turn) flows back into the
 * conversation view.
 */
export interface QuestionActionContextValue {
  submitAnswers: (callId: string, answers: string[][]) => Promise<void>;
  rejectQuestion: (callId: string) => Promise<void>;
}

export const QuestionActionContext = createContext<QuestionActionContextValue | null>(null);
