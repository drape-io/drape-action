#!/usr/bin/env bash
# Post sample comments on a PR to preview comment templates.
# Usage: ./tests/post-sample-comments.sh <pr-number>
set -euo pipefail

PR_NUMBER="${1:?Usage: $0 <pr-number>}"
REPO="drape-io/drape-action"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

export PATH="/opt/homebrew/bin:$PATH"

echo "Posting sample comments on PR #${PR_NUMBER}..."

# Generate all comments as JSON lines, then post each one
npx tsx "${SCRIPT_DIR}/generate-sample-comments.ts" | while IFS= read -r line; do
    header=$(echo "${line}" | jq -r '.header')
    body=$(echo "${line}" | jq -r '.body')
    echo "  Posting: ${header}"
    gh api "repos/${REPO}/issues/${PR_NUMBER}/comments" -f body="${body}" > /dev/null
done

echo "Done! Check the PR for sample comments."
