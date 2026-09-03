import type { LandingSeverity, LandingThresholds } from '@shared/ipc'
import { msToFpm } from './units'

/**
 * Classifies a touchdown against the user's configured thresholds (Settings, defaults in
 * settings-repo.ts) — shared verbatim by Fleet's per-aircraft history and Logbook's
 * per-flight pane (docs/decisions.md, landing-analysis entry) so the two views can never
 * disagree about what counts as a hard landing.
 *
 * Touchdown vertical speed is negative (descending) — classified on magnitude, since a
 * "harder" landing is a larger descent rate regardless of sign convention.
 */
export function classifyLanding(touchdownVerticalSpeedMs: number, thresholds: LandingThresholds): LandingSeverity {
  const fpm = Math.abs(msToFpm(touchdownVerticalSpeedMs))
  if (fpm >= thresholds.hardFpm) return 'hard'
  if (fpm >= thresholds.firmFpm) return 'firm'
  return 'none'
}
