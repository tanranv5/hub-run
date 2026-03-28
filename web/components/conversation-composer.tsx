import { Mic, Send, Square } from "lucide-react";
import { useCallback, useRef } from "react";
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

interface ConversationComposerProps {
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
  voicePhase?: VoiceInputPhase;
  onDraftChange: (value: string) => void;
  onSelectEffort: (value: ProviderReasoningEffort | null) => void;
  onSelectModel: (value: string | null) => void;
  onInterrupt?: () => void;
  onSend: () => void;
  onVoiceClick: () => void;
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
    voicePhase = "idle",
    onDraftChange,
    onInterrupt,
    onSelectEffort,
    onSelectModel,
    onSend,
    onVoiceClick,
  } = props;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const buttonLabel = getStatusButtonLabel(conversationStatus, sending);
  const composerDisabled = refreshing;
  const composerPlaceholder = composerDisabled
    ? "刷新中，暂时不可编辑"
    : getVoiceAwarePlaceholder(conversationStatus, voicePhase);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  return (
    <div className="flex-none p-3 md:p-5">
        <section className="relative rounded-[32px] border border-bdr bg-panel/60 dark:bg-panel-2 px-3 pb-3 pt-3 shadow-lg shadow-black/5 backdrop-blur-sm transition-all focus-within:border-accent/40 focus-within:ring-4 focus-within:ring-accent/5 dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
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
            onDraftChange(event.target.value);
            autoResize();
          }}
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
          style={{ maxHeight: "200px", overflow: "auto" }}
        />
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
        className={`flex h-9 min-w-9 items-center justify-center rounded-full border px-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
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
          className="flex h-9 min-w-9 items-center justify-center rounded-full bg-accent px-3 text-sm font-medium text-bg transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
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
