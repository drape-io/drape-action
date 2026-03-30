import * as core from "@actions/core";
import * as github from "@actions/github";
import { generateComment } from "./comment.js";
import { getInputs } from "./inputs.js";
import { installCli } from "./install.js";
import { postStickyComment } from "./sticky-comment.js";
import type { ActionInputs } from "./types.js";
import { runUpload } from "./upload.js";

function validateAuth(inputs: ActionInputs): void {
	if (inputs.apiKey) {
		return;
	}

	// No API key — check that OIDC env vars are available so the CLI can auto-detect
	const hasOidc = !!process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
	if (!hasOidc) {
		throw new Error(
			'Either "api-key" or OIDC authentication is required. ' +
				'For OIDC, add "permissions: id-token: write" to your job and set the "org" input.',
		);
	}

	if (!inputs.org) {
		throw new Error(
			'The "org" input is required when using OIDC authentication (no api-key provided).',
		);
	}

	core.info("Using OIDC authentication (no api-key provided)");
}

async function run(): Promise<void> {
	const inputs = getInputs();

	// Step 1: Validate authentication (API key or OIDC)
	validateAuth(inputs);

	// Step 2: Install CLI
	await installCli(inputs.cliVersion);

	// Step 3: Run upload
	const result = await runUpload(inputs);

	// Step 4: Set outputs
	core.setOutput("exit-code", String(result.exitCode));
	core.setOutput("result-json", JSON.stringify(result.resultJson));
	core.setOutput("passed", String(result.passed));

	// Step 5: Generate and post PR comment
	if (inputs.comment && github.context.eventName === "pull_request") {
		const body = generateComment(
			inputs.command,
			result.exitCode,
			result.resultJson,
			result.stderr,
			inputs.group,
			inputs.commentTitle,
		);

		core.setOutput("comment-body", body);

		if (body) {
			const pr = github.context.payload.pull_request;
			if (pr) {
				await postStickyComment(
					inputs.githubToken,
					github.context.repo.owner,
					github.context.repo.repo,
					pr.number,
					inputs.commentHeader,
					body,
				);
			}
		}
	}

	// Step 6: Propagate failure
	if (result.exitCode !== 0) {
		core.setFailed(`Drape CLI exited with code ${result.exitCode}`);
	}
}

run().catch((error) => {
	core.setFailed(error instanceof Error ? error.message : String(error));
});
