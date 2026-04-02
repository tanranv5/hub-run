export const DEFAULT_MESSAGE_FONT_SCALE = 4;
export const MIN_MESSAGE_FONT_SCALE = 1;
export const MAX_MESSAGE_FONT_SCALE = 6;

interface ConversationFontScaleClasses {
  expandableBody: string;
  markdownCode: string;
  markdownHeading: string;
  markdownParagraph: string;
  markdownPre: string;
  markdownTable: string;
  markdownListItem: string;
  meta: string;
  searchMatchRing: string;
  searchActiveRing: string;
  textBody: string;
  toolPreview: string;
}

const FONT_SCALE_CLASSES: Record<number, ConversationFontScaleClasses> = {
  1: {
    expandableBody: "text-[11px] leading-5 md:text-[12px] md:leading-5",
    markdownCode: "text-[10px] md:text-[11px]",
    markdownHeading: "text-[11px] md:text-[12px]",
    markdownParagraph: "text-[10px] leading-5 md:text-[11px] md:leading-5",
    markdownPre: "text-[10px] md:text-[11px]",
    markdownTable: "text-[10px] md:text-[11px]",
    markdownListItem: "text-[10px] leading-5 md:text-[11px] md:leading-5",
    meta: "text-[9px] md:text-[10px]",
    searchMatchRing: "ring-1 ring-amber-300/60 ring-offset-0",
    searchActiveRing: "ring-2 ring-amber-400/80 ring-offset-0",
    textBody: "text-[11px] leading-4 md:text-[12px] md:leading-5",
    toolPreview: "text-[11px] leading-5 md:text-[12px] md:leading-5",
  },
  2: {
    expandableBody: "text-[12px] leading-5 md:text-[13px] md:leading-6",
    markdownCode: "text-[11px] md:text-[12px]",
    markdownHeading: "text-[12px] md:text-[13px]",
    markdownParagraph: "text-[11px] leading-5 md:text-[12px] md:leading-6",
    markdownPre: "text-[11px] md:text-[12px]",
    markdownTable: "text-[11px] md:text-[12px]",
    markdownListItem: "text-[11px] leading-5 md:text-[12px] md:leading-6",
    meta: "text-[10px] md:text-[11px]",
    searchMatchRing: "ring-1 ring-amber-300/60 ring-offset-0",
    searchActiveRing: "ring-2 ring-amber-400/80 ring-offset-0",
    textBody: "text-[12px] leading-5 md:text-[13px] md:leading-5",
    toolPreview: "text-[12px] leading-5 md:text-[13px] md:leading-6",
  },
  3: {
    expandableBody: "text-[13px] leading-6 md:text-[14px] md:leading-6",
    markdownCode: "text-[11px] md:text-[12px]",
    markdownHeading: "text-[13px] md:text-[14px]",
    markdownParagraph: "text-[11px] leading-6 md:text-[12px] md:leading-6",
    markdownPre: "text-[11px] md:text-[12px]",
    markdownTable: "text-[11px] md:text-[12px]",
    markdownListItem: "text-[11px] leading-6 md:text-[12px] md:leading-6",
    meta: "text-[10px] md:text-[11px]",
    searchMatchRing: "ring-1 ring-amber-300/60 ring-offset-0",
    searchActiveRing: "ring-2 ring-amber-400/80 ring-offset-0",
    textBody: "text-[13px] leading-5 md:text-[14px] md:leading-6",
    toolPreview: "text-[13px] leading-6 md:text-[14px] md:leading-6",
  },
  4: {
    expandableBody: "text-[14px] leading-6 md:text-[15px] md:leading-7",
    markdownCode: "text-[12px]",
    markdownHeading: "text-[13px] md:text-[14px]",
    markdownParagraph: "text-[12px] leading-relaxed md:text-[13px]",
    markdownPre: "text-[11px] md:text-xs",
    markdownTable: "text-[12px] md:text-[13px]",
    markdownListItem: "text-[12px] leading-relaxed md:text-[13px]",
    meta: "text-[10px] md:text-[11px]",
    searchMatchRing: "ring-1 ring-amber-300/60 ring-offset-0",
    searchActiveRing: "ring-2 ring-amber-400/80 ring-offset-0",
    textBody: "text-[14px] leading-5 md:text-[15px] md:leading-6",
    toolPreview: "text-[13px] leading-6 md:text-sm md:leading-7",
  },
  5: {
    expandableBody: "text-[15px] leading-7 md:text-[16px] md:leading-7",
    markdownCode: "text-[13px]",
    markdownHeading: "text-[14px] md:text-[15px]",
    markdownParagraph: "text-[13px] leading-7 md:text-[14px] md:leading-7",
    markdownPre: "text-[12px] md:text-[13px]",
    markdownTable: "text-[13px] md:text-[14px]",
    markdownListItem: "text-[13px] leading-7 md:text-[14px] md:leading-7",
    meta: "text-[11px] md:text-[12px]",
    searchMatchRing: "ring-1 ring-amber-300/60 ring-offset-0",
    searchActiveRing: "ring-2 ring-amber-400/80 ring-offset-0",
    textBody: "text-[15px] leading-6 md:text-[16px] md:leading-7",
    toolPreview: "text-[14px] leading-7 md:text-[15px] md:leading-7",
  },
  6: {
    expandableBody: "text-[16px] leading-7 md:text-[17px] md:leading-8",
    markdownCode: "text-[14px]",
    markdownHeading: "text-[15px] md:text-[16px]",
    markdownParagraph: "text-[14px] leading-7 md:text-[15px] md:leading-8",
    markdownPre: "text-[13px] md:text-[14px]",
    markdownTable: "text-[14px] md:text-[15px]",
    markdownListItem: "text-[14px] leading-7 md:text-[15px] md:leading-8",
    meta: "text-[11px] md:text-[12px]",
    searchMatchRing: "ring-1 ring-amber-300/60 ring-offset-0",
    searchActiveRing: "ring-2 ring-amber-400/80 ring-offset-0",
    textBody: "text-[16px] leading-7 md:text-[17px] md:leading-7",
    toolPreview: "text-[15px] leading-7 md:text-[16px] md:leading-8",
  },
};

export function normalizeMessageFontScale(scale: number): number {
  if (!Number.isFinite(scale)) {
    return DEFAULT_MESSAGE_FONT_SCALE;
  }
  return Math.min(MAX_MESSAGE_FONT_SCALE, Math.max(MIN_MESSAGE_FONT_SCALE, Math.round(scale)));
}

export function getConversationFontScaleClasses(
  scale: number,
): ConversationFontScaleClasses {
  return FONT_SCALE_CLASSES[normalizeMessageFontScale(scale)];
}
