# PAMRA Unified Market Intelligence Platform — Demo

A proposal + working prototype for unifying the three PAMRA systems (MCMIS, AMIS, Mandi App) into a single platform with a four-layer data authenticity engine.

## What's here

- **PROPOSAL.md** — full solution proposal (architecture, authenticity engine design, integration phases, tech stack).
- **Working prototype** — Node.js + WebSocket dashboard simulating live records from all three sources, with the engine catching tampered entries in real time.

## Run the demo

```bash
cd /Users/mlkhdr11/projects/pamra
npm install
npm start
```

Open http://localhost:3000

The simulator emits ~1 batch every 1.5s. ~25% of batches contain an intentionally-bad record (price manipulation, ghost arrival, geofence violation, statistical outlier, cross-source mismatch, or absent-staff entry). Click any record in the live feed to see the audit drawer with the engine's per-layer verdicts and the ground-truth tamper label.

## Deploy to Vercel (static build)

The platform also runs as a **fully static site** — no server, no database — by
running the simulators, authenticity engine and integrity ledger in the browser.
This is what makes it deployable on Vercel (serverless, where a long-running
WebSocket server and background timers aren't available).

```bash
npm run build      # bundles src/ → public/pamra-backend.js (browser build)
```

Then deploy the repo to Vercel (or `vercel`). Config lives in `vercel.json`:
build command `node build-bundle.js`, output dir `public/`, clean URLs, and `/`
rewritten to the public homepage.

How it works:
- `build-bundle.js` bundles the CommonJS modules in `src/` into one browser
  script (`public/pamra-backend.js`) — so **`src/` stays the single source of
  truth** and `npm start` still runs the real Express server for local dev.
- `web/runtime.js` (appended to the bundle) is the browser-side replacement for
  `server.js`: it runs the same simulators, overrides `window.fetch` for `/api/*`
  so every page works unchanged, and exposes a pub/sub bus in place of the
  WebSocket. A synchronous SHA-256 shim powers the integrity ledger client-side.
- Trade-off: state is per-page (a reload restarts the simulation) and not shared
  across tabs, since there's no server. Fine for a demo; the production design in
  the proposal uses real persistence.

## Architecture (prototype)

```
simulator.js  →  authenticityEngine.js  →  WebSocket  →  dashboard
  (MCMIS,        ├ crossSourceValidator
   AMIS,         ├ statisticalAnomaly
   MANDI_APP)    ├ geoStaffVerifier
                 └ fraudScorer (ML-style)
```

## Key files

- `server.js` — Express + WebSocket entry point
- `src/data/simulator.js` — generates records from 3 sources, injects tampering patterns
- `src/engine/authenticityEngine.js` — orchestrates the 4 layers
- `src/engine/crossSourceValidator.js` — Layer 1
- `src/engine/statisticalAnomaly.js` — Layer 2
- `src/engine/geoStaffVerifier.js` — Layer 3
- `src/engine/fraudScorer.js` — Layer 4
- `public/index.html` + `public/app.js` — dashboard

## Disposition logic

```
any layer fails       → QUARANTINED  (withheld from analytics)
fraud_score > 0.70    → QUARANTINED
any layer warns, OR
fraud_score > 0.40    → SUSPECT      (flagged but published)
otherwise             → CLEAN        (published normally)
```
