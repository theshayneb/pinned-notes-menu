import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  PinnedItem,
  applyRename,
  createDivider,
  createNote,
  displayTitle,
  importLegacy,
  moveItem,
  normalizeSettings,
  pathMatches,
  ribbonTitles,
} from '../src/items'

describe('normalizeSettings', () => {
  it('returns defaults for empty data', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
  })

  it('drops invalid items and fixes duplicate ids', () => {
    const settings = normalizeSettings({
      items: [
        { id: 'a', type: 'note', title: 'A', path: 'A.md', icon: '' },
        { id: 'a', type: 'divider' },
        { type: 'weird' },
        'nope',
      ],
      openIn: 'nowhere',
      showMenuButton: true,
    })
    expect(settings.items).toHaveLength(2)
    expect(settings.items[0].id).toBe('a')
    expect(settings.items[1].id).not.toBe('a')
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

describe('moveItem', () => {
  it('moves within bounds and ignores moves past the ends', () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3])
    expect(moveItem([1, 2, 3], 2, -2)).toEqual([3, 1, 2])
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3])
  })
})
