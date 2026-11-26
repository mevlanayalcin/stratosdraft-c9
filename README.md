# StratosDraft — Cloud9 × JetBrains Hard Fearless Draft War Room

> **Cloud9 × JetBrains "Sky's The Limit" Hackathon 2026 — Category 2 (LoL Macro Scouting & Fearless Draft)**
>
> - **Live Web Application:** https://stratosdraft.bedir-ai.workers.dev/
> - **Live Health & GRID Sample API:** https://stratosdraft.bedir-ai.workers.dev/api/grid/sample-series
> - **Public GitHub Repository (MIT):** https://github.com/mevlanayalcin/stratosdraft-c9
> - **Demo Video (<3 min, 1080p):** `/home/ubuntu/quick-cash-sprint/stratosdraft-media/stratosdraft-c9-demo-1080p.mp4`

## What StratosDraft Solves

Under Riot's **Hard Fearless Draft** format (Bo3 / Bo5), every champion picked by either team in Games 1 through *k-1* is permanently locked out for the rest of the series (10 locked after G1, 20 after G2, 30 after G3, 40 after G4). Traditional single-game spreadsheets miss the multi-game strategic trade-off: **burning an S-tier comfort anchor in Game 1 can lose Games 4–5**, while targeted **role-pinch bans** can collapse an opponent's remaining champion pool.

## Core Capabilities

1. **Official 20-Step Hard Fearless Draft Engine (`public/js/fearless-engine.js`):** Enforces exact Riot tournament ban/pick order, permanent cross-game lockouts, and role assignment across 48 pro-meta champions and 6 pro teams (Cloud9, FlyQuest, Team Liquid, G2, T1, Gen.G).
2. **Bradley-Terry Win-Probability + Attribution Model:** Live Blue/Red win probability decomposed into Side/Macro baseline, Champion Power, Team Comfort, Pairwise Synergy Matrix (28 pro combos), Directed Counter Matrix (23 pro matchups), and AP/AD/Engage Composition Balance.
3. **Save-or-Burn Recommender & 1,000-Trial Reproducible Monte Carlo Simulator:** Scores every legal ban/pick on immediate Game Win-Prob Delta (`ΔP`) + Multi-Game Hard Fearless Series Equity (`ΔEV`), flags `FEARLESS_PINCH` and `BURN_WARNING` alerts, and simulates Bo3/Bo5 series win probabilities and length histograms across 1,000 deterministic trials.
4. **Live GRID GraphQL & Series-State Importer:** Built-in `/api/grid/query` proxy for GRID Central Data (`api-op.grid.gg/central-data/graphql`) and Series State (`api-op.grid.gg/live-data-feed/series-state/graphql`) using your `x-api-key`, plus a 1-click GRID v2 `seriesState` JSON replay parser (`Cloud9 vs FlyQuest Bo5 Game 3 — 20 champions locked`).
5. **Automated Opponent Scouting Briefing & Live AI Coach:** Generates copy-ready Markdown scouting dossiers (side splits, GD@15, Voidgrub/Dragon/Atakhan rates, Phase-1 target bans, Game 3–5 pinch plan) plus a live Cloudflare Workers AI tactical coach (`/api/coach`) grounded strictly in current draft telemetry.

## Run Tests Locally

```bash
node --test "tests/*.test.mjs"
```

*Disclaimer: StratosDraft is an independent open-source analytics tool built for the Cloud9 × JetBrains hackathon and is not affiliated with or endorsed by Riot Games.*
