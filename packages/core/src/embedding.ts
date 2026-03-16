import OpenAI from "openai";

const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_DIMENSIONS = 1536;
const MAX_CHUNK_TOKENS = 8000;
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

export interface EmbeddingConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  dimensions?: number;
}

export class EmbeddingService {
  private client: OpenAI;
  private model: string;
  private dimensions: number;

  constructor(config: EmbeddingConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });
    this.model = config.model || DEFAULT_MODEL;
    this.dimensions = config.dimensions || DEFAULT_DIMENSIONS;
  }

  /**
   * Generate embedding for a single text.
   */
  async embed(text: string): Promise<number[]> {
    const trimmed = text.trim();
    if (!trimmed) {
      return new Array(this.dimensions).fill(0);
    }

    const response = await this.client.embeddings.create({
      model: this.model,
      input: trimmed,
      dimensions: this.dimensions,
    });

    return response.data[0].embedding;
  }

  /**
   * Generate embeddings for multiple texts (batch).
   * OpenAI accepts up to 2048 inputs per request.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const cleaned = texts.map((t) => {
      const trimmed = t.trim();
      return trimmed || " ";
    });

    const batchSize = 2048;
    const results: number[][] = [];

    for (let i = 0; i < cleaned.length; i += batchSize) {
      const batch = cleaned.slice(i, i + batchSize);
      const response = await this.client.embeddings.create({
        model: this.model,
        input: batch,
        dimensions: this.dimensions,
      });

      // Sort by index to maintain order
      const sorted = response.data.sort((a, b) => a.index - b.index);
      for (const item of sorted) {
        results.push(item.embedding);
      }
    }

    return results;
  }

  /**
   * Split long text into overlapping chunks.
   * Splits by sentences/paragraphs and groups into chunks with overlap.
   */
  static chunkText(
    text: string,
    chunkSize: number = CHUNK_SIZE,
    overlap: number = CHUNK_OVERLAP
  ): string[] {
    if (!text || text.trim().length === 0) return [];

    // Split into sentences. Handle CJK sentence endings as well.
    const sentencePattern =
      /[^.!?\u3002\uff01\uff1f\n]+[.!?\u3002\uff01\uff1f]*[\s]*/g;
    const rawSentences = text.match(sentencePattern);

    if (!rawSentences || rawSentences.length === 0) {
      // Fallback: split by fixed character length
      const chunks: string[] = [];
      const step = chunkSize - overlap;
      for (let i = 0; i < text.length; i += step) {
        chunks.push(text.slice(i, i + chunkSize).trim());
      }
      return chunks.filter(Boolean);
    }

    // Also split on paragraph boundaries (double newlines)
    const sentences: string[] = [];
    for (const raw of rawSentences) {
      const parts = raw.split(/\n{2,}/);
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed) sentences.push(trimmed);
      }
    }

    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentLength = 0;

    for (const sentence of sentences) {
      const sentenceLength = sentence.length;

      if (currentLength + sentenceLength > chunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push(currentChunk.join(" "));

        // Build overlap: walk backwards from the end of currentChunk
        const overlapChunk: string[] = [];
        let overlapLength = 0;
        for (let i = currentChunk.length - 1; i >= 0; i--) {
          if (overlapLength + currentChunk[i].length > overlap) break;
          overlapChunk.unshift(currentChunk[i]);
          overlapLength += currentChunk[i].length;
        }

        currentChunk = overlapChunk;
        currentLength = overlapLength;
      }

      currentChunk.push(sentence);
      currentLength += sentenceLength;
    }

    // Push the last chunk
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(" "));
    }

    return chunks;
  }

  /**
   * Estimate token count.
   * Rough heuristic: ~4 chars per token for English, ~2 chars per token for CJK.
   */
  static estimateTokens(text: string): number {
    if (!text) return 0;

    // Count CJK characters
    const cjkMatches = text.match(
      /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/g
    );
    const cjkCount = cjkMatches ? cjkMatches.length : 0;

    // Remove CJK characters and estimate the rest at ~4 chars per token
    const nonCjk = text.replace(
      /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/g,
      ""
    );
    const nonCjkTokens = Math.ceil(nonCjk.length / 4);

    // CJK characters are roughly 1 token per 2 characters
    const cjkTokens = Math.ceil(cjkCount / 2);

    return nonCjkTokens + cjkTokens;
  }

  /**
   * Check if text needs chunking based on estimated token count.
   */
  static needsChunking(text: string): boolean {
    return EmbeddingService.estimateTokens(text) > MAX_CHUNK_TOKENS;
  }
}
