# Changelog

All notable changes to Pinned Notes Menu will be documented in this file.

## [0.0.2] - 2026-11-18

### Fixed
- Obsidian Sync: a device with out-of-date settings no longer overwrites changes made on another device. Before, a phone or tablet that had been offline could bring back notes you unpinned elsewhere, or drop ones you pinned, the next time it pinned, unpinned or renamed something.
  - Settings are now merged instead of replaced: when Sync changes them, and again before every save. The newest edit of each pinned note, divider and display setting wins.
  - Removed notes and dividers are remembered, so an older copy can't bring them back. Notes pinned on any device are kept.
  - Each item keeps its own place in the order, so the list order is the same on every device after a merge, and the newest move wins.
  - Settings saved by version 0.0.1 are still read. Until a device is updated, notes pinned there still sync, but notes unpinned there come back. Update the plugin on every device.

## [0.0.1] - 2026-10-11

### Added
- First release. Combines [Pinned Notes](https://github.com/vasilcoin002/pinned-notes-plugin-obsidian) (pin notes as ribbon icons) and [Ribbon Divider](https://github.com/andrewmcgivery/obsidian-ribbon-divider) (dividers between ribbon icons) into one plugin with a single ordered list of notes and dividers.
- Optional menu button: one ribbon icon that opens a menu of all pinned notes, with dividers as separators.
- Commands: Open pinned note, Pin current note, Unpin current note. Pin or unpin from a file's right-click menu.
- Changes apply without restarting Obsidian.
- Pins follow renamed and moved notes and folders.
- Switches to the note's tab if it is already open; choice of opening in the current tab, a new tab, a split pane or a new window. Middle-click and Ctrl/Cmd-click open a new tab.
- Path and icon suggestions with previews, and warnings for missing notes and unknown icons. Titles are optional and default to the file name.
- Works on mobile.
- Import from the Pinned Notes and Ribbon Divider plugins.
