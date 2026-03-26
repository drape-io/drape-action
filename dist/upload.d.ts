import type { ActionInputs, UploadExecResult } from "./types.js";
export declare function buildCliArgs(inputs: ActionInputs): string[];
export declare function runUpload(inputs: ActionInputs): Promise<UploadExecResult>;
