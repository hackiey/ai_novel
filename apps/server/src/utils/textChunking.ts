import mammoth from "mammoth";

export const DEFAULT_CHUNK_SIZE_CHARS = 10000;
export const DEFAULT_CHUNK_SIZE_WORDS = 10000;

export const ALLOWED_EXTENSIONS = new Set(["txt", "md", "docx", "pdf"]);

export function isCJKText(text: string): boolean {
  const nonWhitespace = text.replace(/\s/g, "");
  if (nonWhitespace.length === 0) return false;
  const cjkChars = nonWhitespace.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g);
  return (cjkChars?.length ?? 0) / nonWhitespace.length > 0.3;
}

export function chunkText(text: string, chunkChars: number, chunkWords: number): string[] {
  const cjkMode = isCJKText(text);
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  function measure(s: string): number {
    if (cjkMode) return s.length;
    return s.split(/\s+/).filter(Boolean).length;
  }

  const limit = cjkMode ? chunkChars : chunkWords;

  for (const para of paragraphs) {
    const paraSize = measure(para);
    const currentSize = measure(current);

    if (currentSize + paraSize <= limit) {
      current += (current ? "\n\n" : "") + para;
    } else if (currentSize > 0) {
      chunks.push(current);
      if (paraSize > limit) {
        const subChunks = splitLargeParagraph(para, limit, cjkMode);
        for (let i = 0; i < subChunks.length - 1; i++) {
          chunks.push(subChunks[i]);
        }
        current = subChunks[subChunks.length - 1];
      } else {
        current = para;
      }
    } else {
      if (paraSize > limit) {
        const subChunks = splitLargeParagraph(para, limit, cjkMode);
        for (let i = 0; i < subChunks.length - 1; i++) {
          chunks.push(subChunks[i]);
        }
        current = subChunks[subChunks.length - 1];
      } else {
        current = para;
      }
    }
  }

  if (current.trim()) {
    chunks.push(current);
  }

  return chunks;
}

export function splitLargeParagraph(para: string, limit: number, cjkMode: boolean): string[] {
  const sentences = para.split(/(?<=[。！？.!?\n])\s*/);
  const chunks: string[] = [];
  let current = "";

  function measure(s: string): number {
    if (cjkMode) return s.length;
    return s.split(/\s+/).filter(Boolean).length;
  }

  for (const sentence of sentences) {
    if (measure(current) + measure(sentence) <= limit) {
      current += sentence;
    } else {
      if (current) chunks.push(current);
      if (measure(sentence) > limit) {
        if (cjkMode) {
          for (let i = 0; i < sentence.length; i += limit) {
            const slice = sentence.slice(i, i + limit);
            if (i + limit >= sentence.length) {
              current = slice;
            } else {
              chunks.push(slice);
            }
          }
        } else {
          const words = sentence.split(/\s+/);
          let acc = "";
          for (const word of words) {
            if (measure(acc) + 1 > limit) {
              chunks.push(acc);
              acc = word;
            } else {
              acc += (acc ? " " : "") + word;
            }
          }
          current = acc;
        }
      } else {
        current = sentence;
      }
    }
  }

  if (current.trim()) {
    chunks.push(current);
  }

  return chunks;
}

export async function fileToText(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "txt":
    case "md":
      return buffer.toString("utf-8");
    case "docx": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "pdf": {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      await parser.destroy();
      return result.text;
    }
    default:
      throw new Error(`Unsupported file type: .${ext}`);
  }
}
