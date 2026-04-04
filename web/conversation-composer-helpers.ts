export function shouldSubmitOnEnter(input: {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
}): boolean {
  return (
    input.key === "Enter" &&
    !input.shiftKey &&
    !input.isComposing
  );
}

export function findPastedImageFile(
  items: ArrayLike<{
    kind?: string;
    type?: string;
    getAsFile?: () => File | null;
  }> | null | undefined,
): File | null {
  if (!items) {
    return null;
  }

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item || item.kind !== "file" || typeof item.getAsFile !== "function") {
      continue;
    }
    const file = item.getAsFile();
    if (!file) {
      continue;
    }
    const itemType = item.type?.trim().toLowerCase() ?? "";
    const fileType = file.type?.trim().toLowerCase() ?? "";
    if (itemType.startsWith("image/") || fileType.startsWith("image/")) {
      return file;
    }
  }

  return null;
}
