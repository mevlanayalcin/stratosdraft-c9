import { CHAMPIONS, CHAMP_BY_ID, ROLES, SAMPLE_GRID_SERIES_STATE, TEAMS } from "./pro-data.js";
import { DRAFT_STEPS, FearlessDraftEngine } from "./fearless-engine.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag, text = "", className = "") {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  if (className) n.className = className;
  return n;
}

function svgEl(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

class StratosApp {
  constructor() {
    this.engine = new FearlessDraftEngine({ blueTeamId: "C9", redTeamId: "FLY", format: "Bo5" });
    this.roleFilter = "ALL";
    this.searchTerm = "";
    this.initControls();
    this.renderAll();
  }

  initControls() {
    const bSel = document.querySelector("#blue-team-select");
    const rSel = document.querySelector("#red-team-select");
    for (const t of Object.values(TEAMS)) {
      bSel.append(new Option(`${t.name} (${t.region})`, t.id, t.id === "C9", t.id === "C9"));
      rSel.append(new Option(`${t.name} (${t.region})`, t.id, t.id === "FLY", t.id === "FLY"));
    }
    const rebuildSeries = () => {
      this.engine = new FearlessDraftEngine({
        blueTeamId: bSel.value,
        redTeamId: rSel.value,
        format: document.querySelector("#format-select").value,
      });
      this.renderAll();
    };
    bSel.addEventListener("change", rebuildSeries);
    rSel.addEventListener("change", rebuildSeries);
    document.querySelector("#format-select").addEventListener("change", rebuildSeries);
    document.querySelector("#reset-series-btn").addEventListener("click", rebuildSeries);

    document.querySelector("#load-grid-btn").addEventListener("click", () => {
      const parsed = FearlessDraftEngine.parseGridSeriesState(SAMPLE_GRID_SERIES_STATE);
      if (parsed.ok) {
        this.engine = parsed.engine;
        bSel.value = this.engine.blueTeamId;
        rSel.value = this.engine.redTeamId;
        document.querySelector("#format-select").value = this.engine.format;
        this.renderAll();
      }
    });

    document.querySelector("#auto-step-btn").addEventListener("click", () => {
      const recs = this.engine.recommendActions(1);
      if (recs[0]) {
        this.engine.applyAction(recs[0].champId);
        this.renderAll();
      }
    });
    document.querySelector("#undo-btn").addEventListener("click", () => {
      this.engine.undoAction();
      this.renderAll();
    });
    document.querySelector("#advance-blue-btn").addEventListener("click", () => {
      this.engine.completeCurrentGame("blue", false);
      this.renderAll();
    });
    document.querySelector("#advance-red-btn").addEventListener("click", () => {
      this.engine.completeCurrentGame("red", false);
      this.renderAll();
    });

    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        document.querySelector(`#tab-${btn.dataset.tab}`)?.classList.add("active");
      });
    });

    document.querySelectorAll(".role-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.roleFilter = btn.dataset.role;
        document.querySelectorAll(".role-btn").forEach((b) => b.classList.toggle("active", b === btn));
        this.renderChampionGrid();
      });
    });
    document.querySelector("#champ-search").addEventListener("input", (e) => {
      this.searchTerm = e.target.value.trim().toLowerCase();
      this.renderChampionGrid();
    });

    document.querySelector("#copy-scouting-btn").addEventListener("click", async () => {
      const text = document.querySelector("#scouting-markdown").textContent;
      try { await navigator.clipboard.writeText(text); } catch {}
    });

    document.querySelector("#load-sample-json-btn").addEventListener("click", () => {
      document.querySelector("#grid-json-input").value = JSON.stringify(SAMPLE_GRID_SERIES_STATE, null, 2);
    });
    document.querySelector("#grid-json-input").value = JSON.stringify(SAMPLE_GRID_SERIES_STATE, null, 2);

    document.querySelector("#import-json-btn").addEventListener("click", () => {
      const status = document.querySelector("#grid-import-status");
      try {
        const parsedJson = JSON.parse(document.querySelector("#grid-json-input").value);
        const res = FearlessDraftEngine.parseGridSeriesState(parsedJson);
        if (!res.ok) {
          status.textContent = `Import error: ${res.reason}`;
          return;
        }
        this.engine = res.engine;
        bSel.value = this.engine.blueTeamId;
        rSel.value = this.engine.redTeamId;
        status.textContent = `Imported GRID series ${res.seriesId}: ${res.importedGames} completed game(s), ${res.lockedCount} champions Fearless-locked for Game ${this.engine.currentGameNumber}.`;
        this.renderAll();
      } catch (err) {
        status.textContent = `Invalid JSON: ${err.message}`;
      }
    });

    document.querySelector("#grid-api-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const out = document.querySelector("#grid-api-output");
      out.textContent = "Querying GRID API via Worker proxy…";
      try {
        const resp = await fetch("/api/grid/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: document.querySelector("#grid-endpoint").value,
            apiKey: document.querySelector("#grid-api-key").value.trim(),
            query: document.querySelector("#grid-query").value,
          }),
        });
        out.textContent = JSON.stringify(await resp.json(), null, 2);
      } catch (err) {
        out.textContent = `Request failed: ${err.message}`;
      }
    });

    document.querySelector("#coach-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = document.querySelector("#coach-input").value.trim();
      if (!q) return;
      const out = document.querySelector("#coach-output");
      out.textContent = "Analyzing live Hard Fearless state, Monte Carlo projections, and GRID scouting telemetry…";
      try {
        const ev = this.engine.evaluateDraft();
        const recs = this.engine.recommendActions(4);
        const mc = this.engine.simulateSeries(1000);
        const pools = this.engine.getRemainingComfortPools();
        const resp = await fetch("/api/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: q,
            context: {
              gameNumber: this.engine.currentGameNumber,
              format: this.engine.format,
              blueTeam: this.engine.getTeam("blue").name,
              redTeam: this.engine.getTeam("red").name,
              currentStep: this.engine.getCurrentStep()?.label || "Draft Complete",
              blueBans: this.engine.blueBans,
              redBans: this.engine.redBans,
              bluePicks: this.engine.bluePicks,
              redPicks: this.engine.redPicks,
              fearlessLockedCount: this.engine.getFearlessLockedSet().size,
              evaluation: { blueWinProb: ev.blueWinProb, redWinProb: ev.redWinProb, attribution: ev.attribution },
              monteCarlo: { blueSeriesWinProb: mc.blueSeriesWinProb, expectedSeriesLength: mc.expectedSeriesLength, lateSeriesDepthAdvantage: mc.lateSeriesDepthAdvantage },
              pinchAlerts: pools.pinchAlerts,
              topRecommendations: recs,
            },
          }),
        });
        const data = await resp.json();
        out.textContent = data.answer || data.error || "No coach answer returned.";
      } catch (err) {
        out.textContent = `Coach request failed: ${err.message}`;
      }
    });
  }

  renderAll() {
    this.renderHeaderStrip();
    this.renderSides();
    this.renderRecommendations();
    this.renderChampionGrid();
    this.renderSignals();
    this.renderMonteCarlo();
    this.renderScouting();
  }

  renderHeaderStrip() {
    const bTeam = this.engine.getTeam("blue");
    const rTeam = this.engine.getTeam("red");
    const score = this.engine.getSeriesScore();
    const locked = this.engine.getFearlessLockedSet();
    const ev = this.engine.evaluateDraft();
    const step = this.engine.getCurrentStep();

    document.querySelector("#series-score-text").textContent = `Game ${this.engine.currentGameNumber} (${this.engine.format}) · ${bTeam.name} ${score.blueWins} – ${score.redWins} ${rTeam.name}`;
    document.querySelector("#fearless-lock-count").textContent = `${locked.size} champions permanently Hard Fearless locked from prior games`;
    document.querySelector("#blue-wp-label").textContent = `${bTeam.name} Blue ${ev.blueWinProb}%`;
    document.querySelector("#red-wp-label").textContent = `${ev.redWinProb}% Red ${rTeam.name}`;
    document.querySelector("#blue-wp-fill").style.width = `${ev.blueWinProb}%`;
    const stepText = step ? `Step ${step.step}/20 · ${step.label}` : "Draft Complete (20/20)";
    document.querySelector("#step-indicator").textContent = stepText;
    document.querySelector("#rec-context-pill").textContent = step ? step.label : "Complete";

    const attr = ev.attribution;
    const fmt = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
    document.querySelector("#attribution-row").replaceChildren(
      el("span", `Macro/Side: ${fmt(attr.sideAndMacro)}`),
      el("span", `Champ Power: ${fmt(attr.championPower)}`),
      el("span", `Comfort: ${fmt(attr.teamComfort)}`),
      el("span", `Synergy: ${fmt(attr.synergy)}`),
      el("span", `Counters: ${fmt(attr.counters)}`),
      el("span", `Comp Balance: ${fmt(attr.compBalance)}`)
    );

    const complete = this.engine.isDraftComplete();
    document.querySelector("#auto-step-btn").disabled = complete;
    document.querySelector("#advance-blue-btn").hidden = !complete;
    document.querySelector("#advance-red-btn").hidden = !complete;
  }

  renderSides() {
    const ev = this.engine.evaluateDraft();
    const step = this.engine.getCurrentStep();
    for (const side of ["blue", "red"]) {
      const team = this.engine.getTeam(side);
      const bans = side === "blue" ? this.engine.blueBans : this.engine.redBans;
      const picks = side === "blue" ? this.engine.bluePicks : this.engine.redPicks;
      const profile = side === "blue" ? ev.blueProfile : ev.redProfile;
      document.querySelector(`#${side}-col-title`).textContent = `${side === "blue" ? "Blue" : "Red"} · ${team.name}`;

      const banStrip = document.querySelector(`#${side}-bans`);
      const banNodes = [];
      for (let i = 0; i < 5; i += 1) {
        const id = bans[i];
        const slot = el("div", id ? CHAMP_BY_ID[id].name : `Ban ${i + 1}`, id ? "ban-slot filled" : "ban-slot");
        banNodes.push(slot);
      }
      banStrip.replaceChildren(...banNodes);

      const pickList = document.querySelector(`#${side}-picks`);
      const pickNodes = [];
      for (let i = 0; i < 5; i += 1) {
        const id = picks[i];
        const isCurrent = step && step.type === "pick" && step.side === side && i === picks.length;
        const cls = `pick-slot ${id ? `${side}-filled` : ""} ${isCurrent ? "active-step" : ""}`;
        const slot = el("div", "", cls);
        if (id) {
          const c = CHAMP_BY_ID[id];
          slot.append(el("strong", c.name), el("span", `${c.roles.join("/")} · ${c.dmg}`, "muted"));
        } else {
          slot.append(el("span", `${side === "blue" ? "B" : "R"}${i + 1} Pick`, "muted"));
        }
        pickNodes.push(slot);
      }
      pickList.replaceChildren(...pickNodes);

      const bars = document.querySelector(`#${side}-comp-bars`);
      const metrics = [
        ["Engage", profile.engage],
        ["Early Tempo", profile.early],
        ["Late Scaling", profile.scale],
        ["Objective Shred", profile.obj],
        ["AP/AD Balance", profile.dmgBalance],
      ];
      bars.replaceChildren(...metrics.map(([lbl, val]) => {
        const row = el("div", "", "cbar-row");
        row.append(el("div", `${lbl}: ${val}/100`));
        const track = el("div", "", "cbar-track");
        const fill = el("div", "", "cbar-fill");
        fill.style.width = `${Math.min(100, val)}%`;
        track.append(fill);
        row.append(track);
        return row;
      }));
    }
  }

  renderRecommendations() {
    const list = document.querySelector("#recommendations-list");
    const recs = this.engine.recommendActions(6);
    if (recs.length === 0) {
      list.replaceChildren(el("p", "Game draft complete! Record the game winner above to lock all 10 champions under Hard Fearless rules and start the next game.", "muted"));
      return;
    }
    list.replaceChildren(...recs.map((r) => {
      const btn = el("button", "", "rec-item");
      btn.type = "button";
      const top = el("div", "", "rec-top");
      top.append(el("span", `${r.action === "ban" ? "BAN" : "PICK"} ${r.name}`));
      const tagCls = r.tag.includes("PINCH") ? "rec-tag tag-pinch" : r.tag.includes("WARN") ? "rec-tag tag-warn" : "rec-tag tag-ok";
      top.append(el("span", r.tag.replace(/_/g, " "), tagCls));
      const metrics = el("div", `ΔP Game: ${r.gameWinDelta >= 0 ? "+" : ""}${r.gameWinDelta}% · ΔEV Fearless: ${r.seriesSaveBurnDelta >= 0 ? "+" : ""}${r.seriesSaveBurnDelta}%`, "rec-metrics");
      const note = el("div", r.strategicNote, "rec-note");
      btn.append(top, metrics, note);
      btn.addEventListener("click", () => {
        this.engine.applyAction(r.champId);
        this.renderAll();
      });
      return btn;
    }));
  }

  renderChampionGrid() {
    const grid = document.querySelector("#champ-grid");
    const locked = this.engine.getFearlessLockedSet();
    const used = this.engine.getCurrentGameUsedSet();
    const complete = this.engine.isDraftComplete();

    const filtered = CHAMPIONS.filter((c) => {
      if (this.roleFilter !== "ALL" && !c.roles.includes(this.roleFilter)) return false;
      if (this.searchTerm && !c.name.toLowerCase().includes(this.searchTerm) && !c.id.toLowerCase().includes(this.searchTerm)) return false;
      return true;
    });

    grid.replaceChildren(...filtered.map((c) => {
      const isLocked = locked.has(c.id);
      const isUsed = used.has(c.id);
      const btn = el("button", "", isLocked ? "champ-btn fearless-locked" : "champ-btn");
      btn.type = "button";
      btn.disabled = isLocked || isUsed || complete;
      const top = el("div", c.name, "champ-name");
      const meta = el("div", "", "champ-meta");
      meta.append(
        el("span", isLocked ? "LOCKED" : isUsed ? "USED" : c.roles.join("/")),
        el("span", `${c.tier}`, `tier-${c.tier}`)
      );
      btn.append(top, meta);
      btn.addEventListener("click", () => {
        this.engine.applyAction(c.id);
        this.renderAll();
      });
      return btn;
    }));
  }

  renderSignals() {
    const ev = this.engine.evaluateDraft();
    const list = document.querySelector("#signals-list");
    const items = [];
    for (const s of ev.synergyNotes) {
      items.push(el("div", `[${s.side.toUpperCase()} SYNERGY +${(s.delta * 100).toFixed(1)}%] ${s.pair} — ${s.reason}`, "sig-row"));
    }
    for (const c of ev.counterNotes) {
      items.push(el("div", `[${c.side.toUpperCase()} COUNTER +${(c.delta * 100).toFixed(1)}%] ${c.matchup} — ${c.reason}`, "sig-row"));
    }
    if (items.length === 0) {
      items.push(el("p", "Draft champions to surface pairwise synergy combos and lane counter differentials.", "muted"));
    }
    list.replaceChildren(...items);
  }

  renderMonteCarlo() {
    const mc = this.engine.simulateSeries(1000);
    const pools = this.engine.getRemainingComfortPools();
    const kpi = (label, val) => {
      const box = el("div", "", "kpi-card");
      box.append(el("span", label), el("strong", val));
      return box;
    };
    document.querySelector("#mc-summary").replaceChildren(
      kpi(`${mc.blueTeam} Series Win`, `${mc.blueSeriesWinProb}%`),
      kpi(`${mc.redTeam} Series Win`, `${mc.redSeriesWinProb}%`),
      kpi("Expected Length", `${mc.expectedSeriesLength} Games`),
      kpi("Late-Series Pool Edge", mc.lateSeriesDepthAdvantage)
    );

    // Render crisp SVG bar chart of Series Length distribution
    const svg = document.querySelector("#mc-chart");
    const keys = Object.keys(mc.lengthDistribution).sort();
    const maxVal = Math.max(1, ...Object.values(mc.lengthDistribution));
    const nodes = [];
    const title = svgEl("text", { x: 20, y: 26, fill: "#bae6fd", "font-size": 13, "font-weight": 700 });
    title.textContent = `Simulated ${mc.format} Series Length Distribution (1,000 Monte Carlo Trials)`;
    nodes.push(title);
    keys.forEach((k, idx) => {
      const count = mc.lengthDistribution[k];
      const pct = Math.round((count / mc.trials) * 1000) / 10;
      const barW = Math.round((count / maxVal) * 320);
      const y = 52 + idx * 42;
      const lbl = svgEl("text", { x: 20, y: y + 18, fill: "#cbd5e1", "font-size": 13, "font-weight": 700 });
      lbl.textContent = `${k} Games`;
      nodes.push(lbl);
      nodes.push(svgEl("rect", { x: 110, y, width: barW, height: 26, rx: 6, fill: "#00aeef" }));
      const valTxt = svgEl("text", { x: 120 + barW, y: y + 18, fill: "#f8fafc", "font-size": 12.5, "font-weight": 700 });
      valTxt.textContent = `${pct}% (${count})`;
      nodes.push(valTxt);
    });
    svg.replaceChildren(...nodes);

    const alerts = document.querySelector("#pinch-alerts");
    if (pools.pinchAlerts.length === 0) {
      alerts.replaceChildren(el("p", "No critical role-pinch vulnerability yet (both teams retain >=3 comfort picks per role). Load GRID Bo5 Game 3 or advance games to see Fearless pool pressure.", "muted"));
    } else {
      alerts.replaceChildren(...pools.pinchAlerts.map((a) => el("div", `${a.severity}: ${a.teamName} (${a.side.toUpperCase()}) has only ${a.remainingCount} comfort ${a.role} remaining (${a.remaining.join(", ") || "NONE"})!`, "pinch-card")));
    }

    const matrix = document.querySelector("#pool-matrix");
    matrix.replaceChildren(...ROLES.map((r) => {
      const cell = el("div", "", "pool-cell");
      const bRem = pools.blue[r].remainingCount;
      const rRem = pools.red[r].remainingCount;
      cell.append(
        el("strong", r),
        el("div", `B: ${bRem}/${pools.blue[r].total}`, "blue-text"),
        el("div", `R: ${rRem}/${pools.red[r].total}`, "red-text")
      );
      return cell;
    }));

    const hist = document.querySelector("#fearless-history");
    if (this.engine.completedGames.length === 0) {
      hist.replaceChildren(el("p", "No prior games completed yet in this series.", "muted"));
    } else {
      hist.replaceChildren(...this.engine.completedGames.map((g) => el(
        "div",
        `Game ${g.gameNumber} (Winner: ${TEAMS[g.winnerTeamId]?.name || g.winnerSide}) — Locked Blue: ${g.bluePicks.join(", ")} | Locked Red: ${g.redPicks.join(", ")}`,
        "history-row"
      )));
    }
  }

  renderScouting() {
    const rep = this.engine.generateScoutingReport("red");
    const opp = rep.opponent;
    const kpi = (label, val) => {
      const box = el("div", "", "kpi-card");
      box.append(el("span", label), el("strong", val));
      return box;
    };
    document.querySelector("#scouting-kpis").replaceChildren(
      kpi("Opponent", opp.name),
      kpi("Avg GD@15", `${opp.gd15 >= 0 ? "+" : ""}${opp.gd15}`),
      kpi("1st Voidgrub", `${Math.round(opp.firstVoidgrubRate * 100)}%`),
      kpi("Atakhan Control", `${Math.round(opp.atakhanRate * 100)}%`),
      kpi("Pinch Target", rep.pinchTargetRole)
    );
    document.querySelector("#scouting-markdown").textContent = rep.markdown;
  }
}

window.__stratos = new StratosApp();
