/**
 * Per-chat-session event hub. Bridges the agent loop running inside the
 * `/api/agent/chat` SSE handler with anyone who needs to observe its events
 * after the original SSE socket has gone away — most importantly the
 * `/api/agent/question/:callId/reply` handler, which has to deliver the
 * question's `tool_result` and the agent's continuation back to the client
 * after the user clicks an answer.
 *
 * Design choices:
 *   - The hub is fire-and-forget: emit() does nothing if no one is subscribed.
 *     This keeps the agent loop unaware of who (if anyone) is listening.
 *   - At most one subscriber is expected at a time — the live /chat handler
 *     writes events to its own socket directly; only the /reply (or /reject)
 *     handler subscribes for the takeover case. The frontend aborts the live
 *     /chat fetch before opening /reply so events aren't double-delivered.
 *   - terminate() lets the agent stream signal "loop is done"; subscribers
 *     waiting on `waitForTermination()` resolve and close their SSE response.
 */

export type HubEvent = Record<string, any> & { type: string };

export class SessionEventHub {
  private subscribers = new Set<(event: HubEvent) => void>();
  private terminated = false;
  private terminationListeners: (() => void)[] = [];

  emit(event: HubEvent): void {
    if (this.terminated) return;
    for (const fn of this.subscribers) {
      try {
        fn(event);
      } catch (err) {
        // A bad subscriber must not break the agent loop.
        // eslint-disable-next-line no-console
        console.error("[SessionEventHub] subscriber threw:", err);
      }
    }
  }

  subscribe(fn: (event: HubEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    const listeners = this.terminationListeners;
    this.terminationListeners = [];
    for (const fn of listeners) {
      try {
        fn();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[SessionEventHub] termination listener threw:", err);
      }
    }
  }

  isTerminated(): boolean {
    return this.terminated;
  }

  waitForTermination(): Promise<void> {
    if (this.terminated) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.terminationListeners.push(resolve);
    });
  }
}

const hubs = new Map<string, SessionEventHub>();

export function getOrCreateSessionHub(sessionId: string): SessionEventHub {
  let hub = hubs.get(sessionId);
  if (!hub) {
    hub = new SessionEventHub();
    hubs.set(sessionId, hub);
  }
  return hub;
}

export function getSessionHub(sessionId: string): SessionEventHub | undefined {
  return hubs.get(sessionId);
}

export function deleteSessionHub(sessionId: string): void {
  const hub = hubs.get(sessionId);
  if (!hub) return;
  hub.terminate();
  hubs.delete(sessionId);
}
