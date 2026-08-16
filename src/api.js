import { apiBaseUrl, supabase, supabasePublishableKey } from "./supabase.js";

export class ApiError extends Error {
  constructor(message, { status = 0, code = "network_error", details = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function adminToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function request(path, { method = "GET", body, admin = false, idempotencyKey, revision } = {}) {
  if (!apiBaseUrl) throw new ApiError("Supabase backend is not configured.", { code: "backend_unconfigured" });
  const headers = { Accept: "application/json" };
  if (supabasePublishableKey) headers.apikey = supabasePublishableKey;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  if (revision != null) headers["If-Match"] = String(revision);
  if (admin) {
    const token = await adminToken();
    if (!token) throw new ApiError("Administrator login is required.", { status: 401, code: "authentication_required" });
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new ApiError(error.message || "Network request failed.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(payload.error?.message || `Request failed with status ${response.status}.`, {
      status: response.status,
      code: payload.error?.code || "request_failed",
      details: payload.error?.details ?? null,
    });
  }
  return payload;
}

export const tournamentApi = {
  health: () => request("/health"),
  list: ({ admin = false } = {}) => request("/tournaments", { admin }),
  get: (idOrSlug, { admin = false } = {}) => request(`/tournaments/${encodeURIComponent(idOrSlug)}`, { admin }),
  events: (id) => request(`/tournaments/${encodeURIComponent(id)}/events`, { admin: true }),
  tokens: () => request("/tokens", { admin: true }),
  createToken: (input) => request("/tokens", { method: "POST", body: input, admin: true, idempotencyKey: crypto.randomUUID() }),
  revokeToken: (id) => request(`/tokens/${encodeURIComponent(id)}/revoke`, { method: "POST", admin: true, idempotencyKey: crypto.randomUUID() }),
  forceSnapshot: (id, snapshot, expectedRevision, lastSyncedRevision, idempotencyKey) => request(`/tournaments/${encodeURIComponent(id)}/venue-snapshot`, {
    method: "PUT",
    admin: true,
    idempotencyKey,
    revision: expectedRevision,
    body: { snapshot, lastSyncedRevision, forceVenue: true },
  }),
  applyOperation: (id, operation, revision) => {
    const encodedId = encodeURIComponent(id);
    const common = { admin: true, idempotencyKey: operation.id, revision };
    const payload = operation.payload ?? {};
    switch (operation.type) {
      case "create_tournament":
        return request("/tournaments", { ...common, revision: undefined, method: "POST", body: { snapshot: payload.snapshot } });
      case "update_metadata":
        return request(`/tournaments/${encodedId}`, { ...common, method: "PATCH", body: payload });
      case "add_player":
        return request(`/tournaments/${encodedId}/players`, { ...common, method: "POST", body: payload });
      case "update_player":
        return request(`/tournaments/${encodedId}/players/${encodeURIComponent(payload.playerId)}`, { ...common, method: "PATCH", body: payload });
      case "set_players":
        return request(`/tournaments/${encodedId}/players`, { ...common, method: "PUT", body: payload });
      case "remove_player":
        return request(`/tournaments/${encodedId}/players/${encodeURIComponent(payload.playerId)}`, { ...common, method: "DELETE" });
      case "reorder_players":
        return request(`/tournaments/${encodedId}/players-order`, { ...common, method: "PUT", body: payload });
      case "reroll":
        return request(`/tournaments/${encodedId}/reroll`, { ...common, method: "POST", body: payload });
      case "start":
        return request(`/tournaments/${encodedId}/start`, { ...common, method: "POST", body: payload });
      case "reset_to_draft":
        return request(`/tournaments/${encodedId}/reset-to-draft`, { ...common, method: "POST", body: payload });
      case "set_match_result":
        return request(`/tournaments/${encodedId}/matches/${encodeURIComponent(payload.matchId)}/result`, { ...common, method: "PUT", body: payload });
      case "clear_match_result":
        return request(`/tournaments/${encodedId}/matches/${encodeURIComponent(payload.matchId)}/result`, { ...common, method: "DELETE", body: payload });
      case "set_last_place_result":
        return request(`/tournaments/${encodedId}/last-place/matches/${encodeURIComponent(payload.matchId)}/result`, { ...common, method: "PUT", body: payload });
      case "clear_last_place_result":
        return request(`/tournaments/${encodedId}/last-place/matches/${encodeURIComponent(payload.matchId)}/result`, { ...common, method: "DELETE", body: payload });
      case "archive":
        return request(`/tournaments/${encodedId}/archive`, { ...common, method: "POST", body: payload });
      case "restore":
        return request(`/tournaments/${encodedId}/restore`, { ...common, method: "POST", body: payload });
      default:
        throw new ApiError(`Unsupported operation: ${operation.type}.`, { code: "unsupported_operation" });
    }
  },
};
