import { App, PluginSettingTab, Setting, getIcon, setIcon } from 'obsidian'
import type PinnedNotesMenuPlugin from './main'
import {
  DEFAULT_MENU_ICON,
  DEFAULT_NOTE_ICON,
  OpenTarget,
  PinnedDivider,
  PinnedNote,
  createDivider,
  createNote,
  displayTitle,
  moveItem,
} from './items'
import { FileSuggest, IconSuggest } from './suggest'

const OPEN_TARGET_LABELS: Record<OpenTarget, string> = {
  current: 'Current tab',
  tab: 'New tab',
  split: 'Split pane',
  window: 'New window',
}

export class PinnedNotesMenuSettingTab extends PluginSettingTab {
  constructor(app: App, private pwPlugin: PinnedNotesMenuPlugin) {
    super(app, pwPlugin)
  }

  hide(): void {
    this.pwPlugin.requestSave.run()
  }

  display(): void {
    this.pwRender()
  }

  /** Redraws the tab, keeping the scroll position. */
  private pwRender(): void {
    const { containerEl } = this
    const plugin = this.pwPlugin
    const settings = plugin.settings
    const scrollTop = containerEl.scrollTop
    containerEl.empty()

    // ── Pinned notes list ────────────────────────────────────────────
    new Setting(containerEl)
      .setName('Pinned notes')
      .setDesc('Notes and dividers appear in the ribbon and the menu in this order. Leave the title empty to use the file name.')
      .setHeading()

    const listEl = containerEl.createDiv('pnm-item-list')
    if (settings.items.length === 0) {
      listEl.createEl('p', { cls: 'setting-item-description', text: 'No pinned notes yet. Add one below, or pin a file from its right-click menu.' })
    }
    settings.items.forEach((item, index) => {
      const setting = new Setting(listEl)
      if (item.type === 'note') this.renderNote(setting, item)
      else this.renderDivider(setting, item)
      this.addRowButtons(setting, index)
    })

    new Setting(containerEl)
      .addButton((button) => button
        .setButtonText('Add note')
        .setCta()
        .onClick(async () => {
          settings.items.push(createNote(''))
          await plugin.saveSettings()
          this.pwRender()
        }))
      .addButton((button) => button
        .setButtonText('Add divider')
        .onClick(async () => {
          settings.items.push(createDivider())
          await plugin.saveSettings()
          this.pwRender()
        }))

    // ── Ribbon ───────────────────────────────────────────────────────
    new Setting(containerEl).setName('Ribbon').setHeading()

    new Setting(containerEl)
      .setName('Show notes in the ribbon')
      .setDesc('Show each pinned note and divider as its own ribbon icon. You can also drag them around in the ribbon.')
      .addToggle((toggle) => toggle
        .setValue(settings.showRibbonIcons)
        .onChange(async (value) => {
          settings.showRibbonIcons = value
          await plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Show menu button')
      .setDesc('Show one ribbon button that opens a menu of all pinned notes, with dividers as separators.')
      .addToggle((toggle) => toggle
        .setValue(settings.showMenuButton)
        .onChange(async (value) => {
          settings.showMenuButton = value
          await plugin.saveSettings()
        }))

    const menuIconSetting = new Setting(containerEl)
      .setName('Menu button icon')
      .setDesc('Any icon name from lucide.dev that Obsidian includes.')
    const menuIconPreview = menuIconSetting.controlEl.createSpan({ cls: 'pnm-icon-preview' })
    const updateMenuIcon = (value: string) => {
      settings.menuIcon = value.trim() || DEFAULT_MENU_ICON
      setIcon(menuIconPreview, settings.menuIcon)
      plugin.requestSave()
    }
    setIcon(menuIconPreview, settings.menuIcon)
    menuIconSetting.addText((text) => {
      text.setPlaceholder(DEFAULT_MENU_ICON).setValue(settings.menuIcon).onChange(updateMenuIcon)
      new IconSuggest(this.app, text.inputEl, updateMenuIcon)
    })

    // ── Opening notes ────────────────────────────────────────────────
    new Setting(containerEl).setName('Opening notes').setHeading()

    new Setting(containerEl)
      .setName('Open notes in')
      .setDesc('Middle-click, or click while holding the modifier key, always opens a new tab.')
      .addDropdown((dropdown) => {
        for (const [value, label] of Object.entries(OPEN_TARGET_LABELS)) dropdown.addOption(value, label)
        dropdown.setValue(settings.openIn).onChange(async (value) => {
          settings.openIn = value as OpenTarget
          await plugin.saveSettings()
        })
      })

    new Setting(containerEl)
      .setName('Switch to open tab')
      .setDesc('If the note is already open, switch to that tab instead of opening it again.')
      .addToggle((toggle) => toggle
        .setValue(settings.focusExisting)
        .onChange(async (value) => {
          settings.focusExisting = value
          await plugin.saveSettings()
        }))

    // ── Import ───────────────────────────────────────────────────────
    new Setting(containerEl).setName('Import').setHeading()

    new Setting(containerEl)
      .setName('Import from other plugins')
      .setDesc('Copy notes and dividers from the original pinned notes and ribbon divider plugins into the list above. Dividers are added at the end.')
      .addButton((button) => button
        .setButtonText('Import')
        .onClick(async () => {
          await plugin.importFromLegacyPlugins()
          this.pwRender()
        }))

    containerEl.scrollTop = scrollTop
  }

  private renderNote(setting: Setting, note: PinnedNote): void {
    const plugin = this.pwPlugin
    setting.setClass('pnm-note-row')
    const iconEl = setting.nameEl.createSpan({ cls: 'pnm-icon-preview' })
    const titleEl = setting.nameEl.createSpan()

    const refresh = () => {
      setIcon(iconEl, note.icon.trim() || DEFAULT_NOTE_ICON)
      titleEl.setText(displayTitle(note))
      const problems: string[] = []
      if (!note.path.trim()) problems.push('Choose a note.')
      else if (!plugin.resolveNote(note)) problems.push('Note not found.')
      if (note.icon.trim() && !getIcon(note.icon.trim())) problems.push(`Unknown icon "${note.icon.trim()}".`)
      setting.setDesc(problems.join(' '))
      setting.descEl.toggleClass('pnm-warning', problems.length > 0)
    }
    refresh()

    const update = (change: Partial<PinnedNote>) => {
      Object.assign(note, change)
      refresh()
      plugin.requestSave()
    }

    setting
      .addText((text) => text
        .setPlaceholder('Title')
        .setValue(note.title)
        .onChange((value) => update({ title: value })))
      .addText((text) => {
        text.setPlaceholder('Path').setValue(note.path).onChange((value) => update({ path: value }))
        text.inputEl.addClass('pnm-path-input')
        new FileSuggest(this.app, text.inputEl, (file) => update({ path: file.path }))
      })
      .addText((text) => {
        text.setPlaceholder(`Icon (${DEFAULT_NOTE_ICON})`).setValue(note.icon).onChange((value) => update({ icon: value }))
        text.inputEl.addClass('pnm-icon-input')
        new IconSuggest(this.app, text.inputEl, (icon) => update({ icon }))
      })
  }

  private renderDivider(setting: Setting, _divider: PinnedDivider): void {
    setting.setClass('pnm-divider-row').setName('Divider')
  }

  private addRowButtons(setting: Setting, index: number): void {
    const plugin = this.pwPlugin
    const items = plugin.settings.items
    const move = async (delta: number) => {
      plugin.settings.items = moveItem(items, index, delta)
      await plugin.saveSettings()
      this.pwRender()
    }
    setting
      .addExtraButton((button) => button
        .setIcon('arrow-up')
        .setTooltip('Move up')
        .setDisabled(index === 0)
        .onClick(() => void move(-1)))
      .addExtraButton((button) => button
        .setIcon('arrow-down')
        .setTooltip('Move down')
        .setDisabled(index === items.length - 1)
        .onClick(() => void move(1)))
      .addExtraButton((button) => button
        .setIcon('trash-2')
        .setTooltip('Remove')
        .onClick(async () => {
          plugin.settings.items = items.filter((_, i) => i !== index)
          await plugin.saveSettings()
          this.pwRender()
        }))
  }
}
