import { useContext, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Check, X } from "lucide-react";
import { getToken } from "../lib/auth.js";
import { QuestionActionContext } from "./QuestionActionContext.js";

const API_BASE = "";

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

export default function QuestionCard({
  callId,
  sessionId,
  questions,
  pending,
  immersive,
}: {
  callId: string;
  sessionId: string;
  questions: QuestionInfo[];
  /** True while the agent is still blocked on this tool call. Once a
   * tool_result arrives, the parent flips this to false and the card freezes. */
  pending: boolean;
  immersive?: boolean;
}) {
  const { t } = useTranslation();
  const actionCtx = useContext(QuestionActionContext);
  const initial = useMemo(() => questions.map(() => new Set<string>()), [questions]);
  const [selections, setSelections] = useState<Set<string>[]>(initial);
  const [submitting, setSubmitting] = useState<"reply" | "reject" | null>(null);
  const [submitted, setSubmitted] = useState<"replied" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const interactive = pending && !submitted;

  const toggle = (qIdx: number, label: string, multi: boolean) => {
    setSelections((prev) => {
      const next = prev.map((s) => new Set(s));
      const cur = next[qIdx];
      if (multi) {
        if (cur.has(label)) cur.delete(label); else cur.add(label);
      } else {
        next[qIdx] = cur.has(label) ? new Set() : new Set([label]);
      }
      return next;
    });
  };

  const allAnswered = selections.every((s) => s.size > 0);

  const post = async (path: string, body: unknown) => {
    const token = getToken();
    return fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  };

  const handleSubmit = async () => {
    if (!interactive || !allAnswered) return;
    setSubmitting("reply");
    setError(null);
    try {
      const answers: string[][] = selections.map((s) => Array.from(s));
      if (actionCtx) {
        await actionCtx.submitAnswers(callId, answers);
      } else {
        const res = await post(`/api/agent/question/${encodeURIComponent(callId)}/reply`, {
          sessionId,
          answers,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
      }
      setSubmitted("replied");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(null);
    }
  };

  const handleReject = async () => {
    if (!interactive) return;
    setSubmitting("reject");
    setError(null);
    try {
      if (actionCtx) {
        await actionCtx.rejectQuestion(callId);
      } else {
        const res = await post(`/api/agent/question/${encodeURIComponent(callId)}/reject`, {
          sessionId,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
      }
      setSubmitted("rejected");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(null);
    }
  };

  const baseCardClass = immersive
    ? "rounded-xl border border-teal-300/30 bg-teal-300/5 backdrop-blur-sm"
    : "rounded-xl border border-teal-200 bg-teal-50/40";

  const headerChipClass = immersive
    ? "inline-block px-2 py-0.5 rounded-full bg-teal-300/20 text-teal-200 text-[10px] font-medium uppercase tracking-wider"
    : "inline-block px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-medium uppercase tracking-wider";

  const questionTextClass = immersive ? "text-white/90" : "text-gray-800";
  const descClass = immersive ? "text-white/50" : "text-gray-500";

  const optionBase = "w-full text-left px-3 py-2 rounded-md border transition-colors text-sm flex items-start gap-2";
  const optionUnselected = immersive
    ? "border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50";
  const optionSelected = immersive
    ? "border-teal-300 bg-teal-300/15 text-white"
    : "border-teal-500 bg-teal-50 text-teal-900";
  const optionDisabled = "opacity-60 cursor-not-allowed";

  return (
    <div className={`${baseCardClass} p-3 space-y-3`}>
      {questions.map((q, qIdx) => {
        const multi = !!q.multiple;
        const selected = selections[qIdx];
        return (
          <div key={qIdx} className="space-y-2">
            <div className="space-y-1">
              {q.header && <span className={headerChipClass}>{q.header}</span>}
              <div className={`text-sm font-medium ${questionTextClass}`}>{q.question}</div>
            </div>
            <div className="space-y-1.5">
              {q.options.map((opt, oIdx) => {
                const isSelected = selected.has(opt.label);
                return (
                  <button
                    key={oIdx}
                    type="button"
                    disabled={!interactive}
                    onClick={() => toggle(qIdx, opt.label, multi)}
                    className={`${optionBase} ${isSelected ? optionSelected : optionUnselected} ${!interactive ? optionDisabled : ""}`}
                  >
                    <span className="mt-0.5 shrink-0 w-4 h-4 inline-flex items-center justify-center">
                      {multi ? (
                        <span className={`w-3.5 h-3.5 rounded-sm border ${isSelected ? "border-current bg-current/20" : immersive ? "border-white/40" : "border-gray-400"}`}>
                          {isSelected && <Check className="w-3 h-3" />}
                        </span>
                      ) : (
                        <span className={`w-3.5 h-3.5 rounded-full border ${isSelected ? "border-current" : immersive ? "border-white/40" : "border-gray-400"} flex items-center justify-center`}>
                          {isSelected && <span className="w-2 h-2 rounded-full bg-current" />}
                        </span>
                      )}
                    </span>
                    <span className="flex-1 leading-relaxed">
                      <span className="font-medium">{opt.label}</span>
                      {opt.description && (
                        <span className={`ml-1 text-xs ${descClass}`}>— {opt.description}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {error && (
        <div className="text-xs text-red-500">{error}</div>
      )}

      <div className="flex items-center gap-2 pt-1">
        {!submitted && (
          <>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!interactive || !allAnswered || submitting !== null}
              className={`px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 ${
                interactive && allAnswered
                  ? "bg-teal-600 text-white hover:bg-teal-700"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              {submitting === "reply" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              {t("question.submit", "提交")}
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={!interactive || submitting !== null}
              className={`px-3 py-1.5 rounded-md text-xs inline-flex items-center gap-1.5 ${
                immersive
                  ? "text-white/60 hover:text-white/90 hover:bg-white/10"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              } ${!interactive ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {submitting === "reject" ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
              {t("question.skip", "跳过")}
            </button>
          </>
        )}
        {submitted === "replied" && (
          <span className={`text-xs inline-flex items-center gap-1 ${immersive ? "text-teal-300" : "text-teal-600"}`}>
            <Check className="w-3 h-3" />
            {t("question.replied", "已回答")}
          </span>
        )}
        {submitted === "rejected" && (
          <span className={`text-xs inline-flex items-center gap-1 ${immersive ? "text-white/40" : "text-gray-400"}`}>
            <X className="w-3 h-3" />
            {t("question.rejected", "已跳过")}
          </span>
        )}
        {!interactive && !submitted && (
          <span className={`text-xs ${immersive ? "text-white/40" : "text-gray-400"}`}>
            {t("question.expired", "问题已结束")}
          </span>
        )}
      </div>
    </div>
  );
}
