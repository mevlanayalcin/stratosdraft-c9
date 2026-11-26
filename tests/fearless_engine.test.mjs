import assert from "node:assert/strict";
import test from "node:test";
import { FearlessDraftEngine } from "../public/js/fearless-engine.js";
import { CHAMPIONS, SAMPLE_GRID_SERIES_STATE } from "../public/js/pro-data.js";

test("Hard Fearless state machine enforces exact 20-step draft and permanent cross-game lockouts", () => {
  const eng = new FearlessDraftEngine({ blueTeamId: "C9", redTeamId: "FLY", format: "Bo5" });
  assert.equal(CHAMPIONS.length, 48);
  for (let i = 0; i < 20; i += 1) {
    const recs = eng.recommendActions(1);
    assert.ok(recs.length >= 1, `No recommendation at step ${i + 1}`);
    const res = eng.applyAction(recs[0].champId);
    assert.equal(res.ok, true, res.reason);
  }
  assert.equal(eng.isDraftComplete(), true);
  const g1Picks = [...eng.bluePicks, ...eng.redPicks];
  assert.equal(g1Picks.length, 10);

  const adv = eng.completeCurrentGame("blue", false);
  assert.equal(adv.ok, true);
  assert.equal(eng.currentGameNumber, 2);
  assert.equal(eng.getFearlessLockedSet().size, 10);

  // Attempting to ban or pick a Game 1 champion in Game 2 MUST be refused
  const illegal = eng.applyAction(g1Picks[0]);
  assert.equal(illegal.ok, false);
  assert.match(illegal.reason, /Hard Fearless/);
});

test("GRID v2 Series-State JSON importer hydrates 20 Fearless lockouts and role pinch alerts", () => {
  const parsed = FearlessDraftEngine.parseGridSeriesState(SAMPLE_GRID_SERIES_STATE);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.importedGames, 2);
  assert.equal(parsed.lockedCount, 20);
  const eng = parsed.engine;
  assert.equal(eng.currentGameNumber, 3);
  assert.equal(eng.getSeriesScore().blueWins, 1);
  assert.equal(eng.getSeriesScore().redWins, 1);

  const pools = eng.getRemainingComfortPools();
  assert.ok(pools.pinchAlerts.length >= 1, "Game 3 with 20 locked champs should trigger Fearless pinch alerts");

  const recs = eng.recommendActions(5);
  assert.equal(recs.length, 5);
  assert.ok(recs.every((r) => !eng.getFearlessLockedSet().has(r.champId)));
});

test("Bradley-Terry synergy/counter evaluation and reproducible 1,000-trial Monte Carlo invariants hold", () => {
  const eng = new FearlessDraftEngine({ blueTeamId: "C9", redTeamId: "FLY", format: "Bo5" });
  const evBase = eng.evaluateDraft(["Rumble", "Vi", "Orianna", "Kaisa", "Rell"], ["Aatrox", "Zyra", "Hwei", "Jhin", "Nami"]);
  assert.ok(evBase.blueWinProb > 55, `Expected strong synergy comp >55%, got ${evBase.blueWinProb}`);
  assert.ok(evBase.synergyNotes.length >= 2);

  // Reproducibility check (same seed -> identical outputs)
  const mc1 = eng.simulateSeries(1000, 42);
  const mc2 = eng.simulateSeries(1000, 42);
  assert.deepEqual(mc1, mc2);
  assert.ok(mc1.expectedSeriesLength >= 3.0 && mc1.expectedSeriesLength <= 5.0);
  assert.equal(Math.round((mc1.blueSeriesWinProb + mc1.redSeriesWinProb) * 10) / 10, 100);
});

test("Automated GRID scouting report generator produces complete Markdown dossier", () => {
  const eng = FearlessDraftEngine.parseGridSeriesState(SAMPLE_GRID_SERIES_STATE).engine;
  const rep = eng.generateScoutingReport("red");
  assert.match(rep.markdown, /FlyQuest/);
  assert.match(rep.markdown, /47376/);
  assert.match(rep.markdown, /Hard Fearless Game 3–5 Pool Pinch Plan/);
});
