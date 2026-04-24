# Node is managed by mise — see .mise.toml

# List available recipes
default:
    @just --list

# Install dependencies
install:
    npm ci

# Run linter
lint:
    npx biome check .

# Fix lint issues
lint-fix:
    npx biome check --write .

# Run type checker
typecheck:
    npx tsc --noEmit

# Run tests
test:
    npx vitest run

# Run tests in watch mode
test-watch:
    npx vitest

# Build dist bundle
build:
    npx ncc build src/main.ts -o dist --source-map --license licenses.txt

# Run all checks (lint, typecheck, test, build)
all: lint typecheck test build

# Verify dist/ is up to date
dist-check: build
    #!/usr/bin/env bash
    if [ -n "$(git diff --name-only dist/)" ]; then
        echo "error: dist/ is out of date. Run 'just build' and commit."
        git diff --stat dist/
        exit 1
    fi
    echo "dist/ is up to date"

# Preview all comment templates locally
preview:
    npx tsx tests/preview-comments.ts

# Post sample comments on a PR for review
post-samples pr:
    bash tests/post-sample-comments.sh {{pr}}

# Run the pre-commit checks (same as CI)
check: lint typecheck test dist-check

# Cut a release. Creates and pushes vX.Y.Z and moves the rolling vX major
# tag. The release workflow (.github/workflows/release.yml) creates the
# GitHub Release with auto-generated notes.
#
# Usage: just release v1.0.0
release VERSION:
    #!/usr/bin/env bash
    set -euo pipefail

    if [[ ! "{{VERSION}}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "error: VERSION must be v<major>.<minor>.<patch> (e.g., v1.0.0)"
        exit 1
    fi

    branch=$(git branch --show-current)
    if [ "$branch" != "main" ]; then
        echo "error: must release from main (currently on $branch)"
        exit 1
    fi

    if [ -n "$(git status --porcelain)" ]; then
        echo "error: working tree is dirty — commit or stash first"
        exit 1
    fi

    git fetch origin main --tags
    if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
        echo "error: local main is not up to date with origin/main"
        exit 1
    fi

    if git rev-parse "{{VERSION}}" >/dev/null 2>&1; then
        echo "error: tag {{VERSION}} already exists"
        exit 1
    fi

    major=$(echo "{{VERSION}}" | grep -oE '^v[0-9]+')

    git tag -a "{{VERSION}}" -m "{{VERSION}}"
    git push origin "{{VERSION}}"

    # Move the rolling major tag so drape-io/drape-action@v1 resolves to
    # this release. Force-push is intentional — this is the standard
    # convention for major-version action refs.
    git tag -fa "$major" -m "$major"
    git push origin "$major" --force

    echo ""
    echo "Released {{VERSION}} (and updated $major)."
    echo "  https://github.com/drape-io/drape-action/releases/tag/{{VERSION}}"
