# JetBrains AI-Powered Engineering Workflow — StratosDraft

Built for the **Cloud9 × JetBrains "Sky's The Limit" Hackathon 2026** (Category 2: League of Legends Macro Scouting & Hard Fearless Draft + Bonus AI-Powered Workflow Story).

## JetBrains Tooling Integration

1. **WebStorm / IntelliJ IDEA Run Configurations (`.idea/runConfigurations/`):**
   - `StratosDraft_Tests.xml` runs Node 22 native test runner (`node --test tests/fearless_engine.test.mjs`) directly inside JetBrains IDE with inline assertion diagnostics and deterministic PRNG seed replay.
2. **JetBrains Qodana Static Inspection (`qodana.yaml`):**
   - Configured with `jetbrains/qodana-js:2025.2` (`qodana.recommended`) to enforce zero dead code, strict ESM import hygiene, and safe DOM construction (zero `innerHTML`) across `public/js/` and `worker/index.js`.
3. **AI-Assisted Modeling & Verification Loop (Junie / JetBrains AI Assistant Workflow):**
   - Domain decomposition separated pure deterministic math (`fearless-engine.js`) from GRID telemetry (`pro-data.js`) and DOM rendering (`app.js`), allowing automated unit + Monte Carlo invariant verification on every edit (`100%` reproducible Mulberry32 seed, exact 20-step Riot tournament draft order, and strict Hard Fearless cross-game lockout enforcement).
