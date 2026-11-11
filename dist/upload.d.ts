import type { ActionInputs, UploadExecResult } from "./types.js";
export declare function buildCliArgs(inputs: ActionInputs): string[];
/**
 * The CLI's environment: the runner's (which carries the OIDC token request variables when the
 * job has `id-token: write`) plus the inputs. With no `api-key` input and no `DRAPE_API_KEY` in
 * the job env, the CLI uses that OIDC token.
 */
export declare function buildCliEnv(inputs: ActionInputs, baseEnv: NodeJS.ProcessEnv): Record<string, string>;
export declare function runUpload(inputs: ActionInputs): Promise<UploadExecResult>;
