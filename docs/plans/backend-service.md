# Plan: backend credential-broker service

Branch: `plan/backend-service`. Flightdeck's first backend of any kind — a new trust
boundary, and worth building carefully rather than quickly. Depends on
`plan/simbrief-generation` (already shipped) for the SimBrief half, and touches the
navdata side of `plan/sid-star-selection` (still blocked, separately, on the Navigraph
application question below) for the other.

## Context

Callum's direction (`docs/decisions.md`, 2026-09-03): Flightdeck should work like
SimToolkitPro — SimBrief and Navigraph access built in, with no end user ever requesting
their own API key. That requires a server Flightdeck controls, holding two credentials on
users' behalf. The two credentials are architecturally different, and the two
`docs/decisions.md` entries from 2026-09-03 (the scope decision, and the Navigraph
refinement against their real developer docs) are required reading before touching this —
summarised here, not restated in full:

- **SimBrief**: their own developer materials are explicitly built for "one operator's
  key, many end users via a server" — a VA dispatch website is the intended shape, and
  this is exactly that shape. The specific mechanism is deliberately not documented
  anywhere in this repo, code included in comments — see `docs/simbrief-notes.md` and the
  redaction note in `docs/decisions.md`. **What can be said here**: the client currently
  builds a request locally and needs one additional value computed from Callum's key
  before submitting it; that computation is what moves server-side. Nothing about
  fetching the resulting plan back changes — `simbrief-client.ts`'s existing
  `fetchLatestOfp` already does that part, unchanged.
- **Navigraph**: their Device Authorization Flow (recommended, per their own docs,
  specifically for flight simulator add-ons) needs a `client_secret` as well as a
  `client_id` in both the device-authorization and token-exchange requests — confirmed
  from their actual documented request parameters, not assumed. Every navdata request is
  gated by *the logged-in user's own* subscription (read from their own token), so there's
  no shared-subscription resale problem — the server's only job is to keep the
  `client_secret` off of every user's machine, by relaying two OAuth calls. It never sees
  navdata, never uses Callum's own subscription, never stores anything per-user.

**Prerequisite, not yet done**: Callum's existing Navigraph developer application (noted
as "applied for, pending" in `plan/sid-star-selection`) was written before this backend
decision existed. Confirm it actually describes a distributed multi-user app with a small
OAuth-brokering server before treating Navigraph access as buildable — the same "ask,
don't assume" discipline that got the SimBrief question its email in the first place. The
SimBrief half has no equivalent blocker.

## What this service is, and — importantly — what it is not

One small, stateless HTTP service with two routes. No accounts, no login of its own, no
database, no per-user state kept anywhere on it. It authenticates *to* SimBrief and
Navigraph on the app's behalf; end users still authenticate directly to SimBrief (their
own login, in a real SimBrief popup, per the existing shipped flow) and to Navigraph
(their own device-flow login, in their own browser) exactly as designed before this. The
server is a thin, boring relay sitting in front of exactly one secret each — not a
platform, not a proxy for the actual flight-planning or navdata traffic itself.

- **`POST /simbrief/sign`** (name illustrative): accepts the same public fields the client
  already assembles locally (nothing sensitive — the fields already sent to the keyless
  prefill URL today), returns the one authorization value Callum's key produces. No
  SimBrief traffic flows through this server at all; the client still talks to SimBrief
  directly for everything else, exactly as `plan/simbrief-generation` already built.
- **`POST /navigraph/device-code`** and **`POST /navigraph/token`** (illustrative): relay
  the two Navigraph OAuth calls, injecting `client_secret` server-side and passing the
  `client_id`, device code, and PKCE verifier straight through untouched. The resulting
  per-user access/refresh token goes straight back to the client and is stored there
  (`app_setting`, same as every other credential in this app) — the server never retains
  it.

Both routes are stateless enough to be implemented as pure functions of their request
body plus one injected secret — which is what makes the hosting choice below mostly a
question of cost and operational simplicity, not of what the platform can technically do.

## Hosting: recommendation and why

The actual load here is about as light as a backend gets — occasional, bursty, one call
per flight dispatched or per Navigraph login (which per Callum's own description issues a
long-lived/"permanent" token, so logins are rare per user, not per session). That argues
strongly for **pay-for-what-you-use, scale-to-zero hosting** over an always-on server —
an always-on VM costs the same whether it serves one request a day or a thousand, and
this service's expected load is much closer to the former for a long time yet.

| Option | Cost at this scale | Practicality for a solo TS developer | Verdict |
|---|---|---|---|
| **Cloudflare Workers** | Free — 100,000 requests/day on the free plan, effectively unlimited headroom for this workload; $5/mo unlocks 10M/month if that's ever exceeded | Deploys with `wrangler`, one CLI, no account infrastructure beyond a Cloudflare login. TypeScript-native, matching this repo's stack exactly. Full `node:crypto` (including `createHash`) is supported by default as of their August 2026 compatibility date — confirmed directly, not assumed, since this was the one real technical risk worth checking before recommending an edge runtime for something crypto-shaped. Free `*.workers.dev` subdomain out of the box; a custom domain is optional, not required. | **Recommended.** |
| **AWS Lambda + Function URL** (skip API Gateway — it adds $1+/million requests and real setup complexity for no benefit at this scale; a Function URL is a plain HTTPS endpoint straight off the function) | Free — 1,000,000 requests/month, permanent, not a trial | Full Node runtime, zero compatibility questions. But real setup friction for someone not already living in AWS day to day: IAM roles, a console or CDK/SAM toolchain, a second cloud account to secure and monitor. | Credible fallback if the Workers runtime hits an actual limitation Cloudflare's compatibility notes don't cover. |
| **Fly.io** | No real free tier since 2024 (trial only now) — a minimal always-on machine runs ~$2–5/mo, realistically $8–25/mo once egress and restarts are accounted for | Simplest mental model — it's just a small Node process, no platform-specific runtime quirks at all. | Only worth it if the edge/serverless model turns out to be a poor fit in practice; costs real money for near-zero actual load either way. |
| DigitalOcean/Hetzner VPS, Render, Railway | ~$4–7/mo (VPS), or free-with-cold-starts (Render's free web service sleeps after inactivity) | Similar always-on tradeoffs to Fly, or a cold-start delay that would show up as a slow first SimBrief/Navigraph call after idle time. | Not recommended over the two above for this specific job. |

**Recommendation: Cloudflare Workers.** It's free at every load this service will see for
the foreseeable future, needs no server to patch or monitor, and the one real technical
question — whether its runtime can do what SimBrief's signing step needs — already checked
out against Cloudflare's own current documentation rather than being assumed. Confirm it
against the real key once building (see Verification), but there's no reason to expect it
won't work.

## Abuse protection

A shared credential behind a public endpoint needs its own protection, separate from
"the secret isn't in the client anymore" — a wide-open relay is exactly as abusable as a
client-embedded secret, just from a different angle. Minimum for v1:

- **Rate-limit per caller**, not just globally — Cloudflare's own Rate Limiting Rules
  (available on Workers, no extra service needed) can throttle by an app-supplied
  identifier. This doesn't need to be cryptographically strong; it needs to make casual
  abuse inconvenient, matching SimBrief support's own bar ("protect the API key somehow").
  A determined attacker who captures and replays genuine Flightdeck request bytes can't be
  fully stopped by anything the client can prove about itself — treat this as deterrence,
  not a guarantee, and say so rather than overselling it.
- **No logging of anything sensitive** — request bodies for the SimBrief route contain
  nothing secret (public flight-plan fields), and the Navigraph routes only ever handle
  values that are the calling user's own (their device code, their token) — but avoid
  logging full request/response bodies by default regardless, on general principle for
  anything touching auth flows.
- **Monitoring**: Cloudflare's built-in request analytics (free, included) are enough for
  a v1 — enough to notice a spike or an outage. No case yet for a dedicated observability
  stack on a two-route service.

## Implementation shape

1. **A new, separate repository — not a folder inside `flightdeck`.** This is a genuinely
   different deployable artifact with its own release cadence (it needs to ship the
   moment a secret rotates, independent of any app release), and CLAUDE.md's own boundary
   rules already treat "the renderer never touches the network directly" as sacred for
   exactly this kind of separation-of-concerns reason. **Private repo** — not for licensing
   reasons (Flightdeck is GPL-3.0, not AGPL, so nothing about its licence obligates the
   *server* to be open-sourced just because a GPL client talks to it; only AGPL's
   network-use clause would create that obligation, and this project deliberately isn't
   that), simply because there's no upside to public visibility for a two-route relay and
   it avoids any confusion about what is or isn't safe to disclose about SimBrief's
   mechanism.
2. **Secrets live only as platform environment variables** (Cloudflare's encrypted
   secrets store, `wrangler secret put`) — never in either repo's source, never in a
   config file that gets committed. This is the one part of this whole feature where a
   mistake is unrecoverable-without-rotation, so treat it with the same care as the
   `.gitignore`d `future-monetization.md` pattern already established for other
   never-commit content.
3. **Flightdeck-side changes**: a new `src/main/backend/` module (matching the existing
   `src/main/simbrief/`, `src/main/gsx/` shape) that calls the deployed service instead of
   computing the SimBrief signing value locally, and a Navigraph OAuth client that calls
   the two relay routes instead of talking to Navigraph directly. The backend's base URL
   is one constant, not sprinkled through the codebase — same discipline CLAUDE.md already
   requires for SimVar names living only in `simvars.ts`.
4. **Consider keeping a "bring your own key" escape hatch** for both credentials, entered
   in Settings exactly like today's SimBrief username, used instead of the built-in
   service when set. Costs little (the client-side code to call SimBrief/Navigraph
   directly already exists or is being built either way) and buys real resilience — if the
   shared service has downtime, or the shared key gets rate-limited or revoked for
   someone else's misuse, a user who wants to isn't fully blocked. Flagged as a genuine
   recommendation, not a certainty — it's additional UI and a second code path to maintain,
   so it's fair to cut for a v1 and add later if the shared service's reliability in
   practice makes it worth it.

## Verification

- Unit tests for the SimBrief signing route as a pure function (given a fixed test key
  and fixed inputs, fixed output) — doesn't need Callum's real key to test the logic, only
  to test it against the real SimBrief endpoint.
- Unit tests for the Navigraph relay routes against a mocked Navigraph token endpoint —
  confirm the secret is injected and never echoed back in any response or error path.
- **Live, before trusting the hosting recommendation completely**: deploy a minimal
  Worker and confirm `node:crypto`'s relevant primitive produces the same output as a
  local Node computation with the same inputs — cheap to check, and this plan's one real
  "verify before committing" item, in the same spirit as every other plan in this project.
- Live: one real SimBrief generation and one real Navigraph device-flow login, each
  routed through the deployed service end to end.
- A basic rate-limit test — hammer the deployed endpoint from a script and confirm it
  throttles rather than passing everything through.

## Open questions

- **The Navigraph application-description check above is a prerequisite, not a detail** —
  don't build the Navigraph relay routes until that's confirmed, even though the SimBrief
  route has no equivalent gate and could ship first on its own.
- **Whether to keep a bring-your-own-key fallback** (implementation shape, point 4) — worth
  a decision before or shortly after v1, not a hard blocker either way.
- **Domain**: the free `*.workers.dev` subdomain is enough to ship with; a custom domain
  (e.g. under whatever domain the flightsim.to listing or a future project site uses) is a
  nice-to-have, not a prerequisite.
- **What happens when the shared key/secret needs rotating** — worth a short runbook once
  this exists (update the platform secret, no client release needed since the client never
  held it), but not worth designing in detail before the service exists to rotate anything
  for.
