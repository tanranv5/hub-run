import type {
  ConversationAnchor,
  ConversationContextResult,
  ConversationMessage,
  ConversationSearchMode,
} from "../../types";
import { filterConversationMessages } from "../../conversation-search";
import {
  readJsonForwardWindow,
  readJsonTailWindowBeforeOffset,
  type JsonlLine,
} from "../jsonl-window";

const CONTEXT_MIN_LINES = 64;
const CONTEXT_MESSAGE_MULTIPLIER = 8;

function hasMatchingAnchor(
  message: ConversationMessage,
  anchor: ConversationAnchor,
): boolean {
  return message.anchor?.offset === anchor.offset
    && message.anchor?.blockIndex === anchor.blockIndex;
}

function createInitialLineCount(targetMessages: number): number {
  return Math.max(CONTEXT_MIN_LINES, Math.max(1, targetMessages) * CONTEXT_MESSAGE_MULTIPLIER);
}

export async function readConversationContextWindow(props: {
  anchor: ConversationAnchor;
  filePath: string;
  mode: ConversationSearchMode;
  parseMessages: (lines: JsonlLine[]) => ConversationMessage[];
  window: number;
}): Promise<ConversationContextResult | null> {
  const {
    anchor,
    filePath,
    mode,
    parseMessages,
    window,
  } = props;
  const radius = Math.max(0, Math.floor(window / 2));
  const beforeWindow = await readBeforeContextWindow({
    anchor,
    filePath,
    mode,
    parseMessages,
    radius,
  });
  const afterWindow = await readAfterContextWindow({
    anchor,
    filePath,
    mode,
    parseMessages,
    radius,
  });
  if (!afterWindow) {
    return null;
  }

  const beforeMessages = beforeWindow.messages.slice(-radius);
  const afterMessages = afterWindow.messages.slice(
    afterWindow.hitIndex,
    afterWindow.hitIndex + radius + 1,
  );
  const hitMessage = afterWindow.messages[afterWindow.hitIndex];
  if (!hitMessage?.anchor) {
    return null;
  }

  return {
    anchor: hitMessage.anchor,
    hitMessageId: hitMessage.id,
    messages: [...beforeMessages, ...afterMessages],
    hasOlder: beforeWindow.messages.length > radius || !beforeWindow.exhausted,
    hasNewer:
      afterWindow.messages.length > afterWindow.hitIndex + radius + 1
      || !afterWindow.exhausted,
  };
}

async function readBeforeContextWindow(props: {
  anchor: ConversationAnchor;
  filePath: string;
  mode: ConversationSearchMode;
  parseMessages: (lines: JsonlLine[]) => ConversationMessage[];
  radius: number;
}) {
  const {
    anchor,
    filePath,
    mode,
    parseMessages,
    radius,
  } = props;
  let lineCount = createInitialLineCount(radius);

  while (true) {
    const window = await readJsonTailWindowBeforeOffset(filePath, anchor.offset, lineCount);
    const messages = filterConversationMessages(parseMessages(window.lines), mode);
    if (messages.length >= radius || window.exhausted) {
      return {
        exhausted: window.exhausted,
        messages,
      };
    }
    lineCount *= 2;
  }
}

async function readAfterContextWindow(props: {
  anchor: ConversationAnchor;
  filePath: string;
  mode: ConversationSearchMode;
  parseMessages: (lines: JsonlLine[]) => ConversationMessage[];
  radius: number;
}) {
  const {
    anchor,
    filePath,
    mode,
    parseMessages,
    radius,
  } = props;
  let lineCount = createInitialLineCount(radius + 1);

  while (true) {
    const window = await readJsonForwardWindow(filePath, anchor.offset, lineCount);
    const messages = filterConversationMessages(parseMessages(window.lines), mode);
    const hitIndex = messages.findIndex((message) => hasMatchingAnchor(message, anchor));
    const enoughAfter = hitIndex >= 0 && messages.length >= hitIndex + radius + 1;
    if ((hitIndex >= 0 && enoughAfter) || window.exhausted) {
      if (hitIndex < 0) {
        return null;
      }
      return {
        exhausted: window.exhausted,
        hitIndex,
        messages,
      };
    }
    lineCount *= 2;
  }
}
