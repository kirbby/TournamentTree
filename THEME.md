# kirbbyAPI Reusable Theme

This file describes the shared color palette and semantic theme tokens used by kirbbyAPI. Copy this into other apps and ask the local agent to implement the theme using these tokens instead of hardcoded colors.

## Theme Character

The theme is a dark charcoal interface with a bright pink brand accent. It should feel compact, technical, and app-like rather than decorative or marketing-heavy.

Use the pink accent consistently for primary actions, active states, links, and small highlights. Use the charcoal surfaces for app chrome, panels, cards, inputs, and secondary buttons.

## Core Palette

```css
:root {
  color-scheme: dark;

  /* Base */
  --color-bg: #111318;
  --color-bg-elevated: #1b1e26;
  --color-bg-subtle: #242833;
  --color-bg-deep: #0d0f14;
  --color-border: #303541;

  /* Text */
  --color-text: #f3f4f8;
  --color-text-muted: #aeb4c1;
  --color-text-inverse: #1c1018;

  /* Brand */
  --color-primary: #ff7ac3;
  --color-primary-hover: #ff94cf;
  --color-primary-soft: #4a2b40;
  --color-primary-border: #69445f;

  /* State */
  --color-success: #5bd48b;
  --color-warning: #f5bf4f;
  --color-danger: #ff6b79;

  /* Informational / technical UI */
  --color-info-bg: #29384f;
  --color-info-text: #a9cdfd;
  --color-code-text: #ffd4ec;
  --color-code-bg: #11141b;
  --color-code-text-muted: #f5d7e8;
}
```

## Semantic Tokens

Apps should use these semantic tokens in components. Do not reference raw hex colors inside component CSS unless defining the palette above.

```css
:root {
  /* Page */
  --app-bg: var(--color-bg);
  --app-text: var(--color-text);
  --app-text-muted: var(--color-text-muted);

  /* Surfaces */
  --surface-bg: var(--color-bg-elevated);
  --surface-bg-subtle: var(--color-bg-subtle);
  --surface-border: var(--color-border);
  --surface-shadow: 0 10px 36px rgba(0, 0, 0, 0.22);

  /* Links */
  --link-color: var(--color-primary);
  --link-hover-color: var(--color-primary-hover);

  /* Buttons */
  --button-primary-bg: var(--color-primary);
  --button-primary-bg-hover: var(--color-primary-hover);
  --button-primary-text: var(--color-text-inverse);

  --button-secondary-bg: var(--color-bg-subtle);
  --button-secondary-bg-hover: #2a2f3b;
  --button-secondary-text: var(--color-text);
  --button-secondary-border: var(--color-border);

  --button-subtle-bg: var(--color-primary-soft);
  --button-subtle-text: var(--color-text);
  --button-subtle-border: var(--color-primary-border);

  /* Forms */
  --input-bg: var(--color-bg);
  --input-text: var(--color-text);
  --input-placeholder: var(--color-text-muted);
  --input-border: var(--color-border);
  --input-border-focus: var(--color-primary);

  /* Status */
  --status-success: var(--color-success);
  --status-warning: var(--color-warning);
  --status-danger: var(--color-danger);

  /* Code */
  --code-bg: var(--color-code-bg);
  --code-bg-deep: var(--color-bg-deep);
  --code-text: var(--color-code-text);
  --code-text-muted: var(--color-code-text-muted);

  /* Focus */
  --focus-ring: 0 0 0 4px rgba(255, 122, 195, 0.22);
}
```

## Recommended Component Defaults

```css
body {
  background:
    radial-gradient(circle at 20% 10%, #1a1f2a 0, transparent 32rem),
    var(--app-bg);
  color: var(--app-text);
}

a {
  color: var(--link-color);
}

a:hover {
  color: var(--link-hover-color);
}

.panel,
.card,
.modal {
  background: var(--surface-bg);
  border: 1px solid var(--surface-border);
  box-shadow: var(--surface-shadow);
}

.button-primary {
  background: var(--button-primary-bg);
  color: var(--button-primary-text);
  border: 0;
}

.button-primary:hover {
  background: var(--button-primary-bg-hover);
}

.button-secondary {
  background: var(--button-secondary-bg);
  color: var(--button-secondary-text);
  border: 1px solid var(--button-secondary-border);
}

.button-secondary:hover {
  background: var(--button-secondary-bg-hover);
}

.button-subtle {
  background: var(--button-subtle-bg);
  color: var(--button-subtle-text);
  border: 1px solid var(--button-subtle-border);
}

input,
select,
textarea {
  background: var(--input-bg);
  color: var(--input-text);
  border: 1px solid var(--input-border);
}

input:focus,
select:focus,
textarea:focus,
button:focus-visible,
a:focus-visible {
  outline: none;
  border-color: var(--input-border-focus);
  box-shadow: var(--focus-ring);
}

code {
  color: var(--code-text);
}

pre {
  background: var(--code-bg);
  color: var(--code-text-muted);
  border: 1px solid var(--surface-border);
}

.icon {
  width: 1.1rem;
  height: 1.1rem;
  flex: 0 0 auto;
  stroke-width: 2.2;
}

.icon-button,
.text-button {
  min-height: 2.35rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  border-radius: 6px;
  cursor: pointer;
}

.icon-button {
  width: 2.35rem;
  padding: 0;
  color: var(--button-secondary-text);
  background: var(--button-secondary-bg);
  border: 1px solid var(--button-secondary-border);
}

.icon-button.is-active {
  color: var(--color-primary);
  background: var(--button-subtle-bg);
  border-color: var(--button-subtle-border);
}

.icon-button.primary-action {
  color: var(--button-primary-text);
  background: var(--button-primary-bg);
  border-color: transparent;
}

.icon-button.danger-action {
  color: var(--status-danger);
  background: transparent;
  border-color: rgba(255, 107, 121, 0.42);
}
```

## Shared Icons

Use `src/icons.js` as the source for common action icons. It maps semantic
action names to SVG icons derived from the existing Kirbby apps:

| Action | Semantic name | Lucide icon |
| --- | --- | --- |
| Refresh | `refresh` | `refresh-cw` |
| Save | `save` | `save` |
| Delete | `delete` | `trash-2` |
| Close | `close` | `x` |
| Favorite | `favorite` | `star` |
| Navigation menu | `navMenu` | `menu` |
| Sidebar collapse | `sidebarCollapse` | `panel-left-close` |
| Sidebar uncollapse | `sidebarUncollapse` | `panel-left-open` |
| Add | `add` | `plus` |
| Search | `search` | `search` |
| Archive | `archive` | `archive` |
| Settings | `settings` | `settings` |

Prefer the helper over ad hoc inline SVG in browser apps:

```js
import { icon, mountIcons } from "./icons.js";

button.innerHTML = icon("settings");
mountIcons();
```

## Agent Implementation Instructions

When implementing this theme in another app:

1. Create a single global theme file, such as `theme.css`, `tokens.css`, or the framework equivalent.
2. Put the core palette and semantic tokens in that file.
3. Replace component-level hardcoded colors with semantic tokens.
4. Use `--button-primary-*` for primary buttons across the app.
5. Use `--button-secondary-*` for secondary buttons, toolbar buttons, and neutral actions.
6. Use `--surface-*` for cards, panels, dialogs, sidebars, headers, and grouped tool areas.
7. Use `--status-success`, `--status-warning`, and `--status-danger` for badges, dots, alerts, and validation states.
8. Keep the pink accent focused on primary actions, active tabs, links, selected states, and small highlights.
9. Avoid adding unrelated accent colors unless the app needs a clear semantic state.
10. Use `src/icons.js` for the shared common action icons.
11. If a framework has its own theme system, map these semantic tokens into that system instead of duplicating values in component files.

## Change Policy

To change the look across all apps, edit only the core palette values first. Component CSS should continue to reference semantic tokens.

For example, to change the brand color, update:

```css
--color-primary: #ff7ac3;
--color-primary-hover: #ff94cf;
--color-primary-soft: #4a2b40;
--color-primary-border: #69445f;
```

Do not search and replace button colors throughout the app. Buttons should already use:

```css
--button-primary-bg: var(--color-primary);
--button-primary-bg-hover: var(--color-primary-hover);
--button-primary-text: var(--color-text-inverse);
```

## Current Source

This palette was generalized from the existing kirbbyAPI dashboard and keymap UI styles in `internal/api/dashboard.go`.
