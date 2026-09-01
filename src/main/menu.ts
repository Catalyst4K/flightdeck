import { Menu, type MenuItemConstructorOptions } from 'electron'

/**
 * In-app navigation lives in the top tab bar (src/renderer/src/App.tsx) — this menu is
 * standard OS-level items only (app menu, Edit, Window), not primary navigation.
 */
export function buildAppMenu(): Menu {
  const template: MenuItemConstructorOptions[] = []
  if (process.platform === 'darwin') template.push({ role: 'appMenu' })
  template.push({ role: 'editMenu' }, { role: 'windowMenu' })
  return Menu.buildFromTemplate(template)
}
