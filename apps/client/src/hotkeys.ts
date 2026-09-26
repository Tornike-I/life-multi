const KEY_LABELS: Record<string, string> = { enter: "↵" };

export function addHotkeyHints(root: ParentNode): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    "button[data-hotkey]",
  )) {
    const hint = document.createElement("span");
    hint.className = "hotkey";
    const key = button.dataset.hotkey!;
    hint.textContent = ` (${KEY_LABELS[key] ?? key})`;
    button.append(hint);
  }
}

export function pressHotkey(root: ParentNode, event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return false;
  }
  const key = event.key.toLowerCase();
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    "button[data-hotkey]",
  )) {
    // offsetParent is null when the button or an ancestor is hidden.
    if (
      button.dataset.hotkey === key &&
      !button.disabled &&
      button.offsetParent !== null
    ) {
      button.click();
      return true;
    }
  }
  return false;
}
