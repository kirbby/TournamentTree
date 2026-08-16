import { openDB } from "idb";

const databasePromise = openDB("tournament-tree", 1, {
  upgrade(database) {
    if (!database.objectStoreNames.contains("tournaments")) {
      database.createObjectStore("tournaments", { keyPath: "id" });
    }
    if (!database.objectStoreNames.contains("operations")) {
      const operations = database.createObjectStore("operations", { keyPath: "id" });
      operations.createIndex("by-tournament", "tournamentId");
      operations.createIndex("by-created", "createdAt");
    }
    if (!database.objectStoreNames.contains("meta")) {
      database.createObjectStore("meta", { keyPath: "key" });
    }
  },
});

export async function saveTournament(record) {
  const database = await databasePromise;
  await database.put("tournaments", record);
  return record;
}

export async function getTournament(id) {
  const database = await databasePromise;
  return database.get("tournaments", id);
}

export async function getTournamentBySlug(slug) {
  const records = await listTournaments();
  return records.find((record) => record.state.slug === slug) ?? null;
}

export async function listTournaments() {
  const database = await databasePromise;
  const records = await database.getAll("tournaments");
  return records.sort((left, right) => String(right.state.tournamentDate).localeCompare(String(left.state.tournamentDate)));
}

export async function queueOperation(tournamentId, operation) {
  const database = await databasePromise;
  const transaction = database.transaction("operations", "readwrite");
  const existing = await transaction.store.index("by-tournament").getAll(tournamentId);
  const queued = {
    id: operation.id ?? crypto.randomUUID(),
    tournamentId,
    operation: { ...operation, id: operation.id ?? undefined },
    createdAt: new Date().toISOString(),
    sequence: existing.reduce((maximum, item) => Math.max(maximum, item.sequence ?? 0), 0) + 1,
  };
  queued.operation.id = queued.id;
  await transaction.store.put(queued);
  await transaction.done;
  return queued;
}

export async function listOperations(tournamentId) {
  const database = await databasePromise;
  const records = await database.getAllFromIndex("operations", "by-tournament", tournamentId);
  return records.sort((left, right) =>
    (left.sequence ?? 0) - (right.sequence ?? 0)
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id));
}

export async function deleteOperation(id) {
  const database = await databasePromise;
  await database.delete("operations", id);
}

export async function clearOperations(tournamentId) {
  const database = await databasePromise;
  const transaction = database.transaction("operations", "readwrite");
  let cursor = await transaction.store.index("by-tournament").openCursor(tournamentId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await transaction.done;
}

export async function operationCount(tournamentId) {
  const database = await databasePromise;
  return database.countFromIndex("operations", "by-tournament", tournamentId);
}

export async function setMeta(key, value) {
  const database = await databasePromise;
  await database.put("meta", { key, value });
}

export async function getMeta(key) {
  const database = await databasePromise;
  return (await database.get("meta", key))?.value;
}
