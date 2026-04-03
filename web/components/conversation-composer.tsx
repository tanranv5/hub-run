import { Mic, Send, Square } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  ProviderModelOption,
  ProviderReasoningEffort,
} from "../../api/types";
import { shouldSubmitOnEnter } from "../conversation-composer-helpers";
import {
  getStatusButtonLabel,
  getStatusPlaceholder,
  type ConversationStatus,
} from "../conversation-status";
import ConversationContextBadge from "./conversation-context-badge";
import type { VoiceInputPhase } from "../use-voice-input";

export const COMPOSER_DEFAULT_HEIGHT_PX = 112;
export const COMPOSER_MIN_HEIGHT_PX = 72;
export const COMPOSER_MAX_HEIGHT_PX = 320;
export const COMPOSER_COLLAPSED_HEIGHT_PX = 44;

interface ConversationComposerProps {
  browseCollapsed?: boolean;
  canInterrupt?: boolean;
  contextDetails?: string | null;
  contextLabel?: string | null;
  conversationStatus: ConversationStatus;
  draft: string;
  effortOptions: ProviderReasoningEffort[];
  interrupting?: boolean;
  modelOptions: ProviderModelOption[];
  refreshing?: boolean;
  selectedEffort: ProviderReasoningEffort | null;
  selectedModelId: string | null;
  sending: boolean;
  storedHeight?: number | null;
  voicePhase?: VoiceInputPhase;
  onDraftChange: (value: string) => void;
  onExpandFromBrowse?: () => void;
  onStoredHeightChange?: (height: number) => void;
  onSelectEffort: (value: ProviderReasoningEffort | null) => void;
  onSelectModel: (value: string | null) => void;
  onInterrupt?: () => void;
  onSend: () => void;
  onVoiceClick: () => void;
}

export function clampComposerStoredHeight(height: number): number {
  return Math.min(
    COMPOSER_MAX_HEIGHT_PX,
    Math.max(COMPOSER_MIN_HEIGHT_PX, Math.round(height)),
  );
}

export function resolveComposerTextareaHeight(props: {
  browseCollapsed: boolean;
  contentHeight: number;
  storedHeight: number | null;
}) {
  const { browseCollapsed, contentHeight, storedHeight } = props;
  if (browseCollapsed) {
    return COMPOSER_COLLAPSED_HEIGHT_PX;
  }
  if (typeof storedHeight === "number" && Number.isFinite(storedHeight)) {
    return clampComposerStoredHeight(storedHeight);
  }
  return clampComposerStoredHeight(contentHeight || COMPOSER_DEFAULT_HEIGHT_PX);
}

export function resolveComposerStoredHeightFromTopDrag(props: {
  initialHeight: number;
  originClientY: number;
  nextClientY: number;
}) {
  const { initialHeight, nextClientY, originClientY } = props;
  return clampComposerStoredHeight(initialHeight + (originClientY - nextClientY));
}

function ComposerSelect(props: {
  label: string;
  mobileLabel?: string;
  options: { label: string; value: string }[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
}) {
  const {
    className = "",
    disabled = false,
    label,
    mobileLabel = label,
    options,
    value,
    onChange,
  } = props;
  if (!options.length) {
    return null;
  }

  return (
    <label className={`flex min-w-0 items-center gap-2 overflow-hidden rounded-full border border-bdr bg-surface px-2.5 py-1 text-[10px] text-muted md:px-3 md:text-[11px] ${className}`}>
      <span className="shrink-0 md:hidden">{mobileLabel}</span>
      <span className="hidden shrink-0 md:inline">{label}</span>
      <select
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 truncate bg-transparent text-txt outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-panel text-txt">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function ConversationComposer(props: ConversationComposerProps) {
  const {
    browseCollapsed = false,
    canInterrupt = false,
    contextDetails = null,
    contextLabel = null,
    conversationStatus,
    draft,
    effortOptions,
    interrupting = false,
    modelOptions,
    refreshing = false,
    selectedEffort,
    selectedModelId,
    sending,
    storedHeight = null,
    voicePhase = "idle",
    onDraftChange,
    onExpandFromBrowse,
    onStoredHeightChange,
    onInterrupt,
    onSelectEffort,
    onSelectModel,
    onSend,
    onVoiceClick,
  } = props;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const buttonLabel = getStatusButtonLabel(conversationStatus, sending);
  const composerDisabled = refreshing;
  const composerPlaceholder = composerDisabled
    ? "刷新中，暂时不可编辑"
    : getVoiceAwarePlaceholder(conversationStatus, voicePhase);
  const [contentHeight, setContentHeight] = useState(COMPOSER_DEFAULT_HEIGHT_PX);
  const resolvedHeight = resolveComposerTextareaHeight({
    browseCollapsed,
    contentHeight,
    storedHeight,
  });

  const measureContentHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) {
      return COMPOSER_DEFAULT_HEIGHT_PX;
    }
    const previousHeight = el.style.height;
    el.style.height = "auto";
    const measured = clampComposerStoredHeight(el.scrollHeight);
    el.style.height = previousHeight;
    setContentHeight(measured);
    return measured;
  }, []);

  useLayoutEffect(() => {
    if (browseCollapsed) {
      return;
    }
    if (storedHeight !== null) {
      return;
    }
    measureContentHeight();
  }, [browseCollapsed, draft, measureContentHeight, storedHeight]);

  useEffect(() => () => {
    resizeCleanupRef.current?.();
  }, []);

  const beginManualResize = useCallback((clientY: number) => {
    const startingHeight = storedHeight ?? measureContentHeight();
    onExpandFromBrowse?.();
    const initialHeight = clampComposerStoredHeight(startingHeight);
    const handleMove = (nextClientY: number) => {
      const nextHeight = resolveComposerStoredHeightFromTopDrag({
        initialHeight,
        nextClientY,
        originClientY: clientY,
      });
      onStoredHeightChange?.(nextHeight);
      setContentHeight(nextHeight);
    };
    const handlePointerMove = (event: PointerEvent) => {
      handleMove(event.clientY);
    };
    const handleMouseMove = (event: MouseEvent) => {
      handleMove(event.clientY);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", cleanup);
      resizeCleanupRef.current = null;
    };
    resizeCleanupRef.current?.();
    resizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", cleanup);
  }, [measureContentHeight, onExpandFromBrowse, onStoredHeightChange, storedHeight]);

  return (
    <div className="flex-none p-3 md:p-5">
        <section className="relative rounded-2xl border border-bdr bg-panel/60 dark:bg-panel-2 px-3 pb-3 pt-3 shadow-sm shadow-black/5 backdrop-blur-sm transition-all focus-within:border-accent/40 focus-within:ring-4 focus-within:ring-accent/5">
          {contextLabel ? (
            <ConversationContextBadge details={contextDetails} label={contextLabel} />
          ) : null}
          <ComposerControls
            disabled={composerDisabled}
            effortOptions={effortOptions}
            modelOptions={modelOptions}
            selectedEffort={selectedEffort}
            selectedModelId={selectedModelId}
            onSelectEffort={onSelectEffort}
            onSelectModel={onSelectModel}
          />
        <textarea
          ref={textareaRef}
          disabled={composerDisabled}
          value={draft}
          onChange={(event) => {
            onExpandFromBrowse?.();
            onDraftChange(event.target.value);
          }}
          onFocus={() => onExpandFromBrowse?.()}
          onKeyDown={(event) => {
            if (
              shouldSubmitOnEnter({
                key: event.key,
                shiftKey: event.shiftKey,
                isComposing: event.nativeEvent.isComposing,
              })
            ) {
              event.preventDefault();
              onSend();
            }
          }}
          rows={2}
          aria-label="发送消息"
          placeholder={composerPlaceholder}
          className="w-full resize-none bg-transparent px-1 pb-14 pt-1 text-[13px] leading-5 text-txt outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60 md:pr-[27rem] md:text-sm md:leading-6"
          style={{
            height: `${resolvedHeight}px`,
            maxHeight: `${COMPOSER_MAX_HEIGHT_PX}px`,
            overflow: browseCollapsed ? "hidden" : "auto",
          }}
        />
        <button
          type="button"
          aria-label="拖动调整输入框高度"
          data-slot="composer-resize-handle"
          onPointerDown={(event) => {
            event.preventDefault();
            beginManualResize(event.clientY);
          }}
          className="group absolute inset-x-3 top-0 z-10 h-5 -translate-y-1/2 touch-none cursor-row-resize rounded-full bg-transparent"
        >
          <span className="pointer-events-none absolute inset-x-[36%] top-1/2 h-1 -translate-y-1/2 rounded-full bg-bdr/70 transition group-hover:bg-bdr" />
        </button>
        <ComposerActions
          buttonLabel={buttonLabel}
          canInterrupt={canInterrupt}
          draft={draft}
          interrupting={interrupting}
          refreshing={composerDisabled}
          onInterrupt={onInterrupt}
          sending={sending}
          onSend={onSend}
          onVoiceClick={onVoiceClick}
          voicePhase={voicePhase}
        />
        </section>
    </div>
  );
}

function ComposerControls(props: {
  disabled?: boolean;
  effortOptions: ProviderReasoningEffort[];
  modelOptions: ProviderModelOption[];
  selectedEffort: ProviderReasoningEffort | null;
  selectedModelId: string | null;
  onSelectEffort: (value: ProviderReasoningEffort | null) => void;
  onSelectModel: (value: string | null) => void;
}) {
  const {
    disabled = false,
    effortOptions,
    modelOptions,
    selectedEffort,
    selectedModelId,
    onSelectEffort,
    onSelectModel,
  } = props;

  return (
    <div
      data-slot="composer-controls"
      className="mb-2 grid grid-cols-[minmax(0,1fr)_minmax(6.25rem,0.8fr)] items-center gap-2 md:absolute md:right-3 md:top-3 md:z-10 md:mb-0 md:flex"
    >
      <ComposerSelect
        label="模型"
        options={modelOptions.map((model) => ({
          label: model.displayName,
          value: model.id,
        }))}
        disabled={disabled}
        value={selectedModelId ?? ""}
        onChange={(value) => onSelectModel(value || null)}
      />
      <ComposerSelect
        label="思考深度"
        mobileLabel="思考"
        className="min-w-[6.25rem]"
        disabled={disabled}
        options={effortOptions.map((effort) => ({
          label: effort,
          value: effort,
        }))}
        value={selectedEffort ?? ""}
        onChange={(value) => onSelectEffort((value || null) as ProviderReasoningEffort | null)}
      />
    </div>
  );
}

function ComposerActions(props: {
  buttonLabel: string | null;
  canInterrupt: boolean;
  draft: string;
  interrupting: boolean;
  refreshing?: boolean;
  onInterrupt?: () => void;
  sending: boolean;
  voicePhase: VoiceInputPhase;
  onSend: () => void;
  onVoiceClick: () => void;
}) {
  const {
    buttonLabel,
    canInterrupt,
    draft,
    interrupting,
    refreshing = false,
    onInterrupt,
    sending,
    voicePhase,
    onSend,
    onVoiceClick,
  } = props;
  const voiceBusy =
    refreshing || voicePhase === "starting" || voicePhase === "stopping";
  const voiceRecording = voicePhase === "recording";
  const voiceTitle = getVoiceButtonTitle(voicePhase);
  const sendButtonClassName = buttonLabel
    ? "inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-accent px-3 text-sm font-medium text-bg transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
    : "inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent text-bg transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div
      data-slot="composer-actions"
      className="absolute bottom-3 right-3 z-10 flex items-center justify-end gap-2"
    >
      <button
        type="button"
        onClick={onVoiceClick}
        title={voiceTitle}
        disabled={voiceBusy}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-60 ${
          voiceRecording
            ? "border-rose-400/30 bg-rose-500/12 text-rose-700 dark:text-rose-100 hover:bg-rose-500/18"
            : "border-bdr bg-surface text-txt hover:bg-surface-hover"
        }`}
      >
        {voiceRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        <span className="sr-only">{voiceTitle}</span>
      </button>
      {canInterrupt ? (
        <button
        type="button"
        onClick={() => onInterrupt?.()}
        disabled={refreshing || interrupting}
          className="flex h-9 min-w-9 items-center justify-center rounded-full border border-rose-400/20 bg-rose-500/10 px-3 text-sm font-medium text-rose-700 dark:text-rose-100 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Square className="mr-1 h-4 w-4" />
          <span>{interrupting ? "中断中" : "中断"}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onSend}
          disabled={refreshing || sending || voicePhase !== "idle" || !draft.trim()}
          className={sendButtonClassName}
        >
          {buttonLabel ?? <Send className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

function getVoiceAwarePlaceholder(status: ConversationStatus, voicePhase: VoiceInputPhase) {
  if (voicePhase === "starting") {
    return "正在打开麦克风...";
  }
  if (voicePhase === "recording") {
    return "正在语音识别...";
  }
  if (voicePhase === "stopping") {
    return "正在整理语音...";
  }
  return getStatusPlaceholder(status);
}

function getVoiceButtonTitle(voicePhase: VoiceInputPhase) {
  if (voicePhase === "starting") {
    return "正在打开麦克风";
  }
  if (voicePhase === "recording") {
    return "结束语音输入";
  }
  if (voicePhase === "stopping") {
    return "正在整理语音";
  }
  return "开始语音输入";
}
