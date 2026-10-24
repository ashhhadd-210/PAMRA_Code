# PAMRA Unified Market Intelligence Platform (PUMIP)

**Prepared for:** Punjab Agricultural Marketing Regulatory Authority
**Date:** 2026-05-13
**Status:** Solution Proposal + Working Prototype

---

## 1. Executive Summary

PAMRA currently operates three disconnected information systems:

| System | URL | Purpose |
|---|---|---|
| **MCMIS** | mcmis.punjab.gov.pk | Market Committee Management — staff, finance, governance |
| **AMIS** | amis.pk | Daily commodity prices, arrivals, market reports |
| **Mandi App** | mandiauction.punjab.gov.pk | Live auction capture from physical mandis |

These three are **siloed**, **inconsistent** in their records, and **unverified** — the same transaction can appear with different prices and volumes across systems, with no mechanism to detect which (if any) is correct. Manual entries are vulnerable to manipulation, omission, and outright fabrication.

**PUMIP** is a unified platform that:

1. **Integrates** all three systems into a single source of truth via a Unified Data Bus.
2. **Verifies** every record through a four-layer Data Authenticity Engine (cross-source validation, statistical anomaly detection, geo+staff verification, ML fraud scoring).
3. **Filters out** false and irrelevant entries automatically, quarantining suspicious data for human review.
4. **Surfaces** real-time market intelligence to PAMRA HQ via dashboards, alerts, and predictive analytics.

The accompanying prototype is a runnable demo of the core flow: data ingestion from all three sources → authenticity engine → unified dashboard with live anomaly alerts.

---

## 2. Problem Statement

### 2.1 Fragmentation
Each system owns a piece of the truth but none owns the whole. A field inspector logging an auction in the Mandi App has no link to the staff record in MCMIS or the published price in AMIS. Reconciliation is manual, slow, and error-prone.

### 2.2 Data Integrity Risk
Without verification, the system trusts whatever is entered. Known failure modes:

- **Price manipulation** — auction prices entered lower than actual sale price (revenue leakage).
- **Ghost arrivals** — phantom inflows logged to mask shortages or justify subsidy claims.
- **Duplicate entries** — same lot recorded multiple times across systems.
- **Out-of-location entries** — records submitted from outside the market geofence.
- **Absent staff entries** — records submitted under the name of staff who weren't on duty.
- **Statistical outliers** — prices that defy market reality (e.g., wheat at 10× normal rate).

### 2.3 Policy Blindspot
Punjab's agricultural policy depends on accurate data. Surplus/shortage forecasting, MSP decisions, food safety alerts, and revenue planning are all only as good as the underlying records. Bad data → bad policy.

---

## 3. Proposed Solution: PUMIP Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                                    │
│   Web Dashboard  │  Mobile Inspector App  │  Public Price Portal         │
└─────────────────────────────────────────────────────────────────────────┘
                                  ▲
┌─────────────────────────────────────────────────────────────────────────┐
│                    API GATEWAY (REST + WebSocket)                        │
│   Auth, rate limiting, audit logging                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                  ▲
┌─────────────────────────────────────────────────────────────────────────┐
│                    INTELLIGENCE LAYER                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │            DATA AUTHENTICITY ENGINE (4-Layer Filter)              │  │
│  │                                                                    │  │
│  │  Layer 1: Cross-Source Validator                                  │  │
│  │   → Same auction in MCMIS vs Mandi vs AMIS — flag mismatches      │  │
│  │                                                                    │  │
│  │  Layer 2: Statistical Anomaly Detector                            │  │
│  │   → Z-score, IQR, rolling-window deviation on price/volume        │  │
│  │                                                                    │  │
│  │  Layer 3: Geo + Staff Verifier                                    │  │
│  │   → GPS within market geofence + staff on attendance roster       │  │
│  │                                                                    │  │
│  │  Layer 4: ML Fraud Scorer                                         │  │
│  │   → Features: time-of-day, price-vs-history, entry velocity,      │  │
│  │     duplicate fingerprint, staff history → confidence score 0–1   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  Analytics Engine │ Forecasting Service │ Alert Router                  │
└─────────────────────────────────────────────────────────────────────────┘
                                  ▲
┌─────────────────────────────────────────────────────────────────────────┐
│                    UNIFIED DATA BUS (Kafka / Redis Streams)              │
│  Normalizes records from all sources into a single canonical schema      │
└─────────────────────────────────────────────────────────────────────────┘
              ▲                ▲                  ▲
       ┌──────┴──────┐  ┌──────┴──────┐   ┌──────┴──────┐
       │   MCMIS     │  │    AMIS     │   │  Mandi App  │
       │  Adapter    │  │  Adapter    │   │  Adapter    │
       └─────────────┘  └─────────────┘   └─────────────┘
              ▲                ▲                  ▲
        existing DB      existing API       mobile uploads
```

### 3.1 Unified Data Bus
A canonical schema for every market event (`AuctionRecord`, `ArrivalRecord`, `StaffPresence`, `PriceQuote`). Adapters poll/subscribe to each legacy system, normalize fields, attach a source tag, and publish to the bus. The bus is the single point at which all downstream services consume data.

### 3.2 Canonical Record Schema (excerpt)
```json
{
  "record_id": "uuid",
  "source": "MCMIS | AMIS | MANDI_APP",
  "market_id": "FSD-01",
  "commodity": "WHEAT",
  "lot_volume_kg": 12500,
  "price_per_kg": 95.50,
  "auction_timestamp": "2026-05-13T08:42:11Z",
  "staff_id": "INSP-4421",
  "geo": { "lat": 31.4504, "lng": 73.1350 },
  "external_ref": "MANDI-AUC-99814",
  "submitted_at": "2026-05-13T08:43:02Z"
}
```

---

## 4. Data Authenticity Engine — Deep Dive

The engine runs every incoming record through four layers. Each layer returns a verdict (`pass | warn | fail`) and a reason. The orchestrator combines these into a final disposition:

- **CLEAN** → published to analytics + dashboards.
- **SUSPECT** → published but visibly flagged; appears in review queue.
- **QUARANTINED** → withheld from analytics; requires human approval.

### Layer 1 — Cross-Source Validator
For records describing the same real-world event (matched on `market_id + commodity + auction_timestamp ± 15min`), compare price and volume across sources. Tolerance bands:
- Price mismatch > 8% → warn
- Price mismatch > 20% → fail
- Volume mismatch > 15% → warn

### Layer 2 — Statistical Anomaly Detector
Maintains a 30-day rolling distribution per `(market, commodity)` pair. Computes:
- **Z-score** on price (|z| > 3 → flag)
- **IQR fence** on volume (outside 1.5×IQR → flag)
- **Velocity check** — too many entries in a short window from one staff member → flag.

### Layer 3 — Geo + Staff Verifier
- Every market has a stored geofence polygon. Record's GPS must lie inside it.
- Staff member must appear in the day's attendance roster (from MCMIS biometric punch-in) within ±2 hours of the record timestamp.
- Repeated geo failures from one staff ID raises their fraud-score prior.

### Layer 4 — ML Fraud Scorer
A gradient-boosted classifier trained on historically-verified vs disputed records. Features include:
- Price deviation from 7-day market median
- Volume deviation from staff's historical entries
- Time-of-day vs typical auction window for that market
- Duplicate fingerprint (hash of nearby fields)
- Staff member's prior dispute rate
- Source agreement count

Outputs a `fraud_score ∈ [0,1]`. Threshold tuned per commodity (perishables tolerate more variance than staples).

### Combined Verdict Logic
```
if any layer == FAIL → QUARANTINED
elif fraud_score > 0.7 → QUARANTINED
elif any layer == WARN or fraud_score > 0.4 → SUSPECT
else → CLEAN
```

---

## 5. Integration Strategy (Non-Disruptive)

The three legacy systems continue to operate — PUMIP is **additive**, not a replacement. This protects PAMRA's existing investments and avoids change-management disruption to market committees already trained on MCMIS.

| Phase | Duration | Scope |
|---|---|---|
| **Phase 1: Read-only ingest** | 2 months | Adapters consume from all 3 systems; engine runs in observe-mode; dashboards built. No write-back. |
| **Phase 2: Quarantine + review** | 2 months | Flagged records appear in PAMRA review queue. HQ staff can approve/reject. Source systems remain authoritative. |
| **Phase 3: Write-back + correction** | 3 months | PUMIP becomes the system of record. Source systems become input channels. Authentication required for direct entry. |
| **Phase 4: Predictive + policy** | 3 months | Forecasting service goes live. Food safety alerts. Surplus-shortage routing recommendations. |

---

## 6. Technology Stack

**Backend**
- Node.js + Express (REST + WebSocket APIs)
- PostgreSQL (canonical records, transactional)
- Redis (streams, caching, real-time fan-out)
- Python microservice for ML fraud scorer (scikit-learn / XGBoost)

**Frontend**
- React + Vite (dashboard)
- Leaflet (Punjab map)
- Chart.js (analytics)
- React Native (inspector mobile app)

**Infra**
- Hosted within Punjab Government Data Center (data sovereignty)
- TLS everywhere; API keys for adapter authentication
- Append-only audit log with hash chaining (tamper-evident)
- Role-based access (Inspector / Committee / HQ Analyst / Admin)

---

## 7. Outcomes Mapped to PAMRA Vision

| PAMRA Outcome | How PUMIP Delivers |
|---|---|
| Better income for farmers | Transparent auction prices, fewer manipulated entries |
| Affordable prices for consumers | Real-time supply routing from surplus to deficit markets |
| Transparent & accountable markets | Every record verified; tamper-evident audit log |
| Data-driven policy | Clean, integrated dataset feeding forecasting |
| Improved revenue collection | Cross-source price verification closes leakage |
| Efficient supply chain | Surplus/shortage flows visualized live |

---

## 8. Prototype Walkthrough

The accompanying prototype (`/Users/mlkhdr11/projects/pamra/`) demonstrates:

1. **Data simulator** generates auction records from all three sources for 10 Punjab markets, including intentionally-bad records (price manipulation, ghost arrivals, geo violations, statistical outliers).
2. **Authenticity engine** runs all four layers on every record in real time.
3. **Live dashboard** shows:
   - Map of Punjab markets with commodity flow arrows
   - Live record feed (clean / suspect / quarantined)
   - Anomaly alert panel with reasons
   - Cross-source mismatch viewer
   - Per-market analytics
4. **Audit drawer** — for any flagged record, see exactly which layer caught it and why.

Run `npm install && npm start` from the project folder and open http://localhost:3000.
