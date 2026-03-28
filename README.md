# Drape Action

A GitHub Action for uploading coverage, test results, security scans, and lint reports to [Drape](https://app.drape.io). Posts rich PR comments with results including coverage regressions, new vulnerabilities, and test suppression status.

**[Documentation](https://docs.drape.io/)**

## Usage

### Coverage

```yaml
- uses: drape-io/drape-action@v1
  if: always()
  continue-on-error: true
  with:
    command: coverage
    file: coverage.xml
    format: cobertura
    api-key: ${{ secrets.DRAPE_API_KEY }}
```

### Test Results

```yaml
- uses: drape-io/drape-action@v1
  if: always()
  continue-on-error: true
  with:
    command: tests
    file: test-results/junit.xml
    api-key: ${{ secrets.DRAPE_API_KEY }}
```

### Security Scan

```yaml
- uses: drape-io/drape-action@v1
  if: always()
  continue-on-error: true
  with:
    command: scan
    file: 'scan-results/*.sarif'
    format: sarif
    scan-name: my-app
    scan-type: dependency
    fail-on-vulnerabilities: 'true'
    fail-on-severity: high
    api-key: ${{ secrets.DRAPE_API_KEY }}
```

### Lint

```yaml
- uses: drape-io/drape-action@v1
  if: always()
  continue-on-error: true
  with:
    command: lint
    file: lint-results/lint.sarif
    api-key: ${{ secrets.DRAPE_API_KEY }}
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `command` | Yes | | Upload type: `coverage`, `tests`, `scan`, `lint` |
| `file` | Yes | | File path or glob pattern |
| `api-key` | Yes | | Drape API key |
| `org` | No | `github.repository_owner` | Drape organization slug |
| `repo` | No | `github.repository` | Drape repository name |
| `cli-version` | No | `latest` | Drape CLI version |
| `api-url` | No | `https://app.drape.io` | Drape API URL |
| `wait` | No | `true` | Wait for server-side processing |
| `timeout` | No | `120` | Max wait time in seconds |
| `verbose` | No | `false` | Enable verbose CLI output |
| `group` | No | | Group label(s) |
| `format` | No | | File format (auto-detected for some types) |
| `comment` | No | `true` | Post a PR comment with results |
| `comment-header` | No | `drape-{command}` | Sticky comment identifier |
| `github-token` | No | `github.token` | GitHub token for posting comments |

### Coverage-specific

| Input | Description |
|-------|-------------|
| `path-prefix` | Path prefix mapping for coverage files |
| `target-branch` | Target branch for PR diff (auto-detected) |

### Scan-specific

| Input | Default | Description |
|-------|---------|-------------|
| `scan-name` | | Scan name (e.g. docker image name) |
| `scan-tag` | | Scan tag (e.g. image tag) |
| `scan-type` | | `image` or `dependency` |
| `fail-on-vulnerabilities` | `false` | Exit non-zero if unsuppressed vulns found |
| `fail-on-severity` | `medium` | Minimum severity: `critical`, `high`, `medium`, `low`, `any` |

### Tests-specific

| Input | Description |
|-------|-------------|
| `job-name` | CI job name (auto-detected) |

## Outputs

| Output | Description |
|--------|-------------|
| `exit-code` | CLI exit code |
| `result-json` | Raw JSON result from the CLI |
| `passed` | Whether the check passed (`true`/`false`) |
| `comment-body` | Generated comment markdown |

## Permissions

The action requires:
- **`pull-requests: write`** — for posting PR comments
- **`contents: read`** — for checkout (if not already checked out)

```yaml
permissions:
  contents: read
  pull-requests: write
```

## PR Comments

Comments are posted as sticky (updating) comments on pull requests. Each command type gets its own comment, identified by a header key (`drape-coverage`, `drape-tests`, etc.). Comments include:

- **Coverage**: head/base rates with diff highlighting, new code coverage, regressed lines with file paths and line ranges
- **Tests**: ingested count, failures, suppression status, flaky test details
- **Security Scan**: severity breakdown table, new/resolved CVEs with NVD links, SLA violations
- **Lint**: violation counts with diff highlighting, new violations with file/line/rule details

To disable comments, set `comment: 'false'`.

## Development

```bash
mise install          # install Node 24
just install          # install npm dependencies
just check            # run all checks (lint, typecheck, test, dist-check)
just preview          # preview all comment templates locally
just post-samples 5   # post sample comments on PR #5
```

## License

Apache 2.0 — see [LICENSE](LICENSE).
