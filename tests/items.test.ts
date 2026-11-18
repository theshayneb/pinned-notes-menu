import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  PinnedNotesMenuSettings,
  addItems,
  editNote,
  mergeSettings,
  moveItem,
  removeItems,
  serializeSettings,
  setPref,
  PinnedItem,
  applyRename,
  createDivider,
  createNote,
  displayTitle,
  importLegacy,
  normalizeSettings,
  pathMatches,
  ribbonTitles,
} from '../src/items'

describe('normalizeSettings', () => {
  it('returns defaults for empty data', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  it('drops invalid items and keeps the newest of duplicate ids', () => {
    const settings = normalizeSettings({
      items: [
        { id: 'a', type: 'note', title: 'Old', path: 'A.md', icon: '', order: 1, updatedAt: 5 },
        { id: 'a', type: 'note', title: 'New', path: 'A.md', icon: '', order: 1, updatedAt: 9 },
        { id: 'b', type: 'divider', order: 2, updatedAt: 1 },
        { type: 'weird' },
        'nope',
      ],
      openIn: 'nowhere',
      showMenuButton: true,
    })
    expect(settings.items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(settings.items[0].type === 'note' && settings.items[0].title).toBe('New')
    expect(settings.openIn).toBe('current')
    expect(settings.showMenuButton).toBe(true)
  })
})

describe('importLegacy', () => {
  const pinnedNotes = {
    pinnedNotes: [
      { id: '1', title: 'Home', path: 'Home', icon: 'house' },
      { id: '2', title: 'Inbox', path: 'Inbox', icon: '' },
      { id: '3', title: '', path: '', icon: '' },
    ],
  }
  const dividers = { dividers: { x: { id: 'x' }, y: { id: 'y' } } }

  it('imports notes and dividers', () => {
    const { notes, dividers: imported } = importLegacy(pinnedNotes, dividers, [])
    expect(notes.map((n) => [n.title, n.path, n.icon])).toEqual([['Home', 'Home', 'house'], ['Inbox', 'Inbox', '']])
    expect(imported).toHaveLength(2)
  })

  it('skips notes already pinned (with or without .md) and dividers when some exist', () => {
    const existing: PinnedItem[] = [createNote('Home.md'), createDivider()]
    const { notes, dividers: imported } = importLegacy(pinnedNotes, dividers, existing)
    expect(notes.map((n) => n.path)).toEqual(['Inbox'])
    expect(imported).toHaveLength(0)
  })

  it('handles missing data', () => {
    expect(importLegacy(null, undefined, [])).toEqual({ notes: [], dividers: [] })
  })
})

describe('paths and titles', () => {
  it('matches paths with and without .md', () => {
    expect(pathMatches('A/B', 'A/B.md')).toBe(true)
    expect(pathMatches('A/B.md', 'A/B.md')).toBe(true)
    expect(pathMatches('A/B', 'A/B.canvas')).toBe(false)
  })

  it('falls back to the file name for the title', () => {
    expect(displayTitle(createNote('Folder/My note.md'))).toBe('My note')
    expect(displayTitle(createNote('Board.canvas'))).toBe('Board.canvas')
    expect(displayTitle(createNote('x.md', 'Custom'))).toBe('Custom')
    expect(displayTitle(createNote(''))).toBe('Untitled')
  })

  it('gives every ribbon icon a unique title', () => {
    const items: PinnedItem[] = [createNote('A.md'), createNote('Other/A.md'), createDivider(), createNote('Pinned notes.md'), createDivider()]
    const titles = [...ribbonTitles(items, ['Pinned notes']).values()]
    expect(titles).toEqual(['A', 'A (2)', 'Divider 1', 'Pinned notes (2)', 'Divider 2'])
  })
})

describe('applyRename', () => {
  it('follows file and folder renames', () => {
    const items: PinnedItem[] = [createNote('Old.md'), createNote('Dir/Note'), createNote('Other.md')]
    expect(applyRename(items, 'Old.md', 'New.md')).toBe(true)
    expect(applyRename(items, 'Dir', 'Renamed')).toBe(true)
    expect(items.map((i) => (i.type === 'note' ? i.path : ''))).toEqual(['New.md', 'Renamed/Note', 'Other.md'])
    expect(applyRename(items, 'Missing.md', 'X.md')).toBe(false)
  })
})


// ── Sync ──────────────────────────────────────────────────────────────

const ids = (settings: PinnedNotesMenuSettings) => settings.items.map((item) => item.id)
const paths = (settings: PinnedNotesMenuSettings) => settings.items.map((item) => (item.type === 'note' ? item.path : '---'))
/** A copy as another device would read it from a synced data.json. */
const viaDisk = (settings: PinnedNotesMenuSettings) => normalizeSettings(JSON.parse(JSON.stringify(serializeSettings(settings))))

function note(path: string, id: string) {
  const n = createNote(path)
  n.id = id
  return n
}

describe('moveItem', () => {
  function list(): PinnedNotesMenuSettings {
    const settings = normalizeSettings(null)
    addItems(settings, [note('A.md', 'a'), note('B.md', 'b'), note('C.md', 'c')], 1000)
    return settings
  }

  it('moves within bounds and ignores moves past the ends', () => {
    const settings = list()
    moveItem(settings, 'a', 1, 2000)
    expect(ids(settings)).toEqual(['b', 'a', 'c'])
    moveItem(settings, 'c', -2, 3000)
    expect(ids(settings)).toEqual(['c', 'b', 'a'])
    moveItem(settings, 'c', -1, 4000)
    expect(ids(settings)).toEqual(['c', 'b', 'a'])
  })

  it('changes only the moved item, and spaces keys out when a gap runs out', () => {
    const settings = list()
    moveItem(settings, 'c', -1, 2000)
    expect(settings.items.filter((i) => i.updatedAt === 2000).map((i) => i.id)).toEqual(['c'])
    for (let i = 0; i < 200; i++) moveItem(settings, settings.items[2].id, -1, 3000 + i)
    expect(new Set(settings.items.map((i) => i.order)).size).toBe(3)
    expect(settings.items.map((i) => i.order)).toEqual([...settings.items.map((i) => i.order)].sort((x, y) => x - y))
  })
})

describe('mergeSettings', () => {
  it('regression: a stale tablet can neither bring back an unpin nor drop a pin', () => {
    // Both devices start in sync with A and B pinned.
    const desktop = normalizeSettings(null)
    addItems(desktop, [note('A.md', 'a'), note('B.md', 'b')], 1000)
    const tablet = viaDisk(desktop)

    // Desktop, days later: pins C and unpins B.
    addItems(desktop, [note('C.md', 'c')], 5000)
    removeItems(desktop, ['b'], 5000)

    // Tablet, still holding the old settings in memory, pins D and saves.
    addItems(tablet, [note('D.md', 'd')], 9000)

    // Sync delivers each device's file to the other, in either order.
    const onDesktop = mergeSettings(desktop, viaDisk(tablet))
    const onTablet = mergeSettings(tablet, viaDisk(desktop))
    expect(paths(onDesktop)).toEqual(['A.md', 'C.md', 'D.md'])
    expect(serializeSettings(onTablet)).toEqual(serializeSettings(onDesktop))

    // And the tablet's stale file, applied again later, changes nothing.
    expect(serializeSettings(mergeSettings(onDesktop, viaDisk(tablet)))).toEqual(serializeSettings(onDesktop))
  })

  it('keeps the newest edit of an item, including its position', () => {
    const base = normalizeSettings(null)
    addItems(base, [note('A.md', 'a'), note('B.md', 'b'), note('C.md', 'c')], 1000)
    const phone = viaDisk(base)
    const desktop = viaDisk(base)

    const a = desktop.items[0]
    if (a.type === 'note') editNote(a, { title: 'Desktop title' }, 2000)
    const phoneA = phone.items[0]
    if (phoneA.type === 'note') editNote(phoneA, { title: 'Phone title' }, 3000)
    moveItem(desktop, 'c', -2, 2500)

    const merged = mergeSettings(desktop, viaDisk(phone))
    expect(merged.items.map((i) => (i.type === 'note' ? i.title || i.path : ''))).toEqual(['C.md', 'Phone title', 'B.md'])
    expect(serializeSettings(mergeSettings(phone, viaDisk(desktop)))).toEqual(serializeSettings(merged))
  })

  it('merges display settings per setting, newest wins', () => {
    const desktop = normalizeSettings(null)
    const phone = normalizeSettings(null)
    setPref(desktop, 'showMenuButton', true, 1000)
    setPref(phone, 'openIn', 'tab', 2000)
    setPref(phone, 'showMenuButton', false, 500)
    const merged = mergeSettings(desktop, viaDisk(phone))
    expect(merged.showMenuButton).toBe(true)
    expect(merged.openIn).toBe('tab')
    expect(serializeSettings(mergeSettings(phone, viaDisk(desktop)))).toEqual(serializeSettings(merged))
  })

  it('handles files saved by version 0.0.1 on another device', () => {
    const desktop = normalizeSettings(null)
    addItems(desktop, [note('A.md', 'a'), note('B.md', 'b')], 1000)
    setPref(desktop, 'showMenuButton', true, 1000)
    removeItems(desktop, ['b'], 2000)

    // 0.0.1 keeps only id/type/title/path/icon per item and the plain setting
    // keys, and doesn't write tombstones or prefs. Its memory still has B, and it pins E.
    const oldFile = {
      items: [
        { id: 'a', type: 'note', title: 'Renamed on tablet', path: 'A.md', icon: '' },
        { id: 'b', type: 'note', title: '', path: 'B.md', icon: '' },
        { id: 'e', type: 'note', title: '', path: 'E.md', icon: '' },
      ],
      showRibbonIcons: true,
      showMenuButton: false,
      menuIcon: 'pin',
      openIn: 'current',
      focusExisting: true,
    }
    const merged = mergeSettings(desktop, normalizeSettings(oldFile))
    expect(paths(merged)).toEqual(['A.md', 'E.md'])
    const a = merged.items[0]
    expect(a.type === 'note' && a.title).toBe('')
    expect(merged.showMenuButton).toBe(true)
    expect(merged.tombstones.b).toBe(2000)
  })

  it('reads a 0.0.1 data.json on upgrade, keeping its order and settings', () => {
    const settings = normalizeSettings({
      items: [
        { id: 'x', type: 'note', title: '', path: 'X.md', icon: '' },
        { id: 'y', type: 'divider' },
        { id: 'w', type: 'note', title: '', path: 'W.md', icon: '' },
      ],
      showMenuButton: true,
      openIn: 'split',
    })
    expect(ids(settings)).toEqual(['x', 'y', 'w'])
    expect(settings.items.every((i) => i.updatedAt === 0)).toBe(true)
    expect(settings.showMenuButton).toBe(true)
    expect(settings.openIn).toBe('split')
    // A new pin goes after them.
    addItems(settings, [note('Z.md', 'z')], 1000)
    expect(ids(settings)).toEqual(['x', 'y', 'w', 'z'])
  })

  it('stays removed even when an older copy of the item is newer than its creation', () => {
    const desktop = normalizeSettings(null)
    addItems(desktop, [note('A.md', 'a')], 1000)
    const phone = viaDisk(desktop)
    const phoneA = phone.items[0]
    if (phoneA.type === 'note') editNote(phoneA, { title: 'Edited' }, 1500)
    removeItems(desktop, ['a'], 2000)
    expect(mergeSettings(desktop, viaDisk(phone)).items).toHaveLength(0)
  })

  it('round-trips through data.json unchanged', () => {
    const settings = normalizeSettings(null)
    addItems(settings, [note('A.md', 'a'), createDivider()], 1000)
    removeItems(settings, ['a'], 2000)
    setPref(settings, 'menuIcon', 'star', 3000)
    expect(serializeSettings(viaDisk(settings))).toEqual(serializeSettings(settings))
  })
})
