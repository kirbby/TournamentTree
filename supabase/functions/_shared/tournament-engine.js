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

  const lastPlaceMode = input.lastPlaceMode ?? "fair";
  assert(["fair", "standard"].includes(lastPlaceMode), "Last-place mode must be fair or standard.");
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
    lastPlaceMode,
    lastPlace: emptyLastPlace(lastPlaceMode),
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
  if (state.lastPlaceMode !== undefined) {
    assert(["fair", "standard"].includes(state.lastPlaceMode), "Last-place mode must be fair or standard.");
  }
  if (state.lastPlace !== undefined) validateLastPlaceState(state.lastPlace);
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

function emptyLastPlace(mode = "standard") {
  return {
    status: mode === "fair" ? "pending" : "disabled",
    format: null,
    candidatePlayerIds: [],
    unresolvedPlayerIds: [],
    matches: [],
    bracket: null,
    participantPlayerIds: {},
    lastPlaceIds: [],
    completedAt: null,
  };
}

function ensureLastPlaceState(state) {
  // Snapshots created before fair last-place support remain standard unless
  // the organizer explicitly enables the new mode while they are drafts.
  state.lastPlaceMode ??= "standard";
  state.lastPlace ??= emptyLastPlace(state.lastPlaceMode);
}

function validateLastPlaceState(lastPlace) {
  assert(lastPlace && typeof lastPlace === "object", "Last-place state is invalid.");
  assert(["disabled", "pending", "active", "completed"].includes(lastPlace.status), "Last-place status is invalid.");
  assert([null, "automatic", "single_match", "round_robin", "reverse_double_elimination"].includes(lastPlace.format), "Last-place format is invalid.");
  for (const field of ["candidatePlayerIds", "unresolvedPlayerIds", "matches", "lastPlaceIds"]) {
    assert(Array.isArray(lastPlace[field]), `Last-place ${field} is invalid.`);
  }
  for (const match of lastPlace.matches) validateScores(match.opponent1?.score ?? null, match.opponent2?.score ?? null);
  if (lastPlace.bracket) {
    for (const entity of ["participant", "stage", "group", "round", "match", "match_game"]) {
      assert(Array.isArray(lastPlace.bracket[entity]), `Last-place bracket ${entity} data is invalid.`);
    }
    for (const match of lastPlace.bracket.match) validateScores(match.opponent1?.score ?? null, match.opponent2?.score ?? null);
  }
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

function lastPlacePlayerForBracketId(state, bracketId) {
  const playerId = state.lastPlace?.participantPlayerIds?.[String(bracketId)];
  return state.players.find((player) => player.id === playerId) ?? null;
}

async function buildReverseDoubleElimination(state, candidatePlayerIds) {
  const candidateSet = new Set(candidatePlayerIds);
  const candidates = state.players
    .filter((player) => candidateSet.has(player.id))
    .map((player) => ({ id: player.id, name: player.name, seed: null }));
  const built = await buildBracket({
    ...state,
    name: `${state.name} — Last Place`,
    players: candidates,
    randomSeed: `${state.randomSeed}:last-place`,
  });
  for (const group of built.bracket.group) {
    if (group.number === 1) group.name = "Danger Bracket";
    else if (group.number === 2) group.name = "Safety Bracket";
    else if (group.number === 3) group.name = "Grand Loser Final";
  }
  return {
    bracket: built.bracket,
    participantPlayerIds: Object.fromEntries(built.players.map((player) => [String(player.bracketId), player.id])),
  };
}

function completedRealMatchStats(state) {
  const stats = new Map(state.players.map((player) => [player.id, { wins: 0, losses: 0 }]));
  if (!state.bracket) return stats;
  for (const match of state.bracket.match) {
    if (match.status < MATCH_STATUS.completed || match.opponent1?.id == null || match.opponent2?.id == null) continue;
    const first = appPlayerForBracketId(state, match.opponent1.id);
    const second = appPlayerForBracketId(state, match.opponent2.id);
    if (!first || !second) continue;
    if (match.opponent1.result === "win") {
      stats.get(first.id).wins += 1;
      stats.get(second.id).losses += 1;
    } else if (match.opponent2.result === "win") {
      stats.get(second.id).wins += 1;
      stats.get(first.id).losses += 1;
    }
  }
  return stats;
}

export function lastPlaceEligibility(state) {
  const stats = completedRealMatchStats(state);
  const candidatePlayerIds = [];
  const unresolvedPlayerIds = [];
  for (const player of state.players) {
    const record = stats.get(player.id);
    if (record.wins > 0) continue;
    if (record.losses >= 2) candidatePlayerIds.push(player.id);
    else unresolvedPlayerIds.push(player.id);
  }
  return {
    candidatePlayerIds,
    unresolvedPlayerIds,
    stats: Object.fromEntries([...stats].map(([playerId, record]) => [playerId, record])),
  };
}

function simpleLastPlaceMatch(id, number, opponent1Id, opponent2Id) {
  return {
    id,
    number,
    status: MATCH_STATUS.ready,
    opponent1: { id: opponent1Id },
    opponent2: { id: opponent2Id },
    completedAt: null,
    completedBy: null,
  };
}

async function initializeLastPlaceCompetition(state, candidatePlayerIds) {
  const lastPlace = emptyLastPlace("fair");
  lastPlace.candidatePlayerIds = [...candidatePlayerIds];
  if (candidatePlayerIds.length === 1) {
    lastPlace.status = "completed";
    lastPlace.format = "automatic";
    lastPlace.lastPlaceIds = [...candidatePlayerIds];
    lastPlace.completedAt = now();
  } else if (candidatePlayerIds.length === 2) {
    lastPlace.status = "active";
    lastPlace.format = "single_match";
    lastPlace.matches = [simpleLastPlaceMatch("lp-1", 1, candidatePlayerIds[0], candidatePlayerIds[1])];
  } else if (candidatePlayerIds.length === 3) {
    lastPlace.status = "active";
    lastPlace.format = "round_robin";
    lastPlace.matches = [
      simpleLastPlaceMatch("lp-1", 1, candidatePlayerIds[0], candidatePlayerIds[1]),
      simpleLastPlaceMatch("lp-2", 2, candidatePlayerIds[0], candidatePlayerIds[2]),
      simpleLastPlaceMatch("lp-3", 3, candidatePlayerIds[1], candidatePlayerIds[2]),
    ];
  } else if (candidatePlayerIds.length >= 4) {
    const built = await buildReverseDoubleElimination(state, candidatePlayerIds);
    lastPlace.status = "active";
    lastPlace.format = "reverse_double_elimination";
    lastPlace.bracket = built.bracket;
    lastPlace.participantPlayerIds = built.participantPlayerIds;
  }
  state.lastPlace = lastPlace;
}

function lowestMainStandingPlayers(state) {
  if (!state.standings?.length) return [];
  const lowestRank = Math.max(...state.standings.map((standing) => standing.rank));
  return state.standings.filter((standing) => standing.rank === lowestRank).map((standing) => standing.playerId).filter(Boolean);
}

async function refreshLastPlaceEligibility(state, { resetCompetition = false } = {}) {
  ensureLastPlaceState(state);
  if (state.lastPlaceMode === "standard") {
    state.lastPlace = emptyLastPlace("standard");
    return;
  }
  if (resetCompetition) state.lastPlace = emptyLastPlace("fair");
  if (!["pending"].includes(state.lastPlace.status)) return;

  const eligibility = lastPlaceEligibility(state);
  state.lastPlace.candidatePlayerIds = eligibility.candidatePlayerIds;
  state.lastPlace.unresolvedPlayerIds = eligibility.unresolvedPlayerIds;
  if (eligibility.unresolvedPlayerIds.length > 0) return;

  let candidates = eligibility.candidatePlayerIds;
  // A reset grand final can give every player a real win. In that rare case,
  // the bottom main-bracket standing remains the fair fallback.
  if (candidates.length === 0) {
    candidates = lowestMainStandingPlayers(state);
    if (candidates.length === 0) return;
  }
  await initializeLastPlaceCompetition(state, candidates);
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
  const mainImpact = descendants
    .filter((candidate) => candidate.status >= MATCH_STATUS.running && !isByeMatch(candidate))
    .map((candidate) => ({
      id: candidate.id,
      status: candidate.status,
      winnerId: appPlayerForBracketId(state, winnerBracketId(candidate))?.id ?? null,
    }));
  const lastPlaceImpact = completedLastPlaceMatches(state).map((candidate) => ({
    id: candidate.id,
    bracket: "last_place",
    status: candidate.status,
    winnerId: candidate.actualWinnerId
      ?? (candidate.opponent1?.result === "win" ? candidate.opponent1.id : candidate.opponent2?.result === "win" ? candidate.opponent2.id : null),
  }));
  return [...mainImpact, ...lastPlaceImpact];
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
    delete reset.actualWinnerId;
    delete reset.actualLoserId;
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

function refreshTournamentCompletion(state) {
  const championshipComplete = Boolean(state.championId);
  const lastPlaceComplete = state.lastPlaceMode !== "fair" || state.lastPlace?.status === "completed";
  if (championshipComplete && lastPlaceComplete) {
    state.status = "completed";
    state.completedAt ||= now();
  } else {
    state.status = "active";
    state.completedAt = null;
  }
}

async function refreshChampionshipCompletion(state, manager, storage) {
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
    state.championId = null;
    state.standings = [];
    refreshTournamentCompletion(state);
    return;
  }
  const standings = await manager.get.finalStandings(stage.id);
  state.standings = standings.map((item) => ({
    rank: item.rank,
    playerId: appPlayerForBracketId(state, item.id)?.id ?? null,
    name: item.name,
  }));
  state.championId = state.standings.find((item) => item.rank === 1)?.playerId ?? null;
  if (firstFinalIsDecisive && resetFinal) {
    const storedReset = await storage.select("match", resetFinal.id);
    storedReset.status = MATCH_STATUS.locked;
    delete storedReset.completedAt;
    delete storedReset.completedBy;
    await storage.update("match", storedReset.id, storedReset);
    state.bracket = await manager.export();
  }
  refreshTournamentCompletion(state);
}

function completedLastPlaceMatches(state) {
  if (state.lastPlace?.format === "reverse_double_elimination") {
    return (state.lastPlace.bracket?.match ?? []).filter((match) =>
      match.status >= MATCH_STATUS.completed && match.opponent1?.id != null && match.opponent2?.id != null);
  }
  return (state.lastPlace?.matches ?? []).filter((match) => match.status >= MATCH_STATUS.completed);
}

export async function lastPlaceCorrectionImpact(state, matchId) {
  ensureLastPlaceState(state);
  if (state.lastPlace.format !== "reverse_double_elimination") return [];
  const { manager, storage } = managerFromBracket(state.lastPlace.bracket);
  const match = await storage.select("match", Number(matchId));
  assert(match, "Last-place match not found.", { code: "not_found", status: 404 });
  if (match.status < MATCH_STATUS.completed) return [];
  const descendants = await descendantMatches(manager, match.id);
  return descendants
    .filter((candidate) => candidate.status >= MATCH_STATUS.running && !isByeMatch(candidate))
    .map((candidate) => ({
      id: candidate.id,
      bracket: "last_place",
      status: candidate.status,
      winnerId: candidate.actualWinnerId ?? null,
    }));
}

function validateWinnerAndScores(players, opponent1Id, opponent2Id, payload) {
  const winner = players.find((player) => player.id === payload.winnerId);
  assert(winner, "Winner not found in this tournament.");
  assert([opponent1Id, opponent2Id].includes(winner.id), "Winner must be one of the match opponents.");
  validateScores(payload.opponent1Score, payload.opponent2Score);
  if (payload.opponent1Score != null && payload.opponent1Score !== payload.opponent2Score) {
    const inferred = payload.opponent1Score > payload.opponent2Score ? opponent1Id : opponent2Id;
    assert(inferred === winner.id || payload.overrideScoreWinner === true, "Selected winner contradicts the score; explicit override is required.", {
      code: "score_winner_conflict",
    });
  }
  return winner;
}

function refreshSimpleLastPlaceCompletion(state) {
  const lastPlace = state.lastPlace;
  if (!lastPlace.matches.every((match) => match.status >= MATCH_STATUS.completed)) {
    lastPlace.status = "active";
    lastPlace.lastPlaceIds = [];
    lastPlace.completedAt = null;
    refreshTournamentCompletion(state);
    return;
  }
  if (lastPlace.format === "single_match") {
    const match = lastPlace.matches[0];
    lastPlace.lastPlaceIds = [match.opponent1.result === "loss" ? match.opponent1.id : match.opponent2.id];
  } else {
    const wins = new Map(lastPlace.candidatePlayerIds.map((playerId) => [playerId, 0]));
    for (const match of lastPlace.matches) {
      const winnerId = match.opponent1.result === "win" ? match.opponent1.id : match.opponent2.id;
      wins.set(winnerId, wins.get(winnerId) + 1);
    }
    const fewestWins = Math.min(...wins.values());
    lastPlace.lastPlaceIds = [...wins].filter(([, count]) => count === fewestWins).map(([playerId]) => playerId);
  }
  lastPlace.status = "completed";
  lastPlace.completedAt ||= now();
  refreshTournamentCompletion(state);
}

async function refreshReverseLastPlaceCompletion(state, manager, storage) {
  const bracket = await manager.export();
  const finalGroup = bracket.group.find((group) => group.number === 3);
  const finalRounds = bracket.round
    .filter((round) => round.group_id === finalGroup?.id)
    .sort((left, right) => left.number - right.number);
  const finalMatches = finalRounds
    .map((round) => bracket.match.find((match) => match.round_id === round.id))
    .filter(Boolean);
  const firstFinal = finalMatches[0];
  const resetFinal = finalMatches[1];
  const firstFinalLoser = winnerBracketId(firstFinal ?? {});
  const dangerBracketFinalist = firstFinal?.opponent1?.id;
  const firstFinalIsDecisive = firstFinal?.status >= MATCH_STATUS.completed
    && firstFinalLoser === dangerBracketFinalist;
  const resetFinalIsDecisive = resetFinal?.status >= MATCH_STATUS.completed;

  if (!firstFinalIsDecisive && !resetFinalIsDecisive) {
    state.lastPlace.status = "active";
    state.lastPlace.lastPlaceIds = [];
    state.lastPlace.completedAt = null;
    state.lastPlace.bracket = bracket;
    refreshTournamentCompletion(state);
    return;
  }

  const decisiveMatch = resetFinalIsDecisive ? resetFinal : firstFinal;
  const lastPlayer = lastPlacePlayerForBracketId(state, winnerBracketId(decisiveMatch));
  state.lastPlace.status = "completed";
  state.lastPlace.lastPlaceIds = lastPlayer ? [lastPlayer.id] : [];
  state.lastPlace.completedAt ||= now();
  if (firstFinalIsDecisive && resetFinal) {
    const storedReset = await storage.select("match", resetFinal.id);
    storedReset.status = MATCH_STATUS.locked;
    delete storedReset.completedAt;
    delete storedReset.completedBy;
    delete storedReset.actualWinnerId;
    delete storedReset.actualLoserId;
    await storage.update("match", storedReset.id, storedReset);
  }
  state.lastPlace.bracket = await manager.export();
  refreshTournamentCompletion(state);
}

async function setSimpleLastPlaceResult(state, payload, context) {
  const match = state.lastPlace.matches.find((candidate) => String(candidate.id) === String(payload.matchId));
  assert(match, "Last-place match not found.", { code: "not_found", status: 404 });
  const winner = validateWinnerAndScores(state.players, match.opponent1.id, match.opponent2.id, payload);
  const originalResult = {
    opponent1Score: match.opponent1.score ?? null,
    opponent2Score: match.opponent2.score ?? null,
    winnerId: match.opponent1.result === "win" ? match.opponent1.id : match.opponent2.result === "win" ? match.opponent2.id : null,
    completedAt: match.completedAt ?? null,
    completedBy: match.completedBy ?? null,
  };
  const side1Wins = winner.id === match.opponent1.id;
  match.opponent1 = { ...match.opponent1, score: payload.opponent1Score ?? undefined, result: side1Wins ? "win" : "loss" };
  match.opponent2 = { ...match.opponent2, score: payload.opponent2Score ?? undefined, result: side1Wins ? "loss" : "win" };
  match.status = MATCH_STATUS.completed;
  match.completedAt = now();
  match.completedBy = context.actorId ?? context.actorKind ?? "unknown";
  refreshSimpleLastPlaceCompletion(state);
  return {
    impact: [],
    originalResult,
    correctedResult: {
      opponent1Score: match.opponent1.score ?? null,
      opponent2Score: match.opponent2.score ?? null,
      winnerId: winner.id,
      completedAt: match.completedAt,
      completedBy: match.completedBy,
    },
  };
}

async function setReverseLastPlaceResult(state, payload, context) {
  const { manager, storage } = managerFromBracket(state.lastPlace.bracket);
  const match = await storage.select("match", Number(payload.matchId));
  assert(match, "Last-place match not found.", { code: "not_found", status: 404 });
  assert(!isByeMatch(match), "Bye matches cannot be edited.");
  assert(match.opponent1?.id != null && match.opponent2?.id != null, "Both opponents must be known before entering a result.");
  const first = lastPlacePlayerForBracketId(state, match.opponent1.id);
  const second = lastPlacePlayerForBracketId(state, match.opponent2.id);
  assert(first && second, "Last-place match opponents are invalid.");
  const winner = validateWinnerAndScores(state.players, first.id, second.id, payload);
  const actualLoser = winner.id === first.id ? second : first;
  const originalResult = {
    opponent1Score: match.opponent1.score ?? null,
    opponent2Score: match.opponent2.score ?? null,
    winnerId: match.actualWinnerId ?? null,
    completedAt: match.completedAt ?? null,
    completedBy: match.completedBy ?? null,
  };
  const changingCompletedMatch = match.status >= MATCH_STATUS.completed;
  const impact = changingCompletedMatch ? await lastPlaceCorrectionImpact(state, match.id) : [];
  if (changingCompletedMatch && impact.length > 0) {
    assert(payload.confirmRollback === true, "Correcting this match will clear downstream last-place results.", {
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
  const semanticSide1Wins = actualLoser.id === first.id;
  await manager.update.match({
    id: match.id,
    opponent1: { score: payload.opponent1Score ?? undefined, result: semanticSide1Wins ? "win" : "loss" },
    opponent2: { score: payload.opponent2Score ?? undefined, result: semanticSide1Wins ? "loss" : "win" },
    completedAt: now(),
    completedBy: context.actorId ?? context.actorKind ?? "unknown",
  });
  const stored = await storage.select("match", match.id);
  stored.actualWinnerId = winner.id;
  stored.actualLoserId = actualLoser.id;
  await storage.update("match", stored.id, stored);
  await refreshReverseLastPlaceCompletion(state, manager, storage);
  const corrected = state.lastPlace.bracket.match.find((candidate) => candidate.id === match.id);
  return {
    impact,
    originalResult,
    correctedResult: {
      opponent1Score: corrected.opponent1?.score ?? null,
      opponent2Score: corrected.opponent2?.score ?? null,
      winnerId: corrected.actualWinnerId ?? null,
      completedAt: corrected.completedAt ?? null,
      completedBy: corrected.completedBy ?? null,
    },
  };
}

async function setLastPlaceResult(state, payload, context) {
  assert(state.status === "active" || state.status === "completed", "Results can only be entered for a started tournament.", {
    code: "invalid_status",
    status: 409,
  });
  assert(state.lastPlaceMode === "fair" && ["active", "completed"].includes(state.lastPlace?.status), "The last-place playoff is not active.", {
    code: "invalid_status",
    status: 409,
  });
  if (state.lastPlace.format === "reverse_double_elimination") return setReverseLastPlaceResult(state, payload, context);
  return setSimpleLastPlaceResult(state, payload, context);
}

async function clearLastPlaceResult(state, payload) {
  assert(state.status === "active" || state.status === "completed", "Tournament has not started.", { code: "invalid_status", status: 409 });
  assert(state.lastPlaceMode === "fair", "The last-place playoff is not enabled.", { code: "invalid_status", status: 409 });
  if (state.lastPlace.format !== "reverse_double_elimination") {
    const match = state.lastPlace.matches.find((candidate) => String(candidate.id) === String(payload.matchId));
    assert(match, "Last-place match not found.", { code: "not_found", status: 404 });
    const originalResult = {
      opponent1Score: match.opponent1.score ?? null,
      opponent2Score: match.opponent2.score ?? null,
      winnerId: match.opponent1.result === "win" ? match.opponent1.id : match.opponent2.result === "win" ? match.opponent2.id : null,
      completedAt: match.completedAt ?? null,
      completedBy: match.completedBy ?? null,
    };
    delete match.opponent1.score;
    delete match.opponent1.result;
    delete match.opponent2.score;
    delete match.opponent2.result;
    match.status = MATCH_STATUS.ready;
    match.completedAt = null;
    match.completedBy = null;
    refreshSimpleLastPlaceCompletion(state);
    return { impact: [], originalResult, correctedResult: null };
  }
  const impact = await lastPlaceCorrectionImpact(state, payload.matchId);
  assert(impact.length === 0 || payload.confirmRollback === true, "Clearing this result will clear downstream last-place results.", {
    code: "rollback_confirmation_required",
    status: 409,
    details: { affectedMatches: impact },
  });
  const { manager, storage } = managerFromBracket(state.lastPlace.bracket);
  const match = await storage.select("match", Number(payload.matchId));
  assert(match, "Last-place match not found.", { code: "not_found", status: 404 });
  const originalResult = {
    opponent1Score: match.opponent1?.score ?? null,
    opponent2Score: match.opponent2?.score ?? null,
    winnerId: match.actualWinnerId ?? null,
    completedAt: match.completedAt ?? null,
    completedBy: match.completedBy ?? null,
  };
  const descendants = await descendantMatches(manager, match.id);
  for (const descendant of descendants) await resetMatchAndScores(manager, storage, descendant.id);
  await resetMatchAndScores(manager, storage, match.id);
  await refreshReverseLastPlaceCompletion(state, manager, storage);
  return { impact, originalResult, correctedResult: null };
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
  const firstPlayer = appPlayerForBracketId(state, match.opponent1.id);
  const secondPlayer = appPlayerForBracketId(state, match.opponent2.id);
  const winner = validateWinnerAndScores(state.players, firstPlayer?.id, secondPlayer?.id, payload);
  const originalResult = {
    opponent1Score: match.opponent1.score ?? null,
    opponent2Score: match.opponent2.score ?? null,
    winnerId: appPlayerForBracketId(state, winnerBracketId(match))?.id ?? null,
    completedAt: match.completedAt ?? null,
    completedBy: match.completedBy ?? null,
  };

  const changingCompletedMatch = match.status >= MATCH_STATUS.completed;
  const resetsLastPlace = changingCompletedMatch
    && state.lastPlaceMode === "fair"
    && !["pending", "disabled"].includes(state.lastPlace?.status);
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
    if (resetsLastPlace) state.lastPlace = emptyLastPlace("fair");
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
  await refreshChampionshipCompletion(state, manager, storage);
  await refreshLastPlaceEligibility(state);
  refreshTournamentCompletion(state);
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
  if (state.lastPlaceMode === "fair" && !["pending", "disabled"].includes(state.lastPlace?.status)) {
    state.lastPlace = emptyLastPlace("fair");
  }
  state.status = "active";
  state.championId = null;
  state.standings = [];
  state.completedAt = null;
  await refreshLastPlaceEligibility(state, { resetCompetition: true });
  refreshTournamentCompletion(state);
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
  ensureLastPlaceState(state);
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
      if (payload.lastPlaceMode !== undefined) {
        requireDraft(state);
        assert(["fair", "standard"].includes(payload.lastPlaceMode), "Last-place mode must be fair or standard.");
        state.lastPlaceMode = payload.lastPlaceMode;
        state.lastPlace = emptyLastPlace(payload.lastPlaceMode);
      }
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
      state.lastPlace = emptyLastPlace(state.lastPlaceMode);
      await refreshLastPlaceEligibility(state);
      break;
    }
    case "set_match_result":
      result = await setMatchResult(state, payload, context);
      break;
    case "clear_match_result":
      result = await clearMatchResult(state, payload);
      break;
    case "set_last_place_result":
      result = await setLastPlaceResult(state, payload, context);
      break;
    case "clear_last_place_result":
      result = await clearLastPlaceResult(state, payload);
      break;
    case "reset_to_draft": {
      assert(payload.confirmReset === true, "Reset confirmation is required.", { code: "confirmation_required", status: 409 });
      assert(state.status === "active" || state.status === "completed", "Only active or completed tournaments can return to draft.");
      state.status = "draft";
      state.players = state.players.map(({ bracketId, ...player }) => player);
      state.bracket = null;
      state.championId = null;
      state.standings = [];
      state.lastPlace = emptyLastPlace(state.lastPlaceMode);
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

export function readyLastPlaceMatches(state) {
  if (state.lastPlace?.format === "reverse_double_elimination") {
    return (state.lastPlace.bracket?.match ?? []).filter((match) =>
      [MATCH_STATUS.ready, MATCH_STATUS.running].includes(match.status));
  }
  return (state.lastPlace?.matches ?? []).filter((match) =>
    [MATCH_STATUS.ready, MATCH_STATUS.running].includes(match.status));
}

export function lastPlacePlayerId(state, bracketId) {
  return lastPlacePlayerForBracketId(state, bracketId)?.id ?? null;
}

export function matchWinnerId(state, match) {
  return appPlayerForBracketId(state, winnerBracketId(match))?.id ?? null;
}

export function playerNameForBracketId(state, bracketId) {
  return appPlayerForBracketId(state, bracketId)?.name ?? "TBD";
}
