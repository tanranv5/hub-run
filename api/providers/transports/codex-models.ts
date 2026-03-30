import type { ProviderModelOption } from "../../types";

const FULL_REASONING = ["low", "medium", "high", "xhigh"] as const;
const MINI_REASONING = ["medium", "high"] as const;

const STATIC_CODEX_MODELS: ProviderModelOption[] = [
  {
    id: "gpt-5.4",
    displayName: "gpt-5.4",
    description: "Latest frontier agentic coding model.",
    isDefault: true,
    hidden: false,
    defaultReasoningEffort: "high",
    supportedReasoningEfforts: [...FULL_REASONING],
  },
  {
    id: "gpt-5.3-codex",
    displayName: "gpt-5.3-codex",
    description: "Latest frontier agentic coding model.",
    isDefault: false,
    hidden: false,
    defaultReasoningEffort: "high",
    supportedReasoningEfforts: [...FULL_REASONING],
  },
  {
    id: "gpt-5.2-codex",
    displayName: "gpt-5.2-codex",
    description: "Frontier agentic coding model.",
    isDefault: false,
    hidden: false,
    defaultReasoningEffort: "high",
    supportedReasoningEfforts: [...FULL_REASONING],
  },
  {
    id: "gpt-5.1-codex-max",
    displayName: "gpt-5.1-codex-max",
    description: "Codex-optimized flagship for deep and fast reasoning.",
    isDefault: false,
    hidden: false,
    defaultReasoningEffort: "high",
    supportedReasoningEfforts: [...FULL_REASONING],
  },
  {
    id: "gpt-5.2",
    displayName: "gpt-5.2",
    description:
      "Latest frontier model with improvements across knowledge, reasoning and coding",
    isDefault: false,
    hidden: false,
    defaultReasoningEffort: "high",
    supportedReasoningEfforts: [...FULL_REASONING],
  },
  {
    id: "gpt-5.1-codex-mini",
    displayName: "gpt-5.1-codex-mini",
    description: "Optimized for codex. Cheaper, faster, but less capable.",
    isDefault: false,
    hidden: false,
    defaultReasoningEffort: "high",
    supportedReasoningEfforts: [...MINI_REASONING],
  },
];

export function listStaticCodexModels(): ProviderModelOption[] {
  return STATIC_CODEX_MODELS.map((model) => ({
    ...model,
    supportedReasoningEfforts: [...model.supportedReasoningEfforts],
  }));
}
