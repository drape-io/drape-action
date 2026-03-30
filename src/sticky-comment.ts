import * as github from "@actions/github";

export async function postStickyComment(
	token: string,
	owner: string,
	repo: string,
	prNumber: number,
	header: string,
	body: string,
): Promise<void> {
	const octokit = github.getOctokit(token);
	const marker = `<!-- ${header} -->`;
	const fullBody = `${marker}\n${body}`;

	// Paginate to handle PRs with >100 comments
	const comments = await octokit.paginate(octokit.rest.issues.listComments, {
		owner,
		repo,
		issue_number: prNumber,
		per_page: 100,
	});

	const existing = comments.find((c) => c.body?.includes(marker));

	if (existing) {
		await octokit.rest.issues.updateComment({
			owner,
			repo,
			comment_id: existing.id,
			body: fullBody,
		});
	} else {
		await octokit.rest.issues.createComment({
			owner,
			repo,
			issue_number: prNumber,
			body: fullBody,
		});
	}
}
