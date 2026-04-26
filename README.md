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

### Advanced: Batched coverage (sharded tests)

When a CI run shards tests across multiple jobs, set `total-shards` to the shard count so the server merges partial coverage into one snapshot and posts a single PR comment. Use `job-name` to differentiate shards in the Drape dashboard:

```yaml
test:
  strategy:
    matrix:
      shard: [1, 2, 3, 4]
  steps:
    - run: pytest --shard=${{ matrix.shard }}/4
    - uses: drape-io/drape-action@v1
      if: always()
      continue-on-error: true
      with:
        command: coverage
        file: coverage.xml
        total-shards: 4
        group: backend                              # logical coverage group
        job-name: backend (${{ matrix.shard }}/4)   # unique per shard
        api-key: ${{ secrets.DRAPE_API_KEY }}
```

Result: one merged PR comment across all 4 shards (instead of 4 separate comments).

If your shard count is dynamic, `total-shards: ${{ strategy.job-total }}` works too.

With default `wait: true`, each shard blocks until all `total-shards` shards arrive (or the 5-min server-side reaper fires if a shard crashes). Budget CI minutes accordingly. `shard-key` is usually auto-derived from `GITHUB_RUN_ID`; set it manually only if auto-detection can't produce a unique key.

**Drape-triggered runs.** If Drape triggers a CI workflow (e.g., burn-in or bisect), it passes `DRAPE_RUN_ID` as an environment variable — the CLI picks it up automatically, so you usually don't need to set `drape-run-id` explicitly. Set the input only when you want to override the env-derived value.

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
| `wait-timeout` | No | `10m` | Max wait time, e.g. `90s`, `3m`, `10m`, `1h30m` |
| `verbose` | No | `false` | Enable verbose CLI output |
| `group` | No | | Group label(s) |
| `drape-run-id` | No | | Correlation ID for Drape-triggered CI runs (coverage/tests only; env fallback: `DRAPE_RUN_ID`) |
| `format` | No | | File format (auto-detected for some types) |
| `comment` | No | `true` | Post a PR comment with results |
| `comment-header` | No | `drape-{command}` | Sticky comment identifier |
| `github-token` | No | `github.token` | GitHub token for posting comments |

### Coverage-specific

| Input | Description |
|-------|-------------|
| `path-prefix` | Path prefix mapping for coverage files |
| `target-branch` | Target branch for PR diff (auto-detected) |
| `shard-key` | Shared ID across sibling matrix shards (auto-derived from `GITHUB_RUN_ID`) |
| `total-shards` | Number of shards across all CI jobs; enables server-side merge (must be >= 2) |

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

## Releases

Releases are cut by pushing a `vX.Y.Z` tag. A GitHub Actions workflow (`.github/workflows/release.yml`) picks up the tag and creates a GitHub Release with auto-generated notes.

From a clean `main`:

```bash
just release v1.0.0
```

This recipe:

1. Validates the version format (`vX.Y.Z`) and confirms you're on `main` with a clean tree that's up to date with `origin/main`.
2. Creates and pushes an annotated `vX.Y.Z` tag.
3. Moves the rolling major tag (`vX`) so `drape-io/drape-action@v1` resolves to the newest `v1.y.z`. Force-push is intentional — this is the standard GitHub Actions convention for major-version refs.

Bump `MAJOR` on breaking changes to Action inputs/outputs, `MINOR` on additive features (new inputs, new optional behaviors), `PATCH` on bug fixes.

## License

Apache 2.0 — see [LICENSE](LICENSE).
