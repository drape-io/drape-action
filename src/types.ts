// Top-level CLI response
export interface DrapeCliResponse {
	uploads: Upload[];
	files_matched?: number;
	files_uploaded?: number;
}

export interface Upload {
	drape_url: string;
	result: UploadResult | null;
}

// The result field is polymorphic based on command type.
// We use a union — consumers narrow based on which fields are present.
export type UploadResult =
	| CoverageResult
	| TestsResult
	| ScanResult
	| LintResult;

// --- Coverage ---

export interface CoverageResult {
	coverage_diff?: CoverageDiff;
	coverage_rate?: string;
	file_count?: string;
}

export interface CoverageDiff {
	passed: boolean;
	failure_reasons?: string[];
	head_coverage_rate: string;
	base_coverage_rate: string;
	coverage_delta: string;
	new_lines_total: number;
	new_lines_covered: number;
	new_code_coverage_rate: string;
	regressed_lines_count: number;
	regressed_files: RegressedFile[] | null;
}

export interface RegressedFile {
	file_path: string;
	regressed_lines: number;
	regressed_line_ranges: [number, number][];
}

// --- Tests ---

export interface TestsResult {
	tests_ingested: number;
	failed_count: number;
	suppressed_count: number;
	unsuppressed_failure_count: number;
	flaky_count: number;
	flaky_tests?: FlakyTest[];
}

export interface FlakyTest {
	name: string;
	suite?: string;
	flake_rate?: number;
}

// --- Scan ---

export interface ScanResult {
	scan_name?: string;
	scan_diff?: ScanDiff;
	total_vulnerabilities?: number;
	// Whole scan, not just new: excludes suppressed, won't-fix and negligible.
	unsuppressed_vulnerabilities?: number;
	unsuppressed_highest_severity?: string;
	highest_severity?: string;
}

export interface ScanDiff {
	passed?: boolean;
	failure_reasons?: string[];
	new_critical_count: number;
	new_high_count: number;
	new_medium_count: number;
	new_low_count: number;
	new_unknown_count?: number;
	suppressed_cves_count: number;
	// Won't-fix upstream: listed in new_cves but excluded from the counts above.
	non_actionable_cves_count?: number;
	unchanged_cves_count: number;
	new_cves: CveEntry[];
	resolved_cves: CveEntry[];
	// Unchanged CVEs that still need action. Don't block; listed for visibility.
	existing_actionable_cves?: CveEntry[];
	sla_violations: SlaViolation[];
	// The counts above and the lists hold one entry per (CVE, package) pair.
	// These count each CVE once. Older servers don't send them.
	cve_counts?: CveCounts;
}

export interface CveCounts {
	// New CVEs that need action, by their highest blocking severity.
	new: Record<"critical" | "high" | "medium" | "low" | "unknown", number>;
	// Unchanged CVEs that still need action and aren't counted as new.
	existing: number;
	// New CVEs with nothing to act on: suppressed, or no fix upstream.
	suppressed: number;
	no_fix: number;
}

export interface CveEntry {
	cve_id: string;
	severity: string;
	package_name: string;
	package_version: string;
	fix_state?: string;
}

export interface SlaViolation {
	cve_id: string;
	severity: string;
	package_name: string;
	days_overdue: number;
}

// --- Lint ---

export interface LintResult {
	lint_diff?: LintDiff;
	total_violations?: number;
	error_count?: number;
	warning_count?: number;
}

export interface LintDiff {
	passed: boolean;
	failure_reasons?: string[];
	base_violation_count: number;
	head_violation_count: number;
	new_violation_count: number;
	resolved_violation_count: number;
	suppressed_violation_count: number;
	new_violations: LintViolation[] | null;
}

export interface LintViolation {
	file_path: string;
	line: number;
	rule_id: string;
	severity: string;
	message: string;
}

// --- Action Inputs ---

export type Command = "coverage" | "tests" | "scan" | "lint";

export interface ActionInputs {
	command: Command;
	file: string;
	apiKey: string;
	org?: string;
	repo?: string;
	cliVersion: string;
	apiUrl: string;
	wait: boolean;
	waitTimeout: string;
	verbose: boolean;
	group?: string;
	format?: string;
	pathPrefix?: string;
	targetBranch?: string;
	shardKey?: string;
	totalShards?: number;
	drapeRunId?: string;
	scanName?: string;
	scanTag?: string;
	scanType?: string;
	failOnVulnerabilities: boolean;
	failOnSeverity?: string;
	jobName?: string;
	comment: boolean;
	commentHeader: string;
	commentTitle?: string;
	githubToken: string;
}

// --- Upload execution result ---

export interface UploadExecResult {
	exitCode: number;
	resultJson: DrapeCliResponse;
	passed: boolean;
	stderr: string;
}
