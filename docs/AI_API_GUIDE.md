# TournamentTree AI API Guide

Use this API only with a scoped `tt_live_...` token. Never request or store a Supabase secret/service-role key.

## Safe workflow

1. Call `GET /health`.
2. Call `GET /tournaments` and identify the tournament by UUID or slug.
3. Call `GET /tournaments/{id-or-slug}` immediately before a mutation.
4. Read `meta.revision` and inspect the current lifecycle, players, and ready matches.
5. Send a fresh UUID in `Idempotency-Key` and the current revision in `If-Match`.
6. On `409 revision_conflict`, do not blindly retry. Fetch current state, reconsider the requested action, then send a new operation UUID.
7. Reuse the same idempotency UUID only when retrying the exact same request after a network/response failure.

## Results

For `PUT /tournaments/{id}/matches/{matchId}/result`, `winnerId` is always required. Send both scores as non-negative integers or send both as `null`. A tie requires an explicit winner. If an unequal score and winner disagree, add `overrideScoreWinner: true` only when the user explicitly intends that override.

Before correcting a completed match, inspect it and downstream state. A response with `rollback_confirmation_required` lists affected matches. Show that impact to the user; only repeat with `confirmRollback: true` after approval.

## Fair last place

Drafts expose `lastPlaceMode` as `fair` or `standard`. Fair mode is the default for new tournaments. Do not manually choose candidates: the engine selects players eliminated from the championship without a real match win, and byes never count as wins.

Inspect `state.lastPlace` before acting. Its format is automatic for one candidate, `single_match` for two, `round_robin` for three, or `reverse_double_elimination` for four or more. Submit actual match winners through `PUT /tournaments/{id}/last-place/matches/{matchId}/result`. In mirrored double elimination, the API still expects the actual winner; the engine advances the actual loser toward the Grand Loser Final. Correct last-place results with the same rollback-confirmation workflow as championship results. A three-player round-robin tie intentionally produces multiple `lastPlaceIds`.

## Limits

Tokens may manage tournament state and read events. They cannot mint/revoke tokens, force an offline venue snapshot, permanently delete a tournament, or bypass lifecycle rules. Draft players cannot change after the tournament starts unless an administrator confirms a full reset to draft, which clears bracket and result history.

See `openapi.yaml` for routes and schemas.

## Curl examples

```bash
API_BASE="https://PROJECT_REF.supabase.co/functions/v1/tournament-api/v1"
AI_TOKEN="tt_live_REDACTED"

curl --fail-with-body "${API_BASE}/tournaments" \
  -H "Authorization: Bearer ${AI_TOKEN}"

curl --fail-with-body -X PUT "${API_BASE}/tournaments/TOURNAMENT_ID/matches/12/result" \
  -H "Authorization: Bearer ${AI_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 11111111-1111-4111-8111-111111111111" \
  -H "If-Match: 7" \
  --data '{"winnerId":"PLAYER_UUID","opponent1Score":3,"opponent2Score":1}'
```

Keep the token out of shell history in real use by reading it from a secret manager or protected environment file.
