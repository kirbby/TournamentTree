export function replaceVisibleToast(container, toast) {
  container.replaceChildren(toast);
}

export function focusElement(root, selector) {
  const element = selector ? root.querySelector(selector) : null;
  if (!element) return false;
  element.focus({ preventScroll: true });
  return true;
}
