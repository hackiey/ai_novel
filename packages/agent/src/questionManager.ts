/**
 * QuestionManager — per-process registry of pending `question` tool calls.
 *
 * The `question` tool blocks on `ask()` (returns a Promise) until either:
 *   1) the client POSTs an answer to /api/agent/question/:callId/reply
 *   2) the client POSTs a rejection
 *   3) the SSE stream dies and the route handler calls `cancelAllForSession()`
 *
 * The pending entry is keyed by the pi-agent-core `toolCallId`, which the SSE
 * stream forwards to the client so it can correlate its reply with the right
 * waiting tool execution.
 */

export interface QuestionOption {
  label: string;
  description: string;
}

export interface QuestionInfo {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
}

export interface QuestionRequest {
  questions: QuestionInfo[];
}

export type Answer = string[];

export interface PendingQuestion {
  callId: string;
  sessionId: string;
  info: QuestionRequest;
  createdAt: number;
}

export class QuestionRejectedError extends Error {
  constructor(message = "The user dismissed this question") {
    super(message);
    this.name = "QuestionRejectedError";
  }
}

interface PendingEntry {
  sessionId: string;
  info: QuestionRequest;
  createdAt: number;
  resolve: (answers: Answer[]) => void;
  reject: (err: Error) => void;
}

/** Default ceiling on how long a single question may stay pending in memory. */
export const DEFAULT_QUESTION_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export class QuestionManager {
  private pending = new Map<string, PendingEntry>();

  ask(
    callId: string,
    sessionId: string,
    info: QuestionRequest,
    timeoutMs: number = DEFAULT_QUESTION_TIMEOUT_MS,
  ): Promise<Answer[]> {
    if (this.pending.has(callId)) {
      return Promise.reject(new Error(`Question already pending for callId=${callId}`));
    }
    return new Promise<Answer[]>((resolve, reject) => {
      // Bound the in-memory wait so an unanswered question doesn't pin a
      // resolver forever (server restarts / quiet leaks). On timeout the entry
      // self-rejects with QuestionRejectedError so the tool returns gracefully
      // and the agent loop can continue.
      const timer = setTimeout(() => {
        const entry = this.pending.get(callId);
        if (!entry) return;
        this.pending.delete(callId);
        entry.reject(new QuestionRejectedError(
          `Question timed out after ${Math.round(timeoutMs / 3600000)}h without an answer`,
        ));
      }, timeoutMs);
      // Allow Node to exit if this is the only thing still scheduled.
      if (typeof (timer as any)?.unref === "function") (timer as any).unref();

      this.pending.set(callId, {
        sessionId,
        info,
        createdAt: Date.now(),
        resolve: (a) => { clearTimeout(timer); resolve(a); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
    });
  }

  /**
   * Resolve a pending question. Returns false when no entry is found, when the
   * sessionId guard fails, or when answers cannot be coerced to the expected
   * shape.
   */
  reply(callId: string, answers: Answer[], sessionId?: string): boolean {
    const entry = this.pending.get(callId);
    if (!entry) return false;
    if (sessionId && entry.sessionId !== sessionId) return false;
    this.pending.delete(callId);
    entry.resolve(answers);
    return true;
  }

  reject(callId: string, sessionId?: string): boolean {
    const entry = this.pending.get(callId);
    if (!entry) return false;
    if (sessionId && entry.sessionId !== sessionId) return false;
    this.pending.delete(callId);
    entry.reject(new QuestionRejectedError());
    return true;
  }

  list(sessionId?: string): PendingQuestion[] {
    const out: PendingQuestion[] = [];
    for (const [callId, entry] of this.pending.entries()) {
      if (sessionId && entry.sessionId !== sessionId) continue;
      out.push({ callId, sessionId: entry.sessionId, info: entry.info, createdAt: entry.createdAt });
    }
    return out;
  }

  cancelAllForSession(sessionId: string): number {
    let cancelled = 0;
    for (const [callId, entry] of Array.from(this.pending.entries())) {
      if (entry.sessionId !== sessionId) continue;
      this.pending.delete(callId);
      entry.reject(new QuestionRejectedError("Session ended before user answered"));
      cancelled++;
    }
    return cancelled;
  }
}
