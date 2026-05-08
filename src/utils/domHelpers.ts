export function getWorkspaceSelectedText(): { text: string; rect: DOMRect | null } | null {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
    return null;
  }
  const selection = window.getSelection();
  const text = selection?.toString().trim() ?? "";
  if (!selection || text.length < 2 || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return { text: text.slice(0, 8000), rect };
}

export function isSelectionPopoverBlockedTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, button, [contenteditable='true'], [data-selection-popover='off']"));
}
