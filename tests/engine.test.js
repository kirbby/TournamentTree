import { describe, expect, it } from "vitest";
import {
  TournamentError,
  applyOperation,
  buildPlacement,
  correctionImpact,
  createTournament,
  lastPlaceCorrectionImpact,
  lastPlacePlayerId,
  readyMatches,
  readyLastPlaceMatches,
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

async function recordLastPlaceWinner(state, match, side = 1, extra = {}) {
  const playerId = state.lastPlace.format === "reverse_double_elimination"
    ? lastPlacePlayerId(state, side === 1 ? match.opponent1.id : match.opponent2.id)
    : side === 1 ? match.opponent1.id : match.opponent2.id;
  return (await applyOperation(state, {
    type: "set_last_place_result",
    payload: {
      matchId: match.id,
      winnerId: playerId,
      opponent1Score: null,
      opponent2Score: null,
      ...extra,
    },
  })).state;
}

async function finishMainBracket(state) {
  let safety = 0;
  while (readyMatches(state).length > 0 && safety < 200) {
    state = await recordWinner(state, readyMatches(state)[0], 1);
    safety += 1;
  }
  expect(safety).toBeLessThan(200);
  return state;
}

async function completeTournament(count) {
  let state = await draftWithPlayers(count, Math.min(4, count));
  state = (await applyOperation(state, { type: "start", payload: {} })).state;
  let safety = 0;
  while (state.status === "active" && safety < 200) {
    const mainPlayable = readyMatches(state);
    const lastPlacePlayable = readyLastPlaceMatches(state);
    expect(mainPlayable.length + lastPlacePlayable.length).toBeGreaterThan(0);
    state = mainPlayable.length
      ? await recordWinner(state, mainPlayable[0], 1)
      : await recordLastPlaceWinner(state, lastPlacePlayable[0], 1);
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

describe("fair last-place playoff", () => {
  async function mainFinished(count) {
    let state = await draftWithPlayers(count, Math.min(4, count));
    state = (await applyOperation(state, { type: "reroll", payload: { randomSeed: "format-test" } })).state;
    state = (await applyOperation(state, { type: "start", payload: {} })).state;
    return finishMainBracket(state);
  }

  it("offers fair and standard modes and defaults new tournaments to fair", async () => {
    let state = await draftWithPlayers(4);
    expect(state.lastPlaceMode).toBe("fair");
    state = (await applyOperation(state, { type: "update_metadata", payload: { lastPlaceMode: "standard" } })).state;
    state = (await applyOperation(state, { type: "start", payload: {} })).state;
    state = await finishMainBracket(state);
    expect(state.lastPlace.status).toBe("disabled");
    expect(state.status).toBe("completed");
  });

  it("keeps pre-feature snapshots on compatible standard placement", async () => {
    let state = await draftWithPlayers(4);
    delete state.lastPlaceMode;
    delete state.lastPlace;
    state = (await applyOperation(state, { type: "start", payload: {} })).state;
    expect(state.lastPlaceMode).toBe("standard");
    expect(state.lastPlace.status).toBe("disabled");
  });

  it.each([
    [4, 1, "automatic"],
    [8, 2, "single_match"],
    [10, 3, "round_robin"],
    [16, 4, "reverse_double_elimination"],
  ])("selects the fair format for %i players", async (count, candidates, format) => {
    const state = await mainFinished(count);
    expect(state.lastPlace.candidatePlayerIds).toHaveLength(candidates);
    expect(state.lastPlace.format).toBe(format);
  });

  it("uses one normal result for two candidates", async () => {
    let state = await mainFinished(8);
    const match = readyLastPlaceMatches(state)[0];
    const expectedLast = match.opponent2.id;
    state = await recordLastPlaceWinner(state, match, 1);
    expect(state.lastPlace.lastPlaceIds).toEqual([expectedLast]);
    expect(state.status).toBe("completed");
  });

  it("allows a shared last place when the three-player round robin ties", async () => {
    let state = await mainFinished(10);
    const [first, second, third] = state.lastPlace.matches;
    state = await recordLastPlaceWinner(state, first, 1);
    state = await recordLastPlaceWinner(state, second, 2);
    state = await recordLastPlaceWinner(state, third, 1);
    expect(state.lastPlace.lastPlaceIds).toHaveLength(3);
    expect(state.lastPlace.status).toBe("completed");
  });

  it("plays mirrored double elimination through a decisive grand loser final", async () => {
    let state = await mainFinished(16);
    let safety = 0;
    while (readyLastPlaceMatches(state).length && safety < 30) {
      const match = readyLastPlaceMatches(state)[0];
      const round = state.lastPlace.bracket.round.find((item) => item.id === match.round_id);
      const group = state.lastPlace.bracket.group.find((item) => item.id === round.group_id);
      const side = group.number === 3 && round.number === 1 ? 2 : 1;
      state = await recordLastPlaceWinner(state, match, side);
      safety += 1;
    }
    expect(state.lastPlace.status).toBe("completed");
    const finalGroup = state.lastPlace.bracket.group.find((group) => group.number === 3);
    const resetRound = state.lastPlace.bracket.round.find((round) => round.group_id === finalGroup.id && round.number === 2);
    const reset = state.lastPlace.bracket.match.find((match) => match.round_id === resetRound.id);
    expect(reset.status).toBe(0);
    expect(state.lastPlace.lastPlaceIds).toHaveLength(1);
  });

  it("activates and completes the grand loser reset when the safety finalist loses first", async () => {
    let state = await mainFinished(16);
    let sawReset = false;
    let safety = 0;
    while (readyLastPlaceMatches(state).length && safety < 30) {
      const match = readyLastPlaceMatches(state)[0];
      const round = state.lastPlace.bracket.round.find((item) => item.id === match.round_id);
      const group = state.lastPlace.bracket.group.find((item) => item.id === round.group_id);
      if (group.number === 3 && round.number === 2) sawReset = true;
      state = await recordLastPlaceWinner(state, match, 1);
      safety += 1;
    }
    expect(sawReset).toBe(true);
    expect(state.lastPlace.status).toBe("completed");
    expect(state.status).toBe("completed");
    const actualWins = new Map(state.lastPlace.candidatePlayerIds.map((playerId) => [playerId, 0]));
    for (const match of state.lastPlace.bracket.match) {
      if (match.actualWinnerId) actualWins.set(match.actualWinnerId, actualWins.get(match.actualWinnerId) + 1);
    }
    for (const [playerId, wins] of actualWins) {
      expect(wins).toBe(state.lastPlace.lastPlaceIds.includes(playerId) ? 1 : 2);
    }
  });

  it("reports and clears downstream reverse-playoff results on correction", async () => {
    let state = await mainFinished(16);
    const first = readyLastPlaceMatches(state)[0];
    state = await recordLastPlaceWinner(state, first, 1);
    while ((await lastPlaceCorrectionImpact(state, first.id)).length === 0) {
      state = await recordLastPlaceWinner(state, readyLastPlaceMatches(state)[0], 1);
    }
    const impact = await lastPlaceCorrectionImpact(state, first.id);
    expect(impact.length).toBeGreaterThan(0);
    await expect(recordLastPlaceWinner(state, first, 2)).rejects.toMatchObject({ code: "rollback_confirmation_required" });
    state = await recordLastPlaceWinner(state, first, 2, { confirmRollback: true });
    expect(readyLastPlaceMatches(state).length).toBeGreaterThan(0);
  });

  it("invalidates a started loser playoff when a championship result is corrected", async () => {
    let state = await mainFinished(16);
    state = await recordLastPlaceWinner(state, readyLastPlaceMatches(state)[0], 1);
    const mainMatch = state.bracket.match.find((match) =>
      match.status >= 4 && match.opponent1?.id != null && match.opponent2?.id != null);
    const currentWinnerIsFirst = mainMatch.opponent1.result === "win";
    const correctedBracketId = currentWinnerIsFirst ? mainMatch.opponent2.id : mainMatch.opponent1.id;
    const correctedWinner = state.players.find((player) => player.bracketId === correctedBracketId);
    const impact = await correctionImpact(state, mainMatch.id);
    expect(impact.some((match) => match.bracket === "last_place")).toBe(true);
    state = (await applyOperation(state, {
      type: "set_match_result",
      payload: {
        matchId: mainMatch.id,
        winnerId: correctedWinner.id,
        opponent1Score: null,
        opponent2Score: null,
        confirmRollback: true,
      },
    })).state;
    expect(state.lastPlace.status).toBe("pending");
    expect(state.lastPlace.bracket).toBeNull();
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
