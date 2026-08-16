#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

version="$(tr -d '[:space:]' < VERSION)"
commit="$(git rev-parse --short HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then commit="${commit}-dirty"; fi

: "${FTP_URL:?Set FTP_URL, for example ftps://hosting.example.com}"
: "${FTP_USER:?Set FTP_USER}"
: "${FTP_PASSWORD:?Set FTP_PASSWORD}"
: "${FTP_PATH:?Set FTP_PATH to the remote web root}"
command -v lftp >/dev/null || { echo "lftp is required." >&2; exit 1; }

pnpm check

echo "Deploying TournamentTree ${version} (${commit}) to ${FTP_URL}${FTP_PATH}"
lftp -u "${FTP_USER},${FTP_PASSWORD}" "${FTP_URL}" <<EOF
set cmd:fail-exit true
set ftp:ssl-force true
set ssl:verify-certificate true
mirror --reverse --delete --verbose "${repo_root}/dist" "${FTP_PATH}"
bye
EOF

echo "Static deployment complete."
