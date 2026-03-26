#!/usr/bin/env bash
set -euo pipefail

VERSION="${CLI_VERSION:-latest}"
OS="linux"
ARCH="amd64"

# Detect ARM64 runners
if [ "$(uname -m)" = "aarch64" ] || [ "$(uname -m)" = "arm64" ]; then
  ARCH="arm64"
fi

# Resolve "latest" to actual version number
if [ "${VERSION}" = "latest" ]; then
  VERSION=$(curl -fsSL "https://api.github.com/repos/drape-io/drape-cli/releases/latest" | jq -r '.tag_name' | sed 's/^v//')
  if [ -z "${VERSION}" ] || [ "${VERSION}" = "null" ]; then
    echo "::error::Failed to resolve latest Drape CLI version"
    exit 1
  fi
  echo "Resolved latest version: v${VERSION}"
fi

# Check cache first
CACHE_DIR="${RUNNER_TOOL_CACHE:-/tmp/drape-cache}/drape/${VERSION}/${ARCH}"
BINARY="${CACHE_DIR}/drape"

if [ -f "${BINARY}" ]; then
  echo "Drape CLI v${VERSION} found in cache"
  echo "${CACHE_DIR}" >> "${GITHUB_PATH}"
  exit 0
fi

# Download tarball and checksums
TARBALL="drape_${OS}_${ARCH}.tar.gz"
BASE_URL="https://github.com/drape-io/drape-cli/releases/download/v${VERSION}"
TMPDIR=$(mktemp -d)
trap 'rm -rf "${TMPDIR}"' EXIT

echo "Downloading Drape CLI v${VERSION} (${OS}/${ARCH})..."
curl -fsSL -o "${TMPDIR}/${TARBALL}" "${BASE_URL}/${TARBALL}"
curl -fsSL -o "${TMPDIR}/checksums.txt" "${BASE_URL}/checksums.txt"

# Verify SHA256 checksum
EXPECTED=$(grep "${TARBALL}" "${TMPDIR}/checksums.txt" | awk '{print $1}')
if [ -z "${EXPECTED}" ]; then
  echo "::error::Checksum not found for ${TARBALL} in checksums.txt"
  exit 1
fi

ACTUAL=$(sha256sum "${TMPDIR}/${TARBALL}" | awk '{print $1}')
if [ "${EXPECTED}" != "${ACTUAL}" ]; then
  echo "::error::Checksum verification failed for ${TARBALL}"
  echo "::error::Expected: ${EXPECTED}"
  echo "::error::Actual:   ${ACTUAL}"
  exit 1
fi
echo "Checksum verified"

# Extract and cache
mkdir -p "${CACHE_DIR}"
tar xzf "${TMPDIR}/${TARBALL}" -C "${CACHE_DIR}"
chmod +x "${BINARY}"

echo "${CACHE_DIR}" >> "${GITHUB_PATH}"
echo "Installed Drape CLI v${VERSION}"
