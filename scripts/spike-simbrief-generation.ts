// Throwaway spike (CLAUDE.md's spike-first rule) to verify SimBrief's real, keyed
// generation endpoint against the live site before any production code is built on it.
// Confirms two open questions from docs/simbrief-notes.md's "Generation" section: the
// departure-date format this path actually honours, and whether the identifier it hands
// back at generation time matches the `request_id` already seen from a normal fetch.
//
// Needs a real Electron GUI process (not ELECTRON_RUN_AS_NODE) since it opens a
// BrowserWindow for SimBrief's own login/progress UI — same as `npm run dev`, unset that
// env var first if running from a terminal that leaked it in.
//
// Reads the API key from simbrief-api-key.local (repo root, gitignored via `*.local` —
// never commit it). Reads the SimBrief username from the app's own settings DB, same as
// the app itself uses.
//
// Run with `npm run spike:simbrief-generation`.

import { app, BrowserWindow } from 'electron'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createDb } from '../src/main/db/client'
import { getSimbriefUsername } from '../src/main/db/settings-repo'
import { fetchLatestOfp } from '../src/main/simbrief/simbrief-client'

const ROOT = path.join(__dirname, '..')
const API_KEY = fs.readFileSync(path.join(ROOT, 'simbrief-api-key.local'), 'utf-8').trim()

// Same test route/type as the 2026-09-02 keyless-URL verification, for comparability.
const ORIG = 'EGLL'
const DEST = 'WSSS'
const TYPE = 'A388'

// Deliberately not "today", so whatever format the endpoint expects is unambiguous once
// compared against the generated plan's echoed departure time.
const testDeparture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
testDeparture.setUTCHours(14, 30, 0, 0)

function formatDdmmmyy(d: Date): string {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const yy = String(d.getUTCFullYear() % 100).padStart(2, '0')
  return `${dd}${months[d.getUTCMonth()]}${yy}`
}

function md5(input: string): string {
  return createHash('md5').update(input).digest('hex')
}

const timestamp = Math.floor(Date.now() / 1000)
const outputPage = 'flightdeck.local/spike'
const apiReq = `${ORIG}${DEST}${TYPE}${timestamp}${outputPage}`
const apiCode = md5(API_KEY + apiReq)
const legacyOfpIdGuess = `${timestamp}_${md5(ORIG + DEST + TYPE).toUpperCase().slice(0, 10)}`

const params = new URLSearchParams({
  orig: ORIG,
  dest: DEST,
  type: TYPE,
  date: formatDdmmmyy(testDeparture),
  deph: String(testDeparture.getUTCHours()),
  depm: String(testDeparture.getUTCMinutes()),
  apicode: apiCode,
  outputpage: outputPage,
  timestamp: String(timestamp)
})
const workerUrl = `https://www.simbrief.com/ofp/ofp.loader.api.php?${params.toString()}`

async function pollForNewOfp(username: string, baselineOfpId: string | null, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const ofp = await fetchLatestOfp(username)
      if (ofp.ofpId !== baselineOfpId) {
        console.log('\n--- New OFP detected ---')
        console.log('request_id from fetchLatestOfp:', ofp.ofpId)
        console.log('locally computed legacy-scheme ofp_id guess:', legacyOfpIdGuess)
        console.log('requested departure (UTC):', testDeparture.toISOString())
        console.log('schedOutUtc from generated plan:', ofp.schedOutUtc)
        return
      }
    } catch {
      // Not generated yet, or no OFP at all for a fresh username — keep polling.
    }
    await new Promise((r) => setTimeout(r, 5000))
  }
  console.log('\nTimed out waiting for a new OFP. Check the BrowserWindow for an error or unfinished login.')
}

async function main(): Promise<void> {
  // Run standalone (not through electron-vite's dev bootstrap), so app.name needs
  // setting explicitly — otherwise userData resolves under the default "Electron" name
  // instead of the real app's data directory.
  app.setName('flightdeck')
  await app.whenReady()

  const dbPath = path.join(app.getPath('userData'), 'flightdeck.db')
  const { db } = createDb(dbPath)
  const username = getSimbriefUsername(db)
  if (!username) {
    console.error('No SimBrief username saved in Settings — set one before running this spike.')
    app.quit()
    return
  }

  let baselineOfpId: string | null = null
  try {
    baselineOfpId = (await fetchLatestOfp(username)).ofpId
  } catch {
    // No prior OFP for this username — fine, baseline stays null.
  }
  console.log('Baseline request_id (before generation):', baselineOfpId)
  console.log('Worker URL:', workerUrl)

  // SimBrief's own popup closes itself once generation finishes — Electron's default is
  // to quit the whole app when the last window closes, which would kill the poll loop
  // below before it can report anything. Keep the process alive past that.
  app.on('window-all-closed', () => {})

  const win = new BrowserWindow({ width: 900, height: 700 })
  win.webContents.on('did-navigate', (_e, url) => console.log('did-navigate:', url))
  win.webContents.on('did-fail-load', (_e, code, desc, url) => console.log('did-fail-load:', code, desc, url))
  win.on('closed', () => console.log('Window closed.'))
  await win.loadURL(workerUrl)

  console.log('\nComplete SimBrief login/generation in the window if prompted.')
  console.log('Polling fetchLatestOfp in the background for up to 5 minutes...\n')

  await pollForNewOfp(username, baselineOfpId, 5 * 60 * 1000)
  app.quit()
}

main()
