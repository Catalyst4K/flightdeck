import { eq } from 'drizzle-orm'
import type { FlightInvoice } from '@shared/ipc'
import type { StoredInvoiceInput } from '../gsx/scan'
import { flightInvoice } from './schema'
import type { FlightdeckDb } from './client'

function toFlightInvoice(row: typeof flightInvoice.$inferSelect): FlightInvoice {
  return {
    id: row.id,
    flightId: row.flightId,
    serviceGroup: row.serviceGroup,
    receiptId: row.receiptId,
    issuedUtc: row.issuedUtc,
    icao: row.icao,
    tail: row.tail,
    operator: row.operator,
    totalUsd: row.totalUsd,
    totalText: row.totalText,
    sourceHtmlPath: row.sourceHtmlPath,
    receiptJson: row.receiptJson
  }
}

export function listInvoicesForFlight(db: FlightdeckDb, flightId: number): FlightInvoice[] {
  return db.select().from(flightInvoice).where(eq(flightInvoice.flightId, flightId)).all().map(toFlightInvoice)
}

/**
 * Adds any of `invoices` not already stored for this flight (deduped on receiptId) and
 * returns the full, current list. Used by both the completion-time snapshot/manual
 * rescan (a batch of confidently-matched receipts) and manually attaching one NOTAIL
 * candidate — additive rather than replace-wholesale, so a repeated rescan can't
 * duplicate rows, and can't wipe out a receipt attached by hand that the confident-match
 * scan itself would never find again.
 */
export function addInvoicesForFlight(
  db: FlightdeckDb,
  flightId: number,
  invoices: StoredInvoiceInput[]
): FlightInvoice[] {
  const alreadyStored = new Set(listInvoicesForFlight(db, flightId).map((i) => i.receiptId))
  const toInsert = invoices.filter((i) => !alreadyStored.has(i.receiptId))
  if (toInsert.length > 0) {
    db.insert(flightInvoice)
      .values(toInsert.map((invoice) => ({ flightId, ...invoice })))
      .run()
  }
  return listInvoicesForFlight(db, flightId)
}
