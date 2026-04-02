import type { ConversationAnchor } from "../types";

export function createConversationAnchor(
  offset: number,
  blockIndex: number = 0,
): ConversationAnchor {
  return {
    offset,
    blockIndex,
  };
}

export function createConversationMessageId(
  sessionId: string,
  lineOffset: number,
  blockIndex: number,
): string {
  return `${sessionId}:${lineOffset}:${blockIndex}`;
}

export function compareConversationAnchors(
  left: ConversationAnchor,
  right: ConversationAnchor,
): number {
  if (left.offset !== right.offset) {
    return left.offset - right.offset;
  }
  return left.blockIndex - right.blockIndex;
}

export function isConversationAnchorAfter(
  candidate: ConversationAnchor | undefined,
  anchor: ConversationAnchor | null,
): boolean {
  if (!candidate) {
    return false;
  }
  if (!anchor) {
    return true;
  }
  return compareConversationAnchors(candidate, anchor) > 0;
}
