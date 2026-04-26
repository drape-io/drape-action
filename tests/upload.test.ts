import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionInputs } from "../src/types.js";
import { buildCliArgs, runUpload } from "../src/upload.js";

// Mock @actions/exec and @actions/core
vi.mock("@actions/exec", () => ({
	getExecOutput: vi.fn(),
}));
vi.mock("@actions/core", () => ({
	warning: vi.fn(),
	info: vi.fn(),
}));

import * as core from "@actions/core";
import * as exec from "@actions/exec";

function makeInputs(overrides: Partial<ActionInputs> = {}): ActionInputs {
	return {
		command: "coverage",
		file: "coverage.xml",
		apiKey: "tok",
		cliVersion: "latest",
		apiUrl: "https://app.drape.io",
		wait: true,
		waitTimeout: "3m",
		verbose: false,
		failOnVulnerabilities: false,
		comment: true,
		commentHeader: "drape-coverage",
		githubToken: "gh-tok",
		...overrides,
	};
}

describe("buildCliArgs", () => {
	it("builds basic coverage args", () => {
		const args = buildCliArgs(makeInputs());
		expect(args).toEqual([
			"upload",
			"coverage",
			"coverage.xml",
			"--quiet",
			"--json",
			"--wait=true",
			"--wait-timeout",
			"3m",
		]);
	});

	it("adds verbose flag", () => {
		const args = buildCliArgs(makeInputs({ verbose: true }));
		expect(args).toContain("--verbose");
	});

	it("adds coverage-specific flags", () => {
		const args = buildCliArgs(
			makeInputs({
				format: "cobertura",
				pathPrefix: "/app",
				targetBranch: "main",
				group: "unit",
			}),
		);
		expect(args).toContain("--format");
		expect(args).toContain("cobertura");
		expect(args).toContain("--path-prefix");
		expect(args).toContain("/app");
		expect(args).toContain("--target-branch");
		expect(args).toContain("main");
		expect(args).toContain("--group");
		expect(args).toContain("unit");
	});

	it("adds tests-specific flags", () => {
		const args = buildCliArgs(
			makeInputs({
				command: "tests",
				file: "results.xml",
				format: "junit",
				jobName: "test-job",
				group: "integration",
			}),
		);
		expect(args[1]).toBe("tests");
		expect(args).toContain("--format");
		expect(args).toContain("junit");
		expect(args).toContain("--job-name");
		expect(args).toContain("test-job");
		expect(args).toContain("--group");
	});

	it("adds scan-specific flags", () => {
		const args = buildCliArgs(
			makeInputs({
				command: "scan",
				file: "scan.sarif",
				format: "sarif",
				scanName: "myapp",
				scanTag: "v1.0",
				scanType: "image",
				failOnVulnerabilities: true,
				failOnSeverity: "high",
			}),
		);
		expect(args).toContain("--scan-name");
		expect(args).toContain("myapp");
		expect(args).toContain("--scan-tag");
		expect(args).toContain("v1.0");
		expect(args).toContain("--scan-type");
		expect(args).toContain("image");
		expect(args).toContain("--fail-on-vulnerabilities");
		expect(args).toContain("--fail-on-severity");
		expect(args).toContain("high");
	});

	it("splits multiple files into separate positional args", () => {
		const args = buildCliArgs(makeInputs({ file: "unit.xml integration.xml" }));
		expect(args).toEqual([
			"upload",
			"coverage",
			"unit.xml",
			"integration.xml",
			"--quiet",
			"--json",
			"--wait=true",
			"--wait-timeout",
			"3m",
		]);
	});

	it("handles newline-separated files", () => {
		const args = buildCliArgs(
			makeInputs({ file: "unit.xml\nintegration.xml" }),
		);
		expect(args[2]).toBe("unit.xml");
		expect(args[3]).toBe("integration.xml");
	});

	it("adds lint format flag", () => {
		const args = buildCliArgs(
			makeInputs({ command: "lint", file: "lint.sarif", format: "sarif" }),
		);
		expect(args).toContain("--format");
		expect(args).toContain("sarif");
	});

	it("does not add scan flags for coverage command", () => {
		const args = buildCliArgs(
			makeInputs({
				scanName: "myapp",
				scanTag: "v1",
			}),
		);
		expect(args).not.toContain("--scan-name");
		expect(args).not.toContain("--scan-tag");
	});

	it("forwards --shard-key, --total-shards, --drape-run-id on coverage", () => {
		const args = buildCliArgs(
			makeInputs({ totalShards: 3, shardKey: "foo", drapeRunId: "run-42" }),
		);
		expect(args).toContain("--total-shards");
		expect(args).toContain("3");
		expect(args).toContain("--shard-key");
		expect(args).toContain("foo");
		expect(args).toContain("--drape-run-id");
		expect(args).toContain("run-42");
	});

	it("omits batch flags on coverage when not set", () => {
		const args = buildCliArgs(makeInputs());
		expect(args).not.toContain("--total-shards");
		expect(args).not.toContain("--shard-key");
		expect(args).not.toContain("--drape-run-id");
	});

	it("forwards only --drape-run-id on tests command", () => {
		const args = buildCliArgs(
			makeInputs({
				command: "tests",
				file: "r.xml",
				totalShards: 3,
				shardKey: "foo",
				drapeRunId: "run-42",
			}),
		);
		expect(args).toContain("--drape-run-id");
		expect(args).toContain("run-42");
		expect(args).not.toContain("--total-shards");
		expect(args).not.toContain("--shard-key");
	});

	it("does not forward batch or run-id flags for scan command", () => {
		const args = buildCliArgs(
			makeInputs({
				command: "scan",
				file: "s.sarif",
				totalShards: 3,
				shardKey: "foo",
				drapeRunId: "run-42",
			}),
		);
		expect(args).not.toContain("--total-shards");
		expect(args).not.toContain("--shard-key");
		expect(args).not.toContain("--drape-run-id");
	});
});

describe("runUpload", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("parses JSON stdout and returns result", async () => {
		vi.mocked(exec.getExecOutput).mockResolvedValue({
			exitCode: 0,
			stdout:
				'{"uploads": [{"drape_url": "https://app.drape.io/r/1", "result": {"coverage_rate": "85"}}]}',
			stderr: "",
		});

		const result = await runUpload(makeInputs());
		expect(result.exitCode).toBe(0);
		expect(result.passed).toBe(true);
		expect(result.resultJson.uploads).toHaveLength(1);
	});

	it("captures non-zero exit code without throwing", async () => {
		vi.mocked(exec.getExecOutput).mockResolvedValue({
			exitCode: 1,
			stdout: '{"uploads": []}',
			stderr: "coverage check failed",
		});

		const result = await runUpload(makeInputs());
		expect(result.exitCode).toBe(1);
		expect(result.passed).toBe(false);
		expect(result.stderr).toBe("coverage check failed");
	});

	it("handles invalid JSON output", async () => {
		vi.mocked(exec.getExecOutput).mockResolvedValue({
			exitCode: 0,
			stdout: "not json",
			stderr: "",
		});

		const result = await runUpload(makeInputs());
		expect(result.resultJson).toEqual({ uploads: [] });
		expect(core.warning).toHaveBeenCalledWith(
			"Failed to parse CLI JSON output",
		);
	});

	it("warns when total-shards is set on a non-coverage command", async () => {
		vi.mocked(exec.getExecOutput).mockResolvedValue({
			exitCode: 0,
			stdout: '{"uploads": []}',
			stderr: "",
		});

		await runUpload(
			makeInputs({ command: "tests", file: "r.xml", totalShards: 3 }),
		);
		expect(core.warning).toHaveBeenCalledWith(
			expect.stringContaining(
				"'total-shards' and 'shard-key' are only used with command: coverage",
			),
		);
	});

	it("warns when shard-key alone is set on a non-coverage command", async () => {
		vi.mocked(exec.getExecOutput).mockResolvedValue({
			exitCode: 0,
			stdout: '{"uploads": []}',
			stderr: "",
		});

		await runUpload(
			makeInputs({ command: "tests", file: "r.xml", shardKey: "my-key" }),
		);
		expect(core.warning).toHaveBeenCalledWith(
			expect.stringContaining(
				"'total-shards' and 'shard-key' are only used with command: coverage",
			),
		);
	});

	it("warns when drape-run-id is set on scan or lint", async () => {
		vi.mocked(exec.getExecOutput).mockResolvedValue({
			exitCode: 0,
			stdout: '{"uploads": []}',
			stderr: "",
		});

		await runUpload(
			makeInputs({ command: "scan", file: "s.sarif", drapeRunId: "run-42" }),
		);
		expect(core.warning).toHaveBeenCalledWith(
			expect.stringContaining(
				"'drape-run-id' is only used with coverage or tests",
			),
		);
	});

	it("does not warn when drape-run-id is set on tests", async () => {
		vi.mocked(exec.getExecOutput).mockResolvedValue({
			exitCode: 0,
			stdout: '{"uploads": []}',
			stderr: "",
		});

		await runUpload(
			makeInputs({ command: "tests", file: "r.xml", drapeRunId: "run-42" }),
		);
		const warnCalls = vi.mocked(core.warning).mock.calls;
		expect(
			warnCalls.some((call) => String(call[0]).includes("drape-run-id")),
		).toBe(false);
	});
});
