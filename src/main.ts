import { Debouncer, Keymap, Menu, Notice, PaneType, Platform, Plugin, TFile, WorkspaceLeaf, debounce, normalizePath } from 'obsidian'
import {
  DEFAULT_NOTE_ICON,
  MENU_BUTTON_TITLE,
  OpenTarget,
  PinnedNote,
  PinnedNotesMenuSettings,
  applyRename,
  createNote,
  displayTitle,
  iconForExtension,
  importLegacy,
  isNote,
  normalizeSettings,
  pathMatches,
  ribbonTitles,
} from './items'
import { PinnedNotesMenuSettingTab } from './settings'
import { PinnedNoteModal } from './suggest'

/** Undocumented ribbon API; used only to remove icons when the list changes, so no restart is needed. */
interface RibbonInternals {
  removeRibbonAction?: (id: string) => void
}

const PANE_FOR_TARGET: Record<OpenTarget, PaneType | false> = {
  current: false,
  tab: 'tab',
  split: 'split',
  window: 'window',
}

export default class PinnedNotesMenuPlugin extends Plugin {
  settings!: PinnedNotesMenuSettings
  private pwRibbonIcons: { actionId: string; el: HTMLElement }[] = []
  /** Saves after typing pauses, so settings text fields don't write data.json on every key. */
  requestSave: Debouncer<[], void> = debounce(() => void this.saveSettings(), 600, true)

  async onload(): Promise<void> {
    await this.loadSettings()
    this.renderRibbon()
    this.addSettingTab(new PinnedNotesMenuSettingTab(this.app, this))

    this.addCommand({
      id: 'open-pinned-note',
      name: 'Open pinned note',
      callback: () => this.openPicker(),
    })
    this.addCommand({
      id: 'pin-current-note',
      name: 'Pin current note',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile()
        if (!file || this.isPinned(file)) return false
        if (!checking) void this.pinFile(file)
        return true
      },
    })
    this.addCommand({
      id: 'unpin-current-note',
      name: 'Unpin current note',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile()
        if (!file || !this.isPinned(file)) return false
        if (!checking) void this.unpinFile(file)
        return true
      },
    })

    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (!(file instanceof TFile)) return
      const pinned = this.isPinned(file)
      menu.addItem((item) => item
        .setTitle(pinned ? 'Unpin from pinned notes' : 'Pin to pinned notes')
        .setIcon(pinned ? 'pin-off' : 'pin')
        .setSection('action')
        .onClick(() => void (pinned ? this.unpinFile(file) : this.pinFile(file))))
    }))

    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (applyRename(this.settings.items, oldPath, file.path)) void this.saveSettings()
    }))
  }

  onunload(): void {
    this.requestSave.run()
  }

  async loadSettings(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData())
  }

  /** Saves settings and redraws the ribbon. */
  async saveSettings(): Promise<void> {
    this.requestSave.cancel()
    await this.saveData(this.settings)
    this.renderRibbon()
  }

  // ── Ribbon ──────────────────────────────────────────────────────────

  renderRibbon(): void {
    this.clearRibbon()
    const { items, showMenuButton, showRibbonIcons, menuIcon } = this.settings

    if (showMenuButton) {
      this.addPwRibbonIcon(menuIcon, MENU_BUTTON_TITLE, (evt) => this.showMenu(evt))
    }
    if (!showRibbonIcons) return

    const titles = ribbonTitles(items, [MENU_BUTTON_TITLE])
    for (const item of items) {
      const title = titles.get(item.id) ?? item.id
      if (isNote(item)) {
        const el = this.addPwRibbonIcon(item.icon || DEFAULT_NOTE_ICON, title, (evt) => void this.openNote(item, evt))
        // The ribbon only reports left clicks; middle click opens a new tab like a link.
        el.addEventListener('auxclick', (evt) => {
          if (evt.button === 1) void this.openNote(item, evt)
        })
      } else {
        // The phone ribbon is a list, where a divider would just be an empty row.
        if (Platform.isPhone) continue
        const el = this.addPwRibbonIcon('', title, () => {})
        // `ribbon-divider` keeps CSS snippets written for the Ribbon Divider plugin working.
        el.addClass('pnm-ribbon-divider', 'ribbon-divider', `ribbon-divider-${item.id}`)
        el.removeAttribute('aria-label')
      }
    }
  }

  private addPwRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => void): HTMLElement {
    const el = this.addRibbonIcon(icon, title, callback)
    this.pwRibbonIcons.push({ actionId: `${this.manifest.id}:${title}`, el })
    return el
  }

  private clearRibbon(): void {
    const ribbon = (this.app.workspace as unknown as { leftRibbon?: RibbonInternals }).leftRibbon
    for (const { actionId, el } of this.pwRibbonIcons) {
      ribbon?.removeRibbonAction?.(actionId)
      el.remove()
    }
    this.pwRibbonIcons = []
  }

  private showMenu(evt: MouseEvent): void {
    const menu = new Menu()
    let hasNotes = false
    let separatorPending = false
    for (const item of this.settings.items) {
      if (!isNote(item)) {
        separatorPending = hasNotes
        continue
      }
      if (separatorPending) menu.addSeparator()
      separatorPending = false
      hasNotes = true
      menu.addItem((menuItem) => menuItem
        .setTitle(displayTitle(item))
        .setIcon(item.icon || DEFAULT_NOTE_ICON)
        .onClick((clickEvt) => void this.openNote(item, clickEvt)))
    }
    if (!hasNotes) {
      menu.addItem((menuItem) => menuItem.setTitle('No pinned notes yet').setDisabled(true))
    }

    menu.addSeparator()
    const active = this.app.workspace.getActiveFile()
    if (active && !this.isPinned(active)) {
      menu.addItem((menuItem) => menuItem
        .setTitle('Pin current note')
        .setIcon('pin')
        .onClick(() => void this.pinFile(active)))
    }
    menu.addItem((menuItem) => menuItem
      .setTitle('Edit pinned notes')
      .setIcon('settings')
      .onClick(() => this.openSettings()))
    menu.showAtMouseEvent(evt)
  }

  openPicker(): void {
    new PinnedNoteModal(this.app, this.settings.items.filter(isNote), (note, evt) => void this.openNote(note, evt)).open()
  }

  private openSettings(): void {
    const setting = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }).setting
    setting?.open()
    setting?.openTabById(this.manifest.id)
  }

  // ── Notes ───────────────────────────────────────────────────────────

  resolveNote(note: PinnedNote): TFile | null {
    const path = note.path.trim()
    if (!path) return null
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path))
    if (file instanceof TFile) return file
    // Older entries (and the original Pinned Notes plugin) store paths without ".md".
    return this.app.metadataCache.getFirstLinkpathDest(path, '')
  }

  async openNote(note: PinnedNote, evt?: MouseEvent | KeyboardEvent): Promise<void> {
    const file = this.resolveNote(note)
    if (!file) {
      new Notice(`Pinned note not found: ${note.path || displayTitle(note)}`)
      return
    }

    let pane: PaneType | false = false
    if (evt) {
      const mod = Keymap.isModEvent(evt)
      pane = mod === true ? 'tab' : mod
      if (evt instanceof MouseEvent && evt.button === 1) pane = 'tab'
    }

    if (!pane) {
      const existing = this.settings.focusExisting ? this.findOpenLeaf(file) : null
      if (existing) {
        this.app.workspace.setActiveLeaf(existing, { focus: true })
        return
      }
      pane = PANE_FOR_TARGET[this.settings.openIn]
    }

    await this.app.workspace.getLeaf(pane).openFile(file)
  }

  private findOpenLeaf(file: TFile): WorkspaceLeaf | null {
    let found: WorkspaceLeaf | null = null
    this.app.workspace.iterateRootLeaves((leaf) => {
      // getViewState also works for tabs that haven't loaded their view yet.
      if (!found && leaf.getViewState().state?.file === file.path) found = leaf
    })
    return found
  }

  isPinned(file: TFile): boolean {
    return this.settings.items.some((item) => isNote(item) && pathMatches(item.path, file.path))
  }

  async pinFile(file: TFile): Promise<void> {
    this.settings.items.push(createNote(file.path, '', iconForExtension(file.extension)))
    await this.saveSettings()
    new Notice(`Pinned ${file.basename}`)
  }

  async unpinFile(file: TFile): Promise<void> {
    this.settings.items = this.settings.items.filter((item) => !(isNote(item) && pathMatches(item.path, file.path)))
    await this.saveSettings()
    new Notice(`Unpinned ${file.basename}`)
  }

  /** Copies notes and dividers from the original Pinned Notes and Ribbon Divider plugins. */
  async importFromLegacyPlugins(): Promise<void> {
    const read = async (pluginId: string): Promise<unknown> => {
      const path = normalizePath(`${this.app.vault.configDir}/plugins/${pluginId}/data.json`)
      try {
        if (!(await this.app.vault.adapter.exists(path))) return null
        return JSON.parse(await this.app.vault.adapter.read(path)) as unknown
      } catch (error) {
        console.error(`Pinned Notes Menu: could not read ${path}`, error)
        return null
      }
    }

    const { notes, dividers } = importLegacy(await read('pinned-notes'), await read('ribbon-divider'), this.settings.items)
    if (notes.length === 0 && dividers.length === 0) {
      new Notice('Nothing new to import from the original pinned notes and ribbon divider plugins.')
      return
    }
    this.settings.items.push(...notes, ...dividers)
    await this.saveSettings()
    new Notice(`Imported ${notes.length} notes and ${dividers.length} dividers. You can now turn off the old plugins.`)
  }
}
