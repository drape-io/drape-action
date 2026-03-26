import * as core from "@actions/core";
import * as exec from "@actions/exec";
import type {
	ActionInputs,
	DrapeCliResponse,
	UploadExecResult,
} from "./types.js";

export function buildCliArgs(inputs: ActionInputs): string[] {
	const args = ["upload", inputs.command, inputs.file, "--quiet"];

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

	const result = await exec.getExecOutput("drape", args, {
		ignoreReturnCode: true,
		silent: false,
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

	return {
		exitCode: result.exitCode,
		resultJson,
		passed: result.exitCode === 0,
		stderr: result.stderr,
	};
}
