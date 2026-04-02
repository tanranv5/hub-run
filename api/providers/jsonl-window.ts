import { open, readFile, stat } from "fs/promises";

export interface JsonlLine {
  line: string;
  offset: number;
}

export interface JsonlTailWindow {
  lines: JsonlLine[];
  startOffset: number;
  exhausted: boolean;
}

export interface JsonlForwardWindow {
  lines: JsonlLine[];
  endOffset: number;
  exhausted: boolean;
}

export interface JsonlHeadWindow {
  lines: JsonlLine[];
  endOffset: number;
  exhausted: boolean;
}

export interface MessageWindowCursor {
  kind: "tail" | "prefix";
  offset: number;
  before: number | null;
}

const CURSOR_PATTERN = /^(tail|prefix):(\d+)(?::(\d+))?$/;
const DEFAULT_TAIL_BYTES = 64 * 1024;

export function encodeMessageWindowCursor(
  kind: MessageWindowCursor["kind"],
  offset: number,
  before: number | null = null,
): string {
  if (before === null) {
    return `${kind}:${offset}`;
  }
  return `${kind}:${offset}:${before}`;
}

export function parseMessageWindowCursor(
  value: string | null,
): MessageWindowCursor | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const match = trimmed.match(CURSOR_PATTERN);
  if (!match) {
    return null;
  }

  return {
    kind: match[1] as MessageWindowCursor["kind"],
    offset: Number.parseInt(match[2] ?? "0", 10),
    before:
      typeof match[3] === "string" ? Number.parseInt(match[3], 10) : null,
  };
}

export function isNumericBeforeCursor(value: string | null): boolean {
  return typeof value === "string" && /^\d+$/.test(value.trim());
}

export async function readJsonLinesWithOffsets(
  filePath: string,
): Promise<JsonlLine[]> {
  const content = await readFile(filePath, "utf-8").catch(() => "");
  return toJsonlLines(content, 0, false);
}

export async function readJsonPrefixLines(
  filePath: string,
  endOffset: number,
): Promise<JsonlLine[]> {
  if (endOffset <= 0) {
    return [];
  }

  const text = await readTextSlice(filePath, 0, endOffset);
  return toJsonlLines(text, 0, false);
}

export async function readJsonLinesFromOffset(
  filePath: string,
  startOffset: number,
  endOffset?: number,
): Promise<JsonlLine[]> {
  const fileSize =
    endOffset ??
    (await stat(filePath)
      .then((result) => result.size)
      .catch(() => 0));
  if (fileSize <= startOffset) {
    return [];
  }

  const text = await readTextSlice(filePath, startOffset, fileSize);
  return toJsonlLines(text, startOffset, false);
}

export async function readJsonTailWindow(
  filePath: string,
  minimumLineCount: number,
  minimumBytes: number = DEFAULT_TAIL_BYTES,
): Promise<JsonlTailWindow> {
  const fileSize = await stat(filePath)
    .then((result) => result.size)
    .catch(() => 0);
  if (fileSize <= 0) {
    return { lines: [], startOffset: 0, exhausted: true };
  }

  let windowBytes = Math.min(
    fileSize,
    Math.max(minimumBytes, minimumLineCount * 512),
  );

  while (true) {
    const startOffset = Math.max(0, fileSize - windowBytes);
    const text = await readTextSlice(filePath, startOffset, fileSize);
    const normalized = normalizeTailSlice(text, startOffset);
    const lines = normalized
      ? toJsonlLines(normalized.text, normalized.startOffset, false)
      : [];
    const exhausted = startOffset === 0;

    if (lines.length >= minimumLineCount || exhausted || windowBytes >= fileSize) {
      return {
        lines,
        startOffset: normalized?.startOffset ?? startOffset,
        exhausted,
      };
    }

    windowBytes = Math.min(fileSize, windowBytes * 2);
  }
}

export async function readJsonTailWindowBeforeOffset(
  filePath: string,
  endOffset: number,
  minimumLineCount: number,
  minimumBytes: number = DEFAULT_TAIL_BYTES,
): Promise<JsonlTailWindow> {
  const safeEndOffset = Math.max(0, endOffset);
  if (safeEndOffset === 0) {
    return { lines: [], startOffset: 0, exhausted: true };
  }

  let windowBytes = Math.min(
    safeEndOffset,
    Math.max(minimumBytes, minimumLineCount * 512),
  );

  while (true) {
    const startOffset = Math.max(0, safeEndOffset - windowBytes);
    const text = await readTextSlice(filePath, startOffset, safeEndOffset);
    const normalized = normalizeTailSlice(text, startOffset);
    const lines = normalized
      ? toJsonlLines(normalized.text, normalized.startOffset, false)
      : [];
    const exhausted = startOffset === 0;

    if (lines.length >= minimumLineCount || exhausted || windowBytes >= safeEndOffset) {
      return {
        lines,
        startOffset: normalized?.startOffset ?? startOffset,
        exhausted,
      };
    }

    windowBytes = Math.min(safeEndOffset, windowBytes * 2);
  }
}

export async function readJsonForwardWindow(
  filePath: string,
  startOffset: number,
  minimumLineCount: number,
  minimumBytes: number = DEFAULT_TAIL_BYTES,
): Promise<JsonlForwardWindow> {
  const fileSize = await stat(filePath)
    .then((result) => result.size)
    .catch(() => 0);
  if (fileSize <= startOffset) {
    return { lines: [], endOffset: startOffset, exhausted: true };
  }

  let windowBytes = Math.min(
    fileSize - startOffset,
    Math.max(minimumBytes, minimumLineCount * 512),
  );

  while (true) {
    const endOffset = Math.min(fileSize, startOffset + windowBytes);
    const text = await readTextSlice(filePath, startOffset, endOffset);
    const lines = toJsonlLines(text, startOffset, true);
    const exhausted = endOffset === fileSize;

    if (lines.length >= minimumLineCount || exhausted || windowBytes >= fileSize - startOffset) {
      return {
        lines,
        endOffset,
        exhausted,
      };
    }

    windowBytes = Math.min(fileSize - startOffset, windowBytes * 2);
  }
}

export async function readJsonHeadWindowFromOffset(
  filePath: string,
  startOffset: number,
  minimumLineCount: number,
  minimumBytes: number = DEFAULT_TAIL_BYTES,
): Promise<JsonlHeadWindow> {
  return readJsonForwardWindow(
    filePath,
    startOffset,
    minimumLineCount,
    minimumBytes,
  );
}

export async function readFirstJsonlLine(filePath: string): Promise<string | null> {
  let fileHandle;
  try {
    fileHandle = await open(filePath, "r");
    const buffer = Buffer.alloc(64 * 1024);
    const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, 0);
    if (bytesRead <= 0) {
      return null;
    }

    const text = buffer.subarray(0, bytesRead).toString("utf-8");
    const newlineIndex = text.indexOf("\n");
    if (newlineIndex < 0) {
      const trimmed = text.trim();
      return trimmed || null;
    }

    const line = text.slice(0, newlineIndex).trim();
    return line || null;
  } catch {
    return null;
  } finally {
    await fileHandle?.close();
  }
}

async function readTextSlice(
  filePath: string,
  startOffset: number,
  endOffset: number,
): Promise<string> {
  const length = Math.max(0, endOffset - startOffset);
  if (length === 0) {
    return "";
  }

  let fileHandle;
  try {
    fileHandle = await open(filePath, "r");
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await fileHandle.read(
      buffer,
      0,
      length,
      startOffset,
    );
    return buffer.subarray(0, bytesRead).toString("utf-8");
  } catch {
    return "";
  } finally {
    await fileHandle?.close();
  }
}

function normalizeTailSlice(
  text: string,
  startOffset: number,
): { text: string; startOffset: number } | null {
  if (startOffset === 0) {
    return { text, startOffset: 0 };
  }

  const newlineIndex = text.indexOf("\n");
  if (newlineIndex < 0) {
    return null;
  }

  const nextOffset =
    startOffset + Buffer.byteLength(text.slice(0, newlineIndex + 1), "utf-8");
  return {
    text: text.slice(newlineIndex + 1),
    startOffset: nextOffset,
  };
}

function toJsonlLines(text: string, baseOffset: number, dropTrailingIncomplete: boolean): JsonlLine[] {
  const segments = text.split("\n");
  const lines: JsonlLine[] = [];
  let offset = baseOffset;

  const lastIndex = segments.length - 1;
  const hasTrailingNewline = text.endsWith("\n");

  for (const [index, segment] of segments.entries()) {
    const line = segment.trim();
    const isLastSegment = index === lastIndex;

    if (line && !(dropTrailingIncomplete && isLastSegment && !hasTrailingNewline)) {
      lines.push({ line, offset });
    }

    offset += Buffer.byteLength(segment, "utf-8");
    if (index < lastIndex) {
      offset += 1;
    }
  }

  return lines;
}
