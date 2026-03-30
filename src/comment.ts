import type {
	CoverageDiff,
	DrapeCliResponse,
	FlakyTest,
	LintDiff,
	ScanDiff,
	Upload,
} from "./types.js";
import { asCoverage, asLint, asScan, asTests } from "./types.js";

type Command = "coverage" | "tests" | "scan" | "lint";

const EMOJI_PASS = ":white_check_mark:";
const EMOJI_FAIL = ":x:";
const EMOJI_WARN = ":warning:";

function titleWithGroup(base: string, group?: string): string {
	return group ? `${base} — ${group}` : base;
}

function nullResultFallback(title: string, exitCode: number): string {
	const msg =
		exitCode !== 0
			? `> ${EMOJI_FAIL} **Upload failed** — no result was produced`
			: "> Upload completed but no result data available yet.";
	return lines(`## ${title}`, "", msg);
}

/**
 * Generate a markdown PR comment for the given command and CLI response.
 * Returns empty string if no comment should be generated.
 */
export function generateComment(
	command: Command,
	exitCode: number,
	response: DrapeCliResponse,
	stderr: string,
	group?: string,
	commentTitle?: string,
): string {
	const uploads = response.uploads ?? [];
	const hasUploads = uploads.length > 0;

	if (!hasUploads && exitCode !== 0) {
		return generateErrorComment(command, exitCode, stderr, group, commentTitle);
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
				group,
				commentTitle,
			);
		case "tests":
			return generateTestsComment(uploads, exitCode, group, commentTitle);
		case "scan":
			return generateScanComment(uploads, exitCode, commentTitle);
		case "lint":
			return generateLintComment(uploads, exitCode, group, commentTitle);
	}
}

// --- Coverage ---

function generateCoverageComment(
	uploads: Upload[],
	exitCode: number,
	filesUploaded?: number,
	group?: string,
	commentTitle?: string,
): string {
	// For batch uploads, the CLI attaches the merged result to uploads[0]
	const result = asCoverage(uploads[0]?.result);
	const title = commentTitle ?? titleWithGroup("Drape: Coverage Report", group);
	if (!result) {
		return nullResultFallback(title, exitCode);
	}

	const drapeUrl = uploads[0]?.drape_url ?? "";
	const diff = result.coverage_diff;
	const header =
		filesUploaded != null && filesUploaded > 1
			? `## ${title} (${filesUploaded} files merged)`
			: `## ${title}`;
	const out: string[] = [header, ""];

	if (diff) {
		out.push(coverageSummaryLine(diff));
		out.push("");

		const delta = Number.parseFloat(diff.coverage_delta);
		const hasChange = delta !== 0;

		if (hasChange) {
			const improved = delta > 0;
			out.push(
				"```diff",
				`${improved ? "-" : "+"} Target branch coverage:  ${formatRate(diff.base_coverage_rate)}%`,
				`${improved ? "+" : "-"} This PR coverage:        ${formatRate(diff.head_coverage_rate)}% (${formatRate(diff.coverage_delta)}%)`,
			);
		} else {
			out.push(
				"```diff",
				`  Target branch coverage:  ${formatRate(diff.base_coverage_rate)}%`,
				`  This PR coverage:        ${formatRate(diff.head_coverage_rate)}%`,
			);
		}
		if (diff.new_lines_total > 0) {
			out.push(
				`  New code coverage: ${formatRate(diff.new_code_coverage_rate)}% (${diff.new_lines_covered}/${diff.new_lines_total} lines)`,
			);
		}
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
		return `> ${EMOJI_FAIL} **Coverage check failed**${detail}`;
	}

	if (diff.regressed_lines_count > 0) {
		return `> ${EMOJI_PASS} **Coverage check passed** — ${diff.regressed_lines_count} regressed line(s) detected`;
	}

	return `> ${EMOJI_PASS} **Coverage check passed** — no regressions detected`;
}

// --- Tests ---

function generateTestsComment(
	uploads: Upload[],
	exitCode: number,
	group?: string,
	commentTitle?: string,
): string {
	let totalIngested = 0;
	let totalFailed = 0;
	let totalSuppressed = 0;
	let totalUnsuppressed = 0;
	let totalFlaky = 0;
	let allFlakyTests: FlakyTest[] = [];
	let hasResults = false;

	for (const upload of uploads) {
		const r = asTests(upload.result);
		if (!r) continue;
		hasResults = true;
		totalIngested += r.tests_ingested ?? 0;
		totalFailed += r.failed_count ?? 0;
		totalSuppressed += r.suppressed_count ?? 0;
		totalUnsuppressed += r.unsuppressed_failure_count ?? 0;
		totalFlaky += r.flaky_count ?? 0;
		allFlakyTests = allFlakyTests.concat(r.flaky_tests ?? []);
	}

	const title = commentTitle ?? titleWithGroup("Drape: Test Results", group);
	if (!hasResults) {
		return nullResultFallback(title, exitCode);
	}

	const drapeUrl = uploads[0]?.drape_url ?? "";
	const out: string[] = [`## ${title}`, ""];

	// Summary line
	if (totalUnsuppressed > 0) {
		out.push(
			`> ${EMOJI_FAIL} **${totalUnsuppressed} unsuppressed test failure(s)**`,
		);
	} else if (totalFailed > 0 && totalUnsuppressed === 0) {
		out.push(
			`> ${EMOJI_PASS} **All ${totalFailed} failure(s) are suppressed** — passing CI`,
		);
	} else {
		out.push(`> ${EMOJI_PASS} **All tests passed**`);
	}

	// Flaky note
	if (totalFlaky > 0) {
		out.push("");
		out.push(
			`> ${EMOJI_WARN} **${totalFlaky} known flaky test(s) failed** — these are tracked but not blocking CI`,
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

function generateScanComment(
	uploads: Upload[],
	exitCode: number,
	commentTitle?: string,
): string {
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
	let hasResults = false;

	for (const upload of uploads) {
		const r = asScan(upload.result);
		if (!r) continue;
		hasResults = true;
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

	const defaultTitle = scanName
		? `Drape: Security Scan — ${scanName}`
		: "Drape: Security Scan";
	const title = commentTitle ?? defaultTitle;
	if (!hasResults) {
		return nullResultFallback(title, exitCode);
	}

	const drapeUrl = uploads[0]?.drape_url ?? "";
	const header = `## ${title}`;
	const out: string[] = [header, ""];

	if (hasDiff) {
		const totalNew = newCritical + newHigh + newMedium + newLow;

		if (totalNew === 0) {
			out.push(`> ${EMOJI_PASS} **No new vulnerabilities found**`);
		} else {
			const parts: string[] = [];
			if (newCritical > 0) parts.push(`${newCritical} critical`);
			if (newHigh > 0) parts.push(`${newHigh} high`);
			if (newMedium > 0) parts.push(`${newMedium} medium`);
			if (newLow > 0) parts.push(`${newLow} low`);
			out.push(
				`> ${EMOJI_WARN} **${totalNew} new vulnerabilities found** (${parts.join(", ")})`,
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
		const r = asScan(uploads[0]?.result);
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

function generateLintComment(
	uploads: Upload[],
	exitCode: number,
	group?: string,
	commentTitle?: string,
): string {
	const result = asLint(uploads[0]?.result);
	const title = commentTitle ?? titleWithGroup("Drape: Lint Report", group);
	if (!result) {
		return nullResultFallback(title, exitCode);
	}

	const drapeUrl = uploads[0]?.drape_url ?? "";
	const diff = result.lint_diff;
	const out: string[] = [`## ${title}`, ""];

	if (diff) {
		out.push(lintSummaryLine(diff));
		out.push("");

		const hasChange = diff.base_violation_count !== diff.head_violation_count;

		if (hasChange) {
			const improved = diff.head_violation_count < diff.base_violation_count;
			out.push(
				"```diff",
				`${improved ? "-" : "+"} Target branch violations:  ${diff.base_violation_count}`,
				`${improved ? "+" : "-"} This PR violations:        ${diff.head_violation_count}`,
			);
			if (diff.new_violation_count > 0) {
				out.push(`- New:              ${diff.new_violation_count}`);
			}
			if (diff.resolved_violation_count > 0) {
				out.push(`+ Resolved:         ${diff.resolved_violation_count}`);
			}
			out.push("```");
		} else {
			out.push(`Violations: **${diff.head_violation_count}**`);
		}

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
		return `> ${EMOJI_FAIL} **Lint check failed**${detail}`;
	}
	return `> ${EMOJI_PASS} **Lint check passed**`;
}

// --- Error ---

export function generateErrorComment(
	command: Command,
	exitCode: number,
	stderr: string,
	group?: string,
	commentTitle?: string,
): string {
	const titles: Record<Command, string> = {
		coverage: "Coverage Report",
		tests: "Test Results",
		scan: "Security Scan",
		lint: "Lint Report",
	};

	const title =
		commentTitle ?? titleWithGroup(`Drape: ${titles[command]}`, group);
	const out: string[] = [
		`## ${title}`,
		"",
		`> ${EMOJI_FAIL} **Upload failed** with exit code ${exitCode}`,
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

export function formatRate(value: string): string {
	const num = Number.parseFloat(value);
	if (Number.isNaN(num)) return value;
	// Drop unnecessary trailing zeros: "84.50" → "84.5", "84.00" → "84"
	return num.toFixed(2).replace(/\.?0+$/, "");
}

function lines(...parts: string[]): string {
	return parts.join("\n");
}
