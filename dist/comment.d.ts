import type { DrapeCliResponse } from "./types.js";
type Command = "coverage" | "tests" | "scan" | "lint";
/**
 * Generate a markdown PR comment for the given command and CLI response.
 * Returns empty string if no comment should be generated.
 */
export declare function generateComment(command: Command, exitCode: number, response: DrapeCliResponse, stderr: string): string;
export declare function generateErrorComment(command: Command, exitCode: number, stderr: string): string;
export {};
