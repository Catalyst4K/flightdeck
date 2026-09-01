import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { IpcChannels, type AppPage } from '@shared/ipc'

const TABS: { label: string; page: AppPage }[] = [
  { label: 'Fleet', page: 'fleet' },
  { label: 'Dispatch', page: 'dispatch' },
  { label: 'Track', page: 'track' },
  { label: 'Logbook', page: 'logbook' },
  { label: 'Settings', page: 'settings' }
]

/**
 * Replaces Electron's default File/Edit/View/Window/Help menu bar with one whose
 * top-level items are the app's own tabs. A menu item with no submenu fires its click
 * handler directly rather than opening a dropdown, so this doubles as top-of-window tab
 * navigation.
 */
export function buildAppMenu(): Menu {
  const items: MenuItemConstructorOptions[] = TABS.map(({ label, page }) => ({
    label,
    click: () => {
      const target = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      target?.webContents.send(IpcChannels.menuNavigate, page)
    }
  }))
  // macOS requires an app-name menu for standard behavior (Cmd+Q, About, etc.) that a
  // plain tab-item template doesn't provide.
  if (process.platform === 'darwin') items.unshift({ role: 'appMenu' })
  return Menu.buildFromTemplate(items)
}
