import { describe, expect, it, vi } from "vitest";
import { focusElement, replaceVisibleToast } from "../src/ui-utils.js";

describe("UI utilities", () => {
  it("replaces the previous notification instead of stacking another", () => {
    const replaceChildren = vi.fn();
    const toast = {};
    replaceVisibleToast({ replaceChildren }, toast);
    expect(replaceChildren).toHaveBeenCalledOnce();
    expect(replaceChildren).toHaveBeenCalledWith(toast);
  });

  it("restores an input focus target after a rerender", () => {
    const focus = vi.fn();
    const querySelector = vi.fn(() => ({ focus }));
    expect(focusElement({ querySelector }, "#add-player input[name=name]")).toBe(true);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
