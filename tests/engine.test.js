import { describe, expect, it } from "vitest";
import {
  TournamentError,
  applyOperation,
  buildPlacement,
  correctionImpact,
  createTournament,
  readyMatches,
} from "../supabase/functions/_shared/tournament-engine.js";

async function draftWithPlayers(count, seededCount = 0) {
  let state = createTournament({ name: `${count} Player Test`, tournamentDate: "2026-08-16" });
  for (let index = 0; index < count; index += 1) {
    state = (await applyOperation(state, {
      type: "add_player",
      payload: { name: `Player ${index + 1}`, seed: index < seededCount ? index + 1 : null },
    })).state;
  }
  return state;
}

async function recordWinner(state, match, side = 1, extra = {}) {
  const bracketId = side === 1 ? match.opponent1.id : match.opponent2.id;
  const player = state.players.find((candidate) => candidate.bracketId === bracketId);
  return (await applyOperation(state, {
    type: "set_match_result",
    payload: {
      matchId: match.id,
      winnerId: player.id,
      opponent1Score: null,
      opponent2Score: null,
      ...extra,
    },
  })).state;
}

async function completeTournament(count) {
  let state = await draftWithPlayers(count, Math.min(4, count));
  state = (await applyOperation(state, { type: "start", payload: {} })).state;
  let safety = 0;
  while (state.status === "active" && safety < 200) {
    const playable = readyMatches(state);
    expect(playable.length).toBeGreaterThan(0);
    state = await recordWinner(state, playable[0], 1);
    safety += 1;
  }
  expect(safety).toBeLessThan(200);
  return state;
}

describe("bracket generation", () => {
  it("generates a valid bracket for every supported player count", async () => {
    for (let count = 2; count <= 32; count += 1) {
      let state = await draftWithPlayers(count, Math.min(4, count));
      state = (await applyOperation(state, { type: "start", payload: {} })).state;
      expect(state.status).toBe("active");
      expect(state.players).toHaveLength(count);
      expect(state.bracket.match.length).toBeGreaterThan(0);
      expect(readyMatches(state).length).toBeGreaterThan(0);
      const firstRound = state.bracket.round.find((round) => round.group_id === state.bracket.group.find((group) => group.number === 1).id && round.number === 1);
      const firstRoundMatches = state.bracket.match.filter((match) => match.round_id === firstRound.id);
      expect(firstRoundMatches.some((match) => match.opponent1 === null && match.opponent2 === null)).toBe(false);
    }
  });

  it.each([2, 3, 5, 8, 10, 12, 17, 31, 32])("completes a %i-player tournament with two losses per eliminated player", async (count) => {
    const state = await completeTournament(count);
    expect(state.status).toBe("completed");
    expect(state.championId).toBeTruthy();
    expect(state.standings.find((item) => item.rank === 1)?.playerId).toBe(state.championId);

    const losses = new Map(state.players.map((player) => [player.bracketId, 0]));
    for (const match of state.bracket.match) {
      if (match.opponent1?.result === "loss") losses.set(match.opponent1.id, losses.get(match.opponent1.id) + 1);
      if (match.opponent2?.result === "loss") losses.set(match.opponent2.id, losses.get(match.opponent2.id) + 1);
    }
    const champion = state.players.find((player) => player.id === state.championId);
    for (const player of state.players) {
      expect(losses.get(player.bracketId)).toBe(player.id === champion.id ? 0 : 2);
    }
  });

  it("keeps top seeds separated and awards six byes in a 10-player field", async () => {
    const state = await draftWithPlayers(10, 4);
    const placement = buildPlacement(state.players, "fixed-seed");
    expect(placement.size).toBe(16);
    expect(placement.slots.filter((slot) => slot === null)).toHaveLength(6);
    for (const seeded of state.players.filter((player) => player.seed)) {
      const index = placement.slots.indexOf(seeded.id);
      expect(placement.slots[index ^ 1]).toBeNull();
    }
  });

  it("rerolls only unseeded placement", async () => {
    let state = await draftWithPlayers(10, 4);
    state = (await applyOperation(state, { type: "reroll", payload: { randomSeed: "first" } })).state;
    const first = [...state.placementPreview];
    state = (await applyOperation(state, { type: "reroll", payload: { randomSeed: "second" } })).state;
    const second = [...state.placementPreview];
    for (const player of state.players.filter((candidate) => candidate.seed)) {
      expect(first.indexOf(player.id)).toBe(second.indexOf(player.id));
    }
    expect(first).not.toEqual(second);
  });
});

describe("grand final", () => {
  async function reachGrandFinal() {
    let state = await draftWithPlayers(2, 1);
    state = (await applyOperation(state, { type: "start", payload: {} })).state;
    state = await recordWinner(state, readyMatches(state)[0], 1);
    return state;
  }

  it("ends immediately when the winners-bracket champion wins Grand Final 1", async () => {
    let state = await reachGrandFinal();
    state = await recordWinner(state, readyMatches(state)[0], 1);
    expect(state.status).toBe("completed");
    expect(readyMatches(state)).toHaveLength(0);
  });

  it("activates the reset final after the losers-bracket champion wins Grand Final 1", async () => {
    let state = await reachGrandFinal();
    state = await recordWinner(state, readyMatches(state)[0], 2);
    expect(state.status).toBe("active");
    expect(readyMatches(state)).toHaveLength(1);
    state = await recordWinner(state, readyMatches(state)[0], 2);
    expect(state.status).toBe("completed");
  });
});

describe("results and corrections", () => {
  it("supports winner-only and tied-score results", async () => {
    let state = await draftWithPlayers(4);
    state = (await applyOperation(state, { type: "start", payload: {} })).state;
    const first = readyMatches(state)[0];
    state = await recordWinner(state, first, 1);
    const next = readyMatches(state)[0];
    const winner = state.players.find((player) => player.bracketId === next.opponent2.id);
    state = (await applyOperation(state, {
      type: "set_match_result",
      payload: { matchId: next.id, winnerId: winner.id, opponent1Score: 3, opponent2Score: 3 },
    })).state;
    expect(state.bracket.match.find((match) => match.id === next.id).opponent2.result).toBe("win");
  });

  it("rejects malformed and contradictory scores without explicit override", async () => {
    let state = await draftWithPlayers(4);
    state = (await applyOperation(state, { type: "start", payload: {} })).state;
    const match = readyMatches(state)[0];
    const lowerScorer = state.players.find((player) => player.bracketId === match.opponent2.id);
    await expect(applyOperation(state, {
      type: "set_match_result",
      payload: { matchId: match.id, winnerId: lowerScorer.id, opponent1Score: 10, opponent2Score: 2 },
    })).rejects.toMatchObject({ code: "score_winner_conflict" });
    await expect(applyOperation(state, {
      type: "set_match_result",
      payload: { matchId: match.id, winnerId: lowerScorer.id, opponent1Score: 1, opponent2Score: null },
    })).rejects.toBeInstanceOf(TournamentError);
    for (const scores of [[-1, 2], [1.5, 2], ["3", 2]]) {
      await expect(applyOperation(state, {
        type: "set_match_result",
        payload: { matchId: match.id, winnerId: lowerScorer.id, opponent1Score: scores[0], opponent2Score: scores[1] },
      })).rejects.toBeInstanceOf(TournamentError);
    }
    state = (await applyOperation(state, {
      type: "set_match_result",
      payload: { matchId: match.id, winnerId: lowerScorer.id, opponent1Score: 10, opponent2Score: 2, overrideScoreWinner: true },
    })).state;
    expect(state.bracket.match.find((item) => item.id === match.id).opponent2.result).toBe("win");
  });

  it("requires confirmation and clears downstream results when correcting", async () => {
    let state = await draftWithPlayers(4);
    state = (await applyOperation(state, { type: "start", payload: {} })).state;
    const original = readyMatches(state)[0];
    state = await recordWinner(state, original, 1);
    while ((await correctionImpact(state, original.id)).length === 0) {
      state = await recordWinner(state, readyMatches(state)[0], 1);
    }
    const impact = await correctionImpact(state, original.id);
    expect(impact.length).toBeGreaterThan(0);
    const correctedWinner = state.players.find((player) => player.bracketId === original.opponent2.id);
    await expect(applyOperation(state, {
      type: "set_match_result",
      payload: { matchId: original.id, winnerId: correctedWinner.id, opponent1Score: null, opponent2Score: null },
    })).rejects.toMatchObject({ code: "rollback_confirmation_required" });
    state = (await applyOperation(state, {
      type: "set_match_result",
      payload: { matchId: original.id, winnerId: correctedWinner.id, opponent1Score: null, opponent2Score: null, confirmRollback: true },
    })).state;
    expect((await correctionImpact(state, original.id)).length).toBe(0);
  });
});
