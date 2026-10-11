# Pinned Notes Menu

An [Obsidian](https://obsidian.md/) plugin that pins the notes you use most to the ribbon, or to a single menu button, and lets you group ribbon icons with dividers.

It combines and extends two MIT-licensed plugins:

- [Pinned Notes](https://github.com/vasilcoin002/pinned-notes-plugin-obsidian) by vasilcoin002: pin notes as ribbon icons.
- [Ribbon Divider](https://github.com/andrewmcgivery/obsidian-ribbon-divider) by Andrew McGivery: dividers between ribbon icons.

## Features

- **One ordered list** of pinned notes and dividers. The order in settings is the order in the ribbon and the menu.
- **Ribbon icons**: each pinned note gets its own icon. Hover for its title.
- **Menu button** (optional): one ribbon button that opens a menu of all pinned notes, with dividers shown as separators. Handy on a phone or when the ribbon is crowded.
- **Command palette**: *Open pinned note* (fuzzy search), *Pin current note*, *Unpin current note*. Assign hotkeys to any of them.
- **Right-click a file** in the file explorer or a tab to pin or unpin it.
- **No restart needed**: changes show up straight away.
- **Follows renames**: renaming or moving a pinned note or its folder updates the pin.
- **Switch to open tab**: if the note is already open, the plugin switches to that tab instead of opening a duplicate (can be turned off).
- **Where to open**: current tab, new tab, split pane or new window. Middle-click or Ctrl/Cmd-click always opens a new tab.
- **Pickers with previews**: file suggestions for the path, icon suggestions with a preview, and warnings for missing notes or unknown icons.
- **Optional titles**: leave the title empty to use the file name.
- Works with notes, canvases, bases, PDFs and any other file in the vault.
- Works on mobile (dividers are skipped in the phone ribbon, which is a list).

## Settings

| Setting | What it does |
| --- | --- |
| Pinned notes | Add, edit, reorder (arrows) and remove notes and dividers. |
| Show notes in the ribbon | Each note and divider as its own ribbon icon. |
| Show menu button | One ribbon button with a menu of all pinned notes. |
| Menu button icon | Icon for the menu button (any [Lucide](https://lucide.dev/) icon Obsidian includes). |
| Open notes in | Current tab, new tab, split pane or new window. |
| Switch to open tab | Reuse a tab that already shows the note. |
| Import from other plugins | Copy notes from Pinned Notes and dividers from Ribbon Divider. |

## Moving from Pinned Notes and Ribbon Divider

1. Install and enable Pinned Notes Menu.
2. Open its settings and click **Import**. Your pinned notes are copied over, and your dividers are added at the end of the list.
3. Use the arrows to put the dividers where you want them.
4. Turn off the old plugins.

CSS snippets that target `.ribbon-divider` keep working: dividers carry that class as well as `pnm-ribbon-divider`.

## Customizing dividers

```css
/* More space around dividers */
.side-dock-actions .side-dock-ribbon-action.pnm-ribbon-divider {
  padding: 8px 0;
}

/* Divider color */
.side-dock-actions .side-dock-ribbon-action.pnm-ribbon-divider::before {
  background-color: var(--color-accent);
}
```

Obsidian remembers where you dragged ribbon icons. If an icon ends up somewhere unexpected, drag it into place in the ribbon, or right-click the ribbon to reset it.

## Installing

Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/theshayneb/pinned-notes-menu/releases/latest) into `<vault>/.obsidian/plugins/pinned-notes-menu/`, then enable **Pinned Notes Menu** under Settings → Community plugins. Or install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat) using `theshayneb/pinned-notes-menu`.

## Development

```
npm install
npm run dev        # rebuild main.js on change
npm run lint       # eslint + tsc
npm run lint:css
npm test
npm run build
```
