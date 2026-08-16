import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";

describe("offline storage", () => {
  it("persists tournament snapshots and ordered operations", async () => {
    const database = await import("../src/local-db.js");
    await database.saveTournament({ id: "test-id", state: { id: "test-id", slug: "test" }, revision: 0 });
    await database.queueOperation("test-id", { id: "11111111-1111-4111-8111-111111111111", type: "first", payload: {} });
    await database.queueOperation("test-id", { id: "22222222-2222-4222-8222-222222222222", type: "second", payload: {} });
    expect((await database.getTournament("test-id")).state.slug).toBe("test");
    expect((await database.listOperations("test-id")).map((entry) => entry.operation.type)).toEqual(["first", "second"]);
    await database.clearOperations("test-id");
    expect(await database.operationCount("test-id")).toBe(0);
  });
});
