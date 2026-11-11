import type { ActionInputs, UploadExecResult } from "./types.js";
export declare function buildCliArgs(inputs: ActionInputs): string[];
/**
 * The runner's env carries the OIDC token request variables under `id-token: write`; with no
 * API key from the input or the job env, the CLI uses that token.
 */
export declare function buildCliEnv(inputs: ActionInputs, baseEnv: NodeJS.ProcessEnv): Record<string, string>;
export declare function runUpload(inputs: ActionInputs): Promise<UploadExecResult>;
