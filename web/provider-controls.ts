import type {
  ProviderModelOption,
  ProviderReasoningEffort,
  ProviderSummary,
} from "../api/types";
import { getProviderModels, getProviderProjects } from "./api";

const REASONING_EFFORTS: ProviderReasoningEffort[] = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

export interface ProviderControlsState {
  models: ProviderModelOption[];
  projects: string[];
  selectedProject: string | null;
  selectedModelId: string | null;
  selectedEffort: ProviderReasoningEffort | null;
  newSessionCwd: string;
  loading: boolean;
  creatingSession: boolean;
  error: string | null;
}

export const INITIAL_PROVIDER_CONTROLS: ProviderControlsState = {
  models: [],
  projects: [],
  selectedProject: null,
  selectedModelId: null,
  selectedEffort: null,
  newSessionCwd: "",
  loading: false,
  creatingSession: false,
  error: null,
};

export function getVisibleModels(models: ProviderModelOption[]): ProviderModelOption[] {
  return models.filter((model) => !model.hidden);
}

export function getEffortOptions(
  models: ProviderModelOption[],
  selectedModelId: string | null,
  selectedEffort: ProviderReasoningEffort | null,
): ProviderReasoningEffort[] {
  const selectedModel = findSelectedModel(models, selectedModelId);
  const effortSet = new Set<ProviderReasoningEffort>();

  if (selectedModel && selectedModel.supportedReasoningEfforts.length > 0) {
    appendEfforts(effortSet, selectedModel.supportedReasoningEfforts);
  } else {
    for (const model of models) {
      appendEfforts(effortSet, model.supportedReasoningEfforts);
    }
  }

  if (selectedEffort) {
    effortSet.add(selectedEffort);
  }

  return REASONING_EFFORTS.filter((effort) => effortSet.has(effort));
}

export async function loadProviderControls(
  provider: ProviderSummary,
  cachedPreference: {
    modelId: string | null;
    effort: ProviderReasoningEffort | null;
  } | null = null,
) {
  const [projects, models] = await Promise.all([
    getProviderProjects(provider.id),
    provider.capabilities.modelSelection ? getProviderModels(provider.id) : Promise.resolve([]),
  ]);

  return resolveProviderControlsFromData(projects, models, cachedPreference);
}

export function resolveProviderControlsFromData(
  projects: string[],
  rawModels: ProviderModelOption[],
  cachedPreference: {
    modelId: string | null;
    effort: ProviderReasoningEffort | null;
  } | null = null,
): ProviderControlsState {
  const visibleModels = getVisibleModels(rawModels);
  const selectedModelId = resolveSelectedModelId(
    visibleModels,
    null,
    cachedPreference?.modelId ?? null,
  );
  return {
    models: visibleModels,
    projects,
    selectedProject: null,
    selectedModelId,
    selectedEffort: resolveSelectedEffort(
      visibleModels,
      selectedModelId,
      null,
      cachedPreference?.effort ?? null,
    ),
    newSessionCwd: "",
    loading: false,
    creatingSession: false,
    error: null,
  };
}

export function createLoadingProviderControls(
  _current?: ProviderControlsState,
): ProviderControlsState {
  return {
    ...INITIAL_PROVIDER_CONTROLS,
    loading: true,
  };
}

export function syncEffortSelection(
  models: ProviderModelOption[],
  selectedModelId: string | null,
  selectedEffort: ProviderReasoningEffort | null,
): ProviderReasoningEffort | null {
  const effortOptions = getEffortOptions(models, selectedModelId, selectedEffort);
  if (!effortOptions.length) {
    return null;
  }

  if (selectedEffort && effortOptions.includes(selectedEffort)) {
    return selectedEffort;
  }

  const selectedModel = findSelectedModel(models, selectedModelId);
  return selectedModel?.defaultReasoningEffort ?? effortOptions[0] ?? null;
}

export function resolveSelectedModelId(
  models: ProviderModelOption[],
  sessionModelId: string | null,
  cachedModelId: string | null,
) {
  if (findSelectedModel(models, sessionModelId)) {
    return sessionModelId;
  }
  if (findSelectedModel(models, cachedModelId)) {
    return cachedModelId;
  }
  return models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? null;
}

export function resolveSelectedEffort(
  models: ProviderModelOption[],
  selectedModelId: string | null,
  sessionEffort: ProviderReasoningEffort | null,
  cachedEffort: ProviderReasoningEffort | null,
): ProviderReasoningEffort | null {
  const preferredEffort = sessionEffort ?? cachedEffort ?? null;
  return syncEffortSelection(models, selectedModelId, preferredEffort);
}

function findSelectedModel(
  models: ProviderModelOption[],
  selectedModelId: string | null,
) {
  return models.find((model) => model.id === selectedModelId) ?? null;
}

function appendEfforts(
  target: Set<ProviderReasoningEffort>,
  efforts: ProviderReasoningEffort[],
) {
  for (const effort of efforts) {
    target.add(effort);
  }
}
