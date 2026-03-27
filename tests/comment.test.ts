import { describe, expect, it } from "vitest";
import { generateComment, generateErrorComment } from "../src/comment.js";
import type { DrapeCliResponse } from "../src/types.js";

describe("generateComment", () => {
	// --- Coverage ---

	describe("coverage", () => {
		it("generates table with passing check and no regressions", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "https://app.drape.io/r/123",
						result: {
							coverage_diff: {
								passed: true,
								head_coverage_rate: "85.5",
								base_coverage_rate: "84.0",
								coverage_delta: "+1.5",
								new_lines_total: 20,
								new_lines_covered: 18,
								new_code_coverage_rate: "90.0",
								regressed_lines_count: 0,
								regressed_files: [],
							},
						},
					},
				],
			};
			const body = generateComment("coverage", 0, response, "");

			expect(body).toContain("## Drape: Coverage Report");
			expect(body).toContain(":white_check_mark:");
			expect(body).toContain("no regressions detected");
			expect(body).toContain("85.5%");
			expect(body).toContain("84%");
			expect(body).toContain("1.5%");
			expect(body).toContain("18/20 lines");
			expect(body).toContain("Result: Passed");
			expect(body).toContain("View full report in Drape");
		});

		it("shows failure with reasons and regressed files", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "https://app.drape.io/r/123",
						result: {
							coverage_diff: {
								passed: false,
								failure_reasons: [
									"5 regressed lines detected",
									"new code coverage below 80%",
								],
								head_coverage_rate: "80.0",
								base_coverage_rate: "84.0",
								coverage_delta: "-4.0",
								new_lines_total: 20,
								new_lines_covered: 10,
								new_code_coverage_rate: "50.0",
								regressed_lines_count: 5,
								regressed_files: [
									{
										file_path: "src/main.go",
										regressed_lines: 5,
										regressed_line_ranges: [[10, 15]],
									},
								],
							},
						},
					},
				],
			};
			const body = generateComment("coverage", 1, response, "");

			expect(body).toContain(":x:");
			expect(body).toContain("Coverage check failed");
			expect(body).toContain("5 regressed lines detected");
			expect(body).toContain("Regressed files (1 file(s), 5 lines)");
			expect(body).toContain("`src/main.go`");
			expect(body).toContain("L10-15");
			expect(body).toContain("Result: Failed");
		});

		it("mentions regressions in summary when passing with regressions", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "",
						result: {
							coverage_diff: {
								passed: true,
								head_coverage_rate: "83.0",
								base_coverage_rate: "84.0",
								coverage_delta: "-1.0",
								new_lines_total: 10,
								new_lines_covered: 10,
								new_code_coverage_rate: "100.0",
								regressed_lines_count: 3,
								regressed_files: [
									{
										file_path: "src/utils.go",
										regressed_lines: 3,
										regressed_line_ranges: [[20, 23]],
									},
								],
							},
						},
					},
				],
			};
			const body = generateComment("coverage", 0, response, "");

			expect(body).toContain("3 regressed line(s) detected");
			expect(body).toContain(":white_check_mark:");
		});

		it("shows overall rate when no diff data", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "",
						result: {
							coverage_rate: "75.0",
							file_count: "42",
						},
					},
				],
			};
			const body = generateComment("coverage", 0, response, "");

			expect(body).toContain("75.0%");
			expect(body).toContain("42");
		});

		it("handles null regressed_files without crashing", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "https://app.drape.io/r/123",
						result: {
							coverage_diff: {
								passed: true,
								head_coverage_rate: "85.5",
								base_coverage_rate: "84.0",
								coverage_delta: "+1.5",
								new_lines_total: 20,
								new_lines_covered: 18,
								new_code_coverage_rate: "90.0",
								regressed_lines_count: 0,
								regressed_files: null,
							},
						},
					},
				],
			};
			const body = generateComment("coverage", 0, response, "");

			expect(body).toContain("## Drape: Coverage Report");
			expect(body).not.toContain("Regressed files");
		});

		it("rounds coverage rates to remove floating point noise", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "",
						result: {
							coverage_diff: {
								passed: false,
								failure_reasons: ["regression"],
								head_coverage_rate: "29.609999999999996",
								base_coverage_rate: "84.59",
								coverage_delta: "-54.980000000000004",
								new_lines_total: 1,
								new_lines_covered: 0,
								new_code_coverage_rate: "0.0",
								regressed_lines_count: 14229,
								regressed_files: [],
							},
						},
					},
				],
			};
			const body = generateComment("coverage", 1, response, "");

			expect(body).toContain("29.61%");
			expect(body).toContain("84.59%");
			expect(body).toContain("-54.98%");
			expect(body).not.toContain("29.609999999999996");
			expect(body).not.toContain("-54.980000000000004");
		});

		it("hides coverage delta when there is no change", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "https://app.drape.io/r/123",
						result: {
							coverage_diff: {
								passed: true,
								head_coverage_rate: "97.54",
								base_coverage_rate: "97.54",
								coverage_delta: "0",
								new_lines_total: 0,
								new_lines_covered: 0,
								new_code_coverage_rate: "0.0",
								regressed_lines_count: 0,
								regressed_files: [],
							},
						},
					},
				],
			};
			const body = generateComment("coverage", 0, response, "");

			expect(body).toContain("97.54%");
			expect(body).not.toContain("(0%)");
		});

		it("hides new code coverage when base and head are identical with no new lines", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "https://app.drape.io/r/123",
						result: {
							coverage_diff: {
								passed: true,
								head_coverage_rate: "97.55",
								base_coverage_rate: "97.55",
								coverage_delta: "0",
								new_lines_total: 0,
								new_lines_covered: 0,
								new_code_coverage_rate: "undefined",
								regressed_lines_count: 0,
								regressed_files: [],
							},
						},
					},
				],
			};
			const body = generateComment("coverage", 0, response, "");

			// Should still show both lines so the user sees coverage didn't change
			expect(body).toContain("Target branch coverage");
			expect(body).toContain("This PR coverage");
			expect(body).toContain("97.55%");
			// Should not show new code coverage when there are 0 new lines
			expect(body).not.toContain("undefined%");
			expect(body).not.toContain("New code coverage");
		});

		it("hides new code coverage line when there are no new lines", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "https://app.drape.io/r/123",
						result: {
							coverage_diff: {
								passed: true,
								head_coverage_rate: "90.00",
								base_coverage_rate: "85.00",
								coverage_delta: "5",
								new_lines_total: 0,
								new_lines_covered: 0,
								new_code_coverage_rate: "undefined",
								regressed_lines_count: 0,
								regressed_files: [],
							},
						},
					},
				],
			};
			const body = generateComment("coverage", 0, response, "");

			// Should still show the diff format since rates differ
			expect(body).toContain("Target branch coverage");
			expect(body).toContain("This PR coverage");
			// Should not show new code coverage when there are 0 new lines
			expect(body).not.toContain("undefined%");
			expect(body).not.toContain("New code coverage");
		});

		it("shows merged file count in header for batch uploads", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "https://app.drape.io/r/123",
						result: {
							coverage_rate: "85.5",
							file_count: "100",
						},
					},
				],
				files_matched: 3,
				files_uploaded: 3,
			};
			const body = generateComment("coverage", 0, response, "");

			expect(body).toContain("## Drape: Coverage Report (3 files merged)");
		});

		it("does not show merged count for single file", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "",
						result: {
							coverage_rate: "85.5",
							file_count: "100",
						},
					},
				],
				files_matched: 1,
				files_uploaded: 1,
			};
			const body = generateComment("coverage", 0, response, "");

			expect(body).toContain("## Drape: Coverage Report");
			expect(body).not.toContain("files merged");
		});

		it("shows placeholder when result is null and exit 0", () => {
			const response: DrapeCliResponse = {
				uploads: [{ drape_url: "", result: null }],
			};
			const body = generateComment("coverage", 0, response, "");

			expect(body).toContain("no result data available yet");
		});

		it("shows failure when result is null and exit non-zero", () => {
			const response: DrapeCliResponse = {
				uploads: [{ drape_url: "", result: null }],
			};
			const body = generateComment("coverage", 1, response, "");

			expect(body).toContain("Upload failed");
			expect(body).toContain("no result was produced");
			expect(body).not.toContain("no result data available yet");
		});
	});

	// --- Tests ---

	describe("tests", () => {
		it("shows suppressed failures passing CI", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "https://app.drape.io/r/456",
						result: {
							tests_ingested: 150,
							failed_count: 3,
							suppressed_count: 3,
							unsuppressed_failure_count: 0,
							flaky_count: 0,
						},
					},
				],
			};
			const body = generateComment("tests", 0, response, "");

			expect(body).toContain("## Drape: Test Results");
			expect(body).toContain("All 3 failure(s) are suppressed");
			expect(body).toContain(":white_check_mark:");
			expect(body).toContain("150");
		});

		it("shows caution for unsuppressed failures", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "",
						result: {
							tests_ingested: 100,
							failed_count: 2,
							suppressed_count: 0,
							unsuppressed_failure_count: 2,
							flaky_count: 0,
						},
					},
				],
			};
			const body = generateComment("tests", 1, response, "");

			expect(body).toContain(":x:");
			expect(body).toContain("2 unsuppressed test failure(s)");
		});

		it("aggregates across multiple uploads", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "https://app.drape.io/r/1",
						result: {
							tests_ingested: 50,
							failed_count: 1,
							suppressed_count: 1,
							unsuppressed_failure_count: 0,
							flaky_count: 0,
						},
					},
					{
						drape_url: "https://app.drape.io/r/2",
						result: {
							tests_ingested: 75,
							failed_count: 2,
							suppressed_count: 2,
							unsuppressed_failure_count: 0,
							flaky_count: 0,
						},
					},
				],
			};
			const body = generateComment("tests", 0, response, "");

			expect(body).toContain("125"); // 50 + 75
			expect(body).toContain("All 3 failure(s) are suppressed");
		});

		it("shows all tests passed when no failures", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "",
						result: {
							tests_ingested: 200,
							failed_count: 0,
							suppressed_count: 0,
							unsuppressed_failure_count: 0,
							flaky_count: 0,
						},
					},
				],
			};
			const body = generateComment("tests", 0, response, "");

			expect(body).toContain("All tests passed");
		});

		it("appends group name to header when provided", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "",
						result: {
							tests_ingested: 200,
							failed_count: 0,
							suppressed_count: 0,
							unsuppressed_failure_count: 0,
							flaky_count: 0,
						},
					},
				],
			};
			const body = generateComment("tests", 0, response, "", "python");

			expect(body).toContain("## Drape: Test Results — python");
		});

		it("comment-title overrides group-based default", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "",
						result: {
							tests_ingested: 200,
							failed_count: 0,
							suppressed_count: 0,
							unsuppressed_failure_count: 0,
							flaky_count: 0,
						},
					},
				],
			};
			const body = generateComment(
				"tests",
				0,
				response,
				"",
				"python",
				"My Custom Title",
			);

			expect(body).toContain("## My Custom Title");
			expect(body).not.toContain("Test Results");
		});

		it("reports flaky test failures with details", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "https://app.drape.io/r/flaky",
						result: {
							tests_ingested: 200,
							failed_count: 4,
							suppressed_count: 2,
							unsuppressed_failure_count: 0,
							flaky_count: 2,
							flaky_tests: [
								{
									name: "test_payment_webhook",
									suite: "payments",
									flake_rate: 0.15,
								},
								{
									name: "test_concurrent_upload",
									suite: "uploads",
									flake_rate: 0.08,
								},
							],
						},
					},
				],
			};
			const body = generateComment("tests", 0, response, "");

			expect(body).toContain("2 known flaky test(s) failed");
			expect(body).toContain("not blocking CI");
			expect(body).toContain("Flaky | 2");
			expect(body).toContain("Flaky tests (2)");
			expect(body).toContain("test_payment_webhook");
			expect(body).toContain("payments");
			expect(body).toContain("15%");
			expect(body).toContain("test_concurrent_upload");
		});

		it("does not show flaky row when count is 0", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "",
						result: {
							tests_ingested: 100,
							failed_count: 0,
							suppressed_count: 0,
							unsuppressed_failure_count: 0,
							flaky_count: 0,
						},
					},
				],
			};
			const body = generateComment("tests", 0, response, "");

			expect(body).not.toContain("Flaky");
			expect(body).not.toContain("flaky");
		});
	});

	// --- Scan ---

	describe("scan", () => {
		it("shows new vulnerabilities with details", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "https://app.drape.io/r/789",
						result: {
							scan_name: "myapp",
							scan_diff: {
								new_critical_count: 1,
								new_high_count: 2,
								new_medium_count: 0,
								new_low_count: 0,
								suppressed_cves_count: 5,
								unchanged_cves_count: 10,
								new_cves: [
									{
										cve_id: "CVE-2024-1234",
										severity: "critical",
										package_name: "openssl",
										package_version: "1.1.1",
										fix_state: "fixed in 1.1.2",
									},
								],
								resolved_cves: [],
								sla_violations: [],
							},
						},
					},
				],
			};
			const body = generateComment("scan", 1, response, "");

			expect(body).toContain("Security Scan — myapp");
			expect(body).toContain("3 new vulnerabilities found");
			expect(body).toContain("1 critical, 2 high");
			expect(body).toContain("CVE-2024-1234");
			expect(body).toContain("nvd.nist.gov");
			expect(body).toContain("Result: Failed");
		});

		it("shows no new vulnerabilities", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "",
						result: {
							scan_diff: {
								new_critical_count: 0,
								new_high_count: 0,
								new_medium_count: 0,
								new_low_count: 0,
								suppressed_cves_count: 3,
								unchanged_cves_count: 10,
								new_cves: [],
								resolved_cves: [],
								sla_violations: [],
							},
						},
					},
				],
			};
			const body = generateComment("scan", 0, response, "");

			expect(body).toContain("No new vulnerabilities found");
			expect(body).toContain(":white_check_mark:");
		});

		it("shows resolved CVEs", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "",
						result: {
							scan_diff: {
								new_critical_count: 0,
								new_high_count: 0,
								new_medium_count: 0,
								new_low_count: 0,
								suppressed_cves_count: 0,
								unchanged_cves_count: 5,
								new_cves: [],
								resolved_cves: [
									{
										cve_id: "CVE-2023-9999",
										severity: "high",
										package_name: "libcurl",
										package_version: "7.0",
									},
								],
								sla_violations: [],
							},
						},
					},
				],
			};
			const body = generateComment("scan", 0, response, "");

			expect(body).toContain("Resolved vulnerabilities (1)");
			expect(body).toContain("CVE-2023-9999");
			expect(body).toContain("HIGH");
		});

		it("shows SLA violations", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "",
						result: {
							scan_diff: {
								new_critical_count: 0,
								new_high_count: 0,
								new_medium_count: 0,
								new_low_count: 0,
								suppressed_cves_count: 0,
								unchanged_cves_count: 0,
								new_cves: [],
								resolved_cves: [],
								sla_violations: [
									{
										cve_id: "CVE-2023-5555",
										severity: "critical",
										package_name: "openssl",
										days_overdue: 30,
									},
								],
							},
						},
					},
				],
			};
			const body = generateComment("scan", 0, response, "");

			expect(body).toContain("SLA Violations (1)");
			expect(body).toContain("30 days");
		});

		it("shows summary when no diff data", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "",
						result: {
							total_vulnerabilities: 15,
							highest_severity: "high",
						},
					},
				],
			};
			const body = generateComment("scan", 0, response, "");

			expect(body).toContain("15");
			expect(body).toContain("high");
		});
	});

	// --- Lint ---

	describe("lint", () => {
		it("shows new violations with table", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "https://app.drape.io/r/lint1",
						result: {
							lint_diff: {
								passed: false,
								failure_reasons: ["new violations introduced"],
								base_violation_count: 10,
								head_violation_count: 13,
								new_violation_count: 3,
								resolved_violation_count: 0,
								suppressed_violation_count: 0,
								new_violations: [
									{
										file_path: "src/app.py",
										line: 42,
										rule_id: "E501",
										severity: "warning",
										message: "line too long",
									},
								],
							},
						},
					},
				],
			};
			const body = generateComment("lint", 1, response, "");

			expect(body).toContain("## Drape: Lint Report");
			expect(body).toContain(":x:");
			expect(body).toContain("Lint check failed");
			expect(body).toContain("new violations introduced");
			expect(body).toContain("`src/app.py`");
			expect(body).toContain("E501");
		});

		it("shows passing lint check", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "",
						result: {
							lint_diff: {
								passed: true,
								base_violation_count: 10,
								head_violation_count: 10,
								new_violation_count: 0,
								resolved_violation_count: 0,
								suppressed_violation_count: 0,
								new_violations: [],
							},
						},
					},
				],
			};
			const body = generateComment("lint", 0, response, "");

			expect(body).toContain(":white_check_mark:");
			expect(body).toContain("Lint check passed");
		});

		it("handles null new_violations without crashing", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "",
						result: {
							lint_diff: {
								passed: true,
								base_violation_count: 0,
								head_violation_count: 0,
								new_violation_count: 0,
								resolved_violation_count: 0,
								suppressed_violation_count: 0,
								new_violations: null,
							},
						},
					},
				],
			};
			const body = generateComment("lint", 0, response, "");

			expect(body).toContain("Lint check passed");
			expect(body).not.toContain("New violations");
		});

		it("shows summary when no diff data", () => {
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "",
						result: {
							total_violations: 5,
							error_count: 2,
							warning_count: 3,
						},
					},
				],
			};
			const body = generateComment("lint", 0, response, "");

			expect(body).toContain("5");
		});
	});

	// --- Error ---

	describe("error", () => {
		it("generates error comment with stderr", () => {
			const response: DrapeCliResponse = { uploads: [] };
			const body = generateComment(
				"coverage",
				1,
				response,
				"connection refused: api.drape.io:443",
			);

			expect(body).toContain("## Drape: Coverage Report");
			expect(body).toContain("Upload failed");
			expect(body).toContain("exit code 1");
			expect(body).toContain("connection refused");
		});

		it("generates error comment without stderr", () => {
			const response: DrapeCliResponse = { uploads: [] };
			const body = generateComment("tests", 2, response, "");

			expect(body).toContain("## Drape: Test Results");
			expect(body).toContain("exit code 2");
			expect(body).not.toContain("Error output");
		});

		it("shows placeholder when result is null and exit 0", () => {
			const response: DrapeCliResponse = {
				uploads: [{ drape_url: "", result: null }],
			};
			const body = generateComment("coverage", 0, response, "");

			expect(body).toContain("no result data available yet");
		});

		it("shows failure when result is null and exit non-zero", () => {
			const response: DrapeCliResponse = {
				uploads: [{ drape_url: "", result: null }],
			};
			const body = generateComment("coverage", 1, response, "");

			expect(body).toContain("Upload failed");
			expect(body).not.toContain("no result data available yet");
		});
	});

	// --- Edge cases ---

	describe("edge cases", () => {
		it("returns empty for no uploads and exit 0", () => {
			const response: DrapeCliResponse = { uploads: [] };
			const body = generateComment("coverage", 0, response, "");
			expect(body).toBe("");
		});

		it("handles missing uploads array", () => {
			const response = {} as DrapeCliResponse;
			const body = generateComment("coverage", 0, response, "");
			expect(body).toBe("");
		});

		it("handles large payload without issues", () => {
			const files = Array.from({ length: 5000 }, (_, i) => ({
				file_path: `src/pkg${i}/file${i}.go`,
				regressed_lines: i,
				regressed_line_ranges: [[i, i + 10]] as [number, number][],
			}));
			const response: DrapeCliResponse = {
				uploads: [
					{
						drape_url: "https://app.drape.io/r/big",
						result: {
							coverage_diff: {
								passed: false,
								failure_reasons: ["too many regressions"],
								head_coverage_rate: "60.0",
								base_coverage_rate: "80.0",
								coverage_delta: "-20.0",
								new_lines_total: 10000,
								new_lines_covered: 5000,
								new_code_coverage_rate: "50.0",
								regressed_lines_count: 5000,
								regressed_files: files,
							},
						},
					},
				],
			};
			const body = generateComment("coverage", 1, response, "");

			expect(body).toContain("Regressed files (5000 file(s)");
			expect(body.length).toBeGreaterThan(100000);
		});
	});
});

describe("generateErrorComment", () => {
	it("uses correct title per command", () => {
		expect(generateErrorComment("coverage", 1, "")).toContain(
			"Coverage Report",
		);
		expect(generateErrorComment("tests", 1, "")).toContain("Test Results");
		expect(generateErrorComment("scan", 1, "")).toContain("Security Scan");
		expect(generateErrorComment("lint", 1, "")).toContain("Lint Report");
	});
});
