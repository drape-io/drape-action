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
