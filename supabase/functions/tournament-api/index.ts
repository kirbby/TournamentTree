import { createClient } from "@supabase/supabase-js";
import {
  TournamentError,
  applyOperation,
  correctionImpact,
  createTournament,
  matchWinnerId,
  publicTournament,
  validateTournamentState,
} from "../_shared/tournament-engine.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, idempotency-key, if-match",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const legacyServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
const serviceKey = legacyServiceKey || (secretKeys ? Object.values(JSON.parse(secretKeys))[0] as string : "");
const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const openApiDocument = await Deno.readTextFile(new URL("./openapi.yaml", import.meta.url));

type Actor = {
  kind: "admin" | "api_token";
  id: string;
  scopes: string[];
  userId?: string;
};

function json(data: unknown, status = 200, meta: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ data, meta, error: null }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function failure(message: string, status = 400, code = "request_failed", details: unknown = null) {
  return new Response(JSON.stringify({ data: null, meta: {}, error: { message, code, details } }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function body(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) return {};
  return request.json().catch(() => {
    throw new TournamentError("Request body must be valid JSON.", { code: "invalid_json", status: 400 });
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const encoded = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `tt_live_${encoded}`;
}

async function actorFromRequest(request: Request, requiredScope = "tournaments:read"): Promise<Actor | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();

  if (token.startsWith("tt_live_")) {
    const tokenHash = await sha256(token);
    const { data: apiToken, error } = await admin
      .from("api_tokens")
      .select("id, scopes, expires_at, revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error || !apiToken || apiToken.revoked_at || (apiToken.expires_at && new Date(apiToken.expires_at) <= new Date())) return null;
    if (!apiToken.scopes.includes(requiredScope)) return null;
    await admin.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", apiToken.id);
    return { kind: "api_token", id: apiToken.id, scopes: apiToken.scopes };
  }

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return null;
  const { data: appAdmin } = await admin.from("app_admins").select("user_id").eq("user_id", userData.user.id).maybeSingle();
  if (!appAdmin) return null;
  return {
    kind: "admin",
    id: userData.user.id,
    userId: userData.user.id,
    scopes: ["tournaments:read", "tournaments:write", "tokens:manage", "venue:force"],
  };
}

async function requireActor(request: Request, scope: string) {
  const actor = await actorFromRequest(request, scope);
  if (!actor) throw new TournamentError("Valid authorization is required.", { code: "unauthorized", status: 401 });
  return actor;
}

function requireAdmin(actor: Actor) {
  if (actor.kind !== "admin") throw new TournamentError("Administrator authorization is required.", { code: "forbidden", status: 403 });
}

function identifierQuery(identifier: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
  return isUuid ? { column: "id", value: identifier } : { column: "slug", value: identifier };
}

async function tournamentRow(identifier: string) {
  const query = identifierQuery(identifier);
  const { data, error } = await admin.from("tournaments").select("*").eq(query.column, query.value).maybeSingle();
  if (error) throw error;
  if (!data) throw new TournamentError("Tournament not found.", { code: "not_found", status: 404 });
  return data;
}

function visibleRow(row: any, actor: Actor | null) {
  if (!actor && row.status === "draft") throw new TournamentError("Tournament not found.", { code: "not_found", status: 404 });
  return row;
}

function mutationId(request: Request) {
  const id = request.headers.get("idempotency-key");
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new TournamentError("A UUID Idempotency-Key header is required.", { code: "idempotency_key_required", status: 400 });
  }
  return id;
}

function expectedRevision(request: Request) {
  const raw = request.headers.get("if-match")?.replaceAll('"', "");
  const revision = Number(raw);
  if (!raw || !Number.isSafeInteger(revision) || revision < 1) {
    throw new TournamentError("An If-Match revision header is required.", { code: "revision_required", status: 409 });
  }
  return revision;
}

function normalizeRow(row: any) {
  return {
    ...row,
    state: publicTournament(row.state),
  };
}

async function createRow(request: Request, actor: Actor) {
  const input = await body(request);
  const state = input.snapshot ? input.snapshot : createTournament(input);
  validateTournamentState(state);
  if (input.snapshot && (state.status !== "draft" || state.players.length !== 0 || state.bracket !== null)) {
    throw new TournamentError("A create snapshot must be an empty draft.", { code: "invalid_create_snapshot", status: 422 });
  }
  const eventId = mutationId(request);
  const { data, error } = await admin.rpc("create_tournament_state", {
    p_state: state,
    p_actor_kind: actor.kind,
    p_actor_id: actor.id,
    p_event_id: eventId,
    p_created_by: actor.userId ?? null,
  });
  if (error) throw error;
  return normalizeRow(data);
}

async function commit(request: Request, row: any, actor: Actor, operation: any) {
  const eventId = mutationId(request);
  const { data: existingEvent, error: eventError } = await admin
    .from("tournament_events")
    .select("id, tournament_id")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw eventError;
  if (existingEvent) {
    if (existingEvent.tournament_id !== row.id) {
      throw new TournamentError("Idempotency key was already used for another tournament.", { code: "idempotency_conflict", status: 409 });
    }
    return { row: normalizeRow(row), result: { idempotentReplay: true } };
  }
  const revision = expectedRevision(request);
  if (revision !== row.revision) {
    throw new TournamentError("Tournament revision has changed.", {
      code: "revision_conflict",
      status: 409,
      details: { expected: revision, current: row.revision },
    });
  }
  const applied = await applyOperation(row.state, operation, { actorKind: actor.kind, actorId: actor.id });
  const { data, error } = await admin.rpc("commit_tournament_state", {
    p_tournament_id: row.id,
    p_expected_revision: revision,
    p_state: applied.state,
    p_action: operation.type,
    p_payload: { request: operation.payload ?? {}, audit: applied.result ?? {} },
    p_actor_kind: actor.kind,
    p_actor_id: actor.id,
    p_event_id: eventId,
  });
  if (error) {
    if (error.code === "40001" || error.message?.includes("revision_conflict")) {
      throw new TournamentError("Tournament revision has changed.", { code: "revision_conflict", status: 409 });
    }
    throw error;
  }
  return { row: normalizeRow(data), result: applied.result };
}

function operationFromRoute(method: string, tail: string[], input: any) {
  if (tail.length === 0 && method === "PATCH") return { type: "update_metadata", payload: input };
  if (tail[0] === "players" && tail.length === 1 && method === "POST") return { type: "add_player", payload: input };
  if (tail[0] === "players" && tail.length === 1 && method === "PUT") return { type: "set_players", payload: input };
  if (tail[0] === "players" && tail[1] && method === "PATCH") return { type: "update_player", payload: { ...input, playerId: tail[1] } };
  if (tail[0] === "players" && tail[1] && method === "DELETE") return { type: "remove_player", payload: { playerId: tail[1] } };
  if (tail[0] === "players-order" && method === "PUT") return { type: "reorder_players", payload: input };
  if (tail[0] === "reroll" && method === "POST") return { type: "reroll", payload: input };
  if (tail[0] === "start" && method === "POST") return { type: "start", payload: input };
  if (tail[0] === "reset-to-draft" && method === "POST") return { type: "reset_to_draft", payload: input };
  if (tail[0] === "matches" && tail[1] && tail[2] === "result" && method === "PUT") {
    return { type: "set_match_result", payload: { ...input, matchId: Number(tail[1]) } };
  }
  if (tail[0] === "matches" && tail[1] && tail[2] === "result" && method === "DELETE") {
    return { type: "clear_match_result", payload: { ...input, matchId: Number(tail[1]) } };
  }
  if (tail[0] === "archive" && method === "POST") return { type: "archive", payload: input };
  if (tail[0] === "restore" && method === "POST") return { type: "restore", payload: input };
  return null;
}

async function handle(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(request.url);
  const allParts = url.pathname.split("/").filter(Boolean);
  const apiVersionIndex = allParts.lastIndexOf("v1");
  const parts = allParts.slice(apiVersionIndex + 1);
  const method = request.method.toUpperCase();

  if (parts[0] === "openapi.yaml" && method === "GET") {
    return new Response(openApiDocument, {
      headers: {
        ...corsHeaders,
        "Cache-Control": "public, max-age=300",
        "Content-Type": "application/vnd.oai.openapi;version=3.1",
      },
    });
  }

  if (parts[0] === "health" && method === "GET") {
    return json({ status: "ok", service: "tournament-api", version: 1 });
  }

  if (parts[0] === "tokens") {
    const actor = await requireActor(request, "tokens:manage");
    requireAdmin(actor);
    if (parts.length === 1 && method === "GET") {
      const { data, error } = await admin.from("api_tokens").select("id, name, scopes, created_at, last_used_at, expires_at, revoked_at").order("created_at", { ascending: false });
      if (error) throw error;
      return json({ tokens: data });
    }
    if (parts.length === 1 && method === "POST") {
      const input = await body(request);
      const name = String(input.name ?? "").trim();
      if (!name || name.length > 80) throw new TournamentError("Token name must be between 1 and 80 characters.");
      const eventId = mutationId(request);
      const { data: existing, error: existingError } = await admin
        .from("api_tokens")
        .select("id, name, scopes, created_at, expires_at")
        .eq("id", eventId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return json({ token: null, tokenInfo: existing, idempotentReplay: true }, 200);
      const token = randomToken();
      const scopes = Array.isArray(input.scopes) ? input.scopes.filter((scope: string) => ["tournaments:read", "tournaments:write"].includes(scope)) : ["tournaments:read", "tournaments:write"];
      const { data, error } = await admin.from("api_tokens").insert({
        id: eventId,
        name,
        token_hash: await sha256(token),
        scopes,
        created_by: actor.userId,
        expires_at: input.expiresAt ?? null,
      }).select("id, name, scopes, created_at, expires_at").single();
      if (error) throw error;
      return json({ token, tokenInfo: data }, 201);
    }
    if (parts[1] && parts[2] === "revoke" && method === "POST") {
      mutationId(request);
      const { error } = await admin.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", parts[1]).is("revoked_at", null);
      if (error) throw error;
      return json({ revoked: true });
    }
  }

  if (parts[0] !== "tournaments") throw new TournamentError("Endpoint not found.", { code: "not_found", status: 404 });

  if (parts.length === 1 && method === "GET") {
    const actor = await actorFromRequest(request, "tournaments:read");
    let query = admin.from("tournaments").select("*").order("tournament_date", { ascending: false });
    if (!actor) query = query.in("status", ["active", "completed", "archived"]);
    const { data, error } = await query;
    if (error) throw error;
    return json({ tournaments: data.map(normalizeRow) });
  }

  if (parts.length === 1 && method === "POST") {
    const actor = await requireActor(request, "tournaments:write");
    return json({ tournament: await createRow(request, actor) }, 201);
  }

  const identifier = parts[1];
  if (!identifier) throw new TournamentError("Tournament identifier is required.");
  const row = await tournamentRow(identifier);
  const tail = parts.slice(2);

  if (tail.length === 0 && method === "GET") {
    const actor = await actorFromRequest(request, "tournaments:read");
    return json({ tournament: normalizeRow(visibleRow(row, actor)) }, 200, { revision: row.revision, updatedAt: row.updated_at });
  }
  if (tail[0] === "matches" && tail.length === 1 && method === "GET") {
    const actor = await actorFromRequest(request, "tournaments:read");
    visibleRow(row, actor);
    const state = row.state;
    const matches = (state.bracket?.match ?? []).map((match: any) => ({ ...match, winnerId: matchWinnerId(state, match) }));
    return json({ matches }, 200, { revision: row.revision });
  }
  if (tail[0] === "standings" && method === "GET") {
    const actor = await actorFromRequest(request, "tournaments:read");
    visibleRow(row, actor);
    return json({ standings: row.state.standings, championId: row.state.championId }, 200, { revision: row.revision });
  }
  if (tail[0] === "events" && method === "GET") {
    await requireActor(request, "tournaments:read");
    const { data, error } = await admin.from("tournament_events").select("*").eq("tournament_id", row.id).order("revision", { ascending: false });
    if (error) throw error;
    return json({ events: data }, 200, { revision: row.revision });
  }
  if (tail[0] === "venue-snapshot" && method === "PUT") {
    const actor = await requireActor(request, "venue:force");
    requireAdmin(actor);
    const input = await body(request);
    if (input.forceVenue !== true) throw new TournamentError("Venue override confirmation is required.", { code: "confirmation_required", status: 409 });
    validateTournamentState(input.snapshot);
    if (input.snapshot.id !== row.id) throw new TournamentError("Snapshot tournament ID does not match.");
    const revision = expectedRevision(request);
    const { data, error } = await admin.rpc("force_venue_tournament_state", {
      p_tournament_id: row.id,
      p_expected_revision: revision,
      p_last_synced_revision: Number(input.lastSyncedRevision ?? 0),
      p_state: input.snapshot,
      p_actor_id: actor.id,
      p_event_id: mutationId(request),
    });
    if (error) {
      if (error.code === "40001") throw new TournamentError("Tournament revision has changed.", { code: "revision_conflict", status: 409 });
      throw error;
    }
    return json({ tournament: normalizeRow(data) }, 200, { revision: data.revision, updatedAt: data.updated_at });
  }

  const actor = await requireActor(request, "tournaments:write");
  const input = await body(request);
  const operation = operationFromRoute(method, tail, input);
  if (!operation) throw new TournamentError("Endpoint not found.", { code: "not_found", status: 404 });
  const committed = await commit(request, row, actor, operation);
  return json({ tournament: committed.row, result: committed.result }, 200, {
    revision: committed.row.revision,
    updatedAt: committed.row.updated_at,
  });
}

Deno.serve(async (request) => {
  try {
    return await handle(request);
  } catch (error: any) {
    console.error(error);
    if (error instanceof TournamentError) return failure(error.message, error.status, error.code, error.details);
    if (error?.code === "23505") return failure("A tournament with this slug already exists.", 409, "duplicate_slug");
    return failure("Internal server error.", 500, "internal_error");
  }
});
