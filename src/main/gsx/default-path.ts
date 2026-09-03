import { join } from 'node:path'

/**
 * GSX is a Windows-only product, so this only ever resolves on win32 (docs/gsx-notes.md).
 * `%APPDATA%` (`process.env.APPDATA`) is the real environment variable Windows sets for
 * this, rather than assuming `~/AppData/Roaming` — a user with a redirected profile
 * folder would otherwise get a wrong, confidently-stated path. Only used to pre-fill
 * Settings' path field when it's empty; the field stays user-editable either way, since a
 * silently-wrong detected path is worse than an empty box (docs/decisions.md).
 */
export function defaultGsxReceiptsPath(): string | null {
  if (process.platform !== 'win32') return null
  const appData = process.env.APPDATA
  if (!appData) return null
  return join(appData, 'Virtuali', 'GSX', 'Receipts')
}
