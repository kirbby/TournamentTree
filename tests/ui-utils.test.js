import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
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

  it("uses semantic dark-theme colors for last-place mode choices", async () => {
    const [source, styles] = await Promise.all([
      readFile(new URL("../src/main.js", import.meta.url), "utf8"),
      readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    ]);
    expect(source).toContain('class="mode-choice ${lastPlaceMode === "fair" ? "is-selected" : ""}');
    expect(styles).toContain("background: var(--surface-bg-subtle)");
    expect(styles).toContain("color: var(--app-text)");
    expect(styles).toContain("color: var(--app-text-muted)");
  });
});
