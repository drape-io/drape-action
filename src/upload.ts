import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { formatRate } from "./comment.js";
import type {
	ActionInputs,
	Command,
	CoverageResult,
	DrapeCliResponse,
	LintResult,
	ScanResult,
	TestsResult,
	UploadExecResult,
} from "./types.js";

export function buildCliArgs(inputs: ActionInputs): string[] {
	const files = inputs.file.split(/\s+/).filter(Boolean);
	const args = ["upload", inputs.command, ...files, "--quiet", "--json"];

	args.push(`--wait=${inputs.wait}`);
	args.push("--timeout", String(inputs.timeout));

	if (inputs.verbose) {
		args.push("--verbose");
	}

	switch (inputs.command) {
		case "coverage":
			if (inputs.format) args.push("--format", inputs.format);
			if (inputs.pathPrefix) args.push("--path-prefix", inputs.pathPrefix);
			if (inputs.targetBranch)
				args.push("--target-branch", inputs.targetBranch);
			if (inputs.group) args.push("--group", inputs.group);
			break;
		case "tests":
			if (inputs.format) args.push("--format", inputs.format);
			if (inputs.jobName) args.push("--job-name", inputs.jobName);
			if (inputs.group) args.push("--group", inputs.group);
			break;
		case "scan":
			if (inputs.format) args.push("--format", inputs.format);
			if (inputs.scanName) args.push("--scan-name", inputs.scanName);
			if (inputs.scanTag) args.push("--scan-tag", inputs.scanTag);
			if (inputs.scanType) args.push("--scan-type", inputs.scanType);
			if (inputs.failOnVulnerabilities) args.push("--fail-on-vulnerabilities");
			if (inputs.failOnSeverity)
				args.push("--fail-on-severity", inputs.failOnSeverity);
			break;
		case "lint":
			if (inputs.format) args.push("--format", inputs.format);
			break;
	}

	return args;
}

export async function runUpload(
	inputs: ActionInputs,
): Promise<UploadExecResult> {
	const args = buildCliArgs(inputs);

	const env: Record<string, string> = {
		...process.env,
		DRAPE_API_URL: inputs.apiUrl,
	};
	if (inputs.apiKey) env.DRAPE_API_KEY = inputs.apiKey;
	if (inputs.org) env.DRAPE_ORG = inputs.org;
	if (inputs.repo) env.DRAPE_REPO = inputs.repo;

	const result = await exec.getExecOutput("drape", args, {
		ignoreReturnCode: true,
		silent: !inputs.verbose,
		env,
	});

	if (result.stderr) {
		core.info(result.stderr);
	}

	let resultJson: DrapeCliResponse;
	try {
		resultJson = JSON.parse(result.stdout);
	} catch {
		core.warning("Failed to parse CLI JSON output");
		resultJson = { uploads: [] };
	}

	logUploadSummary(inputs.command, resultJson, result.exitCode);

	return {
		exitCode: result.exitCode,
		resultJson,
		passed: result.exitCode === 0,
		stderr: result.stderr,
	};
}

function logUploadSummary(
	command: Command,
	response: DrapeCliResponse,
	exitCode: number,
): void {
	if (response.files_matched != null) {
		core.info(
			`Drape ${command}: ${response.files_uploaded ?? 0}/${response.files_matched} file(s) uploaded`,
		);
	}

	const uploads = response.uploads ?? [];
	if (uploads.length === 0) {
		core.info(`Drape ${command}: no uploads (exit ${exitCode})`);
		return;
	}

	for (const upload of uploads) {
		const url = upload.drape_url ?? "";
		const r = upload.result;
		if (!r) {
			core.info(`Drape ${command}: uploaded (no result yet) ${url}`);
			continue;
		}

		switch (command) {
			case "coverage": {
				const diff =
					"coverage_diff" in r
						? (r as CoverageResult).coverage_diff
						: undefined;
				if (diff) {
					const status = diff.passed ? "passed" : "failed";
					core.info(
						`Drape coverage: ${status} — base ${formatRate(diff.base_coverage_rate)}% → head ${formatRate(diff.head_coverage_rate)}% (${formatRate(diff.coverage_delta)}%), ${diff.regressed_lines_count} regressed lines ${url}`,
					);
				} else {
					const cr = r as CoverageResult;
					core.info(
						`Drape coverage: ${cr.coverage_rate ?? "?"}% across ${cr.file_count ?? "?"} files ${url}`,
					);
				}
				break;
			}
			case "tests": {
				const tr = r as TestsResult;
				core.info(
					`Drape tests: ${tr.tests_ingested ?? 0} ingested, ${tr.failed_count ?? 0} failed, ${tr.suppressed_count ?? 0} suppressed, ${tr.unsuppressed_failure_count ?? 0} unsuppressed ${url}`,
				);
				break;
			}
			case "scan": {
				const sr = r as ScanResult;
				const label = sr.scan_name
					? `Drape scan (${sr.scan_name})`
					: "Drape scan";
				const diff = sr.scan_diff;
				if (diff) {
					const totalNew =
						diff.new_critical_count +
						diff.new_high_count +
						diff.new_medium_count +
						diff.new_low_count;
					core.info(
						`${label}: ${totalNew} new vulnerabilities, ${diff.suppressed_cves_count} suppressed, ${diff.unchanged_cves_count} unchanged ${url}`,
					);
				} else {
					core.info(
						`${label}: ${sr.total_vulnerabilities ?? 0} total vulnerabilities ${url}`,
					);
				}
				break;
			}
			case "lint": {
				const diff = "lint_diff" in r ? (r as LintResult).lint_diff : undefined;
				if (diff) {
					const status = diff.passed ? "passed" : "failed";
					core.info(
						`Drape lint: ${status} — ${diff.new_violation_count} new, ${diff.resolved_violation_count} resolved ${url}`,
					);
				} else {
					const lr = r as LintResult;
					core.info(
						`Drape lint: ${lr.total_violations ?? 0} violations ${url}`,
					);
				}
				break;
			}
		}
	}
}
