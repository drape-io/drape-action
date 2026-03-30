import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as core from "@actions/core";
import * as toolCache from "@actions/tool-cache";

const CLI_REPO = "drape-io/drape-cli";

export async function installCli(version: string): Promise<string> {
	const resolvedVersion = await resolveVersion(version);
	const arch = detectArch();
	const platform = detectPlatform();

	// Check cache first
	const cached = toolCache.find("drape", resolvedVersion, arch);
	if (cached) {
		core.info(`Drape CLI v${resolvedVersion} found in cache`);
		core.addPath(cached);
		return cached;
	}

	core.info(
		`Downloading Drape CLI v${resolvedVersion} (${platform}/${arch})...`,
	);

	const tarball = `drape_${platform}_${arch}.tar.gz`;
	const baseUrl = `https://github.com/${CLI_REPO}/releases/download/v${resolvedVersion}`;

	// Download tarball and checksums
	const tarballPath = await toolCache.downloadTool(`${baseUrl}/${tarball}`);
	const checksumsPath = await toolCache.downloadTool(
		`${baseUrl}/checksums.txt`,
	);

	// Verify SHA256 checksum
	await verifyChecksum(tarballPath, checksumsPath, tarball);

	// Extract and cache
	const extractedDir = await toolCache.extractTar(tarballPath);
	const cachedDir = await toolCache.cacheDir(
		extractedDir,
		"drape",
		resolvedVersion,
		arch,
	);

	core.addPath(cachedDir);
	core.info(`Installed Drape CLI v${resolvedVersion}`);
	return cachedDir;
}

async function resolveVersion(version: string): Promise<string> {
	if (version !== "latest") {
		return version.replace(/^v/, "");
	}

	const response = await fetch(
		`https://api.github.com/repos/${CLI_REPO}/releases/latest`,
	);
	if (!response.ok) {
		throw new Error(
			`Failed to resolve latest Drape CLI version: ${response.statusText}`,
		);
	}

	const data = (await response.json()) as { tag_name: string };
	const tag = data.tag_name;
	if (!tag) {
		throw new Error("Failed to resolve latest Drape CLI version: no tag_name");
	}

	const resolved = tag.replace(/^v/, "");
	core.info(`Resolved latest version: v${resolved}`);
	return resolved;
}

function detectPlatform(): string {
	const p = os.platform();
	if (p === "darwin") return "darwin";
	if (p === "win32") return "windows";
	return "linux";
}

function detectArch(): string {
	const arch = os.arch();
	if (arch === "arm64" || arch === "aarch64") return "arm64";
	return "amd64";
}

async function verifyChecksum(
	tarballPath: string,
	checksumsPath: string,
	tarballName: string,
): Promise<void> {
	const checksums = fs.readFileSync(checksumsPath, "utf-8");
	const line = checksums.split("\n").find((l) => l.includes(tarballName));

	if (!line) {
		throw new Error(`Checksum not found for ${tarballName} in checksums.txt`);
	}

	const expected = line.split(/\s+/)[0];
	const fileData = fs.readFileSync(tarballPath);
	const actual = crypto.createHash("sha256").update(fileData).digest("hex");

	if (expected !== actual) {
		throw new Error(
			`Checksum verification failed for ${tarballName}. Expected: ${expected}, Actual: ${actual}`,
		);
	}

	core.info("Checksum verified");
}
