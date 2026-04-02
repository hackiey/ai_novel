import { createHash } from "crypto";
import { completeSimple, getModel, type ThinkingLevel } from "@mariozechner/pi-ai";
import type { Locale } from "./i18n.js";

export interface ChapterSynopsisModelConfig {
  apiKey: string;
  provider: string;
  modelId: string;
  baseURL?: string;
  reasoning?: ThinkingLevel;
}

export interface HistoricalChapterSynopsisContextItem {
  order: number;
  title?: string;
  synopsis: string;
}

export interface RecentChapterSynopsisContextItem {
  order: number;
  title?: string;
  content: string;
}

export interface GenerateChapterSynopsisArgs {
  title?: string;
  content: string;
  currentSynopsis?: string;
  historicalChapters?: HistoricalChapterSynopsisContextItem[];
  recentChapters?: RecentChapterSynopsisContextItem[];
  locale?: Locale;
  model: ChapterSynopsisModelConfig;
}

const CHAPTER_SYNOPSIS_SOURCE_VERSION = "v4";
const CHAPTER_SYNOPSIS_GENERATE_MAX_TOKENS = 16000;

function detectLocale(text: string): Locale {
  const nonWhitespace = text.replace(/\s/g, "");
  if (!nonWhitespace) return "zh";
  const cjkChars = nonWhitespace.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g);
  return (cjkChars?.length ?? 0) / nonWhitespace.length > 0.2 ? "zh" : "en";
}

function buildSystemPrompt(locale: Locale): string {
  if (locale === "en") {
    return "You are a senior fiction editor. Write a dense, detail-rich chapter synopsis in the same language as the chapter content. Preserve concrete plot details whenever they matter: named characters, goals, major actions, conflict shifts, reveals, decisions, consequences, and the ending state. When prior chapter context is provided, use it only to preserve continuity and resolve references. Use the available space efficiently instead of being overly brief. Return plain prose only, with no bullets, headings, or commentary.";
  }
  return "你是一名资深小说编辑。请用与章节正文相同的语言写出信息密度高、细节尽量充分的章节梗概。尽量保留重要的人名、目标、行动、冲突变化、关键信息揭示、决定、后果以及章节结束时的状态。若提供了前文上下文，只可用于保持连续性和解析照应关系。不要为了“简短”而丢失关键信息，应尽量用满可用篇幅。只输出梗概正文，不要列表、标题、解释或额外说明。";
}

function formatChapterLabel(order: number, title: string | undefined, locale: Locale): string {
  if (locale === "en") {
    return title ? `Chapter ${order + 1}: ${title}` : `Chapter ${order + 1}`;
  }
  return title ? `第${order + 1}章：${title}` : `第${order + 1}章`;
}

function formatHistoricalContext(items: HistoricalChapterSynopsisContextItem[], locale: Locale): string | undefined {
  if (items.length === 0) return undefined;
  return items
    .map((item) => `${formatChapterLabel(item.order, item.title, locale)}\n${item.synopsis}`)
    .join("\n\n");
}

function formatRecentContext(items: RecentChapterSynopsisContextItem[], locale: Locale): string | undefined {
  if (items.length === 0) return undefined;
  return items
    .map((item) => `${formatChapterLabel(item.order, item.title, locale)}\n${item.content}`)
    .join("\n\n");
}

function buildUserPrompt(args: {
  title?: string;
  content: string;
  currentSynopsis?: string;
  historicalChapters?: HistoricalChapterSynopsisContextItem[];
  recentChapters?: RecentChapterSynopsisContextItem[];
  locale: Locale;
}): string {
  const { title, content, currentSynopsis, historicalChapters = [], recentChapters = [], locale } = args;
  const historicalContext = formatHistoricalContext(historicalChapters, locale);
  const recentContext = formatRecentContext(recentChapters, locale);

  if (locale === "en") {
    return [
      "Generate a polished chapter synopsis.",
      "Requirements:",
      "1. Preserve as many concrete details as matter: named characters, motivations, major actions, conflict shifts, reveals, decisions, consequences, and the ending state.",
      "2. Focus on the current chapter. Use prior chapter context only for continuity and references.",
      "3. When recent preceding chapter content and older chapter summaries conflict, trust the recent content.",
      "4. Do not invent details that are not in the provided material.",
      "5. Use the available space efficiently. If the chapter has enough material, do not be overly brief.",
      "6. Write one dense paragraph of plain prose only.",
      historicalContext ? `Older chapter summaries (long-range context):\n\n${historicalContext}` : undefined,
      recentContext ? `Recent preceding chapter content (closest continuity context, roughly the prior 50,000 words/characters):\n\n${recentContext}` : undefined,
      title ? `Chapter title: ${title}` : undefined,
      currentSynopsis !== undefined ? `Existing synopsis (for reference only): ${currentSynopsis}` : undefined,
      "Current chapter content:",
      content,
    ].filter(Boolean).join("\n\n");
  }

  return [
    "请为下面的章节生成一段精炼梗概。",
    "要求：",
    "1. 尽量保留关键细节，包括重要角色、人名、目标、主要行动、冲突变化、信息揭示、关键决定、直接后果，以及章节结尾状态。",
    "2. 聚焦当前章节，前文上下文仅用于保持连续性和解析照应。",
    "3. 如果最近章节正文与更久远章节摘要有冲突，以最近章节正文为准。",
    "4. 不要补充提供材料里没有的信息。",
    "5. 只要材料足够，就尽量写得充实，不要过度压缩。",
    "6. 只输出一段信息密度高的梗概正文，不要列表或标题。",
    historicalContext ? `更久远的历史章节摘要：\n\n${historicalContext}` : undefined,
    recentContext ? `距离当前章节最近的前文正文（约前 5 万字上下文）：\n\n${recentContext}` : undefined,
    title ? `章节标题：${title}` : undefined,
    currentSynopsis !== undefined ? `已有梗概（仅供参考，不要照抄）：${currentSynopsis}` : undefined,
    "当前章节正文：",
    content,
  ].filter(Boolean).join("\n\n");
}

function extractText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block): block is { type: "text"; text: string } => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("")
    .trim();
}

async function completeSynopsisText(args: {
  model: ReturnType<typeof getModel>;
  apiKey: string;
  reasoning?: ThinkingLevel;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
}): Promise<string> {
  const response = await completeSimple(
    args.model,
    {
      systemPrompt: args.systemPrompt,
      messages: [{ role: "user", content: args.userPrompt, timestamp: Date.now() }],
    },
    {
      apiKey: args.apiKey,
      reasoning: args.reasoning,
      maxTokens: args.maxTokens,
    },
  );

  return extractText(response.content);
}

export function computeChapterContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function computeChapterSynopsisSourceHash(args: { title?: string; content: string }): string {
  return createHash("sha256")
    .update(`chapter-synopsis:${CHAPTER_SYNOPSIS_SOURCE_VERSION}\n`)
    .update(args.title ?? "")
    .update("\n")
    .update(args.content)
    .digest("hex");
}

export async function generateChapterSynopsis(args: GenerateChapterSynopsisArgs): Promise<{ synopsis: string }> {
  const locale = args.locale ?? detectLocale(`${args.title ?? ""}\n${args.content}`);
  const model = getModel(args.model.provider as any, args.model.modelId as any);
  if (args.model.baseURL) {
    model.baseUrl = args.model.baseURL;
  }

  let synopsis = await completeSynopsisText({
    model,
    apiKey: args.model.apiKey,
    reasoning: args.model.reasoning,
    systemPrompt: buildSystemPrompt(locale),
    userPrompt: buildUserPrompt({
      title: args.title,
      content: args.content,
      currentSynopsis: args.currentSynopsis,
      historicalChapters: args.historicalChapters,
      recentChapters: args.recentChapters,
      locale,
    }),
    maxTokens: CHAPTER_SYNOPSIS_GENERATE_MAX_TOKENS,
  });
  if (!synopsis) {
    throw new Error("Synopsis model returned empty output");
  }

  return { synopsis };
}
