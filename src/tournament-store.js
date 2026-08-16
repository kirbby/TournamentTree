import { applyOperation, createTournament } from "../supabase/functions/_shared/tournament-engine.js";
import { tournamentApi, ApiError } from "./api.js";
import {
  clearOperations,
  deleteOperation,
  getTournament,
  getTournamentBySlug,
  listOperations,
  listTournaments,
  operationCount,
  queueOperation,
  saveTournament,
} from "./local-db.js";
import { isBackendConfigured } from "./supabase.js";

function rowToRecord(row, previous = {}) {
  const state = row.state ?? row;
  return {
    id: state.id,
    state,
    revision: row.revision ?? previous.revision ?? 0,
    lastSyncedRevision: row.revision ?? previous.lastSyncedRevision ?? 0,
    dirty: false,
    lastSyncedAt: new Date().toISOString(),
  };
}

function responseRow(response) {
  return response.data?.tournament ?? response.data;
}

export async function createLocalTournament(input) {
  const state = createTournament(input);
  const record = {
    id: state.id,
    state,
    revision: 0,
    lastSyncedRevision: 0,
    dirty: true,
    lastSyncedAt: null,
  };
  await saveTournament(record);
  await queueOperation(state.id, { type: "create_tournament", payload: { snapshot: state } });
  return record;
}

export async function mutateLocalTournament(id, operation, context = { actorKind: "admin", actorId: "offline-admin" }) {
  const record = await getTournament(id);
  if (!record) throw new Error("Tournament is not available locally.");
  const applied = await applyOperation(record.state, operation, context);
  const queued = await queueOperation(id, { ...operation, id: operation.id ?? crypto.randomUUID() });
  const updated = {
    ...record,
    state: applied.state,
    dirty: true,
    localUpdatedAt: new Date().toISOString(),
  };
  await saveTournament(updated);
  return { record: updated, result: applied.result, queued };
}

export async function cacheRemoteTournament(row) {
  const existing = await getTournament(row.state?.id ?? row.id);
  const record = rowToRecord(row, existing);
  await saveTournament(record);
  return record;
}

export async function localTournament(idOrSlug) {
  return (await getTournament(idOrSlug)) ?? getTournamentBySlug(idOrSlug);
}

export async function localTournaments() {
  const records = await listTournaments();
  await Promise.all(records.map(async (record) => {
    record.pendingCount = await operationCount(record.id);
  }));
  return records;
}

export async function syncTournament(id, { onVenueOverride } = {}) {
  if (!isBackendConfigured || !navigator.onLine) return { synced: false, reason: "offline" };
  let record = await getTournament(id);
  if (!record) return { synced: false, reason: "not_cached" };
  let operations = await listOperations(id);

  let remoteRow = null;
  try {
    remoteRow = responseRow(await tournamentApi.get(id, { admin: true }));
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
  }

  if (operations.length === 0) {
    if (remoteRow && (remoteRow.revision ?? 0) > (record.lastSyncedRevision ?? 0)) {
      record = await cacheRemoteTournament(remoteRow);
    }
    return { synced: true, record };
  }

  const beginsWithCreate = operations[0].operation.type === "create_tournament";
  if (!remoteRow && !beginsWithCreate) {
    throw new ApiError("Cloud tournament was not found.", { status: 404, code: "not_found" });
  }

  if (remoteRow && remoteRow.revision !== record.lastSyncedRevision) {
    onVenueOverride?.({ remoteRevision: remoteRow.revision, localRevision: record.lastSyncedRevision });
    const response = await tournamentApi.forceSnapshot(
      id,
      record.state,
      remoteRow.revision,
      record.lastSyncedRevision,
      crypto.randomUUID(),
    );
    await clearOperations(id);
    record = await cacheRemoteTournament(responseRow(response));
    return { synced: true, venueOverride: true, record };
  }

  for (const queued of operations) {
    const response = await tournamentApi.applyOperation(id, queued.operation, record.revision || undefined);
    await deleteOperation(queued.id);
    record = await cacheRemoteTournament(responseRow(response));
  }
  operations = await listOperations(id);
  record.dirty = operations.length > 0;
  await saveTournament(record);
  return { synced: true, record };
}

export async function refreshPublicTournaments() {
  if (!isBackendConfigured || !navigator.onLine) return localTournaments();
  const response = await tournamentApi.list();
  const rows = response.data?.tournaments ?? response.data ?? [];
  for (const row of rows) await cacheRemoteTournament(row);
  return localTournaments();
}
