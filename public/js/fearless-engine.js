import { CHAMPIONS, CHAMP_BY_ID, COUNTERS, ROLES, SYNERGIES, TEAMS } from "./pro-data.js";

// Official Riot Tournament 20-Step Draft Sequence
export const DRAFT_STEPS = [
  { step: 1, side: "blue", type: "ban", label: "B1 Ban" },
  { step: 2, side: "red", type: "ban", label: "R1 Ban" },
  { step: 3, side: "blue", type: "ban", label: "B2 Ban" },
  { step: 4, side: "red", type: "ban", label: "R2 Ban" },
  { step: 5, side: "blue", type: "ban", label: "B3 Ban" },
  { step: 6, side: "red", type: "ban", label: "R3 Ban" },
  { step: 7, side: "blue", type: "pick", label: "B1 Pick" },
  { step: 8, side: "red", type: "pick", label: "R1 Pick" },
  { step: 9, side: "red", type: "pick", label: "R2 Pick" },
  { step: 10, side: "blue", type: "pick", label: "B2 Pick" },
  { step: 11, side: "blue", type: "pick", label: "B3 Pick" },
  { step: 12, side: "red", type: "pick", label: "R3 Pick" },
  { step: 13, side: "red", type: "ban", label: "R4 Ban" },
  { step: 14, side: "blue", type: "ban", label: "B4 Ban" },
  { step: 15, side: "red", type: "ban", label: "R5 Ban" },
  { step: 16, side: "blue", type: "ban", label: "B5 Ban" },
  { step: 17, side: "red", type: "pick", label: "R4 Pick" },
  { step: 18, side: "blue", type: "pick", label: "B4 Pick" },
  { step: 19, side: "blue", type: "pick", label: "B5 Pick" },
  { step: 20, side: "red", type: "pick", label: "R5 Pick" },
];

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function logit(p) {
  const clamped = Math.min(0.95, Math.max(0.05, p));
  return Math.log(clamped / (1 - clamped));
}

// Fast deterministic PRNG (Mulberry32) so Monte Carlo simulations are 100% reproducible
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYNERGY_MAP = new Map();
for (const [a, b, delta, reason] of SYNERGIES) {
  SYNERGY_MAP.set(`${a}|${b}`, { delta, reason });
  SYNERGY_MAP.set(`${b}|${a}`, { delta, reason });
}

const COUNTER_MAP = new Map();
for (const [winner, loser, delta, reason] of COUNTERS) {
  COUNTER_MAP.set(`${winner}>${loser}`, { delta, reason });
}

export class FearlessDraftEngine {
  constructor({ blueTeamId = "C9", redTeamId = "FLY", format = "Bo5" } = {}) {
    this.format = format === "Bo3" ? "Bo3" : "Bo5";
    this.maxGames = this.format === "Bo3" ? 3 : 5;
    this.winsNeeded = this.format === "Bo3" ? 2 : 3;
    this.blueTeamId = TEAMS[blueTeamId] ? blueTeamId : "C9";
    this.redTeamId = TEAMS[redTeamId] ? redTeamId : "FLY";
    this.completedGames = []; // [{ gameNumber, blueTeamId, redTeamId, bluePicks, redPicks, winner: 'blue'|'red' }]
    this.currentGameNumber = 1;
    this.blueBans = [];
    this.redBans = [];
    this.bluePicks = [];
    this.redPicks = [];
    this.history = [];
    this.seriesId = "live-session";
  }

  getTeam(side) {
    return TEAMS[side === "blue" ? this.blueTeamId : this.redTeamId];
  }

  getSeriesScore() {
    let blueWins = 0;
    let redWins = 0;
    for (const g of this.completedGames) {
      if (g.winnerTeamId === this.blueTeamId) blueWins += 1;
      else if (g.winnerTeamId === this.redTeamId) redWins += 1;
    }
    return { blueWins, redWins };
  }

  // Hard Fearless global lockout: every champion picked by EITHER team in prior games
  getFearlessLockedSet() {
    const locked = new Set();
    for (const g of this.completedGames) {
      for (const c of g.bluePicks) locked.add(c);
      for (const c of g.redPicks) locked.add(c);
    }
    return locked;
  }

  getCurrentGameUsedSet() {
    return new Set([...this.blueBans, ...this.redBans, ...this.bluePicks, ...this.redPicks]);
  }

  getUnavailableSet() {
    const locked = this.getFearlessLockedSet();
    for (const c of this.getCurrentGameUsedSet()) locked.add(c);
    return locked;
  }

  getCurrentStep() {
    const idx = this.history.length;
    return idx < DRAFT_STEPS.length ? DRAFT_STEPS[idx] : null;
  }

  isDraftComplete() {
    return this.history.length >= DRAFT_STEPS.length;
  }

  applyAction(champId) {
    const step = this.getCurrentStep();
    if (!step) return { ok: false, reason: "Game draft is already complete (20/20 steps)." };
    if (!CHAMP_BY_ID[champId]) return { ok: false, reason: `Unknown champion "${champId}".` };
    if (this.getFearlessLockedSet().has(champId)) {
      return { ok: false, reason: `${CHAMP_BY_ID[champId].name} is permanently locked by Hard Fearless Draft from an earlier game.` };
    }
    if (this.getCurrentGameUsedSet().has(champId)) {
      return { ok: false, reason: `${CHAMP_BY_ID[champId].name} is already picked or banned in Game ${this.currentGameNumber}.` };
    }
    if (step.type === "ban") {
      if (step.side === "blue") this.blueBans.push(champId);
      else this.redBans.push(champId);
    } else {
      if (step.side === "blue") this.bluePicks.push(champId);
      else this.redPicks.push(champId);
    }
    this.history.push({ ...step, champId });
    return { ok: true, step, champId };
  }

  undoAction() {
    if (this.history.length === 0) return { ok: false, reason: "No actions to undo in current game." };
    const last = this.history.pop();
    if (last.type === "ban") {
      if (last.side === "blue") this.blueBans.pop();
      else this.redBans.pop();
    } else {
      if (last.side === "blue") this.bluePicks.pop();
      else this.redPicks.pop();
    }
    return { ok: true, undone: last };
  }

  completeCurrentGame(winnerSide = "blue", swapSides = false) {
    if (this.bluePicks.length < 5 || this.redPicks.length < 5) {
      return { ok: false, reason: "Complete all 10 champion picks before advancing to the next Fearless game." };
    }
    const winnerTeamId = winnerSide === "blue" ? this.blueTeamId : this.redTeamId;
    this.completedGames.push({
      gameNumber: this.currentGameNumber,
      blueTeamId: this.blueTeamId,
      redTeamId: this.redTeamId,
      bluePicks: [...this.bluePicks],
      redPicks: [...this.redPicks],
      blueBans: [...this.blueBans],
      redBans: [...this.redBans],
      winnerSide,
      winnerTeamId,
    });
    if (swapSides) {
      const tmp = this.blueTeamId;
      this.blueTeamId = this.redTeamId;
      this.redTeamId = tmp;
    }
    this.currentGameNumber = this.completedGames.length + 1;
    this.blueBans = [];
    this.redBans = [];
    this.bluePicks = [];
    this.redPicks = [];
    this.history = [];
    return { ok: true, nextGameNumber: this.currentGameNumber };
  }

  // Assign picks greedily to roles so comp balance & role depletion work cleanly
  static assignRoles(pickIds) {
    const assigned = {};
    const remaining = [...pickIds];
    // Assign single-role champs first, then flex picks
    remaining.sort((a, b) => (CHAMP_BY_ID[a]?.roles.length || 1) - (CHAMP_BY_ID[b]?.roles.length || 1));
    for (const id of remaining) {
      const c = CHAMP_BY_ID[id];
      if (!c) continue;
      const openRole = c.roles.find((r) => !assigned[r]) || ROLES.find((r) => !assigned[r]);
      if (openRole) assigned[openRole] = id;
    }
    return assigned;
  }

  static computeCompProfile(pickIds) {
    if (pickIds.length === 0) {
      return { engage: 0, wave: 0, scale: 0, early: 0, obj: 0, adCount: 0, apCount: 0, dmgBalance: 1, flexCount: 0 };
    }
    let engage = 0, wave = 0, scale = 0, early = 0, obj = 0, adCount = 0, apCount = 0, flexCount = 0;
    for (const id of pickIds) {
      const c = CHAMP_BY_ID[id];
      if (!c) continue;
      engage += c.engage;
      wave += c.wave;
      scale += c.scale;
      early += c.early;
      obj += c.obj;
      if (c.dmg === "AD") adCount += 1;
      else if (c.dmg === "AP") apCount += 1;
      else { adCount += 0.5; apCount += 0.5; }
      if (c.flex) flexCount += 1;
    }
    const n = pickIds.length;
    const ratio = adCount / Math.max(1, adCount + apCount);
    const dmgBalance = n >= 3 ? Math.max(0, 1 - Math.abs(ratio - 0.5) * 1.8) : 0.8;
    return {
      engage: Math.round((engage / n) * 10),
      wave: Math.round((wave / n) * 10),
      scale: Math.round((scale / n) * 10),
      early: Math.round((early / n) * 10),
      obj: Math.round((obj / n) * 10),
      adCount,
      apCount,
      dmgBalance: Math.round(dmgBalance * 100),
      flexCount,
    };
  }

  static teamComfortScore(team, champId) {
    let bonus = 0;
    for (const role of ROLES) {
      const idx = (team.comfortPool[role] || []).indexOf(champId);
      if (idx === 0) bonus = Math.max(bonus, 0.036);
      else if (idx === 1) bonus = Math.max(bonus, 0.026);
      else if (idx >= 2) bonus = Math.max(bonus, 0.014);
    }
    return bonus;
  }

  evaluateDraft(bluePicks = this.bluePicks, redPicks = this.redPicks) {
    const blueTeam = this.getTeam("blue");
    const redTeam = this.getTeam("red");

    const baseSideDelta = (logit(blueTeam.blueWinRate) - logit(redTeam.redWinRate)) * 0.35;
    let championStrengthDelta = 0;
    let comfortDelta = 0;
    let synergyDelta = 0;
    let counterDelta = 0;
    const synergyNotes = [];
    const counterNotes = [];

    for (const id of bluePicks) {
      const c = CHAMP_BY_ID[id];
      if (!c) continue;
      championStrengthDelta += (c.baseWr - 0.515) * 4.2;
      comfortDelta += FearlessDraftEngine.teamComfortScore(blueTeam, id) * 3.0;
    }
    for (const id of redPicks) {
      const c = CHAMP_BY_ID[id];
      if (!c) continue;
      championStrengthDelta -= (c.baseWr - 0.515) * 4.2;
      comfortDelta -= FearlessDraftEngine.teamComfortScore(redTeam, id) * 3.0;
    }

    for (let i = 0; i < bluePicks.length; i += 1) {
      for (let j = i + 1; j < bluePicks.length; j += 1) {
        const syn = SYNERGY_MAP.get(`${bluePicks[i]}|${bluePicks[j]}`);
        if (syn) {
          synergyDelta += syn.delta * 3.2;
          synergyNotes.push({ side: "blue", pair: `${CHAMP_BY_ID[bluePicks[i]].name} + ${CHAMP_BY_ID[bluePicks[j]].name}`, delta: syn.delta, reason: syn.reason });
        }
      }
    }
    for (let i = 0; i < redPicks.length; i += 1) {
      for (let j = i + 1; j < redPicks.length; j += 1) {
        const syn = SYNERGY_MAP.get(`${redPicks[i]}|${redPicks[j]}`);
        if (syn) {
          synergyDelta -= syn.delta * 3.2;
          synergyNotes.push({ side: "red", pair: `${CHAMP_BY_ID[redPicks[i]].name} + ${CHAMP_BY_ID[redPicks[j]].name}`, delta: syn.delta, reason: syn.reason });
        }
      }
    }

    for (const b of bluePicks) {
      for (const r of redPicks) {
        const bWins = COUNTER_MAP.get(`${b}>${r}`);
        if (bWins) {
          counterDelta += bWins.delta * 3.2;
          counterNotes.push({ side: "blue", matchup: `${CHAMP_BY_ID[b].name} > ${CHAMP_BY_ID[r].name}`, delta: bWins.delta, reason: bWins.reason });
        }
        const rWins = COUNTER_MAP.get(`${r}>${b}`);
        if (rWins) {
          counterDelta -= rWins.delta * 3.2;
          counterNotes.push({ side: "red", matchup: `${CHAMP_BY_ID[r].name} > ${CHAMP_BY_ID[b].name}`, delta: rWins.delta, reason: rWins.reason });
        }
      }
    }

    const blueProfile = FearlessDraftEngine.computeCompProfile(bluePicks);
    const redProfile = FearlessDraftEngine.computeCompProfile(redPicks);
    let compBalanceDelta = 0;
    if (bluePicks.length >= 3) {
      compBalanceDelta += (blueProfile.dmgBalance - 60) * 0.004;
      compBalanceDelta += (blueProfile.engage >= 65 ? 0.08 : -0.09);
      compBalanceDelta += blueProfile.flexCount * 0.03;
    }
    if (redPicks.length >= 3) {
      compBalanceDelta -= (redProfile.dmgBalance - 60) * 0.004;
      compBalanceDelta -= (redProfile.engage >= 65 ? 0.08 : -0.09);
      compBalanceDelta -= redProfile.flexCount * 0.03;
    }

    const totalLogit = baseSideDelta + championStrengthDelta + comfortDelta + synergyDelta + counterDelta + compBalanceDelta;
    const blueWinProb = Math.min(0.86, Math.max(0.14, sigmoid(totalLogit)));

    return {
      blueWinProb: Math.round(blueWinProb * 1000) / 10,
      redWinProb: Math.round((1 - blueWinProb) * 1000) / 10,
      attribution: {
        sideAndMacro: Math.round(baseSideDelta * 100) / 100,
        championPower: Math.round(championStrengthDelta * 100) / 100,
        teamComfort: Math.round(comfortDelta * 100) / 100,
        synergy: Math.round(synergyDelta * 100) / 100,
        counters: Math.round(counterDelta * 100) / 100,
        compBalance: Math.round(compBalanceDelta * 100) / 100,
      },
      blueProfile,
      redProfile,
      blueRoles: FearlessDraftEngine.assignRoles(bluePicks),
      redRoles: FearlessDraftEngine.assignRoles(redPicks),
      synergyNotes,
      counterNotes,
    };
  }

  getRemainingComfortPools() {
    const unavailable = this.getUnavailableSet();
    const out = { blue: {}, red: {}, pinchAlerts: [] };
    for (const side of ["blue", "red"]) {
      const team = this.getTeam(side);
      for (const role of ROLES) {
        const pool = team.comfortPool[role] || [];
        const remaining = pool.filter((id) => !unavailable.has(id));
        out[side][role] = { total: pool.length, remainingCount: remaining.length, remaining };
        if (remaining.length <= 2) {
          out.pinchAlerts.push({
            side,
            teamName: team.name,
            role,
            remainingCount: remaining.length,
            remaining: remaining.map((id) => CHAMP_BY_ID[id]?.name || id),
            severity: remaining.length <= 1 ? "CRITICAL_PINCH" : "HIGH_PINCH",
          });
        }
      }
    }
    return out;
  }

  // Save-or-Burn Multi-Game Fearless Recommender
  recommendActions(topN = 6) {
    const step = this.getCurrentStep();
    if (!step) return [];
    const unavailable = this.getUnavailableSet();
    const side = step.side;
    const oppSide = side === "blue" ? "red" : "blue";
    const myTeam = this.getTeam(side);
    const oppTeam = this.getTeam(oppSide);
    const myPicks = side === "blue" ? this.bluePicks : this.redPicks;
    const oppPicks = side === "blue" ? this.redPicks : this.bluePicks;
    const filledRoles = new Set(Object.keys(FearlessDraftEngine.assignRoles(myPicks)));
    const oppFilledRoles = new Set(Object.keys(FearlessDraftEngine.assignRoles(oppPicks)));
    const baseline = this.evaluateDraft();
    const baseMyProb = side === "blue" ? baseline.blueWinProb : baseline.redWinProb;
    const gamesRemainingAfterThis = Math.max(0, this.maxGames - this.currentGameNumber);
    const pools = this.getRemainingComfortPools();

    const scored = [];
    for (const champ of CHAMPIONS) {
      if (unavailable.has(champ.id)) continue;

      if (step.type === "pick") {
        // Skip picks that cannot fit any open role for my team
        const fitsOpenRole = champ.roles.some((r) => !filledRoles.has(r));
        if (!fitsOpenRole && filledRoles.size < 5) continue;

        const nextBlue = side === "blue" ? [...this.bluePicks, champ.id] : this.bluePicks;
        const nextRed = side === "red" ? [...this.redPicks, champ.id] : this.redPicks;
        const after = this.evaluateDraft(nextBlue, nextRed);
        const afterMyProb = side === "blue" ? after.blueWinProb : after.redWinProb;
        const gameDelta = Math.round((afterMyProb - baseMyProb) * 10) / 10;

        // Hard Fearless Save-or-Burn Calculation:
        // Burning a top-1 S-tier comfort anchor in Game 1/2 carries a future opportunity cost if we have other strong picks,
        // EXCEPT when picking it ALSO pinches the opponent's remaining comfort pool!
        const myRole = champ.roles.find((r) => !filledRoles.has(r)) || champ.roles[0];
        const myRem = pools[side][myRole]?.remainingCount ?? 3;
        const oppWants = (oppTeam.comfortPool[myRole] || []).includes(champ.id) && !oppFilledRoles.has(myRole);
        const oppRem = pools[oppSide][myRole]?.remainingCount ?? 3;

        let saveBurnDelta = 0;
        let tag = "OPTIMAL_PICK";
        let strategicNote = "";

        if (oppWants && oppRem <= 3) {
          saveBurnDelta += 2.2;
          tag = "FEARLESS_PINCH";
          strategicNote = `Denies ${oppTeam.name}'s ${myRole} comfort (${oppRem - 1} left after lock) while scoring +${gameDelta}% now.`;
        } else if (gamesRemainingAfterThis >= 2 && champ.tier === "S" && myRem <= 3 && this.currentGameNumber <= 2) {
          saveBurnDelta -= 1.1;
          tag = "BURN_WARNING";
          strategicNote = `High immediate value (+${gameDelta}%), but burns a scarce S-tier ${myRole} anchor early in Game ${this.currentGameNumber} (${gamesRemainingAfterThis} potential games left).`;
        } else if (champ.flex && myPicks.length <= 2) {
          saveBurnDelta += 1.4;
          tag = "FLEX_ADVANTAGE";
          strategicNote = `Multi-role flex (${champ.roles.join("/")}) hides lane assignment until R4/B5.`;
        } else {
          strategicNote = `Strong Game ${this.currentGameNumber} fit (${myRole}) with clean Fearless pool preservation.`;
        }

        const totalScore = Math.round((gameDelta + saveBurnDelta) * 10) / 10;
        scored.push({
          champId: champ.id,
          name: champ.name,
          roles: champ.roles,
          tier: champ.tier,
          action: "pick",
          gameWinDelta: gameDelta,
          seriesSaveBurnDelta: Math.round(saveBurnDelta * 10) / 10,
          compositeScore: totalScore,
          tag,
          strategicNote,
        });
      } else {
        // Ban evaluation: how much does banning champ hurt opponent's best pick + role pinch?
        const oppRole = champ.roles.find((r) => !oppFilledRoles.has(r));
        if (!oppRole && oppFilledRoles.size < 5) continue;

        const simBlue = oppSide === "blue" ? [...this.bluePicks, champ.id] : this.bluePicks;
        const simRed = oppSide === "red" ? [...this.redPicks, champ.id] : this.redPicks;
        const oppIfPicked = this.evaluateDraft(simBlue, simRed);
        const oppProbGain = (oppSide === "blue" ? oppIfPicked.blueWinProb : oppIfPicked.redWinProb) - (100 - baseMyProb);

        const oppComfort = FearlessDraftEngine.teamComfortScore(oppTeam, champ.id) * 100;
        const oppRem = pools[oppSide][oppRole]?.remainingCount ?? 4;
        const pinchBonus = oppComfort > 0 && oppRem <= 3 ? (4 - oppRem) * 1.4 : 0;
        const fpBonus = oppTeam.firstPickPriority.includes(champ.id) ? 1.5 : 0;
        const totalScore = Math.round((oppProbGain + oppComfort * 0.4 + pinchBonus + fpBonus) * 10) / 10;

        let tag = "META_BAN";
        let strategicNote = `Removes ${champ.name} (${champ.tier}-tier) preventing +${Math.round(oppProbGain * 10) / 10}% opponent swing.`;
        if (pinchBonus > 0) {
          tag = "ROLE_PINCH_BAN";
          strategicNote = `Pinches ${oppTeam.name}'s ${oppRole} comfort pool down to ${Math.max(0, oppRem - 1)} remaining option(s) in Game ${this.currentGameNumber}.`;
        } else if (fpBonus > 0) {
          tag = "PRIORITY_DENIAL";
          strategicNote = `Targets ${oppTeam.name}'s top GRID first-pick priority (${champ.name}).`;
        }

        scored.push({
          champId: champ.id,
          name: champ.name,
          roles: champ.roles,
          tier: champ.tier,
          action: "ban",
          gameWinDelta: Math.round(oppProbGain * 10) / 10,
          seriesSaveBurnDelta: Math.round(pinchBonus * 10) / 10,
          compositeScore: totalScore,
          tag,
          strategicNote,
        });
      }
    }

    scored.sort((a, b) => b.compositeScore - a.compositeScore);
    return scored.slice(0, topN);
  }

  // Reproducible 1,000-trial Monte Carlo Bo3/Bo5 Hard Fearless Series Simulation
  simulateSeries(trials = 1000, seed = 20261126) {
    const rng = mulberry32(seed);
    const currentEval = this.evaluateDraft();
    const curBlueP = currentEval.blueWinProb / 100;
    const score = this.getSeriesScore();
    const pools = this.getRemainingComfortPools();

    // Compute late-series pool depth advantage from remaining comfort champions across all 5 roles
    let blueDepth = 0;
    let redDepth = 0;
    for (const role of ROLES) {
      blueDepth += pools.blue[role].remainingCount;
      redDepth += pools.red[role].remainingCount;
    }
    const depthEdgePerLateGame = (blueDepth - redDepth) * 0.009;
    const baseFutureBlueP = Math.min(0.76, Math.max(0.24, 0.5 + (this.getTeam("blue").blueWinRate + this.getTeam("blue").redWinRate - this.getTeam("red").blueWinRate - this.getTeam("red").redWinRate) * 0.45));

    let blueSeriesWins = 0;
    let totalGamesPlayed = 0;
    const lengthHist = {};

    for (let t = 0; t < trials; t += 1) {
      let bw = score.blueWins;
      let rw = score.redWins;
      let g = this.currentGameNumber;
      while (bw < this.winsNeeded && rw < this.winsNeeded && g <= this.maxGames) {
        const pBlue = g === this.currentGameNumber
          ? curBlueP
          : Math.min(0.82, Math.max(0.18, baseFutureBlueP + depthEdgePerLateGame * (g - 1)));
        if (rng() < pBlue) bw += 1;
        else rw += 1;
        g += 1;
      }
      if (bw >= this.winsNeeded) blueSeriesWins += 1;
      const len = bw + rw;
      totalGamesPlayed += len;
      lengthHist[len] = (lengthHist[len] || 0) + 1;
    }

    return {
      trials,
      format: this.format,
      blueTeam: this.getTeam("blue").name,
      redTeam: this.getTeam("red").name,
      currentScore: `${score.blueWins}-${score.redWins}`,
      blueSeriesWinProb: Math.round((blueSeriesWins / trials) * 1000) / 10,
      redSeriesWinProb: Math.round(((trials - blueSeriesWins) / trials) * 1000) / 10,
      expectedSeriesLength: Math.round((totalGamesPlayed / trials) * 100) / 100,
      blueRemainingComfortTotal: blueDepth,
      redRemainingComfortTotal: redDepth,
      lateSeriesDepthAdvantage: blueDepth >= redDepth
        ? `${this.getTeam("blue").name} (+${blueDepth - redDepth} comfort champs)`
        : `${this.getTeam("red").name} (+${redDepth - blueDepth} comfort champs)`,
      lengthDistribution: lengthHist,
    };
  }

  generateScoutingReport(opponentSide = "red") {
    const opp = this.getTeam(opponentSide);
    const ours = this.getTeam(opponentSide === "red" ? "blue" : "red");
    const pools = this.getRemainingComfortPools()[opponentSide];

    const shallowRoles = ROLES.slice().sort((a, b) => pools[a].remainingCount - pools[b].remainingCount);
    const pinchTargetRole = shallowRoles[0];
    const md = [
      `# Pro Scouting Briefing: ${ours.name} vs ${opp.name} (${this.format} Hard Fearless)`,
      `- **GRID Team ID:** \`${opp.gridTeamId}\` (${opp.region})`,
      `- **Side Splits:** Blue ${Math.round(opp.blueWinRate * 100)}% WR | Red ${Math.round(opp.redWinRate * 100)}% WR`,
      `- **Macro Telemetry (GRID Series State):** GD@15 \`${opp.gd15 >= 0 ? "+" : ""}${opp.gd15}\` | 1st Voidgrub \`${Math.round(opp.firstVoidgrubRate * 100)}%\` | 1st Dragon \`${Math.round(opp.firstDragonRate * 100)}%\` | Atakhan \`${Math.round(opp.atakhanRate * 100)}%\` | Avg Game \`${opp.avgGameMinutes}m\``,
      `- **Strategic Identity:** ${opp.playstyle}`,
      ``,
      `## Phase-1 Ban & First-Pick Denial Plan`,
      `- **Must-Respect First Picks:** ${opp.firstPickPriority.map((id) => CHAMP_BY_ID[id]?.name || id).join(", ")}`,
      `- **Recommended Phase-1 Target Bans:** ${opp.targetBansAgainst.map((id) => CHAMP_BY_ID[id]?.name || id).join(", ")}`,
      ``,
      `## Hard Fearless Game 3–5 Pool Pinch Plan`,
      `- **Primary Pinch Vulnerability:** **${pinchTargetRole}** (${pools[pinchTargetRole].remainingCount} comfort champions remaining: ${pools[pinchTargetRole].remaining.map((id) => CHAMP_BY_ID[id]?.name || id).join(", ") || "DEPLETED"}).`,
      ...ROLES.map((r) => `  - **${r}:** ${pools[r].remainingCount}/${pools[r].total} left (${pools[r].remaining.map((id) => CHAMP_BY_ID[id]?.name || id).join(", ") || "none"})`),
      ``,
      `## Recent GRID Series References`,
      ...opp.recentGridSeries.map((s) => `- \`${s.seriesId}\` vs ${s.opponent} (${s.format}, ${s.score}, Patch ${s.patch}, ${s.date})`),
    ].join("\n");

    return {
      opponent: opp,
      ours,
      pinchTargetRole,
      remainingPools: pools,
      markdown: md,
    };
  }

  // Ingest authentic GRID v2 seriesState JSON payload directly into Hard Fearless series state
  static parseGridSeriesState(payload) {
    const series = payload?.data?.seriesState || payload?.seriesState || payload;
    if (!series || !Array.isArray(series.games)) {
      return { ok: false, reason: "Payload missing GRID seriesState.games array." };
    }
    const teamLookupByName = (name) => {
      const low = String(name || "").toLowerCase();
      for (const t of Object.values(TEAMS)) {
        if (low.includes(t.name.toLowerCase()) || low === t.id.toLowerCase()) return t.id;
      }
      return null;
    };
    const normalizeChamp = (raw) => {
      const cleaned = String(raw || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      for (const c of CHAMPIONS) {
        if (c.id.toLowerCase() === cleaned || c.name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() === cleaned) {
          return c.id;
        }
      }
      return null;
    };

    const seriesTeams = Array.isArray(series.teams) ? series.teams : [];
    const blueTeamId = teamLookupByName(seriesTeams[0]?.name) || "C9";
    const redTeamId = teamLookupByName(seriesTeams[1]?.name) || "FLY";
    const format = String(series.format || "").includes("3") ? "Bo3" : "Bo5";
    const engine = new FearlessDraftEngine({ blueTeamId, redTeamId, format });
    engine.seriesId = String(series.id || "grid-imported");

    let importedGames = 0;
    let lockedCount = 0;
    for (const g of series.games) {
      if (!g.finished || !Array.isArray(g.teams) || g.teams.length < 2) continue;
      const blueObj = g.teams.find((t) => String(t.side || "").toLowerCase() === "blue") || g.teams[0];
      const redObj = g.teams.find((t) => String(t.side || "").toLowerCase() === "red") || g.teams[1];
      const bPicks = (blueObj.players || []).map((p) => normalizeChamp(p.character?.name || p.champion)).filter(Boolean);
      const rPicks = (redObj.players || []).map((p) => normalizeChamp(p.character?.name || p.champion)).filter(Boolean);
      const bId = teamLookupByName(blueObj.name) || blueTeamId;
      const rId = teamLookupByName(redObj.name) || redTeamId;
      const winnerSide = blueObj.won ? "blue" : "red";
      engine.completedGames.push({
        gameNumber: Number(g.sequenceNumber) || importedGames + 1,
        blueTeamId: bId,
        redTeamId: rId,
        bluePicks: bPicks,
        redPicks: rPicks,
        blueBans: [],
        redBans: [],
        winnerSide,
        winnerTeamId: winnerSide === "blue" ? bId : rId,
      });
      importedGames += 1;
      lockedCount += bPicks.length + rPicks.length;
    }
    engine.currentGameNumber = engine.completedGames.length + 1;
    return {
      ok: true,
      engine,
      importedGames,
      lockedCount,
      seriesId: engine.seriesId,
    };
  }
}
