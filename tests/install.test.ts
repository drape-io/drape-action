import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@actions/tool-cache", () => ({
	find: vi.fn(),
	downloadTool: vi.fn(),
	extractTar: vi.fn(),
	cacheDir: vi.fn(),
}));
vi.mock("@actions/core", () => ({
	info: vi.fn(),
	addPath: vi.fn(),
}));
vi.mock("node:fs", () => ({
	readFileSync: vi.fn(),
}));
vi.mock("node:os", () => ({
	arch: () => "x64",
}));

import * as fs from "node:fs";
import * as core from "@actions/core";
import * as toolCache from "@actions/tool-cache";
import { installCli } from "../src/install.js";

describe("installCli", () => {
	beforeEach(() => {
		vi.resetAllMocks();

		// Mock global fetch for version resolution
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ tag_name: "v0.1.2" }),
			}),
		);
	});

	it("returns cached path when CLI is already cached", async () => {
		vi.mocked(toolCache.find).mockReturnValue("/cache/drape/0.1.2/amd64");

		const result = await installCli("0.1.2");

		expect(result).toBe("/cache/drape/0.1.2/amd64");
		expect(core.addPath).toHaveBeenCalledWith("/cache/drape/0.1.2/amd64");
		expect(toolCache.downloadTool).not.toHaveBeenCalled();
	});

	it("downloads, verifies, and caches on cache miss", async () => {
		vi.mocked(toolCache.find).mockReturnValue("");
		vi.mocked(toolCache.downloadTool)
			.mockResolvedValueOnce("/tmp/tarball.tar.gz")
			.mockResolvedValueOnce("/tmp/checksums.txt");
		vi.mocked(toolCache.extractTar).mockResolvedValue("/tmp/extracted");
		vi.mocked(toolCache.cacheDir).mockResolvedValue("/cache/drape/0.1.2/amd64");

		// Mock checksum file and tarball content
		vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
			if (String(path) === "/tmp/checksums.txt") {
				return "abc123  drape_linux_amd64.tar.gz\n";
			}
			// Return a buffer whose sha256 matches "abc123" — we'll mock crypto too
			return Buffer.from("mock-tarball-content");
		});

		// We need the actual checksum to match, so let's compute it
		const crypto = await import("node:crypto");
		const expectedHash = crypto
			.createHash("sha256")
			.update(Buffer.from("mock-tarball-content"))
			.digest("hex");

		vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
			if (String(path) === "/tmp/checksums.txt") {
				return `${expectedHash}  drape_linux_amd64.tar.gz\n`;
			}
			return Buffer.from("mock-tarball-content");
		});

		const result = await installCli("0.1.2");

		expect(result).toBe("/cache/drape/0.1.2/amd64");
		expect(toolCache.downloadTool).toHaveBeenCalledTimes(2);
		expect(toolCache.extractTar).toHaveBeenCalled();
		expect(toolCache.cacheDir).toHaveBeenCalled();
	});

	it("resolves 'latest' version via GitHub API", async () => {
		vi.mocked(toolCache.find).mockReturnValue("/cache/drape/0.1.2/amd64");

		await installCli("latest");

		expect(fetch).toHaveBeenCalledWith(
			"https://api.github.com/repos/drape-io/drape-cli/releases/latest",
			{ headers: {} },
		);
		expect(toolCache.find).toHaveBeenCalledWith(
			"drape",
			"0.1.2",
			expect.any(String),
		);
	});

	it("uses auth header when githubToken is provided", async () => {
		vi.mocked(toolCache.find).mockReturnValue("/cache/drape/0.1.2/amd64");

		await installCli("latest", "ghp_test123");

		expect(fetch).toHaveBeenCalledWith(
			"https://api.github.com/repos/drape-io/drape-cli/releases/latest",
			{ headers: { Authorization: "token ghp_test123" } },
		);
	});

	it("strips v prefix from version", async () => {
		vi.mocked(toolCache.find).mockReturnValue("/cache/drape/1.0.0/amd64");

		await installCli("v1.0.0");

		expect(toolCache.find).toHaveBeenCalledWith(
			"drape",
			"1.0.0",
			expect.any(String),
		);
	});

	it("throws on checksum mismatch", async () => {
		vi.mocked(toolCache.find).mockReturnValue("");
		vi.mocked(toolCache.downloadTool)
			.mockResolvedValueOnce("/tmp/tarball.tar.gz")
			.mockResolvedValueOnce("/tmp/checksums.txt");

		vi.mocked(fs.readFileSync).mockImplementation((path: unknown) => {
			if (String(path) === "/tmp/checksums.txt") {
				return "wrong_checksum  drape_linux_amd64.tar.gz\n";
			}
			return Buffer.from("tarball-data");
		});

		await expect(installCli("0.1.2")).rejects.toThrow(
			"Checksum verification failed",
		);
	});

	it("throws when latest version cannot be resolved", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			}),
		);

		await expect(installCli("latest")).rejects.toThrow(
			"Failed to resolve latest Drape CLI version",
		);
	});
});
