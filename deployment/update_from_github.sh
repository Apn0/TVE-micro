#!/usr/bin/env bash
set -euo pipefail

# Automatically update the repository from GitHub while preserving heavy ignored
# directories (e.g., frontend/node_modules). The script expects to run from the
# project root or any subdirectory within the repo.
#
# Optional environment variables:
#   REMOTE      - Git remote to pull from (default: origin)
#   BRANCH      - Branch to update to (default: current branch)
#   REMOTE_URL  - Remote URL to add if REMOTE is missing
#   CLEAN_UNTRACKED - If "1" or "true", also remove untracked files (ignored
#                     paths such as node_modules are still preserved)

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

REMOTE="${REMOTE:-origin}"
IGNORED_TARGETS=(
  "frontend/node_modules"
  "node_modules"
  "frontend/dist"
  "dist"
  "backend/.venv"
  ".venv"
  "verification_env"
)

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "This script must be run inside a git repository."
    exit 1
fi

if ! git config --get remote."$REMOTE".url >/dev/null 2>&1; then
    if [[ -n "${REMOTE_URL:-}" ]]; then
        echo "Adding remote '$REMOTE' -> $REMOTE_URL"
        git remote add "$REMOTE" "$REMOTE_URL"
    else
        echo "Remote '$REMOTE' not configured. Set REMOTE or REMOTE_URL."
        exit 1
    fi
fi

if ! git fetch "$REMOTE" --prune; then
    echo "Failed to fetch from $REMOTE."
    exit 1
fi

if [[ -z "${BRANCH:-}" ]]; then
    CURRENT_BRANCH="$(git symbolic-ref --quiet --short HEAD || true)"
    if [[ -n "$CURRENT_BRANCH" ]]; then
        BRANCH="$CURRENT_BRANCH"
    else
        REMOTE_HEAD="$(git symbolic-ref --quiet --short "refs/remotes/$REMOTE/HEAD" || true)"
        if [[ -n "$REMOTE_HEAD" ]]; then
            BRANCH="${REMOTE_HEAD#${REMOTE}/}"
            echo "No local branch detected; defaulting to remote HEAD '$BRANCH'."
        else
            echo "Unable to detect a branch. Set BRANCH explicitly."
            exit 1
        fi
    fi
fi

if ! git rev-parse --verify "$REMOTE/$BRANCH" >/dev/null 2>&1; then
    echo "Branch '$BRANCH' not found on remote '$REMOTE'."
    exit 1
fi

DIRTY=0
if ! git diff --quiet || ! git diff --cached --quiet; then
    DIRTY=1
fi

if [[ "$DIRTY" -eq 1 ]]; then
    STASH_NAME="pre-update-$(date +%Y%m%d%H%M%S)"
    echo "Stashing local changes as '$STASH_NAME'..."
    git stash push -u -m "$STASH_NAME" >/dev/null
fi

echo "Checking out '$BRANCH'..."
git checkout "$BRANCH" >/dev/null

echo "Resetting working tree to '$REMOTE/$BRANCH'..."
git reset --hard "$REMOTE/$BRANCH" >/dev/null

if [[ "${CLEAN_UNTRACKED:-}" == "1" || "${CLEAN_UNTRACKED:-}" == "true" ]]; then
    echo "Cleaning untracked files (ignored paths remain untouched)..."
    git clean -fd
fi

if [[ "$DIRTY" -eq 1 ]]; then
    echo "Local changes were stashed. Run 'git stash list' to review and"
    echo "'git stash pop' to reapply if needed."
fi

echo "Update complete. Ignored directories remain untouched:"
for target in "${IGNORED_TARGETS[@]}"; do
    echo "  - $target"
done
