# Kirbby Shared Icons

Common browser app actions use the SVG icons exported by `src/icons.js`.
Canonical icon data lives in `frontend/icons.json`, and viewable generated SVG
files live in `frontend/icons/`.

## Source

This set was consolidated from:

- `kirbbyTools`, which already uses Lucide icon names in its Vite UI.
- `kirbbyOS`, which embeds matching inline SVGs for navigation, refresh,
  settings, sidebar controls, close, add, and delete actions.

## Canonical Map

| Action | Semantic name | Lucide icon | Viewable file |
| --- | --- | --- | --- |
| Refresh | `refresh` | `refresh-cw` | `frontend/icons/refresh.svg` |
| Save | `save` | `save` | `frontend/icons/save.svg` |
| Delete | `delete` | `trash-2` | `frontend/icons/delete.svg` |
| Close | `close` | `x` | `frontend/icons/close.svg` |
| Favorite | `favorite` | `star` | `frontend/icons/favorite.svg` |
| Navigation menu | `navMenu` | `menu` | `frontend/icons/nav-menu.svg` |
| Sidebar collapse | `sidebarCollapse` | `panel-left-close` | `frontend/icons/sidebar-collapse.svg` |
| Sidebar uncollapse | `sidebarUncollapse` | `panel-left-open` | `frontend/icons/sidebar-uncollapse.svg` |
| Add | `add` | `plus` | `frontend/icons/add.svg` |
| Search | `search` | `search` | `frontend/icons/search.svg` |
| Archive | `archive` | `archive` | `frontend/icons/archive.svg` |
| Settings | `settings` | `settings` | `frontend/icons/settings.svg` |

## Usage

```js
import { icon, mountIcons } from "./icons.js";

button.innerHTML = icon("refresh");
mountIcons();
```

For icon-only buttons, include an accessible name:

```html
<button class="icon-button" type="button" aria-label="Refresh" title="Refresh">
  ${icon("refresh")}
</button>
```

The SVG path data is generated into `src/icons.js`, so consuming apps do not
need an icon package or separate network requests just to use the common set.
When changing icons, edit `frontend/icons.json` and run:

```bash
scripts/generate-icons.mjs
```

Use `.icon-button.primary-action` for the main action, `.icon-button.is-active`
for toggled or selected state, and `.icon-button.danger-action` for destructive
actions.
