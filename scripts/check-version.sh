#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="$(tr -d '[:space:]' < "${repo_root}/VERSION")"

if [[ ! "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "VERSION must contain a semantic version, got: ${version}" >&2
  exit 1
fi

package_version="$(node -p "require('${repo_root}/package.json').version")"
if [[ "${package_version}" != "${version}" ]]; then
  echo "VERSION (${version}) does not match package.json (${package_version})." >&2
  exit 1
fi

echo "Version ${version} is consistent."
