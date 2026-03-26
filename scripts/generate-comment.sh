#!/usr/bin/env bash
set -euo pipefail

# Generates a markdown PR comment from the CLI JSON output.
# Reads: INPUT_COMMAND, RESULT_JSON, EXIT_CODE
# Sets: body output via GITHUB_OUTPUT

if [ -z "${RESULT_JSON:-}" ] || [ "${RESULT_JSON}" = "{}" ]; then
  echo "::warning::No JSON result available for comment generation"
  exit 0
fi

# Extract the first upload's result (single-file commands: coverage, lint)
# For multi-file commands (tests, scan), we aggregate across uploads.
UPLOADS_COUNT=$(echo "${RESULT_JSON}" | jq '.uploads | length')

generate_coverage_comment() {
  local result
  result=$(echo "${RESULT_JSON}" | jq '.uploads[0].result // empty')
  if [ -z "${result}" ]; then
    echo "## Coverage Report"
    echo ""
    echo "> Upload completed but no result data available yet."
    return
  fi

  local drape_url
  drape_url=$(echo "${RESULT_JSON}" | jq -r '.uploads[0].drape_url // empty')

  local passed
  passed="true"

  local diff
  diff=$(echo "${result}" | jq '.coverage_diff // empty')

  echo "## Coverage Report"
  echo ""

  if [ -n "${diff}" ] && [ "${diff}" != "null" ]; then
    passed=$(echo "${diff}" | jq -r '.passed // true')

    local head_rate base_rate delta new_total new_covered new_rate regressed_count
    head_rate=$(echo "${diff}" | jq -r '.head_coverage_rate // "—"')
    base_rate=$(echo "${diff}" | jq -r '.base_coverage_rate // "—"')
    delta=$(echo "${diff}" | jq -r '.coverage_delta // "—"')
    new_total=$(echo "${diff}" | jq -r '.new_lines_total // 0')
    new_covered=$(echo "${diff}" | jq -r '.new_lines_covered // 0')
    new_rate=$(echo "${diff}" | jq -r '.new_code_coverage_rate // "—"')
    regressed_count=$(echo "${diff}" | jq -r '.regressed_lines_count // 0')

    if [ "${passed}" = "false" ]; then
      local reasons
      reasons=$(echo "${diff}" | jq -r '.failure_reasons // [] | join(", ")')
      echo "> [!CAUTION]"
      echo "> Coverage check **failed**${reasons:+: ${reasons}}"
      echo ""
    fi

    echo "| Metric | Value |"
    echo "|--------|-------|"
    echo "| **Head coverage** | ${head_rate}% (${delta}%) |"
    echo "| **Base coverage** | ${base_rate}% |"
    echo "| **New code coverage** | ${new_rate}% (${new_covered}/${new_total} lines) |"
    echo "| **Regressed lines** | ${regressed_count} |"

    # Regressed files detail
    local regressed_files_count
    regressed_files_count=$(echo "${diff}" | jq '.regressed_files // [] | length')
    if [ "${regressed_files_count}" -gt 0 ]; then
      echo ""
      echo "<details>"
      echo "<summary>Regressed files (${regressed_files_count} file(s), ${regressed_count} lines)</summary>"
      echo ""
      echo "| File | Lines | Ranges |"
      echo "|------|-------|--------|"
      echo "${diff}" | jq -r '.regressed_files[] | "| `\(.file_path)` | \(.regressed_lines) | \(.regressed_line_ranges // [] | map("L\(.[0])-\(.[1])") | join(", ")) |"'
      echo ""
      echo "</details>"
    fi
  else
    # No diff data — just show overall coverage
    local rate file_count
    rate=$(echo "${result}" | jq -r '.coverage_rate // "—"')
    file_count=$(echo "${result}" | jq -r '.file_count // "—"')

    echo "| Metric | Value |"
    echo "|--------|-------|"
    echo "| **Coverage rate** | ${rate}% |"
    echo "| **Files** | ${file_count} |"
  fi

  echo ""
  local result_label="Passed"
  if [ "${EXIT_CODE}" -ne 0 ]; then
    result_label="Failed"
  fi
  local footer="> **Result: ${result_label}**"
  if [ -n "${drape_url}" ]; then
    footer="${footer} | [View in Drape](${drape_url})"
  fi
  echo "${footer}"
  echo ">"
  echo "> *drape-io/drape-action*"
}

generate_tests_comment() {
  local total_ingested=0 total_failed=0 total_quarantined=0 total_unquarantined=0

  for i in $(seq 0 $((UPLOADS_COUNT - 1))); do
    local result
    result=$(echo "${RESULT_JSON}" | jq ".uploads[${i}].result // empty")
    [ -z "${result}" ] && continue

    local ingested failed quarantined unquarantined
    ingested=$(echo "${result}" | jq -r '.tests_ingested // 0')
    failed=$(echo "${result}" | jq -r '.failed_count // 0')
    quarantined=$(echo "${result}" | jq -r '.quarantined_count // 0')
    unquarantined=$(echo "${result}" | jq -r '.unquarantined_failure_count // 0')

    total_ingested=$((total_ingested + ingested))
    total_failed=$((total_failed + failed))
    total_quarantined=$((total_quarantined + quarantined))
    total_unquarantined=$((total_unquarantined + unquarantined))
  done

  local drape_url
  drape_url=$(echo "${RESULT_JSON}" | jq -r '.uploads[0].drape_url // empty')

  echo "## Test Results"
  echo ""

  if [ "${total_failed}" -gt 0 ] && [ "${total_unquarantined}" -eq 0 ]; then
    echo "> [!NOTE]"
    echo "> All ${total_failed} failure(s) are quarantined — passing CI"
    echo ""
  elif [ "${total_unquarantined}" -gt 0 ]; then
    echo "> [!CAUTION]"
    echo "> ${total_unquarantined} unquarantined test failure(s)"
    echo ""
  fi

  echo "| Metric | Count |"
  echo "|--------|-------|"
  echo "| Tests ingested | ${total_ingested} |"
  echo "| Failed | ${total_failed} |"
  echo "| Quarantined | ${total_quarantined} |"
  echo "| Unquarantined failures | ${total_unquarantined} |"

  echo ""
  local result_label="Passed"
  if [ "${EXIT_CODE}" -ne 0 ]; then
    result_label="Failed"
  fi
  local footer="> **Result: ${result_label}**"
  if [ -n "${drape_url}" ]; then
    footer="${footer} | [View in Drape](${drape_url})"
  fi
  echo "${footer}"
  echo ">"
  echo "> *drape-io/drape-action*"
}

generate_scan_comment() {
  # Aggregate across all uploaded scan files
  local has_diff="false"
  local new_critical=0 new_high=0 new_medium=0 new_low=0
  local suppressed_total=0 unchanged_total=0
  local all_new_cves="" all_resolved_cves="" all_sla_violations=""
  local scan_name=""

  for i in $(seq 0 $((UPLOADS_COUNT - 1))); do
    local result
    result=$(echo "${RESULT_JSON}" | jq ".uploads[${i}].result // empty")
    [ -z "${result}" ] && continue

    if [ -z "${scan_name}" ]; then
      scan_name=$(echo "${result}" | jq -r '.scan_name // empty')
    fi

    local diff
    diff=$(echo "${result}" | jq '.scan_diff // empty')
    if [ -n "${diff}" ] && [ "${diff}" != "null" ]; then
      has_diff="true"
      new_critical=$((new_critical + $(echo "${diff}" | jq -r '.new_critical_count // 0')))
      new_high=$((new_high + $(echo "${diff}" | jq -r '.new_high_count // 0')))
      new_medium=$((new_medium + $(echo "${diff}" | jq -r '.new_medium_count // 0')))
      new_low=$((new_low + $(echo "${diff}" | jq -r '.new_low_count // 0')))
      suppressed_total=$((suppressed_total + $(echo "${diff}" | jq -r '.suppressed_cves_count // 0')))
      unchanged_total=$((unchanged_total + $(echo "${diff}" | jq -r '.unchanged_cves_count // 0')))

      # Collect CVE arrays
      local new_cves resolved_cves sla_viols
      new_cves=$(echo "${diff}" | jq -c '.new_cves // []')
      resolved_cves=$(echo "${diff}" | jq -c '.resolved_cves // []')
      sla_viols=$(echo "${diff}" | jq -c '.sla_violations // []')

      if [ "${all_new_cves}" = "" ]; then
        all_new_cves="${new_cves}"
      else
        all_new_cves=$(echo "${all_new_cves}" "${new_cves}" | jq -s 'add')
      fi
      if [ "${all_resolved_cves}" = "" ]; then
        all_resolved_cves="${resolved_cves}"
      else
        all_resolved_cves=$(echo "${all_resolved_cves}" "${resolved_cves}" | jq -s 'add')
      fi
      if [ "${all_sla_violations}" = "" ]; then
        all_sla_violations="${sla_viols}"
      else
        all_sla_violations=$(echo "${all_sla_violations}" "${sla_viols}" | jq -s 'add')
      fi
    fi
  done

  local drape_url
  drape_url=$(echo "${RESULT_JSON}" | jq -r '.uploads[0].drape_url // empty')

  local header="Security Scan"
  if [ -n "${scan_name}" ]; then
    header="Security Scan: ${scan_name}"
  fi
  echo "## ${header}"
  echo ""

  local total_new=$((new_critical + new_high + new_medium + new_low))

  if [ "${has_diff}" = "true" ]; then
    if [ "${total_new}" -eq 0 ]; then
      echo "No new vulnerabilities found."
      echo ""
    fi

    echo "| Severity | New | Suppressed | Unchanged |"
    echo "|----------|-----|------------|-----------|"
    echo "| Critical | ${new_critical} | — | — |"
    echo "| High | ${new_high} | — | — |"
    echo "| Medium | ${new_medium} | — | — |"
    echo "| Low | ${new_low} | — | — |"
    echo "| **Total** | **${total_new}** | **${suppressed_total}** | **${unchanged_total}** |"

    # New CVEs detail
    local new_cves_count
    new_cves_count=$(echo "${all_new_cves}" | jq 'length')
    if [ "${new_cves_count}" -gt 0 ]; then
      echo ""
      echo "<details>"
      echo "<summary>New vulnerabilities (${new_cves_count})</summary>"
      echo ""
      echo "| CVE | Severity | Package | Fix |"
      echo "|-----|----------|---------|-----|"
      echo "${all_new_cves}" | jq -r '.[] | "| [\(.cve_id)](https://nvd.nist.gov/vuln/detail/\(.cve_id)) | \(.severity | ascii_upcase) | \(.package_name)@\(.package_version) | \(.fix_state // "—") |"'
      echo ""
      echo "</details>"
    fi

    # Resolved CVEs detail
    local resolved_count
    resolved_count=$(echo "${all_resolved_cves}" | jq 'length')
    if [ "${resolved_count}" -gt 0 ]; then
      echo ""
      echo "<details>"
      echo "<summary>Resolved vulnerabilities (${resolved_count})</summary>"
      echo ""
      echo "| CVE | Severity | Package |"
      echo "|-----|----------|---------|"
      echo "${all_resolved_cves}" | jq -r '.[] | "| \(.cve_id) | \(.severity | ascii_upcase) | \(.package_name)@\(.package_version) |"'
      echo ""
      echo "</details>"
    fi

    # SLA violations
    local sla_count
    sla_count=$(echo "${all_sla_violations}" | jq 'length')
    if [ "${sla_count}" -gt 0 ]; then
      echo ""
      echo "> [!WARNING]"
      echo "> **SLA Violations (${sla_count})**"
      echo ">"
      echo "> | CVE | Severity | Package | Overdue |"
      echo "> |-----|----------|---------|---------|"
      echo "${all_sla_violations}" | jq -r '.[] | "> | \(.cve_id) | \(.severity | ascii_upcase) | \(.package_name) | \(.days_overdue) days |"'
    fi
  else
    # No diff data
    local total_vulns highest
    total_vulns=$(echo "${RESULT_JSON}" | jq -r '.uploads[0].result.total_vulnerabilities // 0')
    highest=$(echo "${RESULT_JSON}" | jq -r '.uploads[0].result.unsuppressed_highest_severity // .uploads[0].result.highest_severity // "none"')

    echo "| Metric | Value |"
    echo "|--------|-------|"
    echo "| **Total vulnerabilities** | ${total_vulns} |"
    echo "| **Highest severity** | ${highest} |"
  fi

  echo ""
  local result_label="Passed"
  if [ "${EXIT_CODE}" -ne 0 ]; then
    result_label="Failed"
  fi
  local footer="> **Result: ${result_label}**"
  if [ -n "${drape_url}" ]; then
    footer="${footer} | [View in Drape](${drape_url})"
  fi
  echo "${footer}"
  echo ">"
  echo "> *drape-io/drape-action*"
}

generate_lint_comment() {
  local result
  result=$(echo "${RESULT_JSON}" | jq '.uploads[0].result // empty')
  if [ -z "${result}" ]; then
    echo "## Lint Report"
    echo ""
    echo "> Upload completed but no result data available yet."
    return
  fi

  local drape_url
  drape_url=$(echo "${RESULT_JSON}" | jq -r '.uploads[0].drape_url // empty')

  local diff
  diff=$(echo "${result}" | jq '.lint_diff // empty')

  echo "## Lint Report"
  echo ""

  if [ -n "${diff}" ] && [ "${diff}" != "null" ]; then
    local passed
    passed=$(echo "${diff}" | jq -r '.passed // true')

    if [ "${passed}" = "false" ]; then
      local reasons
      reasons=$(echo "${diff}" | jq -r '.failure_reasons // [] | join(", ")')
      echo "> [!CAUTION]"
      echo "> Lint check **failed**${reasons:+: ${reasons}}"
      echo ""
    fi

    local base_count head_count new_count resolved_count suppressed_count
    base_count=$(echo "${diff}" | jq -r '.base_violation_count // "—"')
    head_count=$(echo "${diff}" | jq -r '.head_violation_count // "—"')
    new_count=$(echo "${diff}" | jq -r '.new_violation_count // 0')
    resolved_count=$(echo "${diff}" | jq -r '.resolved_violation_count // 0')
    suppressed_count=$(echo "${diff}" | jq -r '.suppressed_violation_count // 0')

    echo "| Metric | Value |"
    echo "|--------|-------|"
    echo "| **Head violations** | ${head_count} |"
    echo "| **Base violations** | ${base_count} |"
    echo "| **New** | ${new_count} |"
    echo "| **Resolved** | ${resolved_count} |"
    if [ "${suppressed_count}" -gt 0 ] 2>/dev/null; then
      echo "| **Suppressed** | ${suppressed_count} |"
    fi

    # New violations detail
    local new_violations_count
    new_violations_count=$(echo "${diff}" | jq '.new_violations // [] | length')
    if [ "${new_violations_count}" -gt 0 ]; then
      echo ""
      echo "<details>"
      echo "<summary>New violations (${new_violations_count})</summary>"
      echo ""
      echo "| File | Line | Rule | Severity | Message |"
      echo "|------|------|------|----------|---------|"
      echo "${diff}" | jq -r '.new_violations[] | "| `\(.file_path)` | \(.line) | \(.rule_id) | \(.severity) | \(.message) |"'
      echo ""
      echo "</details>"
    fi
  else
    # No diff data
    local total_violations error_count warning_count
    total_violations=$(echo "${result}" | jq -r '.total_violations // 0')
    error_count=$(echo "${result}" | jq -r '.error_count // 0')
    warning_count=$(echo "${result}" | jq -r '.warning_count // 0')

    echo "| Metric | Value |"
    echo "|--------|-------|"
    echo "| **Total violations** | ${total_violations} |"
    echo "| **Errors** | ${error_count} |"
    echo "| **Warnings** | ${warning_count} |"
  fi

  echo ""
  local result_label="Passed"
  if [ "${EXIT_CODE}" -ne 0 ]; then
    result_label="Failed"
  fi
  local footer="> **Result: ${result_label}**"
  if [ -n "${drape_url}" ]; then
    footer="${footer} | [View in Drape](${drape_url})"
  fi
  echo "${footer}"
  echo ">"
  echo "> *drape-io/drape-action*"
}

# Generate the comment body
BODY_FILE=$(mktemp)
trap 'rm -f "${BODY_FILE}"' EXIT

case "${INPUT_COMMAND}" in
  coverage) generate_coverage_comment > "${BODY_FILE}" ;;
  tests)    generate_tests_comment > "${BODY_FILE}" ;;
  scan)     generate_scan_comment > "${BODY_FILE}" ;;
  lint)     generate_lint_comment > "${BODY_FILE}" ;;
  *)
    echo "::warning::Unknown command '${INPUT_COMMAND}' — skipping comment generation"
    exit 0
    ;;
esac

# Set the body output using a multiline delimiter
{
  echo "body<<DRAPE_COMMENT_EOF"
  cat "${BODY_FILE}"
  echo "DRAPE_COMMENT_EOF"
} >> "${GITHUB_OUTPUT}"
