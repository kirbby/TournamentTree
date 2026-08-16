#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

: "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF}"
version="$(tr -d '[:space:]' < VERSION)"
commit="$(git rev-parse --short HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then commit="${commit}-dirty"; fi

pnpm check

echo "Deploying TournamentTree API ${version} (${commit}) to ${SUPABASE_PROJECT_REF}"
npx --yes supabase@latest link --project-ref "${SUPABASE_PROJECT_REF}"
npx --yes supabase@latest db push --linked
npx --yes supabase@latest functions deploy tournament-api \
  --project-ref "${SUPABASE_PROJECT_REF}" \
  --import-map supabase/functions/deno.json

echo "Supabase deployment complete."
