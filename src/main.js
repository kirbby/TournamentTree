import "./styles/theme.css";
import "./styles.css";
import "brackets-viewer/dist/brackets-viewer.min.js";
import { registerSW } from "virtual:pwa-register";
import { icon, mountIcons } from "./icons.js";
import {
  MATCH_STATUS,
  correctionImpact,
  playerNameForBracketId,
} from "../supabase/functions/_shared/tournament-engine.js";
import { tournamentApi } from "./api.js";
import { operationCount } from "./local-db.js";
import {
  cacheRemoteTournament,
  createLocalTournament,
  localTournament,
  localTournaments,
  mutateLocalTournament,
  refreshPublicTournaments,
  syncTournament,
} from "./tournament-store.js";
import { isBackendConfigured, supabase } from "./supabase.js";

registerSW({ immediate: true });

const app = document.querySelector("#app");
let session = null;
let realtimeChannel = null;
let refreshTimer = null;
const syncingIds = new Set();
let dashboardSyncing = false;

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatDate = (value) => value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`))
  : "No date";

const statusStyle = {
  draft: "bg-amber-100 text-amber-800",
  active: "bg-green-100 text-green-800",
  completed: "bg-blue-100 text-blue-800",
  archived: "bg-slate-200 text-slate-700",
};

function statusBadge(status) {
  return `<span class="badge ${statusStyle[status] ?? statusStyle.archived}">${escapeHtml(status)}</span>`;
}

function toast(message, kind = "info") {
  let container = document.querySelector("#toasts");
  if (!container) {
    container = document.createElement("div");
    container.id = "toasts";
    container.className = "fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2";
    document.body.append(container);
  }
  const element = document.createElement("div");
  const color = kind === "error" ? "bg-red-700" : kind === "success" ? "bg-green-700" : "bg-slate-900";
  element.className = `toast rounded-lg ${color} px-4 py-3 text-sm text-white shadow-lg`;
  element.textContent = message;
  container.append(element);
  setTimeout(() => element.remove(), 4500);
}

function route() {
  const hash = location.hash || "#/";
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "t" && parts[1]) return { name: "public-tournament", id: parts[1] };
  if (parts[0] === "admin" && parts[1] === "t" && parts[2]) return { name: "admin-tournament", id: parts[2] };
  if (parts[0] === "admin") return { name: "admin" };
  return { name: "home" };
}

function shell(content, { wide = false } = {}) {
  const online = navigator.onLine;
  const synchronizing = online && syncingIds.size > 0;
  app.innerHTML = `
    <header class="border-b border-slate-200 bg-slate-950 text-white no-print">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        <a href="#/" class="flex items-center gap-3 font-bold tracking-tight">
          <span class="grid h-9 w-9 place-items-center rounded-lg bg-blue-500 text-lg">TT</span>
          <span>TournamentTree</span>
        </a>
        <nav class="flex items-center gap-2 text-sm">
          <a class="rounded-lg px-3 py-2 hover:bg-slate-800" href="#/">Tournaments</a>
          <a class="rounded-lg px-3 py-2 hover:bg-slate-800" href="#/admin">Admin</a>
        </nav>
      </div>
    </header>
    <div id="connection-bar" class="${online ? "bg-green-50 text-green-800" : "bg-amber-100 text-amber-900"} border-b px-4 py-2 text-center text-xs font-semibold">
      ${synchronizing ? `Synchronizing ${syncingIds.size} tournament${syncingIds.size === 1 ? "" : "s"}…` : online ? "Online · local saves are immediate" : "Offline — changes stay safely on this device until reconnection"}
    </div>
    <main class="mx-auto ${wide ? "max-w-[96rem]" : "max-w-6xl"} px-4 py-8 sm:px-6">${content}</main>
  `;
  mountIcons(app);
}

function loading(label = "Loading tournament…") {
  shell(`<div class="grid min-h-[40vh] place-items-center text-slate-500">${escapeHtml(label)}</div>`);
}

function errorView(error) {
  console.error(error);
  shell(`<div class="card mx-auto max-w-xl border-red-200">
    <h1 class="text-xl font-bold text-red-800">Something went wrong</h1>
    <p class="mt-2 text-sm text-slate-600">${escapeHtml(error.message || error)}</p>
    <button class="btn-secondary mt-5" data-action="retry">Try again</button>
  </div>`);
  document.querySelector("[data-action=retry]")?.addEventListener("click", renderRoute);
}

function tournamentCard(record, admin = false) {
  const state = record.state;
  const link = admin ? `#/admin/t/${encodeURIComponent(state.id)}` : `#/t/${encodeURIComponent(state.slug)}`;
  return `<a href="${link}" class="card block transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-bold">${escapeHtml(state.name)}</h2>
        <p class="mt-1 text-sm text-slate-500">${formatDate(state.tournamentDate)} · ${state.players.length} players</p>
      </div>
      ${statusBadge(state.status)}
    </div>
    ${record.pendingCount ? `<p class="mt-3 text-xs font-semibold text-amber-700">${record.pendingCount} change${record.pendingCount === 1 ? "" : "s"} waiting to sync</p>` : ""}
    ${state.championId ? `<p class="mt-3 text-sm"><span class="text-slate-500">Champion:</span> <strong>${escapeHtml(state.players.find((player) => player.id === state.championId)?.name)}</strong></p>` : ""}
  </a>`;
}

async function renderHome() {
  shell(`<div class="space-y-6"><h1 class="text-3xl font-black tracking-tight">Tournaments</h1><p class="text-slate-500">Loading current tournaments and archive…</p></div>`);
  const records = await refreshPublicTournaments();
  const visible = records.filter((record) => ["active", "completed", "archived"].includes(record.state.status));
  const current = visible.filter((record) => record.state.status === "active");
  const archive = visible.filter((record) => record.state.status !== "active");
  shell(`
    <section>
      <div class="flex items-end justify-between gap-4">
        <div><p class="text-sm font-bold uppercase tracking-widest text-blue-600">Live</p><h1 class="mt-1 text-3xl font-black tracking-tight">Current tournaments</h1></div>
      </div>
      <div class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        ${current.length ? current.map((record) => tournamentCard(record)).join("") : `<div class="card col-span-full text-slate-500">No tournament is currently active.</div>`}
      </div>
    </section>
    <section class="mt-12">
      <p class="text-sm font-bold uppercase tracking-widest text-slate-500">History</p>
      <h2 class="mt-1 text-2xl font-black">Archive</h2>
      <div class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        ${archive.length ? archive.map((record) => tournamentCard(record)).join("") : `<div class="card col-span-full text-slate-500">Completed tournaments will appear here.</div>`}
      </div>
    </section>
  `);
}

function playerName(state, bracketId) {
  return bracketId == null ? "TBD" : playerNameForBracketId(state, bracketId);
}

function matchLabel(state, match) {
  const group = state.bracket?.group.find((item) => item.id === match.group_id);
  const round = state.bracket?.round.find((item) => item.id === match.round_id);
  if (group?.number === 1) return `Winners R${round?.number ?? "?"} · Match ${match.number}`;
  if (group?.number === 2) return `Losers R${round?.number ?? "?"} · Match ${match.number}`;
  return round?.number === 2 ? "Grand Final Reset" : "Grand Final";
}

function renderBracket(state, selector = "#bracket-viewer") {
  if (!state.bracket || !window.bracketsViewer) return;
  requestAnimationFrame(() => {
    const target = document.querySelector(selector);
    if (!target) return;
    try {
      window.bracketsViewer.render({
        stages: state.bracket.stage,
        groups: state.bracket.group,
        rounds: state.bracket.round,
        matches: state.bracket.match,
        matchGames: state.bracket.match_game,
        participants: state.bracket.participant,
      }, {
        selector,
        clear: true,
        participantOriginPlacement: "before",
        separatedChildCountLabel: true,
        showSlotsOrigin: true,
      });
    } catch (error) {
      target.innerHTML = `<p class="p-4 text-red-700">Could not render bracket: ${escapeHtml(error.message)}</p>`;
    }
  });
}

function standingsHtml(state) {
  if (!state.standings?.length) return "";
  return `<section class="card"><h2 class="text-xl font-bold">Final standings</h2><ol class="mt-4 divide-y divide-slate-100">
    ${state.standings.map((item) => `<li class="flex items-center gap-4 py-3"><span class="w-8 font-black text-slate-400">${item.rank}</span><strong>${escapeHtml(item.name)}</strong></li>`).join("")}
  </ol></section>`;
}

async function loadPublicRecord(idOrSlug) {
  let record = await localTournament(idOrSlug);
  if (isBackendConfigured && navigator.onLine) {
    try {
      const response = await tournamentApi.get(idOrSlug);
      record = await cacheRemoteTournament(response.data.tournament);
    } catch (error) {
      if (!record) throw error;
    }
  }
  return record;
}

async function renderPublicTournament(idOrSlug) {
  loading();
  const record = await loadPublicRecord(idOrSlug);
  if (!record || record.state.status === "draft") throw new Error("Tournament not found.");
  const state = record.state;
  const champion = state.players.find((player) => player.id === state.championId);
  shell(`
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div><p class="text-sm font-bold uppercase tracking-widest text-blue-600">${formatDate(state.tournamentDate)}</p><h1 class="mt-1 text-3xl font-black tracking-tight">${escapeHtml(state.name)}</h1><p class="mt-2 text-slate-500">${state.players.length} players · Cached ${record.lastSyncedAt ? new Date(record.lastSyncedAt).toLocaleString() : "locally"}</p></div>
      <div class="flex items-center gap-2">${statusBadge(state.status)}<button class="btn-secondary no-print" onclick="window.print()">Print</button></div>
    </div>
    ${champion ? `<div class="mt-6 rounded-xl bg-gradient-to-r from-amber-100 to-yellow-50 p-6"><p class="text-sm font-bold uppercase tracking-widest text-amber-700">Champion</p><p class="mt-1 text-3xl font-black">${escapeHtml(champion.name)}</p></div>` : ""}
    ${state.bracket ? `<section class="mt-8"><h2 class="mb-4 text-xl font-bold">Bracket</h2><div class="bracket-shell"><div id="bracket-viewer" class="brackets-viewer"></div></div></section>` : ""}
    <div class="mt-8">${standingsHtml(state)}</div>
  `, { wide: true });
  renderBracket(state);
  subscribeToTournament(record.id, () => renderPublicTournament(idOrSlug));
}

async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

function loginView(message = "") {
  shell(`<div class="mx-auto max-w-md">
    <div class="card">
      <p class="text-sm font-bold uppercase tracking-widest text-blue-600">Organizer</p>
      <h1 class="mt-1 text-2xl font-black">Administrator login</h1>
      ${!isBackendConfigured ? `<div class="mt-4 rounded-lg bg-amber-100 p-3 text-sm text-amber-900">Supabase is not configured. Add the Vite environment values before signing in.</div>` : ""}
      ${message ? `<div class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">${escapeHtml(message)}</div>` : ""}
      <form id="login-form" class="mt-6 space-y-4">
        <label class="block text-sm font-semibold">Email<input class="field mt-1" name="email" type="email" autocomplete="username" required></label>
        <label class="block text-sm font-semibold">Password<input class="field mt-1" name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn-primary w-full" ${!isBackendConfigured ? "disabled" : ""}>Sign in</button>
      </form>
    </div>
  </div>`);
  document.querySelector("#login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({ email: values.get("email"), password: values.get("password") });
    if (error) loginView(error.message);
    else renderRoute();
  });
}

async function tokenPanel() {
  if (!navigator.onLine || !isBackendConfigured) return `<div class="card"><h2 class="font-bold">AI API tokens</h2><p class="mt-2 text-sm text-slate-500">Connect to the internet to manage API tokens.</p></div>`;
  try {
    const response = await tournamentApi.tokens();
    const tokens = response.data.tokens ?? [];
    return `<div class="card">
      <div class="flex items-center justify-between gap-3"><div><h2 class="font-bold">AI API tokens</h2><p class="mt-1 text-sm text-slate-500">Scoped access for external LLMs and automations.</p></div><button class="btn-secondary" data-action="create-token">${icon("add")} Create token</button></div>
      <div class="mt-4 divide-y divide-slate-100">${tokens.length ? tokens.map((token) => `<div class="flex items-center justify-between gap-3 py-3"><div><strong>${escapeHtml(token.name)}</strong><p class="text-xs text-slate-500">${token.revoked_at ? "Revoked" : `Created ${new Date(token.created_at).toLocaleDateString()}`}</p></div>${token.revoked_at ? "" : `<button class="text-sm font-semibold text-red-700" data-action="revoke-token" data-id="${token.id}">Revoke</button>`}</div>`).join("") : `<p class="py-3 text-sm text-slate-500">No API token has been created.</p>`}</div>
    </div>`;
  } catch (error) {
    return `<div class="card border-red-200"><h2 class="font-bold">AI API tokens</h2><p class="mt-2 text-sm text-red-700">${escapeHtml(error.message)}</p></div>`;
  }
}

async function renderAdmin() {
  session = await getSession();
  if (!session) return loginView();
  const records = await localTournaments();
  const tokens = await tokenPanel();
  shell(`
    <div class="flex flex-wrap items-start justify-between gap-4"><div><p class="text-sm font-bold uppercase tracking-widest text-blue-600">Organizer</p><h1 class="mt-1 text-3xl font-black">Dashboard</h1><p class="mt-1 text-sm text-slate-500">${escapeHtml(session.user.email)}</p></div><button class="btn-secondary" data-action="logout">Sign out</button></div>
    <div class="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section>
        <div class="card">
          <h2 class="text-lg font-bold">Create tournament</h2>
          <form id="create-tournament" class="mt-4 grid gap-3 sm:grid-cols-[1fr_11rem_auto]">
            <input class="field" name="name" placeholder="Tournament name" required maxlength="100">
            <input class="field" name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" required>
            <button class="btn-primary">${icon("add")} Create</button>
          </form>
        </div>
        <div class="mt-6 grid gap-4 sm:grid-cols-2">${records.length ? records.map((record) => tournamentCard(record, true)).join("") : `<div class="card col-span-full text-slate-500">Create the first tournament to get started.</div>`}</div>
      </section>
      <aside>${tokens}</aside>
    </div>
  `);
  document.querySelector("[data-action=logout]")?.addEventListener("click", async () => { await supabase.auth.signOut(); location.hash = "#/"; });
  document.querySelector("#create-tournament")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      const record = await createLocalTournament({ name: values.get("name"), tournamentDate: values.get("date") });
      toast("Tournament saved locally.", "success");
      location.hash = `#/admin/t/${record.id}`;
      syncTournament(record.id).catch((error) => toast(`Cloud sync pending: ${error.message}`, "error"));
    } catch (error) { toast(error.message, "error"); }
  });
  document.querySelector("[data-action=create-token]")?.addEventListener("click", async () => {
    const name = prompt("Token name", "Tournament AI");
    if (!name) return;
    try {
      const response = await tournamentApi.createToken({ name, scopes: ["tournaments:read", "tournaments:write"] });
      const secret = response.data.token;
      prompt("Copy this token now. It will not be shown again.", secret);
      renderAdmin();
    } catch (error) { toast(error.message, "error"); }
  });
  document.querySelectorAll("[data-action=revoke-token]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm("Revoke this API token?")) return;
    try { await tournamentApi.revokeToken(button.dataset.id); renderAdmin(); } catch (error) { toast(error.message, "error"); }
  }));
  const pendingRecords = records.filter((record) => record.pendingCount > 0 && !syncingIds.has(record.id));
  if (navigator.onLine && pendingRecords.length && !dashboardSyncing) {
    dashboardSyncing = true;
    Promise.allSettled(pendingRecords.map((record) => backgroundSync(record.id, false)))
      .finally(() => { dashboardSyncing = false; renderAdmin(); });
  }
}

function placementPreview(state) {
  if (!state.placementPreview?.length) return "";
  const playerById = new Map(state.players.map((player) => [player.id, player]));
  const pairs = [];
  for (let index = 0; index < state.placementPreview.length; index += 2) {
    pairs.push([state.placementPreview[index], state.placementPreview[index + 1]]);
  }
  return `<div class="mt-6"><h3 class="font-bold">First-round preview</h3><div class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">${pairs.map((pair) => `<div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"><div>${pair[0] ? escapeHtml(playerById.get(pair[0])?.name) : `<span class="text-slate-400">BYE</span>`}</div><div class="my-1 border-t border-slate-200"></div><div>${pair[1] ? escapeHtml(playerById.get(pair[1])?.name) : `<span class="text-slate-400">BYE</span>`}</div></div>`).join("")}</div></div>`;
}

function draftEditor(state) {
  return `<section class="card">
    <div class="flex flex-wrap items-center justify-between gap-3"><div><h2 class="text-xl font-bold">Players</h2><p class="mt-1 text-sm text-slate-500">${state.players.length}/32 · Seed any consecutive top players; everyone else is shuffled.</p></div><button class="btn-secondary" data-action="reroll" ${state.players.length < 2 ? "disabled" : ""}>${icon("refresh")} Reroll unseeded</button></div>
    <form id="add-player" class="mt-5 flex gap-2"><input class="field" name="name" placeholder="Player name" maxlength="80" required><button class="btn-primary" ${state.players.length >= 32 ? "disabled" : ""}>${icon("add")} Add</button></form>
    <form id="players-form" class="mt-5">
      <div class="divide-y divide-slate-100">${state.players.length ? state.players.map((player, index) => `<div class="grid grid-cols-[auto_1fr_5rem_auto] items-center gap-2 py-2" data-player="${player.id}"><span class="w-6 text-center text-xs font-bold text-slate-400">${index + 1}</span><input class="field player-name" value="${escapeHtml(player.name)}" maxlength="80"><select class="field player-seed"><option value="">—</option>${state.players.map((_, seedIndex) => `<option value="${seedIndex + 1}" ${player.seed === seedIndex + 1 ? "selected" : ""}>#${seedIndex + 1}</option>`).join("")}</select><div class="flex"><button type="button" class="rounded px-2 py-1 hover:bg-slate-100" data-action="move-up" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" class="rounded px-2 py-1 hover:bg-slate-100" data-action="move-down" ${index === state.players.length - 1 ? "disabled" : ""}>↓</button><button type="button" class="rounded px-2 py-1 text-red-700 hover:bg-red-50" data-action="remove-player">×</button></div></div>`).join("") : `<p class="py-5 text-sm text-slate-500">Add between 2 and 32 players.</p>`}</div>
      ${state.players.length ? `<button class="btn-secondary mt-4">${icon("save")} Save names and seeds</button>` : ""}
    </form>
    ${placementPreview(state)}
    <div class="mt-6 border-t border-slate-200 pt-5"><button class="btn-primary" data-action="start" ${state.players.length < 2 ? "disabled" : ""}>Start tournament</button></div>
  </section>`;
}

function matchCard(state, match, { completed = false, readOnly = false } = {}) {
  const player1 = playerName(state, match.opponent1?.id);
  const player2 = playerName(state, match.opponent2?.id);
  const winner = match.opponent1?.result === "win" ? player1 : match.opponent2?.result === "win" ? player2 : null;
  return `<article class="rounded-xl border ${completed ? "border-slate-200" : "border-blue-200 bg-blue-50/40"} p-4">
    <div class="flex items-start justify-between gap-3"><p class="text-xs font-bold uppercase tracking-wide text-slate-500">${escapeHtml(matchLabel(state, match))}</p>${completed ? `<span class="badge bg-slate-100 text-slate-600">Complete</span>` : `<span class="badge bg-blue-100 text-blue-700">Ready</span>`}</div>
    <div class="mt-3 grid grid-cols-[1fr_auto] gap-2 text-sm"><strong>${escapeHtml(player1)}</strong><span>${match.opponent1?.score ?? "—"}</span><strong>${escapeHtml(player2)}</strong><span>${match.opponent2?.score ?? "—"}</span></div>
    ${winner ? `<p class="mt-3 text-sm text-green-700">Winner: <strong>${escapeHtml(winner)}</strong></p>` : ""}
    ${readOnly ? "" : `<div class="mt-4 flex gap-2"><button class="btn-${completed ? "secondary" : "primary"}" data-action="edit-result" data-match="${match.id}">${completed ? "Correct result" : "Enter result"}</button>${completed ? `<button class="btn-secondary text-red-700" data-action="clear-result" data-match="${match.id}">${icon("delete")} Clear</button>` : ""}</div>`}
  </article>`;
}

function activeEditor(state, { readOnly = false } = {}) {
  const playable = state.bracket.match.filter((match) => [MATCH_STATUS.ready, MATCH_STATUS.running].includes(match.status));
  const completed = state.bracket.match.filter((match) => match.status >= MATCH_STATUS.completed && match.opponent1 && match.opponent2).sort((a, b) => b.id - a.id);
  return `<section>
    ${state.championId ? `<div class="rounded-xl bg-gradient-to-r from-amber-100 to-yellow-50 p-6"><p class="text-sm font-bold uppercase tracking-widest text-amber-700">Champion</p><p class="mt-1 text-3xl font-black">${escapeHtml(state.players.find((player) => player.id === state.championId)?.name)}</p></div>` : ""}
    <div class="mt-6 grid gap-6 xl:grid-cols-[1fr_22rem]">
      <div><div class="flex items-center justify-between"><h2 class="text-xl font-bold">Ready matches</h2><span class="badge bg-blue-100 text-blue-700">${playable.length}</span></div><div class="mt-4 grid gap-4 md:grid-cols-2">${playable.length ? playable.map((match) => matchCard(state, match, { readOnly })).join("") : `<div class="card col-span-full text-slate-500">No match is currently ready.</div>`}</div></div>
      <aside><h2 class="text-xl font-bold">Completed matches</h2><div class="mt-4 max-h-[36rem] space-y-3 overflow-y-auto">${completed.length ? completed.map((match) => matchCard(state, match, { completed: true, readOnly })).join("") : `<div class="card text-slate-500">No results yet.</div>`}</div></aside>
    </div>
    <section class="mt-8"><h2 class="mb-4 text-xl font-bold">Bracket</h2><div class="bracket-shell"><div id="bracket-viewer" class="brackets-viewer"></div></div></section>
    <div class="mt-8">${standingsHtml(state)}</div>
  </section>`;
}

async function commitAndSync(id, operation) {
  const result = await mutateLocalTournament(id, operation, { actorKind: "admin", actorId: session?.user?.id ?? "offline-admin" });
  toast(navigator.onLine ? "Saved locally; syncing…" : "Saved on this device for later sync.", "success");
  renderAdminTournament(id);
  return result;
}

async function backgroundSync(id, rerender = true) {
  if (syncingIds.has(id) || !navigator.onLine || !session) return;
  syncingIds.add(id);
  document.querySelector("#connection-bar")?.replaceChildren(document.createTextNode("Synchronizing venue changes…"));
  try {
    const result = await syncTournament(id, {
      onVenueOverride: () => toast("Venue changes are superseding newer cloud actions; audit history is preserved.", "info"),
    });
    if (result.synced) toast("Cloud synchronization complete.", "success");
  } catch (error) {
    toast(`Cloud sync pending: ${error.message}`, "error");
  } finally {
    syncingIds.delete(id);
    if (rerender) renderRoute();
  }
}

function resultDialog(state, match, impact = []) {
  const dialog = document.createElement("dialog");
  const player1 = state.players.find((player) => player.bracketId === match.opponent1.id);
  const player2 = state.players.find((player) => player.bracketId === match.opponent2.id);
  const currentWinner = match.opponent1.result === "win" ? player1.id : match.opponent2.result === "win" ? player2.id : "";
  dialog.className = "w-[min(34rem,calc(100vw-2rem))] rounded-xl p-0 shadow-2xl backdrop:bg-slate-950/60";
  dialog.innerHTML = `<form method="dialog" id="result-form" class="p-6">
    <div class="flex items-start justify-between gap-4"><div><p class="text-xs font-bold uppercase tracking-widest text-blue-600">${escapeHtml(matchLabel(state, match))}</p><h2 class="mt-1 text-xl font-black">Record result</h2></div><button value="cancel" class="rounded p-2 text-slate-500 hover:bg-slate-100">×</button></div>
    ${impact.length ? `<div class="mt-4 rounded-lg bg-amber-100 p-3 text-sm text-amber-900">This correction clears ${impact.length} downstream result${impact.length === 1 ? "" : "s"}.</div>` : ""}
    <div class="mt-5 grid grid-cols-[1fr_7rem] items-center gap-3"><strong>${escapeHtml(player1.name)}</strong><input class="field" name="score1" type="number" min="0" step="1" value="${match.opponent1.score ?? ""}" placeholder="Score"><strong>${escapeHtml(player2.name)}</strong><input class="field" name="score2" type="number" min="0" step="1" value="${match.opponent2.score ?? ""}" placeholder="Score"></div>
    <label class="mt-5 block text-sm font-semibold">Winner<select class="field mt-1" name="winner" required><option value="">Select winner</option><option value="${player1.id}" ${currentWinner === player1.id ? "selected" : ""}>${escapeHtml(player1.name)}</option><option value="${player2.id}" ${currentWinner === player2.id ? "selected" : ""}>${escapeHtml(player2.name)}</option></select></label>
    <label class="mt-4 flex items-start gap-2 text-sm"><input class="mt-1 rounded border-slate-300" name="override" type="checkbox"><span>Allow the selected winner to differ from an unequal score.</span></label>
    <div class="mt-6 flex justify-end gap-2"><button value="cancel" class="btn-secondary">Cancel</button><button value="default" class="btn-primary" data-submit>Save result</button></div>
  </form>`;
  document.body.append(dialog);
  mountIcons(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.querySelector("#result-form").addEventListener("submit", async (event) => {
    const submitter = event.submitter;
    if (!submitter?.hasAttribute("data-submit")) return;
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const raw1 = values.get("score1");
    const raw2 = values.get("score2");
    try {
      await commitAndSync(state.id, {
        type: "set_match_result",
        payload: {
          matchId: match.id,
          opponent1Score: raw1 === "" ? null : Number(raw1),
          opponent2Score: raw2 === "" ? null : Number(raw2),
          winnerId: values.get("winner"),
          overrideScoreWinner: values.get("override") === "on",
          confirmRollback: impact.length > 0,
        },
      });
      dialog.close();
    } catch (error) { toast(error.message, "error"); }
  });
  dialog.showModal();
}

async function renderAdminTournament(id) {
  session = await getSession();
  if (!session) return loginView("Sign in online once before managing tournaments offline.");
  let record = await localTournament(id);
  if (!record && navigator.onLine) {
    const response = await tournamentApi.get(id, { admin: true });
    record = await cacheRemoteTournament(response.data.tournament);
  }
  if (!record) throw new Error("Tournament is not available on this device.");
  const pending = await operationCount(record.id);
  const state = record.state;
  shell(`
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div><a href="#/admin" class="text-sm font-semibold text-blue-700">← Dashboard</a><div class="mt-2 flex items-center gap-3"><h1 class="text-3xl font-black">${escapeHtml(state.name)}</h1>${statusBadge(state.status)}</div><p class="mt-2 text-sm text-slate-500">${formatDate(state.tournamentDate)} · revision ${record.revision}${pending ? ` · ${pending} pending` : " · synchronized"}</p></div>
      <div class="flex flex-wrap gap-2 no-print"><button class="btn-secondary" data-action="export">Export JSON</button>${state.status === "archived" ? `<button class="btn-secondary" data-action="restore">Restore</button>` : state.status !== "draft" ? `<button class="btn-secondary" data-action="archive">Archive</button><button class="btn-danger" data-action="reset">Reset to draft</button>` : ""}</div>
    </div>
    <div class="mt-8">${state.status === "draft" ? draftEditor(state) : state.status === "archived" ? `<div class="card text-slate-600">This tournament is archived. Restore it to manage results.</div><div class="mt-8">${activeEditor(state, { readOnly: true })}</div>` : activeEditor(state)}</div>
  `, { wide: true });
  if (state.bracket) renderBracket(state);

  document.querySelector("#add-player")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try { await commitAndSync(id, { type: "add_player", payload: { name: values.get("name") } }); } catch (error) { toast(error.message, "error"); }
  });
  document.querySelector("#players-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const assignments = [...event.currentTarget.querySelectorAll("[data-player]")].map((row) => ({
      playerId: row.dataset.player,
      name: row.querySelector(".player-name").value,
      seed: row.querySelector(".player-seed").value ? Number(row.querySelector(".player-seed").value) : null,
    }));
    try { await commitAndSync(id, { type: "set_players", payload: { players: assignments } }); } catch (error) { toast(error.message, "error"); }
  });
  document.querySelector("[data-action=reroll]")?.addEventListener("click", () => commitAndSync(id, { type: "reroll", payload: {} }).catch((error) => toast(error.message, "error")));
  document.querySelector("[data-action=start]")?.addEventListener("click", () => {
    if (confirm("Start this tournament? Players and seeds will be locked.")) commitAndSync(id, { type: "start", payload: {} }).catch((error) => toast(error.message, "error"));
  });
  document.querySelectorAll("[data-action=remove-player]").forEach((button) => button.addEventListener("click", () => {
    const playerId = button.closest("[data-player]").dataset.player;
    commitAndSync(id, { type: "remove_player", payload: { playerId } }).catch((error) => toast(error.message, "error"));
  }));
  document.querySelectorAll("[data-action=move-up],[data-action=move-down]").forEach((button) => button.addEventListener("click", () => {
    const playerId = button.closest("[data-player]").dataset.player;
    const playerIds = state.players.map((player) => player.id);
    const index = playerIds.indexOf(playerId);
    const target = button.dataset.action === "move-up" ? index - 1 : index + 1;
    [playerIds[index], playerIds[target]] = [playerIds[target], playerIds[index]];
    commitAndSync(id, { type: "reorder_players", payload: { playerIds } }).catch((error) => toast(error.message, "error"));
  }));
  document.querySelectorAll("[data-action=edit-result]").forEach((button) => button.addEventListener("click", async () => {
    const match = state.bracket.match.find((item) => item.id === Number(button.dataset.match));
    const impact = await correctionImpact(state, match.id);
    resultDialog(state, match, impact);
  }));
  document.querySelectorAll("[data-action=clear-result]").forEach((button) => button.addEventListener("click", async () => {
    const matchId = Number(button.dataset.match);
    const impact = await correctionImpact(state, matchId);
    if (!confirm(`Clear this result${impact.length ? ` and ${impact.length} downstream result(s)` : ""}?`)) return;
    commitAndSync(id, { type: "clear_match_result", payload: { matchId, confirmRollback: true } }).catch((error) => toast(error.message, "error"));
  }));
  document.querySelector("[data-action=reset]")?.addEventListener("click", () => {
    if (confirm("Return to draft and permanently clear all bracket results?")) commitAndSync(id, { type: "reset_to_draft", payload: { confirmReset: true } }).catch((error) => toast(error.message, "error"));
  });
  document.querySelector("[data-action=archive]")?.addEventListener("click", () => commitAndSync(id, { type: "archive", payload: {} }).catch((error) => toast(error.message, "error")));
  document.querySelector("[data-action=restore]")?.addEventListener("click", () => commitAndSync(id, { type: "restore", payload: {} }).catch((error) => toast(error.message, "error")));
  document.querySelector("[data-action=export]")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${state.slug}-${state.tournamentDate}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
  if (pending > 0 && navigator.onLine && session) backgroundSync(id);
}

function subscribeToTournament(id, callback) {
  if (!supabase || !navigator.onLine) return;
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase.channel(`tournament:${id}`).on("postgres_changes", {
    event: "UPDATE",
    schema: "public",
    table: "tournaments",
    filter: `id=eq.${id}`,
  }, callback).subscribe();
  refreshTimer = setTimeout(callback, 30_000);
}

async function renderRoute() {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (realtimeChannel && supabase) { supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
  try {
    const current = route();
    if (current.name === "home") await renderHome();
    else if (current.name === "public-tournament") await renderPublicTournament(current.id);
    else if (current.name === "admin") await renderAdmin();
    else if (current.name === "admin-tournament") await renderAdminTournament(current.id);
  } catch (error) {
    errorView(error);
  }
}

window.addEventListener("hashchange", renderRoute);
window.addEventListener("online", () => { toast("Connection restored. Synchronizing…", "success"); renderRoute(); });
window.addEventListener("offline", () => { toast("Offline mode enabled. Changes remain on this device."); renderRoute(); });
if (supabase) supabase.auth.onAuthStateChange((_event, nextSession) => { session = nextSession; });

renderRoute();
