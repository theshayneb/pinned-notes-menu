// Pure data helpers (no Obsidian imports) so they can be unit tested.
//
// Sync model: Obsidian Sync can deliver a data.json that another device saved
// from stale memory. So every item carries an `updatedAt` and an `order` key,
// removed items leave a tombstone, and each display setting carries its own
// timestamp. `mergeSettings` combines two copies keeping the newest edit of
// each item and setting, which never brings back a removed item or drops an
// added one.

export type OpenTarget = 'current' | 'tab' | 'split' | 'window'

interface ItemSyncFields {
  id: string
  /** Sort key. Items are listed by `order`, then `id`. */
  order: number
  /** Time of the last edit (ms). 0 for items saved by version 0.0.1. */
  updatedAt: number
}

export interface PinnedNote extends ItemSyncFields {
  type: 'note'
  /** Shown on hover and in the menu. Empty means "use the file name". */
  title: string
  /** Vault path, e.g. `Folder/Note.md`. Older entries may omit the `.md`. */
  path: string
  /** Lucide icon name. Empty means the default icon. */
  icon: string
}

export interface PinnedDivider extends ItemSyncFields {
  type: 'divider'
}

export type PinnedItem = PinnedNote | PinnedDivider

export interface Prefs {
  /** Show each pinned note and divider as its own ribbon icon. */
  showRibbonIcons: boolean
  /** Show one ribbon button that opens a menu of all pinned notes. */
  showMenuButton: boolean
  menuIcon: string
  openIn: OpenTarget
  /** Switch to an already open tab of the note instead of opening it again. */
  focusExisting: boolean
}

export type PrefKey = keyof Prefs

export interface PinnedNotesMenuSettings extends Prefs {
  /** Sorted by `order`, then `id`. */
  items: PinnedItem[]
  /** Removed item id → time it was removed (ms). Kept forever. */
  tombstones: Record<string, number>
  /** Time each display setting was last changed (ms); missing means 0. */
  prefsUpdatedAt: Partial<Record<PrefKey, number>>
}

export const DEFAULT_NOTE_ICON = 'file'
export const DEFAULT_MENU_ICON = 'pin'
export const MENU_BUTTON_TITLE = 'Pinned notes'

export const DEFAULT_PREFS: Prefs = {
  showRibbonIcons: true,
  showMenuButton: false,
  menuIcon: DEFAULT_MENU_ICON,
  openIn: 'current',
  focusExisting: true,
}

export const PREF_KEYS = Object.keys(DEFAULT_PREFS) as PrefKey[]

export const DEFAULT_SETTINGS: PinnedNotesMenuSettings = {
  ...DEFAULT_PREFS,
  items: [],
  tombstones: {},
  prefsUpdatedAt: {},
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

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A timestamp later than both `now` and `previous`, so an edit always beats the version it replaces. */
function stamp(previous: number, now: number): number {
  return Math.max(now, previous + 1)
}

/** New note, not yet in a list. `addItems` gives it its order and timestamp. */
export function createNote(path: string, title = '', icon = ''): PinnedNote {
  return { id: newId(), type: 'note', title, path, icon, order: 0, updatedAt: 0 }
}

export function createDivider(): PinnedDivider {
  return { id: newId(), type: 'divider', order: 0, updatedAt: 0 }
}

export function isNote(item: PinnedItem): item is PinnedNote {
  return item.type === 'note'
}

export function compareItems(a: PinnedItem, b: PinnedItem): number {
  return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

function validPref<K extends PrefKey>(key: K, value: unknown): value is Prefs[K] {
  if (key === 'openIn') return OPEN_TARGETS.includes(value as OpenTarget)
  if (key === 'menuIcon') return typeof value === 'string' && value.trim() !== ''
  return typeof value === 'boolean'
}

function isRemoved(item: PinnedItem, tombstones: Record<string, number>): boolean {
  const removedAt = tombstones[item.id]
  return removedAt !== undefined && removedAt >= item.updatedAt
}

/**
 * Turns whatever is in data.json into valid settings, dropping broken items.
 * Reads both this format and the one saved by version 0.0.1: items without
 * `updatedAt` count as oldest (0), items without `order` keep their place in
 * the file, and display settings outside `prefs` count as oldest.
 */
export function normalizeSettings(raw: unknown): PinnedNotesMenuSettings {
  const data = isRecord(raw) ? raw : {}

  const tombstones: Record<string, number> = {}
  if (isRecord(data.tombstones)) {
    for (const [id, at] of Object.entries(data.tombstones)) {
      const time = num(at)
      if (id && time !== null) tombstones[id] = time
    }
  }

  const byId = new Map<string, PinnedItem>()
  const entries = Array.isArray(data.items) ? data.items : []
  entries.forEach((entry: unknown, index: number) => {
    if (!isRecord(entry)) return
    const id = str(entry.id) || newId()
    const sync = { id, order: num(entry.order) ?? index + 1, updatedAt: num(entry.updatedAt) ?? 0 }
    let item: PinnedItem
    if (entry.type === 'divider') {
      item = { ...sync, type: 'divider' }
    } else if (entry.type === 'note') {
      item = { ...sync, type: 'note', title: str(entry.title), path: str(entry.path), icon: str(entry.icon) }
    } else {
      return
    }
    const seen = byId.get(id)
    byId.set(id, seen ? newerItem(seen, item) : item)
  })

  // Display settings: `prefs` holds each value with its timestamp. The plain
  // top-level keys are what 0.0.1 reads and writes; use them only as a fallback.
  const prefs: Prefs = { ...DEFAULT_PREFS }
  const prefsUpdatedAt: Partial<Record<PrefKey, number>> = {}
  const stored = isRecord(data.prefs) ? data.prefs : {}
  for (const key of PREF_KEYS) {
    const entry = stored[key]
    if (isRecord(entry) && validPref(key, entry.value)) {
      setPrefValue(prefs, key, entry.value)
      const at = num(entry.updatedAt)
      if (at) prefsUpdatedAt[key] = at
    } else if (validPref(key, data[key])) {
      setPrefValue(prefs, key, data[key])
    }
  }

  const items = [...byId.values()].filter((item) => !isRemoved(item, tombstones)).sort(compareItems)
  return { ...prefs, items, tombstones, prefsUpdatedAt }
}

function setPrefValue<K extends PrefKey>(prefs: Prefs, key: K, value: Prefs[K]): void {
  prefs[key] = value
}

/** What gets written to data.json. */
export function serializeSettings(settings: PinnedNotesMenuSettings): Record<string, unknown> {
  const prefs: Record<string, { value: unknown; updatedAt: number }> = {}
  const legacy: Record<string, unknown> = {}
  for (const key of PREF_KEYS) {
    prefs[key] = { value: settings[key], updatedAt: settings.prefsUpdatedAt[key] ?? 0 }
    legacy[key] = settings[key]
  }
  const tombstones: Record<string, number> = {}
  for (const id of Object.keys(settings.tombstones).sort()) tombstones[id] = settings.tombstones[id]
  return {
    items: [...settings.items].sort(compareItems),
    tombstones,
    prefs,
    // Plain copies so devices still on 0.0.1 show the current settings.
    ...legacy,
  }
}

/** Two copies that serialize the same are the same settings. */
export function sameSettings(a: PinnedNotesMenuSettings, b: PinnedNotesMenuSettings): boolean {
  return JSON.stringify(serializeSettings(a)) === JSON.stringify(serializeSettings(b))
}

/** The newer of two versions of one item; ties go to the same one whichever side it is on. */
function newerItem<T extends PinnedItem>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b
}

/**
 * Combines two copies of the settings: the newest version of each item and
 * each display setting wins, tombstones from both sides apply, and an item
 * on only one side is kept unless a tombstone at least as new removes it.
 * The result is the same whichever copy is `local`. Items from `local` that
 * win are returned as the same objects, so open editors keep working on them.
 */
export function mergeSettings(local: PinnedNotesMenuSettings, incoming: PinnedNotesMenuSettings): PinnedNotesMenuSettings {
  const tombstones = { ...local.tombstones }
  for (const [id, at] of Object.entries(incoming.tombstones)) {
    tombstones[id] = Math.max(tombstones[id] ?? 0, at)
  }

  const byId = new Map<string, PinnedItem>()
  for (const item of local.items) byId.set(item.id, item)
  for (const item of incoming.items) {
    const seen = byId.get(item.id)
    byId.set(item.id, seen ? newerItem(seen, item) : item)
  }
  const items = [...byId.values()].filter((item) => !isRemoved(item, tombstones)).sort(compareItems)

  const prefs: Prefs = { ...DEFAULT_PREFS }
  const prefsUpdatedAt: Partial<Record<PrefKey, number>> = {}
  for (const key of PREF_KEYS) {
    const localAt = local.prefsUpdatedAt[key] ?? 0
    const incomingAt = incoming.prefsUpdatedAt[key] ?? 0
    const useLocal = localAt !== incomingAt
      ? localAt > incomingAt
      : JSON.stringify(local[key]) >= JSON.stringify(incoming[key])
    setPrefValue(prefs, key, useLocal ? local[key] : incoming[key])
    const at = Math.max(localAt, incomingAt)
    if (at) prefsUpdatedAt[key] = at
  }

  return { ...prefs, items, tombstones, prefsUpdatedAt }
}

// ── Edits ─────────────────────────────────────────────────────────────
// Every edit goes through these so it gets a fresh timestamp.

export function setPref<K extends PrefKey>(settings: PinnedNotesMenuSettings, key: K, value: Prefs[K], now = Date.now()): void {
  setPrefValue(settings, key, value)
  settings.prefsUpdatedAt[key] = stamp(settings.prefsUpdatedAt[key] ?? 0, now)
}

/** Applies a change to a note's title, path or icon. */
export function editNote(note: PinnedNote, change: Partial<Pick<PinnedNote, 'title' | 'path' | 'icon'>>, now = Date.now()): void {
  Object.assign(note, change)
  note.updatedAt = stamp(note.updatedAt, now)
}

/** Appends new items at the end of the list. */
export function addItems(settings: PinnedNotesMenuSettings, newItems: PinnedItem[], now = Date.now()): void {
  let order = settings.items.reduce((max, item) => Math.max(max, item.order), 0)
  for (const item of newItems) {
    item.order = ++order
    item.updatedAt = stamp(item.updatedAt, now)
    settings.items.push(item)
  }
}

/** Removes items and records tombstones so other devices remove them too. */
export function removeItems(settings: PinnedNotesMenuSettings, ids: string[], now = Date.now()): void {
  const remove = new Set(ids)
  for (const item of settings.items) {
    if (remove.has(item.id)) settings.tombstones[item.id] = stamp(item.updatedAt, now)
  }
  settings.items = settings.items.filter((item) => !remove.has(item.id))
}

/**
 * Moves an item `delta` places up (negative) or down. Only the moved item gets
 * a new order key, between its new neighbours, so a move made on another
 * device to a different item is not undone by a merge.
 */
export function moveItem(settings: PinnedNotesMenuSettings, id: string, delta: number, now = Date.now()): void {
  const items = [...settings.items].sort(compareItems)
  const index = items.findIndex((item) => item.id === id)
  const target = index + delta
  if (index < 0 || delta === 0 || target < 0 || target >= items.length) return

  const item = items[index]
  const others = items.filter((other) => other !== item)
  const orderBetween = () => {
    const before = others[target - 1]
    const after = others[target]
    if (!before) return after.order - 1
    if (!after) return before.order + 1
    return (before.order + after.order) / 2
  }

  let order = orderBetween()
  const before = others[target - 1]
  const after = others[target]
  if ((before && order <= before.order) || (after && order >= after.order)) {
    // The gap is too small to split again (or two keys are equal): space all keys out.
    others.forEach((other, i) => {
      other.order = i + 1
      other.updatedAt = stamp(other.updatedAt, now)
    })
    order = orderBetween()
  }
  item.order = order
  item.updatedAt = stamp(item.updatedAt, now)
  settings.items = [...others, item].sort(compareItems)
}

/**
 * Updates note paths after a file or folder rename. Returns true when
 * anything changed.
 */
export function applyRename(items: PinnedItem[], oldPath: string, newPath: string, now = Date.now()): boolean {
  let changed = false
  for (const item of items) {
    if (!isNote(item)) continue
    if (pathMatches(item.path, oldPath)) {
      editNote(item, { path: newPath }, now)
      changed = true
    } else if (item.path.startsWith(oldPath + '/')) {
      editNote(item, { path: newPath + item.path.slice(oldPath.length) }, now)
      changed = true
    }
  }
  return changed
}

// ── Import from the original plugins ──────────────────────────────────

/**
 * Converts the data.json of the original "Pinned Notes" (`pinned-notes`) and
 * "Ribbon Divider" (`ribbon-divider`) plugins into new items. Notes whose path
 * is already pinned are skipped. Dividers go after the notes, since the
 * original plugins don't record where they sat relative to each other.
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

// ── Paths and titles ──────────────────────────────────────────────────

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
