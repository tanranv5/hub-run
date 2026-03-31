import type {
  ProviderId,
  ProviderModelOption,
  ProviderReasoningEffort,
  ProviderSessionContext,
  SessionSummary,
} from "../api/types";
import {
  resolveSelectedEffort,
  resolveSelectedModelId,
  syncEffortSelection,
} from "./provider-controls";
import {
  clearSelectedSessionPreference,
  getBrowserStorage,
  readProviderControlPreference,
  readSelectedSessionPreference,
  writeProviderControlPreference,
  writeSelectedSessionPreference,
} from "./ui-preferences";

export function getStoredControlPreference(providerId: ProviderId) {
  return readProviderControlPreference(getBrowserStorage(), providerId);
}

export function getStoredSelectedSession(
  providerId: ProviderId,
  project: string | null,
) {
  return readSelectedSessionPreference(getBrowserStorage(), providerId, project);
}

export function persistProviderControls(
  providerId: ProviderId,
  modelId: string | null,
  effort: ProviderReasoningEffort | null,
) {
  writeProviderControlPreference(getBrowserStorage(), providerId, {
    modelId,
    effort,
  });
}

export function persistSelectedSession(
  providerId: ProviderId,
  project: string | null,
  session: SessionSummary,
) {
  writeSelectedSessionPreference(getBrowserStorage(), providerId, project, session);
}

export function clearStoredSelectedSession(
  providerId: ProviderId,
  sessionId: string,
) {
  clearSelectedSessionPreference(getBrowserStorage(), providerId, sessionId);
}

export function resolveContextDrivenControls(
  models: ProviderModelOption[],
  currentModelId: string | null,
  currentEffort: ProviderReasoningEffort | null,
  context: ProviderSessionContext | null,
) {
  const selectedModelId = resolveSelectedModelId(
    models,
    context?.modelId ?? null,
    currentModelId,
  );
  return {
    selectedModelId,
    selectedEffort: resolveSelectedEffort(
      models,
      selectedModelId,
      context?.reasoningEffort ?? null,
      currentEffort,
    ),
  };
}

export function resolveUserSelectedControls(
  models: ProviderModelOption[],
  modelId: string | null,
  effort: ProviderReasoningEffort | null,
) {
  return {
    selectedModelId: modelId,
    selectedEffort: syncEffortSelection(models, modelId, effort),
  };
}
