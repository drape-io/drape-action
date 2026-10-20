import type {
	CoverageDiff,
	CoverageResult,
	CveCounts,
	CveEntry,
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

function titleWithGroup(base: string, group?: string): string {
	return group ? `${base} — ${group}` : base;
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
	const result = uploads[0]?.result as CoverageResult | null;
	const title = commentTitle ?? titleWithGroup("Drape: Coverage Report", group);
	if (!result) {
		const msg =
			exitCode !== 0
				? "> :x: **Upload failed** — no result was produced"
				: "> Upload completed but no result data available yet.";
		return lines(`## ${title}`, "", msg);
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
		return `> :x: **Coverage check failed**${detail}`;
	}

	if (diff.regressed_lines_count > 0) {
		return `> :white_check_mark: **Coverage check passed** — ${diff.regressed_lines_count} regressed line(s) detected`;
	}

	return "> :white_check_mark: **Coverage check passed** — no regressions detected";
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
	const title = commentTitle ?? titleWithGroup("Drape: Test Results", group);
	const out: string[] = [`## ${title}`, ""];

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
	let nonActionableTotal = 0;
	let unsuppressedTotal = 0;
	let newUnknown = 0;
	let unchangedTotal = 0;
	let failureReasons: string[] = [];
	// Grouped per upload: a CVE in two uploads is two rows, as it is two
	// in the summed counts.
	const newGroups: CveGroup[] = [];
	const existingGroups: CveGroup[] = [];
	let existingFindings = 0;
	let hasExistingList = false;
	const resolvedGroups: CveGroup[] = [];
	let allSlaViolations: ScanDiff["sla_violations"] = [];
	let scanName = "";
	// Per-CVE counts, used only when every diff has them, so a mix of old
	// and new servers never adds CVEs to package findings.
	const cveCounts: CveCounts = {
		new: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
		existing: 0,
		suppressed: 0,
		no_fix: 0,
	};
	let countsByCve = true;

	for (const upload of uploads) {
		const r = upload.result as ScanResult | null;
		if (!r) continue;
		if (!scanName && r.scan_name) scanName = r.scan_name;
		unsuppressedTotal += r.unsuppressed_vulnerabilities ?? 0;

		const diff = r.scan_diff;
		if (diff) {
			hasDiff = true;
			newCritical += diff.new_critical_count;
			newHigh += diff.new_high_count;
			newMedium += diff.new_medium_count;
			newLow += diff.new_low_count;
			newUnknown += diff.new_unknown_count ?? 0;
			suppressedTotal += diff.suppressed_cves_count;
			nonActionableTotal += diff.non_actionable_cves_count ?? 0;
			// A passing diff's reasons are informational notes, not failures.
			if (diff.passed === false) {
				failureReasons = failureReasons.concat(diff.failure_reasons ?? []);
			}
			unchangedTotal += diff.unchanged_cves_count;
			newGroups.push(...groupByCve(diff.new_cves ?? []));
			if (diff.existing_actionable_cves) {
				hasExistingList = true;
				existingFindings += diff.existing_actionable_cves.length;
				existingGroups.push(...groupByCve(diff.existing_actionable_cves));
			}
			resolvedGroups.push(...groupByCve(diff.resolved_cves ?? []));
			allSlaViolations = allSlaViolations.concat(diff.sla_violations ?? []);
			if (diff.cve_counts) {
				for (const sev of Object.keys(cveCounts.new) as Array<
					keyof CveCounts["new"]
				>) {
					cveCounts.new[sev] += diff.cve_counts.new[sev] ?? 0;
				}
				cveCounts.existing += diff.cve_counts.existing;
				cveCounts.suppressed += diff.cve_counts.suppressed;
				cveCounts.no_fix += diff.cve_counts.no_fix;
			} else {
				countsByCve = false;
			}
		}
	}
	countsByCve = countsByCve && hasDiff;
	if (countsByCve) {
		({
			critical: newCritical,
			high: newHigh,
			medium: newMedium,
			low: newLow,
			unknown: newUnknown,
		} = cveCounts.new);
		suppressedTotal = cveCounts.suppressed;
		nonActionableTotal = cveCounts.no_fix;
	}

	const drapeUrl = uploads[0]?.drape_url ?? "";
	const defaultTitle = scanName
		? `Drape: Security Scan — ${scanName}`
		: "Drape: Security Scan";
	const header = `## ${commentTitle ?? defaultTitle}`;
	const out: string[] = [header, ""];

	if (hasDiff) {
		const totalNew = newCritical + newHigh + newMedium + newLow;

		if (totalNew === 0 && exitCode !== 0) {
			// The check can fail without new CVEs, e.g. on an SLA breach. The
			// header must not read as a pass above a failed result.
			out.push("> :x: **No new vulnerabilities, but the scan check failed**");
			if (failureReasons.length > 0) {
				out.push(">");
				for (const reason of failureReasons) {
					out.push(`> - ${reason}`);
				}
			} else {
				out.push(">", "> See the job log for the reason.");
			}
		} else if (totalNew === 0) {
			out.push("> :white_check_mark: **No new vulnerabilities found**");
		} else {
			const parts: string[] = [];
			if (newCritical > 0) parts.push(`${newCritical} critical`);
			if (newHigh > 0) parts.push(`${newHigh} high`);
			if (newMedium > 0) parts.push(`${newMedium} medium`);
			if (newLow > 0) parts.push(`${newLow} low`);
			out.push(
				`> :warning: **${totalNew} new ${totalNew === 1 ? "vulnerability" : "vulnerabilities"} found** (${parts.join(", ")})`,
			);
		}

		// Gating on new CVEs must not hide older ones that still need action.
		// Prefer the server's per-CVE count, then its per-package list, the
		// unit of the headline in that case; the oldest servers only let us
		// derive a count.
		const existing = countsByCve
			? cveCounts.existing
			: hasExistingList
				? existingFindings
				: unsuppressedTotal - totalNew - newUnknown;
		if (existing > 0) {
			out.push(
				"",
				`> :warning: **${existing} existing ${existing === 1 ? "vulnerability still needs" : "vulnerabilities still need"} action.** ${existing === 1 ? "It predates" : "They predate"} this change, so ${existing === 1 ? "it doesn't" : "they don't"} block it.`,
			);
		}
		out.push("");

		// The server's unchanged count is per package; there is no per-CVE
		// equivalent, and the existing line above already names the ones
		// that matter.
		if (countsByCve) {
			out.push(
				"| Severity | New | Suppressed |",
				"|----------|-----|------------|",
				`| Critical | ${newCritical} | — |`,
				`| High | ${newHigh} | — |`,
				`| Medium | ${newMedium} | — |`,
				`| Low | ${newLow} | — |`,
				`| **Total** | **${totalNew}** | **${suppressedTotal}** |`,
			);
		} else {
			out.push(
				"| Severity | New | Suppressed | Unchanged |",
				"|----------|-----|------------|-----------|",
				`| Critical | ${newCritical} | — | — |`,
				`| High | ${newHigh} | — | — |`,
				`| Medium | ${newMedium} | — | — |`,
				`| Low | ${newLow} | — | — |`,
				`| **Total** | **${totalNew}** | **${suppressedTotal}** | **${unchangedTotal}** |`,
			);
		}

		if (nonActionableTotal > 0) {
			out.push(
				"",
				countsByCve
					? `${nonActionableTotal} new ${nonActionableTotal === 1 ? "CVE has" : "CVEs have"} no fix upstream (won't fix or not affected). They are listed below but don't block.`
					: `${nonActionableTotal} won't-fix finding(s) have no upstream fix. They are listed below but don't block.`,
			);
		}

		pushCveTable(out, "New vulnerabilities", newGroups, true);
		pushCveTable(
			out,
			"Existing vulnerabilities that still need action",
			existingGroups,
			true,
		);
		pushCveTable(out, "Resolved vulnerabilities", resolvedGroups, false);

		const overdue = groupSlaViolations(allSlaViolations);
		if (overdue.length > 0) {
			out.push(
				"",
				"> [!WARNING]",
				`> **SLA Violations (${overdue.length})**`,
				">",
				"> | CVE | Severity | Packages | Overdue |",
				"> |-----|----------|----------|---------|",
			);
			for (const v of overdue) {
				out.push(
					`> | ${v.cve_id} | ${v.severity.toUpperCase()} | ${v.packages.join(", ")} | ${v.days_overdue} days |`,
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

const SEVERITY_RANK: Record<string, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
	negligible: 4,
	unknown: 5,
};

function severityRank(severity: string): number {
	return SEVERITY_RANK[severity] ?? Object.keys(SEVERITY_RANK).length;
}

interface CveGroup {
	cve_id: string;
	severity: string;
	packages: string[];
	fixes: string[];
}

// The server lists one entry per (CVE, package) pair. Readers think in CVEs,
// so a CVE that hits several packages becomes one row listing them all,
// under its highest severity.
function groupByCve(entries: CveEntry[]): CveGroup[] {
	const groups = new Map<string, CveGroup>();
	for (const e of entries) {
		let group = groups.get(e.cve_id);
		if (!group) {
			group = {
				cve_id: e.cve_id,
				severity: e.severity,
				packages: [],
				fixes: [],
			};
			groups.set(e.cve_id, group);
		} else if (severityRank(e.severity) < severityRank(group.severity)) {
			group.severity = e.severity;
		}
		group.packages.push(`${e.package_name}@${e.package_version}`);
		group.fixes.push(e.fix_state ?? "—");
	}
	return [...groups.values()];
}

function pushCveTable(
	out: string[],
	title: string,
	groups: CveGroup[],
	withFix: boolean,
): void {
	if (groups.length === 0) return;
	out.push(
		"",
		"<details>",
		`<summary>${title} (${groups.length})</summary>`,
		"",
		withFix
			? "| CVE | Severity | Packages | Fix |"
			: "| CVE | Severity | Packages |",
		withFix
			? "|-----|----------|----------|-----|"
			: "|-----|----------|----------|",
	);
	for (const g of groups) {
		const cells = [
			`[${g.cve_id}](https://nvd.nist.gov/vuln/detail/${g.cve_id})`,
			g.severity.toUpperCase(),
			g.packages.join("<br>"),
		];
		if (withFix) cells.push(g.fixes.join("<br>"));
		out.push(`| ${cells.join(" | ")} |`);
	}
	out.push("", "</details>");
}

function groupSlaViolations(violations: ScanDiff["sla_violations"]) {
	const groups = new Map<
		string,
		{
			cve_id: string;
			severity: string;
			packages: string[];
			days_overdue: number;
		}
	>();
	for (const v of violations) {
		const group = groups.get(v.cve_id);
		if (!group) {
			groups.set(v.cve_id, {
				cve_id: v.cve_id,
				severity: v.severity,
				packages: [v.package_name],
				days_overdue: v.days_overdue,
			});
			continue;
		}
		group.packages.push(v.package_name);
		group.days_overdue = Math.max(group.days_overdue, v.days_overdue);
		if (severityRank(v.severity) < severityRank(group.severity)) {
			group.severity = v.severity;
		}
	}
	return [...groups.values()];
}

// --- Lint ---

function generateLintComment(
	uploads: Upload[],
	exitCode: number,
	group?: string,
	commentTitle?: string,
): string {
	const result = uploads[0]?.result as LintResult | null;
	if (!result) {
		const msg =
			exitCode !== 0
				? "> :x: **Upload failed** — no result was produced"
				: "> Upload completed but no result data available yet.";
		return lines(
			`## ${commentTitle ?? titleWithGroup("Drape: Lint Report", group)}`,
			"",
			msg,
		);
	}

	const drapeUrl = uploads[0]?.drape_url ?? "";
	const diff = result.lint_diff;
	const title = commentTitle ?? titleWithGroup("Drape: Lint Report", group);
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
		return `> :x: **Lint check failed**${detail}`;
	}
	return "> :white_check_mark: **Lint check passed**";
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

export function formatRate(value: string): string {
	const num = Number.parseFloat(value);
	if (Number.isNaN(num)) return value;
	// Drop unnecessary trailing zeros: "84.50" → "84.5", "84.00" → "84"
	return num.toFixed(2).replace(/\.?0+$/, "");
}

function lines(...parts: string[]): string {
	return parts.join("\n");
}
