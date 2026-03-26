#!/usr/bin/env bash
set -euo pipefail

# Build CLI command
# Note: org/repo are auto-detected by the CLI from GITHUB_REPOSITORY when
# DRAPE_ORG/DRAPE_REPO are not set. The action passes them as env vars only
# when the user explicitly provides them.
CMD_ARGS=("drape" "upload" "${INPUT_COMMAND}" "${INPUT_FILE}")

# Use --quiet for clean JSON on stdout
CMD_ARGS+=("--quiet")

# Common flags
CMD_ARGS+=("--wait=${INPUT_WAIT}")
CMD_ARGS+=("--timeout" "${INPUT_TIMEOUT}")

if [ "${INPUT_VERBOSE}" = "true" ]; then
  CMD_ARGS+=("--verbose")
fi

# Command-specific flags
case "${INPUT_COMMAND}" in
  coverage)
    [ -n "${INPUT_FORMAT:-}" ] && CMD_ARGS+=("--format" "${INPUT_FORMAT}")
    [ -n "${INPUT_PATH_PREFIX:-}" ] && CMD_ARGS+=("--path-prefix" "${INPUT_PATH_PREFIX}")
    [ -n "${INPUT_TARGET_BRANCH:-}" ] && CMD_ARGS+=("--target-branch" "${INPUT_TARGET_BRANCH}")
    [ -n "${INPUT_GROUP:-}" ] && CMD_ARGS+=("--group" "${INPUT_GROUP}")
    ;;
  tests)
    [ -n "${INPUT_FORMAT:-}" ] && CMD_ARGS+=("--format" "${INPUT_FORMAT}")
    [ -n "${INPUT_JOB_NAME:-}" ] && CMD_ARGS+=("--job-name" "${INPUT_JOB_NAME}")
    [ -n "${INPUT_GROUP:-}" ] && CMD_ARGS+=("--group" "${INPUT_GROUP}")
    ;;
  scan)
    [ -n "${INPUT_FORMAT:-}" ] && CMD_ARGS+=("--format" "${INPUT_FORMAT}")
    [ -n "${INPUT_SCAN_NAME:-}" ] && CMD_ARGS+=("--scan-name" "${INPUT_SCAN_NAME}")
    [ -n "${INPUT_SCAN_TAG:-}" ] && CMD_ARGS+=("--scan-tag" "${INPUT_SCAN_TAG}")
    [ -n "${INPUT_SCAN_TYPE:-}" ] && CMD_ARGS+=("--scan-type" "${INPUT_SCAN_TYPE}")
    [ "${INPUT_FAIL_ON_VULNS}" = "true" ] && CMD_ARGS+=("--fail-on-vulnerabilities")
    [ -n "${INPUT_FAIL_ON_SEVERITY:-}" ] && CMD_ARGS+=("--fail-on-severity" "${INPUT_FAIL_ON_SEVERITY}")
    ;;
  lint)
    [ -n "${INPUT_FORMAT:-}" ] && CMD_ARGS+=("--format" "${INPUT_FORMAT}")
    ;;
  *)
    echo "::error::Unknown command: ${INPUT_COMMAND}. Must be one of: coverage, tests, scan, lint"
    exit 2
    ;;
esac

# Run CLI, capture JSON stdout separately from stderr logs
# With --quiet, the CLI writes JSON to stdout and errors to stderr.
# Capture them separately so JSON parsing is clean.
JSON_FILE=$(mktemp)
STDERR_FILE=$(mktemp)
trap 'rm -f "${JSON_FILE}" "${STDERR_FILE}"' EXIT

set +e
"${CMD_ARGS[@]}" > "${JSON_FILE}" 2>"${STDERR_FILE}"
CLI_EXIT=$?
set -e

# Show stderr in the action log
if [ -s "${STDERR_FILE}" ]; then
  cat "${STDERR_FILE}" >&2
fi

# Parse JSON from stdout
JSON_RESULT=$(cat "${JSON_FILE}")
if ! echo "${JSON_RESULT}" | jq -e '.' > /dev/null 2>&1; then
  JSON_RESULT="{}"
  echo "::warning::Failed to parse CLI JSON output"
fi

# Set outputs using multiline delimiter
{
  echo "exit-code=${CLI_EXIT}"

  echo "result-json<<DRAPE_JSON_EOF"
  echo "${JSON_RESULT}"
  echo "DRAPE_JSON_EOF"
} >> "${GITHUB_OUTPUT}"

# Determine pass/fail
if [ "${CLI_EXIT}" -eq 0 ]; then
  echo "passed=true" >> "${GITHUB_OUTPUT}"
else
  echo "passed=false" >> "${GITHUB_OUTPUT}"
fi

# Exit with CLI exit code
exit "${CLI_EXIT}"
