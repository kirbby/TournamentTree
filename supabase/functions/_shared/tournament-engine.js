import { BracketsManager } from "brackets-manager";
import { InMemoryDatabase } from "brackets-memory-db";

export const TOURNAMENT_SCHEMA_VERSION = 1;
export const MATCH_STATUS = Object.freeze({
  locked: 0,
  waiting: 1,
  ready: 2,
  running: 3,
  completed: 4,
  archived: 5,
});

export class TournamentError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, status?: number, details?: unknown }} [options]
   */
  constructor(message, { code = "validation_error", status = 422, details = null } = {}) {
    super(message);
    this.name = "TournamentError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const now = () => new Date().toISOString();
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const clone = (value) => structuredClone(value);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function assert(condition, message, options) {
  if (!condition) throw new TournamentError(message, options);
}

export function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function createTournament(input = {}) {
  const name = String(input.name ?? "").trim();
  assert(name.length >= 1 && name.length <= 100, "Tournament name must be between 1 and 100 characters.");
  const createdAt = now();
  const id = input.id ?? makeId();
  const slug = slugify(input.slug || name);
  assert(slug.length > 0, "Tournament slug is invalid.");

  return {
    schemaVersion: TOURNAMENT_SCHEMA_VERSION,
    id,
    name,
    slug,
    tournamentDate: input.tournamentDate || new Date().toISOString().slice(0, 10),
    status: "draft",
    previousStatus: null,
    players: [],
    randomSeed: makeId(),
    placementPreview: [],
    bracket: null,
    championId: null,
    standings: [],
    createdAt,
    updatedAt: createdAt,
    startedAt: null,
    completedAt: null,
    archivedAt: null,
  };
}

export function validateTournamentState(state) {
  assert(state && typeof state === "object", "Tournament state is required.");
  assert(state.schemaVersion === TOURNAMENT_SCHEMA_VERSION, "Unsupported tournament state version.", {
    code: "unsupported_schema_version",
  });
  assert(["draft", "active", "completed", "archived"].includes(state.status), "Invalid tournament status.");
  assert(uuidPattern.test(state.id), "Tournament ID must be a UUID.");
  assert(slugify(state.slug) === state.slug && state.slug.length <= 64, "Tournament slug is invalid.");
  assert(datePattern.test(state.tournamentDate) && !Number.isNaN(Date.parse(`${state.tournamentDate}T00:00:00Z`)), "Tournament date is invalid.");
  assert(Array.isArray(state.players) && state.players.length <= 32, "Tournament can contain at most 32 players.");
  validatePlayers(state.players, state.status !== "draft");
  if (state.status !== "draft") {
    assert(state.bracket, "A started tournament must have bracket data.");
    for (const entity of ["participant", "stage", "group", "round", "match", "match_game"]) {
      assert(Array.isArray(state.bracket[entity]), `Bracket ${entity} data is invalid.`);
    }
    const bracketIds = new Set();
    for (const player of state.players) {
      assert(Number.isInteger(player.bracketId), "Started players must have bracket IDs.");
      assert(!bracketIds.has(player.bracketId), "Bracket player IDs must be unique.");
      bracketIds.add(player.bracketId);
    }
    for (const match of state.bracket.match) {
      const score1 = match.opponent1?.score ?? null;
      const score2 = match.opponent2?.score ?? null;
      validateScores(score1, score2);
      assert(!(match.opponent1?.result === "win" && match.opponent2?.result === "win"), "A match cannot have two winners.");
    }
  }
  return true;
}

function validatePlayers(players, requireCount = false) {
  if (requireCount) assert(players.length >= 2, "A tournament requires at least 2 players.");
  assert(players.length <= 32, "A tournament can contain at most 32 players.");
  const names = new Set();
  const seeds = [];
  for (const player of players) {
    assert(uuidPattern.test(player.id), "Player ID must be a UUID.");
    const name = String(player.name ?? "").trim();
    assert(name.length >= 1 && name.length <= 80, "Player names must be between 1 and 80 characters.");
    const normalized = name.toLocaleLowerCase();
    assert(!names.has(normalized), `Duplicate player name: ${name}.`);
    names.add(normalized);
    if (player.seed !== null && player.seed !== undefined) {
      assert(Number.isInteger(player.seed) && player.seed > 0, "Seeds must be positive integers.");
      seeds.push(player.seed);
    }
  }
  seeds.sort((a, b) => a - b);
  assert(new Set(seeds).size === seeds.length, "Seed numbers must be unique.");
  for (let index = 0; index < seeds.length; index += 1) {
    assert(seeds[index] === index + 1, "Seed numbers must be consecutive starting at 1.");
  }
}

function requireDraft(state) {
  assert(state.status === "draft", "The roster is locked after the tournament starts.", {
    code: "roster_locked",
    status: 409,
  });
}

function nextPowerOfTwo(value) {
  // A two-player double-elimination tournament still needs a winners final,
  // losers path, and resettable grand final. The manager only creates that
  // topology from a four-slot stage, with two automatic byes.
  let result = 4;
  while (result < value) result *= 2;
  return result;
}

export function standardSeedOrder(size) {
  assert(Number.isInteger(size) && size >= 2 && size <= 32 && (size & (size - 1)) === 0, "Bracket size must be a power of two between 2 and 32.");
  let order = [1, 2];
  for (let current = 4; current <= size; current *= 2) {
    order = order.flatMap((seed) => [seed, current + 1 - seed]);
  }
  return order;
}

function hashSeed(seed) {
  let hash = 2166136261;
  for (const character of String(seed)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let value = hashSeed(seed) || 1;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function shuffle(items, seed) {
  const values = [...items];
  const random = seededRandom(seed);
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [values[index], values[target]] = [values[target], values[index]];
  }
  return values;
}

export function buildPlacement(players, randomSeed) {
  validatePlayers(players, true);
  const size = nextPowerOfTwo(players.length);
  const seeded = players.filter((player) => player.seed != null).sort((a, b) => a.seed - b.seed);
  const unseeded = shuffle(players.filter((player) => player.seed == null), randomSeed);
  const byeCount = size - players.length;

  // brackets-manager's lower bracket routing expects byes to be balanced in
  // this shape. Feeding it arbitrary null slots can leave an impossible TBD
  // in the lower bracket. We build that safe topology first, then assign the
  // actual players while preserving seed separation and bye priority.
  const pairedPlayerCount = players.length - byeCount;
  const balanced = [
    ...Array(pairedPlayerCount).fill(true),
    ...Array.from({ length: byeCount }, () => [true, false]).flat(),
  ];
  while (balanced.length < size) balanced.push(false);
  const safeSlots = standardSeedOrder(size).map((seed) => balanced[seed - 1]);
  const byeSlots = [];
  const contestedSlots = [];
  for (let index = 0; index < safeSlots.length; index += 2) {
    if (safeSlots[index] && !safeSlots[index + 1]) byeSlots.push(index);
    else if (!safeSlots[index] && safeSlots[index + 1]) byeSlots.push(index + 1);
    else {
      if (safeSlots[index]) contestedSlots.push(index);
      if (safeSlots[index + 1]) contestedSlots.push(index + 1);
    }
  }

  const byePlayers = [
    ...seeded.slice(0, Math.min(seeded.length, byeCount)),
    ...unseeded.slice(0, Math.max(0, byeCount - seeded.length)),
  ];
  const byeIds = new Set(byePlayers.map((player) => player.id));
  const contestedPlayers = [...seeded, ...unseeded].filter((player) => !byeIds.has(player.id));
  const slots = Array(size).fill(null);
  const preferredSlot = (player) => player.seed == null
    ? Number.POSITIVE_INFINITY
    : standardSeedOrder(size).indexOf(player.seed);
  const assignClosest = (player, available) => {
    const preferred = preferredSlot(player);
    const targetIndex = Number.isFinite(preferred)
      ? available.reduce((best, slot, index) => {
          const distance = Math.abs(slot - preferred);
          return distance < best.distance ? { index, distance } : best;
        }, { index: 0, distance: Number.POSITIVE_INFINITY }).index
      : 0;
    const [slot] = available.splice(targetIndex, 1);
    slots[slot] = player;
  };
  for (const player of byePlayers) assignClosest(player, byeSlots);
  for (const player of contestedPlayers) assignClosest(player, contestedSlots);

  return {
    size,
    slots: slots.map((player) => player?.id ?? null),
    names: slots.map((player) => player?.name ?? null),
  };
}

function managerFromBracket(bracket) {
  const storage = new InMemoryDatabase();
  if (bracket) storage.setData(clone(bracket));
  return { manager: new BracketsManager(storage), storage };
}

async function buildBracket(state) {
  const placement = buildPlacement(state.players, state.randomSeed);
  const loserOrdering = {
    4: ["natural"],
    8: ["natural", "reverse"],
    16: ["natural", "reverse_half_shift", "reverse"],
    32: ["natural", "reverse", "half_shift", "natural"],
  }[placement.size];
  const { manager } = managerFromBracket(null);
  await manager.create.stage({
    tournamentId: 0,
    name: state.name,
    type: "double_elimination",
    seeding: placement.names,
    settings: {
      size: placement.size,
      balanceByes: false,
      grandFinal: "double",
      manualOrdering: [Array.from({ length: placement.size }, (_, index) => index + 1)],
      // With manual first-round ordering, brackets-manager does not reserve
      // index 0 for that ordering. Its result propagator still expects that
      // index, so include the placeholder explicitly before LB ordering.
      seedOrdering: ["natural", ...loserOrdering],
    },
  });
  const bracket = await manager.export();
  const participantByName = new Map(bracket.participant.map((participant) => [participant.name, participant.id]));
  const players = state.players.map((player) => ({
    ...player,
    bracketId: participantByName.get(player.name),
  }));
  return { bracket, players, placement };
}

function winnerBracketId(match) {
  if (match.opponent1?.result === "win") return match.opponent1.id;
  if (match.opponent2?.result === "win") return match.opponent2.id;
  return null;
}

function appPlayerForBracketId(state, bracketId) {
  return state.players.find((player) => player.bracketId === bracketId) ?? null;
}

function isByeMatch(match) {
  return match.opponent1 == null || match.opponent2 == null;
}

async function descendantMatches(manager, matchId) {
  const seen = new Set();
  const ordered = [];
  async function visit(id) {
    const next = await manager.find.nextMatches(id);
    for (const match of next.filter(Boolean)) {
      if (seen.has(match.id)) continue;
      seen.add(match.id);
      await visit(match.id);
      ordered.push(match);
    }
  }
  await visit(matchId);
  return ordered;
}

export async function correctionImpact(state, matchId) {
  assert(state.bracket, "Tournament has not started.");
  const { manager, storage } = managerFromBracket(state.bracket);
  const match = await storage.select("match", Number(matchId));
  assert(match, "Match not found.", { code: "not_found", status: 404 });
  if (match.status < MATCH_STATUS.completed) return [];
  const descendants = await descendantMatches(manager, match.id);
  return descendants
    .filter((candidate) => candidate.status >= MATCH_STATUS.running && !isByeMatch(candidate))
    .map((candidate) => ({
      id: candidate.id,
      status: candidate.status,
      winnerId: appPlayerForBracketId(state, winnerBracketId(candidate))?.id ?? null,
    }));
}

async function resetMatchAndScores(manager, storage, matchId) {
  const match = await storage.select("match", matchId);
  if (!match || isByeMatch(match)) return;
  if (match.status >= MATCH_STATUS.running) await manager.reset.matchResults(match.id);
  const reset = await storage.select("match", match.id);
  if (reset?.opponent1) delete reset.opponent1.score;
  if (reset?.opponent2) delete reset.opponent2.score;
  if (reset) {
    delete reset.completedAt;
    delete reset.completedBy;
    await storage.update("match", reset.id, reset);
  }
}

function validateScores(score1, score2) {
  const bothMissing = score1 == null && score2 == null;
  const bothPresent = score1 != null && score2 != null;
  assert(bothMissing || bothPresent, "Scores must either both be present or both be omitted.");
  if (bothPresent) {
    assert(Number.isInteger(score1) && score1 >= 0, "Opponent 1 score must be a non-negative integer.");
    assert(Number.isInteger(score2) && score2 >= 0, "Opponent 2 score must be a non-negative integer.");
  }
}

async function refreshCompletion(state, manager, storage) {
  const stage = state.bracket.stage[0];
  const finalGroup = state.bracket.group.find((group) => group.number === 3);
  const finalRounds = state.bracket.round
    .filter((round) => round.group_id === finalGroup?.id)
    .sort((left, right) => left.number - right.number);
  const finalMatches = finalRounds
    .map((round) => state.bracket.match.find((match) => match.round_id === round.id))
    .filter(Boolean);
  const firstFinal = finalMatches[0];
  const resetFinal = finalMatches[1];
  const firstFinalWinner = winnerBracketId(firstFinal ?? {});
  const winnersBracketChampion = firstFinal?.opponent1?.id;
  const firstFinalIsDecisive = firstFinal?.status >= MATCH_STATUS.completed
    && firstFinalWinner === winnersBracketChampion;
  const resetFinalIsDecisive = resetFinal?.status >= MATCH_STATUS.completed;

  if (!firstFinalIsDecisive && !resetFinalIsDecisive) {
    state.status = "active";
    state.championId = null;
    state.standings = [];
    state.completedAt = null;
    return;
  }
  const standings = await manager.get.finalStandings(stage.id);
  state.standings = standings.map((item) => ({
    rank: item.rank,
    playerId: appPlayerForBracketId(state, item.id)?.id ?? null,
    name: item.name,
  }));
  state.championId = state.standings.find((item) => item.rank === 1)?.playerId ?? null;
  state.status = "completed";
  state.completedAt ||= now();
  if (firstFinalIsDecisive && resetFinal) {
    const storedReset = await storage.select("match", resetFinal.id);
    storedReset.status = MATCH_STATUS.locked;
    delete storedReset.completedAt;
    delete storedReset.completedBy;
    await storage.update("match", storedReset.id, storedReset);
    state.bracket = await manager.export();
  }
}

async function setMatchResult(state, payload, context) {
  assert(state.status === "active" || state.status === "completed", "Results can only be entered for a started tournament.", {
    code: "invalid_status",
    status: 409,
  });
  const { manager, storage } = managerFromBracket(state.bracket);
  const match = await storage.select("match", Number(payload.matchId));
  assert(match, "Match not found.", { code: "not_found", status: 404 });
  assert(!isByeMatch(match), "Bye matches cannot be edited.");
  assert(match.opponent1?.id != null && match.opponent2?.id != null, "Both opponents must be known before entering a result.");
  const winner = state.players.find((player) => player.id === payload.winnerId);
  assert(winner, "Winner not found in this tournament.");
  assert([match.opponent1.id, match.opponent2.id].includes(winner.bracketId), "Winner must be one of the match opponents.");
  validateScores(payload.opponent1Score, payload.opponent2Score);
  const originalResult = {
    opponent1Score: match.opponent1.score ?? null,
    opponent2Score: match.opponent2.score ?? null,
    winnerId: appPlayerForBracketId(state, winnerBracketId(match))?.id ?? null,
    completedAt: match.completedAt ?? null,
    completedBy: match.completedBy ?? null,
  };

  if (payload.opponent1Score != null && payload.opponent1Score !== payload.opponent2Score) {
    const inferred = payload.opponent1Score > payload.opponent2Score ? match.opponent1.id : match.opponent2.id;
    assert(inferred === winner.bracketId || payload.overrideScoreWinner === true, "Selected winner contradicts the score; explicit override is required.", {
      code: "score_winner_conflict",
    });
  }

  const changingCompletedMatch = match.status >= MATCH_STATUS.completed;
  const impact = changingCompletedMatch ? await correctionImpact(state, match.id) : [];
  if (changingCompletedMatch && impact.length > 0) {
    assert(payload.confirmRollback === true, "Correcting this match will clear downstream results.", {
      code: "rollback_confirmation_required",
      status: 409,
      details: { affectedMatches: impact },
    });
  }

  if (changingCompletedMatch) {
    const descendants = await descendantMatches(manager, match.id);
    for (const descendant of descendants) await resetMatchAndScores(manager, storage, descendant.id);
    await resetMatchAndScores(manager, storage, match.id);
  }

  const side1Wins = winner.bracketId === match.opponent1.id;
  await manager.update.match({
    id: match.id,
    opponent1: {
      score: payload.opponent1Score ?? undefined,
      result: side1Wins ? "win" : "loss",
    },
    opponent2: {
      score: payload.opponent2Score ?? undefined,
      result: side1Wins ? "loss" : "win",
    },
    completedAt: now(),
    completedBy: context.actorId ?? context.actorKind ?? "unknown",
  });
  state.bracket = await manager.export();
  await refreshCompletion(state, manager, storage);
  const corrected = state.bracket.match.find((candidate) => candidate.id === match.id);
  return {
    impact,
    originalResult,
    correctedResult: {
      opponent1Score: corrected.opponent1?.score ?? null,
      opponent2Score: corrected.opponent2?.score ?? null,
      winnerId: appPlayerForBracketId(state, winnerBracketId(corrected))?.id ?? null,
      completedAt: corrected.completedAt ?? null,
      completedBy: corrected.completedBy ?? null,
    },
  };
}

async function clearMatchResult(state, payload) {
  assert(state.status === "active" || state.status === "completed", "Tournament has not started.");
  const impact = await correctionImpact(state, payload.matchId);
  assert(impact.length === 0 || payload.confirmRollback === true, "Clearing this result will clear downstream results.", {
    code: "rollback_confirmation_required",
    status: 409,
    details: { affectedMatches: impact },
  });
  const { manager, storage } = managerFromBracket(state.bracket);
  const match = await storage.select("match", Number(payload.matchId));
  assert(match, "Match not found.", { code: "not_found", status: 404 });
  const originalResult = {
    opponent1Score: match.opponent1?.score ?? null,
    opponent2Score: match.opponent2?.score ?? null,
    winnerId: appPlayerForBracketId(state, winnerBracketId(match))?.id ?? null,
    completedAt: match.completedAt ?? null,
    completedBy: match.completedBy ?? null,
  };
  const descendants = await descendantMatches(manager, match.id);
  for (const descendant of descendants) await resetMatchAndScores(manager, storage, descendant.id);
  await resetMatchAndScores(manager, storage, match.id);
  state.bracket = await manager.export();
  state.status = "active";
  state.championId = null;
  state.standings = [];
  state.completedAt = null;
  return { impact, originalResult, correctedResult: null };
}

function normalizePlayerSeeds(players) {
  const seeded = players.filter((player) => player.seed != null).sort((a, b) => a.seed - b.seed);
  seeded.forEach((player, index) => { player.seed = index + 1; });
}

export async function applyOperation(sourceState, operation, context = {}) {
  validateTournamentState(sourceState);
  assert(operation && typeof operation.type === "string", "Operation type is required.");
  const state = clone(sourceState);
  const payload = operation.payload ?? {};
  let result = {};

  switch (operation.type) {
    case "update_metadata": {
      if (payload.name !== undefined) {
        const name = String(payload.name).trim();
        assert(name.length >= 1 && name.length <= 100, "Tournament name must be between 1 and 100 characters.");
        state.name = name;
      }
      if (payload.slug !== undefined) {
        const slug = slugify(payload.slug);
        assert(slug, "Tournament slug is invalid.");
        state.slug = slug;
      }
      if (payload.tournamentDate !== undefined) state.tournamentDate = payload.tournamentDate;
      break;
    }
    case "add_player": {
      requireDraft(state);
      assert(state.players.length < 32, "A tournament can contain at most 32 players.");
      state.players.push({
        id: payload.id ?? makeId(),
        name: String(payload.name ?? "").trim(),
        seed: payload.seed ?? null,
      });
      validatePlayers(state.players);
      state.placementPreview = buildPlacementPreviewIfPossible(state);
      break;
    }
    case "update_player": {
      requireDraft(state);
      const player = state.players.find((candidate) => candidate.id === payload.playerId);
      assert(player, "Player not found.", { code: "not_found", status: 404 });
      if (payload.name !== undefined) player.name = String(payload.name).trim();
      if (payload.seed !== undefined) player.seed = payload.seed;
      validatePlayers(state.players);
      state.placementPreview = buildPlacementPreviewIfPossible(state);
      break;
    }
    case "set_players": {
      requireDraft(state);
      assert(Array.isArray(payload.players) && payload.players.length === state.players.length, "Complete player data is required.");
      const updates = new Map(payload.players.map((player) => [player.playerId, player]));
      assert(updates.size === state.players.length && state.players.every((player) => updates.has(player.id)), "Player data contains invalid IDs.");
      state.players = state.players.map((player) => {
        const update = updates.get(player.id);
        return {
          ...player,
          name: String(update.name ?? "").trim(),
          seed: update.seed ?? null,
        };
      });
      validatePlayers(state.players);
      state.placementPreview = buildPlacementPreviewIfPossible(state);
      break;
    }
    case "remove_player": {
      requireDraft(state);
      const index = state.players.findIndex((candidate) => candidate.id === payload.playerId);
      assert(index >= 0, "Player not found.", { code: "not_found", status: 404 });
      state.players.splice(index, 1);
      normalizePlayerSeeds(state.players);
      validatePlayers(state.players);
      state.placementPreview = buildPlacementPreviewIfPossible(state);
      break;
    }
    case "reorder_players": {
      requireDraft(state);
      assert(Array.isArray(payload.playerIds) && payload.playerIds.length === state.players.length, "Complete player order is required.");
      const byId = new Map(state.players.map((player) => [player.id, player]));
      state.players = payload.playerIds.map((id) => byId.get(id));
      assert(state.players.every(Boolean) && new Set(payload.playerIds).size === state.players.length, "Player order contains invalid IDs.");
      state.placementPreview = buildPlacementPreviewIfPossible(state);
      break;
    }
    case "reroll": {
      requireDraft(state);
      state.randomSeed = payload.randomSeed ?? makeId();
      state.placementPreview = buildPlacementPreviewIfPossible(state);
      break;
    }
    case "start": {
      requireDraft(state);
      validatePlayers(state.players, true);
      const built = await buildBracket(state);
      state.bracket = built.bracket;
      state.players = built.players;
      state.placementPreview = built.placement.slots;
      state.status = "active";
      state.startedAt = now();
      state.completedAt = null;
      state.championId = null;
      state.standings = [];
      break;
    }
    case "set_match_result":
      result = await setMatchResult(state, payload, context);
      break;
    case "clear_match_result":
      result = await clearMatchResult(state, payload);
      break;
    case "reset_to_draft": {
      assert(payload.confirmReset === true, "Reset confirmation is required.", { code: "confirmation_required", status: 409 });
      assert(state.status === "active" || state.status === "completed", "Only active or completed tournaments can return to draft.");
      state.status = "draft";
      state.players = state.players.map(({ bracketId, ...player }) => player);
      state.bracket = null;
      state.championId = null;
      state.standings = [];
      state.startedAt = null;
      state.completedAt = null;
      state.placementPreview = buildPlacementPreviewIfPossible(state);
      break;
    }
    case "archive": {
      assert(state.status !== "draft", "Draft tournaments cannot be archived.");
      state.previousStatus = state.status;
      state.status = "archived";
      state.archivedAt = now();
      break;
    }
    case "restore": {
      assert(state.status === "archived", "Only archived tournaments can be restored.");
      state.status = state.previousStatus === "active" ? "active" : "completed";
      state.previousStatus = null;
      state.archivedAt = null;
      break;
    }
    default:
      throw new TournamentError(`Unsupported operation: ${operation.type}.`, { code: "unsupported_operation", status: 400 });
  }

  state.updatedAt = now();
  validateTournamentState(state);
  return { state, result };
}

function buildPlacementPreviewIfPossible(state) {
  if (state.players.length < 2) return [];
  try {
    return buildPlacement(state.players, state.randomSeed).slots;
  } catch {
    return [];
  }
}

export function publicTournament(state) {
  const copy = clone(state);
  return copy;
}

export function readyMatches(state) {
  if (!state.bracket) return [];
  return state.bracket.match.filter((match) => match.status === MATCH_STATUS.ready || match.status === MATCH_STATUS.running);
}

export function matchWinnerId(state, match) {
  return appPlayerForBracketId(state, winnerBracketId(match))?.id ?? null;
}

export function playerNameForBracketId(state, bracketId) {
  return appPlayerForBracketId(state, bracketId)?.name ?? "TBD";
}
