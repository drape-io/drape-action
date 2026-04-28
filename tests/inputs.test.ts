import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @actions/core before importing inputs
vi.mock("@actions/core", () => ({
	getInput: vi.fn(),
	getBooleanInput: vi.fn(),
}));

import * as core from "@actions/core";
import { getInputs } from "../src/inputs.js";

describe("getInputs", () => {
	beforeEach(() => {
		vi.resetAllMocks();

		// Default mocks for required + boolean inputs
		const getInput = vi.mocked(core.getInput);
		getInput.mockImplementation((name: string) => {
			const defaults: Record<string, string> = {
				command: "coverage",
				file: "coverage.xml",
				"api-key": "drape-key-123",
				"cli-version": "latest",
				"api-url": "https://app.drape.io",
				"wait-timeout": "10m",
				"github-token": "gh-token",
			};
			return defaults[name] ?? "";
		});

		const getBooleanInput = vi.mocked(core.getBooleanInput);
		getBooleanInput.mockImplementation((name: string) => {
			const defaults: Record<string, boolean> = {
				wait: true,
				verbose: false,
				"fail-on-vulnerabilities": false,
				comment: true,
			};
			return defaults[name] ?? false;
		});
	});

	it("parses all required inputs", () => {
		const inputs = getInputs();
		expect(inputs.command).toBe("coverage");
		expect(inputs.file).toBe("coverage.xml");
		expect(inputs.apiKey).toBe("drape-key-123");
	});

	it("sets default comment header from command", () => {
		const inputs = getInputs();
		expect(inputs.commentHeader).toBe("drape-coverage");
	});

	it("uses custom comment header when provided", () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "comment-header") return "my-custom-header";
			if (name === "command") return "tests";
			if (name === "file") return "results.xml";
			if (name === "api-key") return "tok";
			return "";
		});

		const inputs = getInputs();
		expect(inputs.commentHeader).toBe("my-custom-header");
	});

	it("rejects invalid command", () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "command") return "invalid";
			return "";
		});

		expect(() => getInputs()).toThrow("Invalid command");
	});

	it("converts optional empty strings to undefined", () => {
		const inputs = getInputs();
		expect(inputs.org).toBeUndefined();
		expect(inputs.format).toBeUndefined();
		expect(inputs.pathPrefix).toBeUndefined();
		expect(inputs.scanName).toBeUndefined();
	});

	it("parses boolean inputs", () => {
		const inputs = getInputs();
		expect(inputs.wait).toBe(true);
		expect(inputs.verbose).toBe(false);
		expect(inputs.comment).toBe(true);
	});

	it("parses wait-timeout as duration string", () => {
		const inputs = getInputs();
		expect(inputs.waitTimeout).toBe("10m");
	});

	it("defaults wait-timeout to 10m when unset", () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "command") return "coverage";
			if (name === "file") return "coverage.xml";
			if (name === "api-key") return "tok";
			return "";
		});

		const inputs = getInputs();
		expect(inputs.waitTimeout).toBe("10m");
	});

	it("includes group in default comment header", () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "command") return "tests";
			if (name === "file") return "results.xml";
			if (name === "api-key") return "tok";
			if (name === "group") return "unit";
			return "";
		});

		const inputs = getInputs();
		expect(inputs.commentHeader).toBe("drape-tests-unit");
	});

	it("includes scan-name in default comment header", () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "command") return "scan";
			if (name === "file") return "scan.json";
			if (name === "api-key") return "tok";
			if (name === "scan-name") return "myapp";
			return "";
		});

		const inputs = getInputs();
		expect(inputs.commentHeader).toBe("drape-scan-myapp");
	});

	it("parses shard-key, total-shards, and drape-run-id", () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "command") return "coverage";
			if (name === "file") return "coverage.xml";
			if (name === "api-key") return "tok";
			if (name === "total-shards") return "3";
			if (name === "shard-key") return "my-key";
			if (name === "drape-run-id") return "run-42";
			return "";
		});

		const inputs = getInputs();
		expect(inputs.totalShards).toBe(3);
		expect(inputs.shardKey).toBe("my-key");
		expect(inputs.drapeRunId).toBe("run-42");
	});

	it("leaves new batch inputs undefined when not set", () => {
		const inputs = getInputs();
		expect(inputs.totalShards).toBeUndefined();
		expect(inputs.shardKey).toBeUndefined();
		expect(inputs.drapeRunId).toBeUndefined();
	});

	it.each([
		{ label: "non-numeric", value: "abc" },
		{ label: "zero", value: "0" },
		{ label: "one", value: "1" },
		{ label: "negative", value: "-1" },
		{ label: "decimal", value: "3.5" },
	])("rejects $label total-shards value", ({ value }) => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "command") return "coverage";
			if (name === "file") return "coverage.xml";
			if (name === "api-key") return "tok";
			if (name === "total-shards") return value;
			return "";
		});

		expect(() => getInputs()).toThrow(/Invalid total-shards/);
	});

	it("rejects shard-key without total-shards on coverage", () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "command") return "coverage";
			if (name === "file") return "coverage.xml";
			if (name === "api-key") return "tok";
			if (name === "shard-key") return "my-key";
			return "";
		});

		expect(() => getInputs()).toThrow(/shard-key requires total-shards/);
	});

	it("allows shard-key without total-shards on non-coverage commands", () => {
		// Non-coverage commands warn-and-drop the flag (see runUpload),
		// matching total-shards behavior. No parse-time throw.
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === "command") return "tests";
			if (name === "file") return "r.xml";
			if (name === "api-key") return "tok";
			if (name === "shard-key") return "my-key";
			return "";
		});

		expect(() => getInputs()).not.toThrow();
	});
});
