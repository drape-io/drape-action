import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateComment = vi.fn();
const mockUpdateComment = vi.fn();
const mockPaginate = vi.fn();

vi.mock("@actions/github", () => ({
	getOctokit: () => ({
		rest: {
			issues: {
				listComments: "listComments-endpoint",
				createComment: mockCreateComment,
				updateComment: mockUpdateComment,
			},
		},
		paginate: mockPaginate,
	}),
}));

import { postStickyComment } from "../src/sticky-comment.js";

describe("postStickyComment", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("creates a new comment when none exists", async () => {
		mockPaginate.mockResolvedValue([]);

		await postStickyComment(
			"token",
			"drape-io",
			"webapp",
			42,
			"drape-coverage",
			"## Coverage Report\n...",
		);

		expect(mockCreateComment).toHaveBeenCalledWith({
			owner: "drape-io",
			repo: "webapp",
			issue_number: 42,
			body: "<!-- drape-coverage -->\n## Coverage Report\n...",
		});
		expect(mockUpdateComment).not.toHaveBeenCalled();
	});

	it("updates existing comment with matching marker", async () => {
		mockPaginate.mockResolvedValue([
			{ id: 100, body: "<!-- drape-coverage -->\nold content" },
			{ id: 101, body: "unrelated comment" },
		]);

		await postStickyComment(
			"token",
			"drape-io",
			"webapp",
			42,
			"drape-coverage",
			"## Coverage Report\nnew content",
		);

		expect(mockUpdateComment).toHaveBeenCalledWith({
			owner: "drape-io",
			repo: "webapp",
			comment_id: 100,
			body: "<!-- drape-coverage -->\n## Coverage Report\nnew content",
		});
		expect(mockCreateComment).not.toHaveBeenCalled();
	});

	it("does not confuse different headers", async () => {
		mockPaginate.mockResolvedValue([
			{ id: 100, body: "<!-- drape-tests -->\ntest comment" },
		]);

		await postStickyComment(
			"token",
			"drape-io",
			"webapp",
			42,
			"drape-coverage",
			"## Coverage Report",
		);

		expect(mockCreateComment).toHaveBeenCalled();
		expect(mockUpdateComment).not.toHaveBeenCalled();
	});

	it("passes correct pagination params", async () => {
		mockPaginate.mockResolvedValue([]);

		await postStickyComment(
			"token",
			"drape-io",
			"webapp",
			42,
			"drape-coverage",
			"body",
		);

		expect(mockPaginate).toHaveBeenCalledWith(
			"listComments-endpoint",
			expect.objectContaining({
				owner: "drape-io",
				repo: "webapp",
				issue_number: 42,
				per_page: 100,
			}),
		);
	});
});
