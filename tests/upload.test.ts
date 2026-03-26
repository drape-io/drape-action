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
		timeout: 120,
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
			"--timeout",
			"120",
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
			"--timeout",
			"120",
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
});
