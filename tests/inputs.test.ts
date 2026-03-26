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
				timeout: "120",
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

	it("parses timeout as number", () => {
		const inputs = getInputs();
		expect(inputs.timeout).toBe(120);
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
});
