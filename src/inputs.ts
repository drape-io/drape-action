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

	const totalShardsRaw = core.getInput("total-shards");
	let totalShards: number | undefined;
	if (totalShardsRaw) {
		// Reject non-integer strings BEFORE parseInt — "3.5" would silently
		// truncate to 3 and the server would over-wait for a phantom shard.
		if (!/^\d+$/.test(totalShardsRaw)) {
			throw new Error(
				`Invalid total-shards: "${totalShardsRaw}". Must be a positive integer >= 2 (typically your shard count).`,
			);
		}
		const parsed = Number.parseInt(totalShardsRaw, 10);
		if (parsed < 2) {
			throw new Error(
				`Invalid total-shards: "${totalShardsRaw}". Must be >= 2 for batch mode; omit the input for single-shard uploads.`,
			);
		}
		totalShards = parsed;
	}

	const shardKey = core.getInput("shard-key") || undefined;
	const drapeRunId = core.getInput("drape-run-id") || undefined;

	// Only enforce on coverage — for non-coverage commands, the flag is
	// dropped and a soft warning fires from runUpload (matches total-shards
	// behavior). Enforcing here would hard-fail copy-paste configs.
	if (command === "coverage" && shardKey && totalShards === undefined) {
		throw new Error(
			"shard-key requires total-shards to be set (e.g., total-shards: ${{ strategy.job-total }} or your shard count).",
		);
	}

	return {
		command: command as Command,
		file: core.getInput("file", { required: true }),
		apiKey: core.getInput("api-key", { required: true }),
		org: core.getInput("org") || undefined,
		repo: core.getInput("repo") || undefined,
		cliVersion: core.getInput("cli-version") || "latest",
		apiUrl: core.getInput("api-url") || "https://app.drape.io",
		wait: core.getBooleanInput("wait"),
		waitTimeout: core.getInput("wait-timeout") || "10m",
		verbose: core.getBooleanInput("verbose"),
		group,
		format: core.getInput("format") || undefined,
		pathPrefix: core.getInput("path-prefix") || undefined,
		targetBranch: core.getInput("target-branch") || undefined,
		shardKey,
		totalShards,
		drapeRunId,
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
