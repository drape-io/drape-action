import type {
	CoverageDiff,
	CoverageResult,
	DrapeCliResponse,
	FlakyTest,
	LintDiff,
	LintResult,
	ScanDiff,
	ScanResult,
	TestsResult,
	Upload,
} from "./types.js";

type Command = "coverage" | "tests" | "scan" | "lint";

/**
 * Generate a markdown PR comment for the given command and CLI response.
 * Returns empty string if no comment should be generated.
 */
export function generateComment(
	command: Command,
	exitCode: number,
	response: DrapeCliResponse,
	stderr: string,
): string {
	const uploads = response.uploads ?? [];
	const hasUploads = uploads.length > 0;

	if (!hasUploads && exitCode !== 0) {
		return generateErrorComment(command, exitCode, stderr);
	}

	if (!hasUploads) {
		return "";
	}

	switch (command) {
		case "coverage":
			return generateCoverageComment(
				uploads,
				exitCode,
				response.files_uploaded,
			);
		case "tests":
			return generateTestsComment(uploads, exitCode);
		case "scan":
			return generateScanComment(uploads, exitCode);
		case "lint":
			return generateLintComment(uploads, exitCode);
	}
}

// --- Coverage ---

function generateCoverageComment(
	uploads: Upload[],
	exitCode: number,
	filesUploaded?: number,
): string {
	// For batch uploads, the CLI attaches the merged result to uploads[0]
	const result = uploads[0]?.result as CoverageResult | null;
	if (!result) {
		return lines(
			"## Drape: Coverage Report",
			"",
			"> Upload completed but no result data available yet.",
		);
	}

	const drapeUrl = uploads[0]?.drape_url ?? "";
	const diff = result.coverage_diff;
	const header =
		filesUploaded != null && filesUploaded > 1
			? `## Drape: Coverage Report (${filesUploaded} files merged)`
			: "## Drape: Coverage Report";
	const out: string[] = [header, ""];

	if (diff) {
		out.push(coverageSummaryLine(diff));
		out.push("");

		out.push(
			"```diff",
			`- Base coverage:     ${formatRate(diff.base_coverage_rate)}%`,
			`+ Head coverage:     ${formatRate(diff.head_coverage_rate)}% (${formatRate(diff.coverage_delta)}%)`,
			`  New code coverage: ${formatRate(diff.new_code_coverage_rate)}% (${diff.new_lines_covered}/${diff.new_lines_total} lines)`,
		);
		if (diff.regressed_lines_count > 0) {
			out.push(`! Regressed lines:   ${diff.regressed_lines_count}`);
		}
		out.push("```");

		const regressedFiles = diff.regressed_files ?? [];
		if (regressedFiles.length > 0) {
			out.push("");
			out.push(
				"<details>",
				`<summary>Regressed files (${regressedFiles.length} file(s), ${diff.regressed_lines_count} lines)</summary>`,
				"",
				"| File | Lines | Ranges |",
				"|------|-------|--------|",
			);
			for (const f of regressedFiles) {
				const ranges = (f.regressed_line_ranges ?? [])
					.map(([start, end]) => `L${start}-${end}`)
					.join(", ");
				out.push(`| \`${f.file_path}\` | ${f.regressed_lines} | ${ranges} |`);
			}
			out.push("", "</details>");
		}
	} else {
		const rate = result.coverage_rate ?? "—";
		const fileCount = result.file_count ?? "—";
		out.push(
			"| Metric | Value |",
			"|--------|-------|",
			`| Coverage | ${rate}% |`,
			`| Files | ${fileCount} |`,
		);
	}

	out.push("", footer(exitCode, drapeUrl));
	return lines(...out);
}

function coverageSummaryLine(diff: CoverageDiff): string {
	if (diff.passed === false) {
		const reasons = (diff.failure_reasons ?? []).join(", ");
		const detail = reasons ? `: ${reasons}` : "";
		return `> :x: **Coverage check failed**${detail}`;
	}

	if (diff.regressed_lines_count > 0) {
		return `> :white_check_mark: **Coverage check passed** — ${diff.regressed_lines_count} regressed line(s) detected`;
	}

	return "> :white_check_mark: **Coverage check passed** — no regressions detected";
}

// --- Tests ---

function generateTestsComment(uploads: Upload[], exitCode: number): string {
	let totalIngested = 0;
	let totalFailed = 0;
	let totalSuppressed = 0;
	let totalUnsuppressed = 0;
	let totalFlaky = 0;
	let allFlakyTests: FlakyTest[] = [];

	for (const upload of uploads) {
		const r = upload.result as TestsResult | null;
		if (!r) continue;
		totalIngested += r.tests_ingested ?? 0;
		totalFailed += r.failed_count ?? 0;
		totalSuppressed += r.suppressed_count ?? 0;
		totalUnsuppressed += r.unsuppressed_failure_count ?? 0;
		totalFlaky += r.flaky_count ?? 0;
		allFlakyTests = allFlakyTests.concat(r.flaky_tests ?? []);
	}

	const drapeUrl = uploads[0]?.drape_url ?? "";
	const out: string[] = ["## Drape: Test Results", ""];

	// Summary line
	if (totalUnsuppressed > 0) {
		out.push(`> :x: **${totalUnsuppressed} unsuppressed test failure(s)**`);
	} else if (totalFailed > 0 && totalUnsuppressed === 0) {
		out.push(
			`> :white_check_mark: **All ${totalFailed} failure(s) are suppressed** — passing CI`,
		);
	} else {
		out.push("> :white_check_mark: **All tests passed**");
	}

	// Flaky note
	if (totalFlaky > 0) {
		out.push("");
		out.push(
			`> :warning: **${totalFlaky} known flaky test(s) failed** — these are tracked but not blocking CI`,
		);
	}

	out.push("");

	out.push(
		"| Metric | Count |",
		"|--------|-------|",
		`| Tests ingested | ${totalIngested} |`,
		`| Failed | ${totalFailed} |`,
		`| Suppressed | ${totalSuppressed} |`,
		`| Unsuppressed | ${totalUnsuppressed} |`,
	);
	if (totalFlaky > 0) {
		out.push(`| Flaky | ${totalFlaky} |`);
	}

	if (allFlakyTests.length > 0) {
		out.push("");
		out.push(
			"<details>",
			`<summary>Flaky tests (${allFlakyTests.length})</summary>`,
			"",
			"| Test | Suite | Flake rate |",
			"|------|-------|------------|",
		);
		for (const t of allFlakyTests) {
			const rate =
				t.flake_rate != null ? `${Math.round(t.flake_rate * 100)}%` : "—";
			out.push(`| ${t.name} | ${t.suite ?? "—"} | ${rate} |`);
		}
		out.push("", "</details>");
	}

	out.push("", footer(exitCode, drapeUrl));
	return lines(...out);
}

// --- Scan ---

function generateScanComment(uploads: Upload[], exitCode: number): string {
	let hasDiff = false;
	let newCritical = 0;
	let newHigh = 0;
	let newMedium = 0;
	let newLow = 0;
	let suppressedTotal = 0;
	let unchangedTotal = 0;
	let allNewCves: ScanDiff["new_cves"] = [];
	let allResolvedCves: ScanDiff["resolved_cves"] = [];
	let allSlaViolations: ScanDiff["sla_violations"] = [];
	let scanName = "";

	for (const upload of uploads) {
		const r = upload.result as ScanResult | null;
		if (!r) continue;
		if (!scanName && r.scan_name) scanName = r.scan_name;

		const diff = r.scan_diff;
		if (diff) {
			hasDiff = true;
			newCritical += diff.new_critical_count;
			newHigh += diff.new_high_count;
			newMedium += diff.new_medium_count;
			newLow += diff.new_low_count;
			suppressedTotal += diff.suppressed_cves_count;
			unchangedTotal += diff.unchanged_cves_count;
			allNewCves = allNewCves.concat(diff.new_cves ?? []);
			allResolvedCves = allResolvedCves.concat(diff.resolved_cves ?? []);
			allSlaViolations = allSlaViolations.concat(diff.sla_violations ?? []);
		}
	}

	const drapeUrl = uploads[0]?.drape_url ?? "";
	const header = scanName
		? `## Drape: Security Scan — ${scanName}`
		: "## Drape: Security Scan";
	const out: string[] = [header, ""];

	if (hasDiff) {
		const totalNew = newCritical + newHigh + newMedium + newLow;

		if (totalNew === 0) {
			out.push("> :white_check_mark: **No new vulnerabilities found**");
		} else {
			const parts: string[] = [];
			if (newCritical > 0) parts.push(`${newCritical} critical`);
			if (newHigh > 0) parts.push(`${newHigh} high`);
			if (newMedium > 0) parts.push(`${newMedium} medium`);
			if (newLow > 0) parts.push(`${newLow} low`);
			out.push(
				`> :warning: **${totalNew} new vulnerabilities found** (${parts.join(", ")})`,
			);
		}
		out.push("");

		out.push(
			"| Severity | New | Suppressed | Unchanged |",
			"|----------|-----|------------|-----------|",
			`| Critical | ${newCritical} | — | — |`,
			`| High | ${newHigh} | — | — |`,
			`| Medium | ${newMedium} | — | — |`,
			`| Low | ${newLow} | — | — |`,
			`| **Total** | **${totalNew}** | **${suppressedTotal}** | **${unchangedTotal}** |`,
		);

		if (allNewCves.length > 0) {
			out.push("");
			out.push(
				"<details>",
				`<summary>New vulnerabilities (${allNewCves.length})</summary>`,
				"",
				"| CVE | Severity | Package | Fix |",
				"|-----|----------|---------|-----|",
			);
			for (const cve of allNewCves) {
				out.push(
					`| [${cve.cve_id}](https://nvd.nist.gov/vuln/detail/${cve.cve_id}) | ${cve.severity.toUpperCase()} | ${cve.package_name}@${cve.package_version} | ${cve.fix_state ?? "—"} |`,
				);
			}
			out.push("", "</details>");
		}

		if (allResolvedCves.length > 0) {
			out.push("");
			out.push(
				"<details>",
				`<summary>Resolved vulnerabilities (${allResolvedCves.length})</summary>`,
				"",
				"| CVE | Severity | Package |",
				"|-----|----------|---------|",
			);
			for (const cve of allResolvedCves) {
				out.push(
					`| ${cve.cve_id} | ${cve.severity.toUpperCase()} | ${cve.package_name}@${cve.package_version} |`,
				);
			}
			out.push("", "</details>");
		}

		if (allSlaViolations.length > 0) {
			out.push(
				"",
				"> [!WARNING]",
				`> **SLA Violations (${allSlaViolations.length})**`,
				">",
				"> | CVE | Severity | Package | Overdue |",
				"> |-----|----------|---------|---------|",
			);
			for (const v of allSlaViolations) {
				out.push(
					`> | ${v.cve_id} | ${v.severity.toUpperCase()} | ${v.package_name} | ${v.days_overdue} days |`,
				);
			}
		}
	} else {
		// No diff data — show totals
		const r = uploads[0]?.result as ScanResult | null;
		const totalVulns = r?.total_vulnerabilities ?? 0;
		const highest =
			r?.unsuppressed_highest_severity ?? r?.highest_severity ?? "none";

		out.push(
			"| Metric | Value |",
			"|--------|-------|",
			`| Total vulnerabilities | ${totalVulns} |`,
			`| Highest severity | ${highest} |`,
		);
	}

	out.push("", footer(exitCode, drapeUrl));
	return lines(...out);
}

// --- Lint ---

function generateLintComment(uploads: Upload[], exitCode: number): string {
	const result = uploads[0]?.result as LintResult | null;
	if (!result) {
		return lines(
			"## Drape: Lint Report",
			"",
			"> Upload completed but no result data available yet.",
		);
	}

	const drapeUrl = uploads[0]?.drape_url ?? "";
	const diff = result.lint_diff;
	const out: string[] = ["## Drape: Lint Report", ""];

	if (diff) {
		out.push(lintSummaryLine(diff));
		out.push("");

		out.push(
			"```diff",
			`- Base violations:  ${diff.base_violation_count}`,
			`+ Head violations:  ${diff.head_violation_count}`,
		);
		if (diff.new_violation_count > 0) {
			out.push(`+ New:              ${diff.new_violation_count}`);
		}
		if (diff.resolved_violation_count > 0) {
			out.push(`- Resolved:         ${diff.resolved_violation_count}`);
		}
		out.push("```");

		const newViolations = diff.new_violations ?? [];
		if (newViolations.length > 0) {
			out.push(
				"",
				"<details>",
				`<summary>New violations (${newViolations.length})</summary>`,
				"",
				"| File | Line | Rule | Severity | Message |",
				"|------|------|------|----------|---------|",
			);
			for (const v of newViolations) {
				out.push(
					`| \`${v.file_path}\` | ${v.line} | ${v.rule_id} | ${v.severity} | ${v.message} |`,
				);
			}
			out.push("", "</details>");
		}
	} else {
		const totalViolations = result.total_violations ?? 0;
		const errorCount = result.error_count ?? 0;
		const warningCount = result.warning_count ?? 0;

		out.push(
			"| Metric | Value |",
			"|--------|-------|",
			`| Total violations | ${totalViolations} |`,
			`| Errors | ${errorCount} |`,
			`| Warnings | ${warningCount} |`,
		);
	}

	out.push("", footer(exitCode, drapeUrl));
	return lines(...out);
}

function lintSummaryLine(diff: LintDiff): string {
	if (diff.passed === false) {
		const reasons = (diff.failure_reasons ?? []).join(", ");
		const detail = reasons ? ` — ${reasons}` : "";
		return `> :x: **Lint check failed**${detail}`;
	}
	return "> :white_check_mark: **Lint check passed**";
}

// --- Error ---

export function generateErrorComment(
	command: Command,
	exitCode: number,
	stderr: string,
): string {
	const titles: Record<Command, string> = {
		coverage: "Coverage Report",
		tests: "Test Results",
		scan: "Security Scan",
		lint: "Lint Report",
	};

	const out: string[] = [
		`## Drape: ${titles[command]}`,
		"",
		`> :x: **Upload failed** with exit code ${exitCode}`,
	];

	if (stderr.trim()) {
		out.push(
			"",
			"<details>",
			"<summary>Error output</summary>",
			"",
			"```",
			stderr.trim(),
			"```",
			"",
			"</details>",
		);
	}

	out.push("", "> *drape-io/drape-action*");
	return lines(...out);
}

// --- Helpers ---

function footer(exitCode: number, drapeUrl: string): string {
	const label = exitCode === 0 ? "Passed" : "Failed";
	if (drapeUrl) {
		return `> [View full report in Drape](${drapeUrl}) · **Result: ${label}** · *drape-io/drape-action*`;
	}
	return `> **Result: ${label}** · *drape-io/drape-action*`;
}

function formatRate(value: string): string {
	const num = Number.parseFloat(value);
	if (Number.isNaN(num)) return value;
	// Drop unnecessary trailing zeros: "84.50" → "84.5", "84.00" → "84"
	return num.toFixed(2).replace(/\.?0+$/, "");
}

function lines(...parts: string[]): string {
	return parts.join("\n");
}
