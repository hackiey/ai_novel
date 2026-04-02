import { randomUUID } from "crypto";
import { ObjectId, type Db } from "mongodb";
import { computeChapterSynopsisSourceHash, generateChapterSynopsis, type ChapterSynopsisModelConfig } from "@ai-creator/agent";

const CHAPTER_SYNOPSIS_SCAN_INTERVAL_MS = 60 * 60 * 1000;
const CHAPTER_SYNOPSIS_LOCK_TTL_MS = 30 * 60 * 1000;
const CHAPTER_SYNOPSIS_MIN_CJK_CHARS = 200;
const CHAPTER_SYNOPSIS_MIN_WORDS = 200;
const CHAPTER_SYNOPSIS_RECENT_CONTEXT_BUDGET = 50_000;
const VALID_REASONING = ["minimal", "low", "medium", "high", "xhigh"] as const;

type ReasoningLevel = typeof VALID_REASONING[number];
type ProcessOutcome =
  | "skipped_unchanged"
  | "skipped_empty"
  | "skipped_short"
  | "skipped_claim"
  | "skipped_blocked"
  | "processed"
  | "failed"
  | "discarded_stale";
type SynopsisStatus = "pending" | "processing" | "ready" | "error";

interface ChapterSynopsisDoc {
  _id: ObjectId;
  projectId: ObjectId;
  order: number;
  title?: string;
  content?: string;
  synopsis?: string;
  synopsisSourceHash?: string;
  synopsisStatus?: SynopsisStatus;
}

interface ProcessResult {
  outcome: ProcessOutcome;
  chapter: ChapterSynopsisDoc;
  readyForDependents: boolean;
}

function detectContentLocale(text: string): "zh" | "en" {
  const nonWhitespace = text.replace(/\s/g, "");
  if (!nonWhitespace) return "zh";
  const cjkChars = nonWhitespace.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g);
  return (cjkChars?.length ?? 0) / nonWhitespace.length > 0.2 ? "zh" : "en";
}

function countCjkCharacters(text: string): number {
  return text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g)?.length ?? 0;
}

function countEnglishWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countSynopsisContextUnits(text: string): number {
  return detectContentLocale(text) === "zh" ? countCjkCharacters(text) : countEnglishWords(text);
}

function getShortContentMetric(text: string): { locale: "zh" | "en"; count: number; min: number } {
  const locale = detectContentLocale(text);
  if (locale === "zh") {
    return { locale, count: countCjkCharacters(text), min: CHAPTER_SYNOPSIS_MIN_CJK_CHARS };
  }
  return { locale, count: countEnglishWords(text), min: CHAPTER_SYNOPSIS_MIN_WORDS };
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getHistoricalSynopsisText(chapter: ChapterSynopsisDoc): string {
  const synopsis = normalizeText(chapter.synopsis).trim();
  if (synopsis) return synopsis;
  return normalizeText(chapter.content).trim().slice(0, 2000);
}

function buildChapterHistoryContext(previousChapters: ChapterSynopsisDoc[]) {
  let recentUnits = 0;
  let recentStartIndex = previousChapters.length;

  for (let i = previousChapters.length - 1; i >= 0; i -= 1) {
    recentUnits += countSynopsisContextUnits(normalizeText(previousChapters[i].content));
    recentStartIndex = i;
    if (recentUnits >= CHAPTER_SYNOPSIS_RECENT_CONTEXT_BUDGET) break;
  }

  const historicalChapters = previousChapters
    .slice(0, recentStartIndex)
    .flatMap((chapter) => {
      const synopsis = getHistoricalSynopsisText(chapter);
      if (!synopsis) return [];
      return [{
        order: chapter.order,
        title: normalizeText(chapter.title) || undefined,
        synopsis,
      }];
    });

  const recentChapters = previousChapters
    .slice(recentStartIndex)
    .flatMap((chapter) => {
      const content = normalizeText(chapter.content).trim();
      if (!content) return [];
      return [{
        order: chapter.order,
        title: normalizeText(chapter.title) || undefined,
        content,
      }];
    });

  return { historicalChapters, recentChapters };
}

function buildReadySynopsisUpdate(sourceHash: string, synopsis: string) {
  return {
    $set: {
      synopsis,
      synopsisSourceHash: sourceHash,
      synopsisStatus: "ready" as const,
      synopsisUpdatedAt: new Date(),
    },
    $unset: {
      synopsisError: "",
      synopsisJobLockedAt: "",
      synopsisJobToken: "",
    },
  };
}

function parseModelSpec(spec: string): { provider: string; modelId: string; reasoning?: ReasoningLevel } {
  const idx = spec.indexOf(":");
  const provider = idx === -1 ? "anthropic" : spec.slice(0, idx);
  const rest = idx === -1 ? spec : spec.slice(idx + 1);
  const slashIdx = rest.lastIndexOf("/");

  if (slashIdx !== -1) {
    const maybeReasoning = rest.slice(slashIdx + 1);
    if (VALID_REASONING.includes(maybeReasoning as ReasoningLevel)) {
      return {
        provider,
        modelId: rest.slice(0, slashIdx),
        reasoning: maybeReasoning as ReasoningLevel,
      };
    }
  }

  return { provider, modelId: rest };
}

function resolveModelConfig(): ChapterSynopsisModelConfig | null {
  const spec = process.env.CHAPTER_SYNOPSIS_MODEL || process.env.DEFAULT_MODEL || "openai:gpt-4o";
  const { provider, modelId, reasoning: specReasoning } = parseModelSpec(spec);
  const providerEnvPrefix = provider.toUpperCase().replace(/-/g, "_");
  const apiKey = process.env[`${providerEnvPrefix}_API_KEY`] || process.env.LLM_API_KEY || "";
  if (!apiKey) {
    return null;
  }

  const defaultReasoningRaw = process.env.DEFAULT_REASONING;
  const defaultReasoning = defaultReasoningRaw && VALID_REASONING.includes(defaultReasoningRaw as ReasoningLevel)
    ? (defaultReasoningRaw as ReasoningLevel)
    : undefined;

  return {
    apiKey,
    provider,
    modelId,
    baseURL: process.env[`${providerEnvPrefix}_BASE_URL`] || undefined,
    reasoning: specReasoning ?? defaultReasoning,
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export class ChapterSynopsisService {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly db: Db) {}

  start(): void {
    if (this.timer) return;

    const modelConfig = resolveModelConfig();
    if (!modelConfig) {
      console.log("[ChapterSynopsis] No API key configured, scheduler disabled");
      return;
    }

    console.log(`[ChapterSynopsis] Scheduler started, interval=${CHAPTER_SYNOPSIS_SCAN_INTERVAL_MS}ms, model=${modelConfig.provider}:${modelConfig.modelId}`);
    void this.runOnce();
    this.timer = setInterval(() => {
      void this.runOnce();
    }, CHAPTER_SYNOPSIS_SCAN_INTERVAL_MS);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async runOnce(): Promise<void> {
    if (this.running) {
      console.log("[ChapterSynopsis] Previous run still active, skipping");
      return;
    }

    const modelConfig = resolveModelConfig();
    if (!modelConfig) {
      console.log("[ChapterSynopsis] No API key configured, skipping run");
      return;
    }

    this.running = true;
    const startedAt = Date.now();
    const stats = {
      scanned: 0,
      skipped_unchanged: 0,
      skipped_empty: 0,
      skipped_short: 0,
      skipped_claim: 0,
      skipped_blocked: 0,
      processed: 0,
      failed: 0,
      discarded_stale: 0,
    } as Record<ProcessOutcome | "scanned", number>;

    try {
      const cursor = this.db.collection("chapters").find(
        {},
        {
          projection: {
            _id: 1,
            projectId: 1,
            order: 1,
            title: 1,
            content: 1,
            synopsis: 1,
            synopsisSourceHash: 1,
            synopsisStatus: 1,
          },
          sort: {
            projectId: 1,
            order: 1,
            _id: 1,
          },
        },
      );

      let currentProjectId: string | undefined;
      let projectChapters: ChapterSynopsisDoc[] = [];

      for await (const chapter of cursor as AsyncIterable<ChapterSynopsisDoc>) {
        const projectId = chapter.projectId.toHexString();
        if (currentProjectId && projectId !== currentProjectId) {
          await this.processProjectChapters(projectChapters, modelConfig, stats);
          projectChapters = [];
        }
        currentProjectId = projectId;
        projectChapters.push(chapter);
      }

      if (projectChapters.length > 0) {
        await this.processProjectChapters(projectChapters, modelConfig, stats);
      }
    } catch (error) {
      console.error("[ChapterSynopsis] Scan failed:", error);
    } finally {
      this.running = false;
      console.log(
        `[ChapterSynopsis] Run finished in ${Date.now() - startedAt}ms: scanned=${stats.scanned}, processed=${stats.processed}, unchanged=${stats.skipped_unchanged}, empty=${stats.skipped_empty}, short=${stats.skipped_short}, claimed_by_other=${stats.skipped_claim}, blocked_by_previous=${stats.skipped_blocked}, stale=${stats.discarded_stale}, failed=${stats.failed}`,
      );
    }
  }

  private async processProjectChapters(
    chapters: ChapterSynopsisDoc[],
    modelConfig: ChapterSynopsisModelConfig,
    stats: Record<ProcessOutcome | "scanned", number>,
  ): Promise<void> {
    const processedChapters: ChapterSynopsisDoc[] = [];
    let blocked = false;

    for (const chapter of chapters) {
      stats.scanned += 1;

      if (blocked) {
        stats.skipped_blocked += 1;
        continue;
      }

      const result = await this.processChapter(chapter, processedChapters, modelConfig);
      stats[result.outcome] += 1;
      processedChapters.push(result.chapter);

      if (!result.readyForDependents) {
        blocked = true;
      }
    }
  }

  private async processChapter(
    chapter: ChapterSynopsisDoc,
    previousChapters: ChapterSynopsisDoc[],
    modelConfig: ChapterSynopsisModelConfig,
  ): Promise<ProcessResult> {
    const title = normalizeText(chapter.title);
    const content = normalizeText(chapter.content);
    const synopsis = normalizeText(chapter.synopsis);
    const sourceHash = computeChapterSynopsisSourceHash({ title, content });
    const baseFilter = {
      _id: chapter._id,
      title,
      content,
      order: chapter.order,
    };

    if (sourceHash === chapter.synopsisSourceHash && chapter.synopsisStatus === "ready") {
      return {
        outcome: "skipped_unchanged",
        chapter: { ...chapter, title, content, synopsis, synopsisSourceHash: sourceHash, synopsisStatus: "ready" },
        readyForDependents: true,
      };
    }

    if (!content.trim()) {
      const updateResult = await this.db.collection("chapters").updateOne(baseFilter, buildReadySynopsisUpdate(sourceHash, ""));
      if (updateResult.matchedCount === 0) {
        return {
          outcome: "discarded_stale",
          chapter: { ...chapter, title, content, synopsis },
          readyForDependents: false,
        };
      }
      return {
        outcome: "skipped_empty",
        chapter: { ...chapter, title, content, synopsis: "", synopsisSourceHash: sourceHash, synopsisStatus: "ready" },
        readyForDependents: true,
      };
    }

    const shortMetric = getShortContentMetric(content);
    if (shortMetric.count < shortMetric.min) {
      const updateResult = await this.db.collection("chapters").updateOne(baseFilter, buildReadySynopsisUpdate(sourceHash, ""));
      if (updateResult.matchedCount === 0) {
        return {
          outcome: "discarded_stale",
          chapter: { ...chapter, title, content, synopsis },
          readyForDependents: false,
        };
      }
      console.log(
        `[ChapterSynopsis] Skipped short chapter ${chapter._id.toHexString()} (${shortMetric.locale} ${shortMetric.count}/${shortMetric.min})`,
      );
      return {
        outcome: "skipped_short",
        chapter: { ...chapter, title, content, synopsis: "", synopsisSourceHash: sourceHash, synopsisStatus: "ready" },
        readyForDependents: true,
      };
    }

    const lockExpiredBefore = new Date(Date.now() - CHAPTER_SYNOPSIS_LOCK_TTL_MS);
    const token = randomUUID();
    const claimed = await this.db.collection("chapters").findOneAndUpdate(
      {
        ...baseFilter,
        $and: [
          {
            $or: [
              { synopsisSourceHash: { $exists: false } },
              { synopsisSourceHash: { $ne: sourceHash } },
              { synopsisStatus: { $ne: "ready" } },
            ],
          },
          {
            $or: [
              { synopsisJobLockedAt: { $exists: false } },
              { synopsisJobLockedAt: { $lt: lockExpiredBefore } },
            ],
          },
        ],
      },
      {
        $set: {
          synopsisStatus: "processing",
          synopsisLastAttemptAt: new Date(),
          synopsisJobLockedAt: new Date(),
          synopsisJobToken: token,
        },
        $unset: {
          synopsisError: "",
        },
      },
      { returnDocument: "after" },
    );

    if (!claimed) {
      return {
        outcome: "skipped_claim",
        chapter: { ...chapter, title, content, synopsis },
        readyForDependents: false,
      };
    }

    try {
      const { historicalChapters, recentChapters } = buildChapterHistoryContext(previousChapters);
      const { synopsis: nextSynopsis } = await generateChapterSynopsis({
        title: title || undefined,
        content,
        currentSynopsis: synopsis || undefined,
        historicalChapters,
        recentChapters,
        model: modelConfig,
      });

      const updateResult = await this.db.collection("chapters").updateOne(
        { ...baseFilter, synopsisJobToken: token },
        buildReadySynopsisUpdate(sourceHash, nextSynopsis),
      );

      if (updateResult.matchedCount === 0) {
        console.log(`[ChapterSynopsis] Discarded stale synopsis for chapter ${chapter._id.toHexString()}`);
        return {
          outcome: "discarded_stale",
          chapter: { ...chapter, title, content, synopsis },
          readyForDependents: false,
        };
      }

      return {
        outcome: "processed",
        chapter: {
          ...chapter,
          title,
          content,
          synopsis: nextSynopsis,
          synopsisSourceHash: sourceHash,
          synopsisStatus: "ready",
        },
        readyForDependents: true,
      };
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      console.error(`[ChapterSynopsis] Failed to summarize chapter ${chapter._id.toHexString()}: ${errorMessage}`);
      await this.db.collection("chapters").updateOne(
        { _id: chapter._id, synopsisJobToken: token },
        {
          $set: {
            synopsisStatus: "error",
            synopsisError: errorMessage,
            synopsisLastAttemptAt: new Date(),
          },
          $unset: {
            synopsisJobLockedAt: "",
            synopsisJobToken: "",
          },
        },
      );
      return {
        outcome: "failed",
        chapter: { ...chapter, title, content, synopsis, synopsisStatus: "error" },
        readyForDependents: false,
      };
    }
  }
}
