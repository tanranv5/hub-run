import {
  findConversationSearchRanges,
  readConversationVisibleText,
} from "../../api/conversation-search";
import type {
  ConversationMessage,
  ConversationSearchMode,
  ProviderSummary,
} from "../../api/types";
import {
  getMessageBlock,
  parseTaggedControlMessage,
  parseSubagentNotification,
  parseSkillInvocation,
  getToolLabel,
  resolveToolTitle,
  sanitizeConversationText,
} from "../conversation-message-helpers";
import {
  DEFAULT_MESSAGE_FONT_SCALE,
  getConversationFontScaleClasses,
} from "../conversation-reading-styles";
import { ConversationExpandableCard } from "./conversation-expandable-card";
import { MarkdownRenderer } from "./markdown-renderer";
import { ConversationTimestamp } from "./conversation-timestamp";
import { ConversationToolCard } from "./conversation-tool-card";

type SearchVisualState = "none" | "match" | "active";

function roleLabel(role: ConversationMessage["role"]) {
  if (role === "user") {
    return "用户";
  }
  if (role === "assistant") {
    return "助手";
  }
  return "系统";
}

function bubbleTone(message: ConversationMessage) {
  if (message.role === "user") {
    return "border-accent/30 bg-accent/15 text-txt-bold shadow-sm";
  }
  if (message.role === "assistant") {
    return "border-bdr-strong bg-panel text-txt shadow-sm";
  }
  return "border-bdr bg-surface text-txt-muted";
}

function layoutTone(message: ConversationMessage) {
  if (message.role === "user") {
    return "ml-auto max-w-[92%] md:max-w-[78%]";
  }
  if (message.role === "assistant") {
    return "mr-auto max-w-full";
  }
  return "mx-auto max-w-full";
}

function showMetaOnMobile(message: ConversationMessage) {
  if (message.role === "system") {
    return true;
  }
  return message.kind !== "text";
}

function readProjectedPlainConversationText(message: ConversationMessage): string {
  const skillInvocation = parseSkillInvocation(message.text);
  if (skillInvocation) {
    return sanitizeConversationText(skillInvocation.remainingText);
  }
  const notification = parseSubagentNotification(message.text);
  if (notification) {
    return sanitizeConversationText(notification.remainingText);
  }
  const taggedControlMessage = parseTaggedControlMessage(message.text);
  if (taggedControlMessage) {
    return sanitizeConversationText(taggedControlMessage.remainingText);
  }
  return readConversationVisibleText(message);
}

export function SummaryBanner(props: { summary: ConversationMessage | null }) {
  const { summary } = props;
  if (!summary) {
    return null;
  }

  return (
    <section className="rounded-[24px] border border-amber-400/20 bg-amber-400/8 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.2em] text-amber-700">
        总结
      </div>
      <div className="mt-2 text-sm leading-6 text-txt">
        <MarkdownRenderer content={sanitizeConversationText(summary.text)} />
      </div>
    </section>
  );
}

export function EmptyConversationState(props: {
  provider: ProviderSummary | null;
  onOpenBrowser: () => void;
}) {
  const { provider, onOpenBrowser } = props;

  return (
    <section
      data-slot="empty-conversation-state"
      className="flex h-full min-h-0 flex-1 flex-col"
    >
      <div className="flex flex-1 flex-col px-6 pt-6">
        <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center rounded-[40px] border border-dashed border-bdr bg-surface/40 py-24 text-center backdrop-blur-sm">
          <p className="text-[11px] uppercase tracking-[0.28em] text-muted">
            会话
          </p>
          <h2 className="mt-4 text-3xl font-semibold text-txt">
            {provider ? `从 ${provider.label} 里选一个会话` : "先选择 provider"}
          </h2>
          <button
            type="button"
            onClick={onOpenBrowser}
            className="mt-6 inline-flex h-11 items-center rounded-2xl border border-bdr bg-surface px-5 text-sm text-txt transition hover:bg-surface-hover lg:hidden"
          >
            打开会话列表
          </button>
        </div>
      </div>

      <div
        data-slot="empty-conversation-composer-shell"
        className="flex-none p-3 md:p-5"
      >
        <div className="pointer-events-none relative min-h-[128px] rounded-[32px] border border-bdr bg-panel/40 px-3 pb-3 pt-3 opacity-60 shadow-inner backdrop-blur-sm">
          <div className="absolute right-3 top-3 hidden items-center gap-2 md:flex">
            <div className="h-8 w-28 rounded-full bg-muted/10" />
            <div className="h-8 w-24 rounded-full bg-muted/10" />
          </div>
          <div className="space-y-3 pr-0 md:pr-[27rem]">
            <div className="h-4 w-36 rounded-full bg-muted/20" />
            <div className="h-3 w-[72%] rounded-full bg-muted/10" />
            <div className="h-3 w-[56%] rounded-full bg-muted/10" />
          </div>
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <div className="h-9 w-9 rounded-full border border-bdr bg-surface" />
            <div className="h-9 w-20 rounded-full border border-bdr bg-surface" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function ConversationMessageCard(props: {
  fontScale?: number;
  highlightQuery?: string;
  message: ConversationMessage;
  previousMessage?: ConversationMessage | null;
  renderMode?: ConversationSearchMode;
  searchState?: SearchVisualState;
}) {
  const {
    fontScale = DEFAULT_MESSAGE_FONT_SCALE,
    highlightQuery = "",
    message,
    previousMessage = null,
    renderMode = "all",
    searchState = "none",
  } = props;
  const block = getMessageBlock(message);
  const sanitizedText = sanitizeConversationText(message.text);
  const skillInvocation = parseSkillInvocation(message.text);
  const subagentNotification = parseSubagentNotification(message.text);
  const taggedControlMessage = parseTaggedControlMessage(message.text);
  const showMeta = showMetaOnMobile(message);
  const plainVisibleText = readProjectedPlainConversationText(message);

  if (renderMode !== "all") {
    if (block.type === "turn_aborted") {
      return (
        <ConversationExpandableCard
          badge="已中断"
          collapsedLabel="展开详情"
          contentScale={fontScale}
          expandedLabel="收起详情"
          messageId={message.id}
          searchState={searchState}
          subtitle={message.title ?? "status"}
          timestamp={message.timestamp}
          text={sanitizedText || message.text}
          tone="rose"
        />
      );
    }
    if (!plainVisibleText) {
      return null;
    }
    return (
      <ConversationTextBubble
        fontScale={fontScale}
        forcePlainText
        highlightQuery={highlightQuery}
        message={message}
        searchState={searchState}
        showMeta={showMeta}
        text={plainVisibleText}
      />
    );
  }

  if (skillInvocation) {
    return renderSkillInvocationMessage({
      fontScale,
      highlightQuery,
      message,
      searchState,
      showMeta,
      skillInvocation,
    });
  }
  if (subagentNotification) {
    return renderSubagentNotificationMessage({
      fontScale,
      highlightQuery,
      message,
      notification: subagentNotification,
      searchState,
      showMeta,
    });
  }
  if (taggedControlMessage) {
    return renderTaggedControlMessage({
      fontScale,
      highlightQuery,
      message,
      searchState,
      showMeta,
      taggedControlMessage,
    });
  }

  if (block.type === "image") {
    return (
      <ConversationImageBubble
        imagePath={block.imagePath}
        imageUrl={block.imageUrl}
        message={message}
        searchState={searchState}
        showMeta={showMeta}
      />
    );
  }

  if (block.type === "thinking") {
    if (!sanitizedText) {
      return null;
    }
    return (
      <ConversationExpandableCard
        badge="思考"
        collapsedLabel="展开思考"
        contentScale={fontScale}
        expandedLabel="收起思考"
        messageId={message.id}
        searchState={searchState}
        subtitle="assistant reasoning"
        timestamp={message.timestamp}
        text={sanitizedText}
        tone="amber"
      />
    );
  }

  if (block.type === "turn_aborted") {
    return (
      <ConversationExpandableCard
        badge="已中断"
        collapsedLabel="展开详情"
        contentScale={fontScale}
        expandedLabel="收起详情"
        messageId={message.id}
        searchState={searchState}
        subtitle={message.title ?? "status"}
        timestamp={message.timestamp}
        text={sanitizedText || message.text}
        tone="rose"
      />
    );
  }

  if (block.type === "tool_use" || block.type === "tool_result") {
    const toolTitle = resolveToolTitle(message, previousMessage);
    return (
      <ConversationToolCard
        block={block}
        contentScale={fontScale}
        messageId={message.id}
        searchState={searchState}
        timestamp={message.timestamp}
        toolLabel={getToolLabel(toolTitle)}
        toolTitle={toolTitle}
      />
    );
  }

  if (!sanitizedText) {
    return null;
  }

  return (
    <ConversationTextBubble
      fontScale={fontScale}
      highlightQuery={highlightQuery}
      message={message}
      searchState={searchState}
      showMeta={showMeta}
      text={sanitizedText}
    />
  );
}

function renderSubagentNotificationMessage(props: {
  fontScale: number;
  highlightQuery: string;
  message: ConversationMessage;
  notification: ReturnType<typeof parseSubagentNotification>;
  searchState: SearchVisualState;
  showMeta: boolean;
}) {
  const {
    fontScale,
    highlightQuery,
    message,
    notification,
    searchState,
    showMeta,
  } = props;
  if (!notification) {
    return null;
  }
  const remainingText = sanitizeConversationText(notification.remainingText);
  return (
    <>
      <ConversationExpandableCard
        badge="子代理"
        collapsedLabel="展开详情"
        contentScale={fontScale}
        expandedLabel="收起详情"
        messageId={message.id}
        searchState={searchState}
        subtitle={notification.statusLabel}
        timestamp={remainingText ? undefined : message.timestamp}
        text={notification.detailsText}
        tone="amber"
      />
      {remainingText ? (
        <ConversationTextBubble
          fontScale={fontScale}
          highlightQuery={highlightQuery}
          message={message}
          searchState={searchState}
          showMeta={showMeta}
          text={remainingText}
        />
      ) : null}
    </>
  );
}

function renderSkillInvocationMessage(props: {
  fontScale: number;
  highlightQuery: string;
  message: ConversationMessage;
  searchState: SearchVisualState;
  showMeta: boolean;
  skillInvocation: ReturnType<typeof parseSkillInvocation>;
}) {
  const {
    fontScale,
    highlightQuery,
    message,
    searchState,
    showMeta,
    skillInvocation,
  } = props;
  if (!skillInvocation) {
    return null;
  }
  const remainingText = sanitizeConversationText(skillInvocation.remainingText);
  return (
    <>
      <ConversationExpandableCard
        badge="技能"
        collapsedLabel="展开详情"
        contentScale={fontScale}
        expandedLabel="收起详情"
        messageId={message.id}
        searchState={searchState}
        subtitle={skillInvocation.name}
        timestamp={remainingText ? undefined : message.timestamp}
        text={skillInvocation.detailsText}
        tone="amber"
      />
      {remainingText ? (
        <ConversationTextBubble
          fontScale={fontScale}
          highlightQuery={highlightQuery}
          message={message}
          searchState={searchState}
          showMeta={showMeta}
          text={remainingText}
        />
      ) : null}
    </>
  );
}

function renderTaggedControlMessage(props: {
  fontScale: number;
  highlightQuery: string;
  message: ConversationMessage;
  searchState: SearchVisualState;
  showMeta: boolean;
  taggedControlMessage: ReturnType<typeof parseTaggedControlMessage>;
}) {
  const {
    fontScale,
    highlightQuery,
    message,
    searchState,
    showMeta,
    taggedControlMessage,
  } = props;
  if (!taggedControlMessage) {
    return null;
  }
  const detailsText = sanitizeConversationText(taggedControlMessage.detailsText);
  const remainingText = sanitizeConversationText(taggedControlMessage.remainingText);
  if (!detailsText) {
    return remainingText
      ? (
          <ConversationTextBubble
            fontScale={fontScale}
            highlightQuery={highlightQuery}
            message={message}
            searchState={searchState}
            showMeta={showMeta}
            text={remainingText}
          />
        )
      : null;
  }
  return (
    <>
      <ConversationExpandableCard
        badge={taggedControlMessage.badge}
        collapsedLabel="展开详情"
        contentScale={fontScale}
        expandedLabel="收起详情"
        messageId={message.id}
        searchState={searchState}
        subtitle={taggedControlMessage.subtitle}
        timestamp={remainingText ? undefined : message.timestamp}
        text={detailsText}
        tone={taggedControlMessage.tone}
      />
      {remainingText ? (
        <ConversationTextBubble
          fontScale={fontScale}
          highlightQuery={highlightQuery}
          message={message}
          searchState={searchState}
          showMeta={showMeta}
          text={remainingText}
        />
      ) : null}
    </>
  );
}

function ConversationTextBubble(props: {
  fontScale: number;
  forcePlainText?: boolean;
  highlightQuery?: string;
  message: ConversationMessage;
  searchState?: SearchVisualState;
  showMeta: boolean;
  text: string;
}) {
  const {
    fontScale,
    forcePlainText = false,
    highlightQuery = "",
    message,
    searchState = "none",
    showMeta,
    text,
  } = props;
  const scale = getConversationFontScaleClasses(fontScale);
  const normalizedHighlightQuery = highlightQuery.trim();
  const highlightRanges = normalizedHighlightQuery
    ? findConversationSearchRanges(text, normalizedHighlightQuery)
    : [];
  const shouldHighlight = highlightRanges.length > 0;
  const searchRing = searchState === "active"
    ? scale.searchActiveRing
    : (searchState === "match" ? scale.searchMatchRing : "");
  return (
    <article className={layoutTone(message)}>
      <div
        className={`rounded-xl border px-3 py-3 md:rounded-2xl md:px-4 md:py-4 ${bubbleTone(message)} ${searchRing}`}
      >
        <div
          className={`${showMeta ? "flex" : "hidden md:flex"} flex-wrap items-center gap-2 uppercase tracking-[0.18em] text-muted ${scale.meta}`}
        >
          <span>{roleLabel(message.role)}</span>
          <span className="text-muted/50">/</span>
          <span>{message.kind}</span>
          {message.title ? (
            <>
              <span className="hidden text-muted/50 md:inline">/</span>
              <span className="hidden normal-case tracking-normal md:inline">
                {message.title}
              </span>
            </>
          ) : null}
        </div>
        {shouldHighlight ? (
          <HighlightedConversationText
            highlightState={searchState}
            message={message}
            ranges={highlightRanges}
            scaleClassName={scale.textBody}
            text={text}
          />
        ) : message.role === "assistant" || message.role === "system" ? (
          <div className={`mt-3 ${forcePlainText ? scale.textBody : ""}`}>
            {forcePlainText ? (
              <div className={`whitespace-pre-wrap break-words ${scale.textBody}`}>{text}</div>
            ) : (
              <MarkdownRenderer content={text} fontScale={fontScale} />
            )}
          </div>
        ) : (
          <pre className={`mt-3 overflow-x-auto whitespace-pre-wrap break-words ${scale.textBody}`}>
            {text}
          </pre>
        )}
        <ConversationTimestamp timestamp={message.timestamp} />
      </div>
    </article>
  );
}

function ConversationImageBubble(props: {
  imagePath?: string;
  imageUrl?: string;
  message: ConversationMessage;
  searchState?: SearchVisualState;
  showMeta: boolean;
}) {
  const {
    imagePath,
    imageUrl,
    message,
    searchState = "none",
    showMeta,
  } = props;
  const imageAlt = message.role === "user" ? "用户图片" : "助手图片";
  const scale = getConversationFontScaleClasses(DEFAULT_MESSAGE_FONT_SCALE);
  const searchRing = searchState === "active"
    ? scale.searchActiveRing
    : (searchState === "match" ? scale.searchMatchRing : "");
  return (
    <article className={`group ${layoutTone(message)}`}>
      <div
        className={`rounded-xl border px-3 py-3 md:rounded-2xl md:px-4 md:py-4 ${bubbleTone(message)} ${searchRing}`}
      >
        <div
          className={`${showMeta ? "flex" : "hidden md:flex"} flex-wrap items-center gap-2 uppercase tracking-[0.18em] text-muted ${scale.meta}`}
        >
          <span>{roleLabel(message.role)}</span>
          <span className="text-muted/50">/</span>
          <span>{message.kind}</span>
        </div>
        {imageUrl ? (
          <img
            alt={imageAlt}
            className="mt-3 max-h-[28rem] w-auto max-w-full rounded-2xl border border-bdr bg-surface object-contain"
            src={imageUrl}
          />
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-bdr bg-surface px-4 py-3 text-sm text-muted">
            本地图片：{imagePath ?? "(unknown image)"}
          </div>
        )}
        {imagePath && !imageUrl ? null : imagePath ? (
          <div className="mt-2 text-xs text-muted break-all">{imagePath}</div>
        ) : null}
        <ConversationTimestamp timestamp={message.timestamp} />
      </div>
    </article>
  );
}

function HighlightedConversationText(props: {
  highlightState: SearchVisualState;
  message: ConversationMessage;
  ranges: Array<{ start: number; end: number }>;
  scaleClassName: string;
  text: string;
}) {
  const { highlightState, message, ranges, scaleClassName, text } = props;
  const content = (
    <>
      {sliceHighlightedText(text, ranges).map((part, index) => (
        part.highlight ? (
          <mark
            key={`${part.text}-${index}`}
            className={highlightState === "active" && part.active
              ? "rounded bg-amber-400/50 px-0.5 text-current"
              : "rounded bg-amber-300/25 px-0.5 text-current"}
          >
            {part.text}
          </mark>
        ) : (
          <span key={`${part.text}-${index}`}>{part.text}</span>
        )
      ))}
    </>
  );

  if (message.role === "assistant" || message.role === "system") {
    return (
      <div className={`mt-3 whitespace-pre-wrap break-words ${scaleClassName}`}>
        {content}
      </div>
    );
  }
  return (
    <pre className={`mt-3 overflow-x-auto whitespace-pre-wrap break-words ${scaleClassName}`}>
      {content}
    </pre>
  );
}

function sliceHighlightedText(
  text: string,
  ranges: Array<{ start: number; end: number }>,
) {
  const parts: Array<{ active: boolean; highlight: boolean; text: string }> = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) {
      parts.push({
        active: false,
        highlight: false,
        text: text.slice(cursor, range.start),
      });
    }
    parts.push({
      active: index === 0,
      highlight: true,
      text: text.slice(range.start, range.end),
    });
    cursor = range.end;
  });
  if (cursor < text.length) {
    parts.push({
      active: false,
      highlight: false,
      text: text.slice(cursor),
    });
  }
  return parts.filter((part) => part.text.length > 0);
}
