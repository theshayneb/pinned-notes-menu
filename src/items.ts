// Pure data helpers (no Obsidian imports) so they can be unit tested.

export type OpenTarget = 'current' | 'tab' | 'split' | 'window'

export interface PinnedNote {
  id: string
  type: 'note'
  /** Shown on hover and in the menu. Empty means "use the file name". */
  title: string
  /** Vault path, e.g. `Folder/Note.md`. Older entries may omit the `.md`. */
  path: string
  /** Lucide icon name. Empty means the default icon. */
  icon: string
}

export interface PinnedDivider {
  id: string
  type: 'divider'
}

export type PinnedItem = PinnedNote | PinnedDivider

export interface PinnedNotesMenuSettings {
  items: PinnedItem[]
  /** Show each pinned note and divider as its own ribbon icon. */
  showRibbonIcons: boolean
  /** Show one ribbon button that opens a menu of all pinned notes. */
  showMenuButton: boolean
  menuIcon: string
  openIn: OpenTarget
  /** Switch to an already open tab of the note instead of opening it again. */
  focusExisting: boolean
}

export const DEFAULT_NOTE_ICON = 'file'
export const DEFAULT_MENU_ICON = 'pin'
export const MENU_BUTTON_TITLE = 'Pinned notes'

export const DEFAULT_SETTINGS: PinnedNotesMenuSettings = {
  items: [],
  showRibbonIcons: true,
  showMenuButton: false,
  menuIcon: DEFAULT_MENU_ICON,
  openIn: 'current',
  focusExisting: true,
}

const OPEN_TARGETS: OpenTarget[] = ['current', 'tab', 'split', 'window']

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function createNote(path: string, title = '', icon = ''): PinnedNote {
  return { id: newId(), type: 'note', title, path, icon }
}

export function createDivider(): PinnedDivider {
  return { id: newId(), type: 'divider' }
}

/** Turns whatever is in data.json into valid settings, dropping broken items. */
export function normalizeSettings(raw: unknown): PinnedNotesMenuSettings {
  const data = isRecord(raw) ? raw : {}
  const seen = new Set<string>()
  const items: PinnedItem[] = []

  for (const entry of Array.isArray(data.items) ? data.items : []) {
    if (!isRecord(entry)) continue
    let id = str(entry.id)
    if (!id || seen.has(id)) id = newId()
    seen.add(id)
    if (entry.type === 'divider') {
      items.push({ id, type: 'divider' })
    } else if (entry.type === 'note') {
      items.push({ id, type: 'note', title: str(entry.title), path: str(entry.path), icon: str(entry.icon) })
    }
  }

  const openIn = OPEN_TARGETS.includes(data.openIn as OpenTarget) ? (data.openIn as OpenTarget) : DEFAULT_SETTINGS.openIn
  const bool = (key: keyof PinnedNotesMenuSettings, fallback: boolean) =>
    typeof data[key] === 'boolean' ? data[key] : fallback

  return {
    items,
    showRibbonIcons: bool('showRibbonIcons', DEFAULT_SETTINGS.showRibbonIcons),
    showMenuButton: bool('showMenuButton', DEFAULT_SETTINGS.showMenuButton),
    menuIcon: str(data.menuIcon) || DEFAULT_MENU_ICON,
    openIn,
    focusExisting: bool('focusExisting', DEFAULT_SETTINGS.focusExisting),
  }
}

/**
 * Converts the data.json of the original "Pinned Notes" (`pinned-notes`) and
 * "Ribbon Divider" (`ribbon-divider`) plugins into items. Notes whose path is
 * already pinned are skipped. Dividers go after the notes, since the original
 * plugins don't record where they sat relative to each other.
 */
export function importLegacy(
  pinnedNotesData: unknown,
  ribbonDividerData: unknown,
  existing: PinnedItem[],
): { notes: PinnedNote[]; dividers: PinnedDivider[] } {
  const pinnedPaths = new Set(existing.filter(isNote).map((n) => n.path))
  const notes: PinnedNote[] = []
  const legacyNotes = isRecord(pinnedNotesData) && Array.isArray(pinnedNotesData.pinnedNotes)
    ? pinnedNotesData.pinnedNotes
    : []
  for (const entry of legacyNotes) {
    if (!isRecord(entry)) continue
    const path = str(entry.path).trim()
    if (!path || [...pinnedPaths].some((p) => pathMatches(p, path) || pathMatches(path, p))) continue
    pinnedPaths.add(path)
    notes.push(createNote(path, str(entry.title).trim(), str(entry.icon).trim()))
  }

  // Dividers have no identity to match on, so only import them into a list without any.
  const dividers: PinnedDivider[] = []
  const legacyDividers = existing.some((item) => item.type === 'divider')
    ? []
    : isRecord(ribbonDividerData) && isRecord(ribbonDividerData.dividers)
      ? Object.keys(ribbonDividerData.dividers)
      : []
  for (let i = 0; i < legacyDividers.length; i++) dividers.push(createDivider())

  return { notes, dividers }
}

export function isNote(item: PinnedItem): item is PinnedNote {
  return item.type === 'note'
}

/** True when a stored note path refers to the file at `filePath`. */
export function pathMatches(notePath: string, filePath: string): boolean {
  return notePath === filePath || (filePath.endsWith('.md') && notePath === filePath.slice(0, -3))
}

export function baseName(path: string): string {
  const name = path.split('/').pop() ?? ''
  return name.endsWith('.md') ? name.slice(0, -3) : name
}

export function displayTitle(note: PinnedNote): string {
  return note.title.trim() || baseName(note.path.trim()) || 'Untitled'
}

/** Returns a copy of `items` with the item at `index` moved by `delta`. */
export function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items
  const copy = items.slice()
  const [item] = copy.splice(index, 1)
  copy.splice(target, 0, item)
  return copy
}

/**
 * Updates note paths after a file or folder rename. Returns true when
 * anything changed.
 */
export function applyRename(items: PinnedItem[], oldPath: string, newPath: string): boolean {
  let changed = false
  for (const item of items) {
    if (!isNote(item)) continue
    if (pathMatches(item.path, oldPath)) {
      item.path = newPath
      changed = true
    } else if (item.path.startsWith(oldPath + '/')) {
      item.path = newPath + item.path.slice(oldPath.length)
      changed = true
    }
  }
  return changed
}

/**
 * Obsidian identifies ribbon icons by `<plugin id>:<title>`, so every icon this
 * plugin adds needs a unique title. Returns the title to use for each item.
 */
export function ribbonTitles(items: PinnedItem[], reserved: string[] = []): Map<string, string> {
  const used = new Set(reserved)
  const titles = new Map<string, string>()
  let dividerCount = 0
  for (const item of items) {
    const base = isNote(item) ? displayTitle(item) : `Divider ${++dividerCount}`
    let title = base
    for (let n = 2; used.has(title); n++) title = `${base} (${n})`
    used.add(title)
    titles.set(item.id, title)
  }
  return titles
}

/** Default icon for a newly pinned file, by extension. */
export function iconForExtension(extension: string): string {
  switch (extension) {
    case 'canvas': return 'layout-dashboard'
    case 'base': return 'table'
    case 'pdf': return 'file-text'
    default: return ''
  }
}
