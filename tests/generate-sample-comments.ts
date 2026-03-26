import { generateComment, generateErrorComment } from "../src/comment.js";

const comments = [
	{
		header: "drape-coverage-pass",
		body: generateComment(
			"coverage",
			0,
			{
				uploads: [
					{
						drape_url: "https://app.drape.io/r/coverage-123",
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
			},
			"",
		),
	},
	{
		header: "drape-coverage-fail",
		body: generateComment(
			"coverage",
			1,
			{
				uploads: [
					{
						drape_url: "https://app.drape.io/r/coverage-456",
						result: {
							coverage_diff: {
								passed: false,
								failure_reasons: [
									"coverage decreased",
									"new code below threshold",
								],
								head_coverage_rate: "80.0",
								base_coverage_rate: "84.0",
								coverage_delta: "-4.0",
								new_lines_total: 20,
								new_lines_covered: 10,
								new_code_coverage_rate: "50.0",
								regressed_lines_count: 12,
								regressed_files: [
									{
										file_path: "src/handlers/auth.go",
										regressed_lines: 8,
										regressed_line_ranges: [
											[45, 52],
											[78, 80],
										],
									},
									{
										file_path: "src/middleware/cors.go",
										regressed_lines: 4,
										regressed_line_ranges: [[12, 16]],
									},
								],
							},
						},
					},
				],
			},
			"",
		),
	},
	{
		header: "drape-tests-pass",
		body: generateComment(
			"tests",
			0,
			{
				uploads: [
					{
						drape_url: "https://app.drape.io/r/tests-789",
						result: {
							tests_ingested: 342,
							failed_count: 3,
							suppressed_count: 3,
							unsuppressed_failure_count: 0,
						},
					},
				],
			},
			"",
		),
	},
	{
		header: "drape-tests-fail",
		body: generateComment(
			"tests",
			1,
			{
				uploads: [
					{
						drape_url: "https://app.drape.io/r/tests-101",
						result: {
							tests_ingested: 342,
							failed_count: 5,
							suppressed_count: 2,
							unsuppressed_failure_count: 3,
						},
					},
				],
			},
			"",
		),
	},
	{
		header: "drape-scan-fail",
		body: generateComment(
			"scan",
			1,
			{
				uploads: [
					{
						drape_url: "https://app.drape.io/r/scan-202",
						result: {
							scan_name: "webapp:latest",
							scan_diff: {
								new_critical_count: 1,
								new_high_count: 2,
								new_medium_count: 1,
								new_low_count: 0,
								suppressed_cves_count: 5,
								unchanged_cves_count: 23,
								new_cves: [
									{
										cve_id: "CVE-2024-38821",
										severity: "critical",
										package_name: "spring-security-core",
										package_version: "6.3.3",
										fix_state: "fixed in 6.3.4",
									},
									{
										cve_id: "CVE-2024-22262",
										severity: "high",
										package_name: "spring-web",
										package_version: "6.1.6",
										fix_state: "fixed in 6.1.7",
									},
								],
								resolved_cves: [
									{
										cve_id: "CVE-2023-44487",
										severity: "high",
										package_name: "netty-codec-http2",
										package_version: "4.1.97",
									},
								],
								sla_violations: [
									{
										cve_id: "CVE-2024-38821",
										severity: "critical",
										package_name: "spring-security-core",
										days_overdue: 15,
									},
								],
							},
						},
					},
				],
			},
			"",
		),
	},
	{
		header: "drape-lint-fail",
		body: generateComment(
			"lint",
			1,
			{
				uploads: [
					{
						drape_url: "https://app.drape.io/r/lint-404",
						result: {
							lint_diff: {
								passed: false,
								failure_reasons: ["new violations introduced"],
								base_violation_count: 42,
								head_violation_count: 45,
								new_violation_count: 5,
								resolved_violation_count: 2,
								suppressed_violation_count: 1,
								new_violations: [
									{
										file_path: "src/handlers/auth.go",
										line: 45,
										rule_id: "errcheck",
										severity: "error",
										message:
											"Error return value of `(*DB).Close` is not checked",
									},
									{
										file_path: "src/middleware/cors.go",
										line: 12,
										rule_id: "unused",
										severity: "error",
										message: "field `timeout` is unused",
									},
								],
							},
						},
					},
				],
			},
			"",
		),
	},
	{
		header: "drape-error",
		body: generateErrorComment(
			"coverage",
			1,
			"Error: unable to connect to api.drape.io:443\nconnection timed out after 30s",
		),
	},
];

for (const c of comments) {
	const markedBody = `<!-- ${c.header} -->\n**Sample comment for PR review — this is how the comment will look in production:**\n\n${c.body}`;
	console.log(JSON.stringify({ header: c.header, body: markedBody }));
}
