import * as core from "@actions/core";
import * as exec from "@actions/exec";
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
	const args = ["upload", inputs.command, ...files, "--quiet"];

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
		DRAPE_API_KEY: inputs.apiKey,
		DRAPE_API_URL: inputs.apiUrl,
	};
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
	const uploads = response.uploads ?? [];
	if (uploads.length === 0) {
		core.info(`Drape ${command}: no uploads (exit ${exitCode})`);
		return;
	}

	for (const upload of uploads) {
		const url = upload.drape_url ?? "";
		if (!upload.result) {
			core.info(`Drape ${command}: uploaded (no result yet) ${url}`);
			continue;
		}

		switch (command) {
			case "coverage": {
				const r = upload.result as CoverageResult;
				const diff = r.coverage_diff;
				if (diff) {
					const status = diff.passed ? "passed" : "failed";
					core.info(
						`Drape coverage: ${status} — base ${diff.base_coverage_rate}% → head ${diff.head_coverage_rate}% (${diff.coverage_delta}%), ${diff.regressed_lines_count} regressed lines ${url}`,
					);
				} else {
					core.info(
						`Drape coverage: ${r.coverage_rate ?? "?"}% across ${r.file_count ?? "?"} files ${url}`,
					);
				}
				break;
			}
			case "tests": {
				const r = upload.result as TestsResult;
				core.info(
					`Drape tests: ${r.tests_ingested} ingested, ${r.failed_count} failed, ${r.suppressed_count} suppressed, ${r.unsuppressed_failure_count} unsuppressed ${url}`,
				);
				break;
			}
			case "scan": {
				const r = upload.result as ScanResult;
				const diff = r.scan_diff;
				if (diff) {
					const totalNew =
						diff.new_critical_count +
						diff.new_high_count +
						diff.new_medium_count +
						diff.new_low_count;
					core.info(
						`Drape scan: ${totalNew} new vulnerabilities, ${diff.suppressed_cves_count} suppressed, ${diff.unchanged_cves_count} unchanged ${url}`,
					);
				} else {
					core.info(
						`Drape scan: ${r.total_vulnerabilities ?? 0} total vulnerabilities ${url}`,
					);
				}
				break;
			}
			case "lint": {
				const r = upload.result as LintResult;
				const diff = r.lint_diff;
				if (diff) {
					const status = diff.passed ? "passed" : "failed";
					core.info(
						`Drape lint: ${status} — ${diff.new_violation_count} new, ${diff.resolved_violation_count} resolved ${url}`,
					);
				} else {
					core.info(`Drape lint: ${r.total_violations ?? 0} violations ${url}`);
				}
				break;
			}
		}
	}
}
