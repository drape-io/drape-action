import * as core from "@actions/core";
import * as github from "@actions/github";
import { generateComment } from "./comment.js";
import { getInputs } from "./inputs.js";
import { installCli } from "./install.js";
import { postStickyComment } from "./sticky-comment.js";
import { runUpload } from "./upload.js";

async function run(): Promise<void> {
	const inputs = getInputs();

	// Step 1: Install CLI
	await installCli(inputs.cliVersion);

	// Step 2: Run upload
	const result = await runUpload(inputs);

	// Step 3: Set outputs
	core.setOutput("exit-code", String(result.exitCode));
	core.setOutput("result-json", JSON.stringify(result.resultJson));
	core.setOutput("passed", String(result.passed));

	// Step 4: Generate and post PR comment
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

	// Step 5: Propagate failure
	if (result.exitCode !== 0) {
		core.setFailed(`Drape CLI exited with code ${result.exitCode}`);
	}
}

run().catch((error) => {
	core.setFailed(error instanceof Error ? error.message : String(error));
});
