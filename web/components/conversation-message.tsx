import type { ConversationMessage, ProviderSummary } from "../../api/types";
import {
  getMessageBlock,
  parseTaggedControlMessage,
  parseSubagentNotification,
  parseSkillInvocation,
  getToolLabel,
  resolveToolTitle,
  sanitizeConversationText,
} from "../conversation-message-helpers";
import { ConversationExpandableCard } from "./conversation-expandable-card";
import { MarkdownRenderer } from "./markdown-renderer";
import { ConversationTimestamp } from "./conversation-timestamp";
import { ConversationToolCard } from "./conversation-tool-card";

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
  message: ConversationMessage;
  previousMessage?: ConversationMessage | null;
}) {
  const { message, previousMessage = null } = props;
  const block = getMessageBlock(message);
  const sanitizedText = sanitizeConversationText(message.text);
  const skillInvocation = parseSkillInvocation(message.text);
  const subagentNotification = parseSubagentNotification(message.text);
  const taggedControlMessage = parseTaggedControlMessage(message.text);
  const showMeta = showMetaOnMobile(message);

  if (skillInvocation) {
    return renderSkillInvocationMessage(message, showMeta, skillInvocation);
  }
  if (subagentNotification) {
    return renderSubagentNotificationMessage(message, showMeta, subagentNotification);
  }
  if (taggedControlMessage) {
    return renderTaggedControlMessage(message, showMeta, taggedControlMessage);
  }

  if (block.type === "thinking") {
    if (!sanitizedText) {
      return null;
    }
    return (
      <ConversationExpandableCard
        badge="思考"
        collapsedLabel="展开思考"
        expandedLabel="收起思考"
        messageId={message.id}
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
        expandedLabel="收起详情"
        messageId={message.id}
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
        messageId={message.id}
        timestamp={message.timestamp}
        toolLabel={getToolLabel(toolTitle)}
        toolTitle={toolTitle}
      />
    );
  }

  if (!sanitizedText) {
    return null;
  }

  return <ConversationTextBubble message={message} showMeta={showMeta} text={sanitizedText} />;
}

function renderSubagentNotificationMessage(
  message: ConversationMessage,
  showMeta: boolean,
  notification: ReturnType<typeof parseSubagentNotification>,
) {
  if (!notification) {
    return null;
  }
  const remainingText = sanitizeConversationText(notification.remainingText);
  return (
    <>
      <ConversationExpandableCard
        badge="子代理"
        collapsedLabel="展开详情"
        expandedLabel="收起详情"
        messageId={message.id}
        subtitle={notification.statusLabel}
        timestamp={remainingText ? undefined : message.timestamp}
        text={notification.detailsText}
        tone="amber"
      />
      {remainingText ? (
        <ConversationTextBubble message={message} showMeta={showMeta} text={remainingText} />
      ) : null}
    </>
  );
}

function renderSkillInvocationMessage(
  message: ConversationMessage,
  showMeta: boolean,
  skillInvocation: ReturnType<typeof parseSkillInvocation>,
) {
  if (!skillInvocation) {
    return null;
  }
  const remainingText = sanitizeConversationText(skillInvocation.remainingText);
  return (
    <>
      <ConversationExpandableCard
        badge="技能"
        collapsedLabel="展开详情"
        expandedLabel="收起详情"
        messageId={message.id}
        subtitle={skillInvocation.name}
        timestamp={remainingText ? undefined : message.timestamp}
        text={skillInvocation.detailsText}
        tone="amber"
      />
      {remainingText ? (
        <ConversationTextBubble message={message} showMeta={showMeta} text={remainingText} />
      ) : null}
    </>
  );
}

function renderTaggedControlMessage(
  message: ConversationMessage,
  showMeta: boolean,
  taggedControlMessage: ReturnType<typeof parseTaggedControlMessage>,
) {
  if (!taggedControlMessage) {
    return null;
  }
  const detailsText = sanitizeConversationText(taggedControlMessage.detailsText);
  const remainingText = sanitizeConversationText(taggedControlMessage.remainingText);
  if (!detailsText) {
    return remainingText
      ? <ConversationTextBubble message={message} showMeta={showMeta} text={remainingText} />
      : null;
  }
  return (
    <>
      <ConversationExpandableCard
        badge={taggedControlMessage.badge}
        collapsedLabel="展开详情"
        expandedLabel="收起详情"
        messageId={message.id}
        subtitle={taggedControlMessage.subtitle}
        timestamp={remainingText ? undefined : message.timestamp}
        text={detailsText}
        tone={taggedControlMessage.tone}
      />
      {remainingText ? (
        <ConversationTextBubble message={message} showMeta={showMeta} text={remainingText} />
      ) : null}
    </>
  );
}

function ConversationTextBubble(props: {
  message: ConversationMessage;
  showMeta: boolean;
  text: string;
}) {
  const { message, showMeta, text } = props;
  return (
    <article className={layoutTone(message)}>
      <div
        className={`rounded-[22px] border px-3 py-3 shadow-lg shadow-slate-950/15 md:rounded-[26px] md:px-4 md:py-4 ${bubbleTone(message)}`}
      >
        <div
          className={`${showMeta ? "flex" : "hidden md:flex"} flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted md:text-[11px]`}
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
        {message.role === "assistant" || message.role === "system" ? (
          <div className="mt-3 text-[14px] leading-6 md:text-[15px] md:leading-7">
            <MarkdownRenderer content={text} />
          </div>
        ) : (
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-[14px] leading-5 md:text-[15px] md:leading-6">
            {text}
          </pre>
        )}
        <ConversationTimestamp timestamp={message.timestamp} />
      </div>
    </article>
  );
}
