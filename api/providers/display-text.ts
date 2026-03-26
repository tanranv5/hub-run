const NOISE_BLOCK_PATTERNS = [
  /<user_instructions>[\s\S]*?<\/user_instructions>/gi,
  /<INSTRUCTIONS>[\s\S]*?<\/INSTRUCTIONS>/gi,
  /<environment_context>[\s\S]*?<\/environment_context>/gi,
  /<system-reminder>[\s\S]*?<\/system-reminder>/gi,
  /<oai-mem-citation>[\s\S]*?<\/oai-mem-citation>/gi,
  /^\s*##\s*Open tabs:[ \t]*(?:\n(?:[ \t]*$|[ \t]*-.*))*/gim,
];

const NOISE_INLINE_PATTERNS = [
  /<command-name>[^<]*<\/command-name>/g,
  /<command-message>[^<]*<\/command-message>/g,
  /<command-args>[^<]*<\/command-args>/g,
  /<local-command-stdout>[^<]*<\/local-command-stdout>/g,
];

const NOISE_LINE_PATTERNS = [
  /^\s*#\s*AGENTS\.md instructions[^\n]*$/gim,
  /^\s*#\s*Context from my IDE setup:\s*$/gim,
  /^\s*##\s*My request for Codex:\s*$/gim,
  /^\s*#\s*Files mentioned by the user:\s*$/gim,
  /^\s*##\s*(?:Active|Current) file:[^\n]*$/gim,
  /^\s*##\s*Active selection of the file:[^\n]*$/gim,
  /^\s*#\s*Open tabs:\s*$/gim,
  /^\s*<\/?user_instructions>\s*$/gim,
  /^\s*<\/?INSTRUCTIONS>\s*$/gim,
  /^\s*<\/?environment_context>\s*$/gim,
  /^\s*Files called AGENTS\.md commonly appear\b.*$/gim,
  /^\s*Their purpose is to pass along human guidance\b.*$/gim,
  /^\s*Each AGENTS\.md governs the entire directory\b.*$/gim,
  /^\s*When two AGENTS\.md files disagree\b.*$/gim,
];

function stripConversationNoise(text: string): string {
  let cleaned = text;

  for (const pattern of NOISE_BLOCK_PATTERNS) {
    cleaned = cleaned.replace(pattern, "\n");
  }

  for (const pattern of NOISE_INLINE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  for (const pattern of NOISE_LINE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  return cleaned;
}

export function sanitizeConversationText(text: string): string {
  return stripConversationNoise(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractMeaningfulDisplay(text: string): string | null {
  const cleaned = sanitizeConversationText(text);
  const normalized = cleaned.replace(/\s+/g, " ").trim();
  return normalized || null;
}
