import * as core from "@actions/core";
import type { ActionInputs, Command } from "./types.js";

const VALID_COMMANDS = new Set(["coverage", "tests", "scan", "lint"]);

export function getInputs(): ActionInputs {
	const command = core.getInput("command", { required: true });
	if (!VALID_COMMANDS.has(command)) {
		throw new Error(
			`Invalid command: "${command}". Must be one of: coverage, tests, scan, lint`,
		);
	}

	const group = core.getInput("group") || undefined;
	const scanName = core.getInput("scan-name") || undefined;
	const suffix = group ?? scanName;
	const commentHeader =
		core.getInput("comment-header") ||
		(suffix ? `drape-${command}-${suffix}` : `drape-${command}`);

	return {
		command: command as Command,
		file: core.getInput("file", { required: true }),
		apiKey: core.getInput("api-key") || undefined,
		org: core.getInput("org") || undefined,
		repo: core.getInput("repo") || undefined,
		cliVersion: core.getInput("cli-version") || "latest",
		apiUrl: core.getInput("api-url") || "https://app.drape.io",
		wait: core.getBooleanInput("wait"),
		timeout: Number.parseInt(core.getInput("timeout") || "120", 10),
		verbose: core.getBooleanInput("verbose"),
		group,
		format: core.getInput("format") || undefined,
		pathPrefix: core.getInput("path-prefix") || undefined,
		targetBranch: core.getInput("target-branch") || undefined,
		scanName,
		scanTag: core.getInput("scan-tag") || undefined,
		scanType: core.getInput("scan-type") || undefined,
		failOnVulnerabilities: core.getBooleanInput("fail-on-vulnerabilities"),
		failOnSeverity: core.getInput("fail-on-severity") || undefined,
		jobName: core.getInput("job-name") || undefined,
		comment: core.getBooleanInput("comment"),
		commentHeader,
		commentTitle: core.getInput("comment-title") || undefined,
		githubToken: core.getInput("github-token"),
	};
}
