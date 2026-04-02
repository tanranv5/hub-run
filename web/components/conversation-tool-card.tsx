import { useEffect, useState } from "react";
import type { ConversationBlock } from "../../api/types";
import {
  parseJsonLikeText,
  stringifyStructuredValue,
  summarizeToolBlock,
} from "../conversation-message-helpers";
import { ConversationTimestamp } from "./conversation-timestamp";
import { MarkdownRenderer, getFencedCodeBlock } from "./markdown-renderer";
import {
  DEFAULT_MESSAGE_FONT_SCALE,
  getConversationFontScaleClasses,
} from "../conversation-reading-styles";

const LAYERED_TOOL_LABELS = new Set(["脚本", "写入文件"]);

export function ConversationToolCard(props: {
  block: ConversationBlock;
  contentScale?: number;
  messageId: string;
  searchState?: "none" | "match" | "active";
  timestamp?: string;
  toolLabel: string;
  toolTitle: string | null;
}) {
  const {
    block,
    contentScale = DEFAULT_MESSAGE_FONT_SCALE,
    messageId,
    searchState = "none",
    timestamp,
    toolLabel,
    toolTitle,
  } = props;
  const [expanded, setExpanded] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(false);
  const layeredCollapse = shouldUseLayeredCollapse(toolLabel);
  const preview = summarizeToolBlock(block);
  const isResult = block.type === "tool_result";
  const toggleLabel = getTopToggleLabel(expanded, isResult, layeredCollapse);
  const scale = getConversationFontScaleClasses(contentScale);
  const searchRing = searchState === "active"
    ? scale.searchActiveRing
    : (searchState === "match" ? scale.searchMatchRing : "");

  useEffect(() => {
    setExpanded(false);
    setResultExpanded(false);
  }, [messageId]);

  return (
    <article className="group mx-auto max-w-full">
      <div className={`rounded-xl border border-accent/20 bg-accent/8 px-3 py-3 text-txt md:rounded-2xl md:px-4 md:py-4 ${searchRing}`}>
        <button
          aria-expanded={expanded}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-bdr bg-surface px-3 py-2 text-left"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-accent/80 md:text-[11px]">
            <span>{toolLabel}</span>
            {toolTitle ? (
              <>
                <span className="text-accent/30">/</span>
                <span className="normal-case tracking-normal text-accent/60">{toolTitle}</span>
              </>
            ) : null}
          </span>
          <span className="text-[11px] text-accent">{toggleLabel}</span>
        </button>
        {!layeredCollapse || expanded ? (
          <p className={`mt-3 whitespace-pre-wrap break-words text-txt/90 ${scale.toolPreview}`}>
            {preview}
          </p>
        ) : null}
        {expanded ? (
          <ToolExpandedBody
            block={block}
            contentScale={contentScale}
            layeredCollapse={layeredCollapse}
            resultExpanded={resultExpanded}
            setResultExpanded={setResultExpanded}
          />
        ) : null}
        <ConversationTimestamp className="text-accent/55" timestamp={timestamp} />
      </div>
    </article>
  );
}

function getTopToggleLabel(
  expanded: boolean,
  isResult: boolean,
  layeredCollapse: boolean,
) {
  if (layeredCollapse) {
    return expanded ? "收起详情" : "展开详情";
  }
  if (isResult) {
    return expanded ? "收起结果" : "展开结果";
  }
  return expanded ? "收起输入" : "展开输入";
}

function shouldUseLayeredCollapse(toolLabel: string) {
  return LAYERED_TOOL_LABELS.has(toolLabel);
}

function ToolExpandedBody(props: {
  block: ConversationBlock;
  contentScale: number;
  layeredCollapse: boolean;
  resultExpanded: boolean;
  setResultExpanded: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  const { block, contentScale, layeredCollapse, resultExpanded, setResultExpanded } = props;
  if (!layeredCollapse || block.type !== "tool_result") {
    return <ToolValueContent block={block} contentScale={contentScale} />;
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={resultExpanded}
        data-slot="tool-result-nested-toggle"
        onClick={() => setResultExpanded((current) => !current)}
        className="inline-flex items-center rounded-lg border border-bdr bg-surface px-2.5 py-1.5 text-[11px] text-accent transition hover:bg-surface-hover"
      >
        {resultExpanded ? "收起执行结果" : "展开执行结果"}
      </button>
      {resultExpanded ? <ToolValueContent block={block} contentScale={contentScale} /> : null}
    </div>
  );
}

function ToolValueContent(props: { block: ConversationBlock; contentScale: number }) {
  const { block, contentScale } = props;
  const scale = getConversationFontScaleClasses(contentScale);
  const value = block.type === "tool_use" ? block.input : block.content;
  const text = stringifyStructuredValue(value);
  if (!text.trim()) {
    return null;
  }

  const specialContent = renderSpecialToolContent(block);
  if (specialContent) {
    return <div className="mt-3">{specialContent}</div>;
  }

  const parsed = typeof value === "string" ? parseJsonLikeText(value) : value;
  if (parsed && typeof parsed === "object") {
    return (
      <pre className={`mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-2xl border border-bdr bg-surface px-3 py-3 text-txt/90 ${scale.expandableBody}`}>
        {JSON.stringify(parsed, null, 2)}
      </pre>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-bdr bg-surface px-3 py-3">
      <MarkdownRenderer content={formatToolText(text, block.type)} fontScale={contentScale} />
    </div>
  );
}

function formatToolText(
  text: string,
  type: ConversationBlock["type"],
): string {
  if (type !== "tool_result") {
    return getFencedCodeBlock(text, "json");
  }
  if (text.includes("```")) {
    return text;
  }
  return text.includes("\n") ? getFencedCodeBlock(text, "text") : text;
}

function renderSpecialToolContent(block: ConversationBlock) {
  if (block.type !== "tool_use" || !block.name || !block.input || typeof block.input !== "object") {
    return null;
  }

  const toolName = block.name.toLowerCase();
  const input = block.input as Record<string, unknown>;
  if ((toolName === "update_plan" || toolName === "todowrite") && Array.isArray(input.todos)) {
    return <TodoInputView items={input.todos} />;
  }
  if ((toolName === "request_user_input" || toolName === "askuserquestion") && Array.isArray(input.questions)) {
    return <QuestionInputView questions={input.questions} />;
  }
  if ((toolName === "task" || toolName === "spawn_agent") && typeof input.prompt === "string") {
    return (
      <TaskInputView
        description={typeof input.description === "string" ? input.description : null}
        prompt={input.prompt}
        subagentType={typeof input.subagent_type === "string" ? input.subagent_type : null}
      />
    );
  }
  return null;
}

function TodoInputView(props: { items: unknown[] }) {
  const items = props.items
    .filter((item) => item && typeof item === "object")
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({
      content: typeof item.content === "string" ? item.content : "",
      status: typeof item.status === "string" ? item.status : "pending",
    }))
    .filter((item) => item.content);
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className="overflow-hidden rounded-2xl border border-bdr bg-surface">
      {items.map((item, index) => (
        <li key={`${item.content}-${index}`} className="border-b border-bdr px-3 py-2 last:border-b-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-accent/60">{item.status}</div>
          <div className="mt-1 text-sm leading-6 text-txt/90">{item.content}</div>
        </li>
      ))}
    </ul>
  );
}

function QuestionInputView(props: { questions: unknown[] }) {
  const questions = props.questions
    .filter((question) => question && typeof question === "object")
    .map((question) => question as Record<string, unknown>)
    .map((question) => ({
      header: typeof question.header === "string" ? question.header : "Question",
      question: typeof question.question === "string" ? question.question : "",
      options: Array.isArray(question.options) ? question.options : [],
    }))
    .filter((question) => question.question);
  if (questions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {questions.map((question, index) => (
        <div key={`${question.header}-${index}`} className="rounded-2xl border border-bdr bg-surface px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-accent/60">{question.header}</div>
          <div className="mt-2 text-sm leading-6 text-txt/90">{question.question}</div>
          <ul className="mt-3 space-y-2">
            {question.options.map((option, optionIndex) => {
              const record = option && typeof option === "object" ? option as Record<string, unknown> : null;
              const label = typeof record?.label === "string" ? record.label : "";
              const description = typeof record?.description === "string" ? record.description : "";
              if (!label) {
                return null;
              }
              return (
                <li key={`${label}-${optionIndex}`} className="rounded-xl border border-bdr bg-accent/6 px-3 py-2">
                  <div className="text-sm font-medium text-accent">{label}</div>
                  {description ? <div className="mt-1 text-xs text-muted">{description}</div> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TaskInputView(props: {
  description: string | null;
  prompt: string;
  subagentType: string | null;
}) {
  const { description, prompt, subagentType } = props;
  return (
    <div className="rounded-2xl border border-bdr bg-surface px-3 py-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-accent/60">
        {subagentType ? <span>{subagentType}</span> : null}
        {description ? <span className="normal-case tracking-normal text-muted">{description}</span> : null}
      </div>
      <div className="mt-3 text-sm leading-6 text-txt/90">
        <MarkdownRenderer content={prompt} />
      </div>
    </div>
  );
}
