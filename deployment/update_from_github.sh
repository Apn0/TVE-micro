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
REMOTE_HEAD=""
EXPLICIT_BRANCH=0
if [[ -n "${BRANCH+x}" ]]; then
    EXPLICIT_BRANCH=1
fi
LOCAL_ONLY=0
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
    read -r -a AVAILABLE_REMOTES <<< "$(git remote | tr '\n' ' ')"
    if [[ -n "${REMOTE_URL:-}" ]]; then
        echo "Adding remote '$REMOTE' -> $REMOTE_URL"
        git remote add "$REMOTE" "$REMOTE_URL"
    elif [[ "$REMOTE" == "origin" && ${#AVAILABLE_REMOTES[@]} -eq 1 ]]; then
        REMOTE="${AVAILABLE_REMOTES[0]}"
        echo "Remote 'origin' not configured; defaulting to existing remote '$REMOTE'."
        echo "Set REMOTE to override or REMOTE_URL to add 'origin'."
    elif [[ ${#AVAILABLE_REMOTES[@]} -gt 0 && -t 0 && -t 1 ]]; then
        echo "Remote '$REMOTE' not configured. Available remotes: ${AVAILABLE_REMOTES[*]}"
        read -r -p "Select remote to use [${AVAILABLE_REMOTES[*]}]: " CHOSEN_REMOTE
        if [[ -n "$CHOSEN_REMOTE" && " ${AVAILABLE_REMOTES[*]} " == *" $CHOSEN_REMOTE "* ]]; then
            REMOTE="$CHOSEN_REMOTE"
            echo "Using remote '$REMOTE'. Set REMOTE to skip the prompt next time."
        else
            echo "Invalid selection. Set REMOTE or REMOTE_URL explicitly."
            exit 1
        fi
    elif [[ -t 0 && -t 1 ]]; then
        read -r -p "Remote '$REMOTE' missing. Enter URL to add as '$REMOTE' (leave empty to continue without a remote): " REMOTE_URL_INPUT
        if [[ -n "$REMOTE_URL_INPUT" ]]; then
            REMOTE_URL="$REMOTE_URL_INPUT"
            echo "Adding remote '$REMOTE' -> $REMOTE_URL"
            git remote add "$REMOTE" "$REMOTE_URL"
        elif [[ "${ALLOW_LOCAL_ONLY:-}" == "1" || "${ALLOW_LOCAL_ONLY:-}" == "true" ]]; then
            echo "Remote '$REMOTE' not configured. Proceeding in local-only mode (no fetch)."
            LOCAL_ONLY=1
        else
            read -r -p "Proceed without a remote? [y/N]: " LOCAL_ONLY_REPLY
            if [[ "$LOCAL_ONLY_REPLY" =~ ^[Yy]$ ]]; then
                echo "Proceeding in local-only mode (no fetch). Set ALLOW_LOCAL_ONLY=true to skip this prompt."
                LOCAL_ONLY=1
            else
                echo "Remote '$REMOTE' not configured. Set REMOTE, REMOTE_URL, or ALLOW_LOCAL_ONLY=true."
                exit 1
            fi
        fi
    elif [[ "$REMOTE" == "origin" && ${#AVAILABLE_REMOTES[@]} -gt 1 ]]; then
        echo "Remote '$REMOTE' not configured. Available remotes: ${AVAILABLE_REMOTES[*]}"
        echo "Set REMOTE to choose one, provide REMOTE_URL to add '$REMOTE', or set ALLOW_LOCAL_ONLY=true to skip using a remote."
        exit 1
    else
        if [[ "${ALLOW_LOCAL_ONLY:-}" == "1" || "${ALLOW_LOCAL_ONLY:-}" == "true" ]]; then
            echo "Remote '$REMOTE' not configured. Proceeding in local-only mode (no fetch)."
            LOCAL_ONLY=1
        else
            echo "Remote '$REMOTE' not configured. Set REMOTE, REMOTE_URL, or ALLOW_LOCAL_ONLY=true."
            exit 1
        fi
    fi
fi

if [[ "$LOCAL_ONLY" -eq 0 ]]; then
    if ! git fetch "$REMOTE" --prune; then
        echo "Failed to fetch from $REMOTE."
        exit 1
    fi
fi

detect_remote_head() {
    # Try the locally tracked remote HEAD first.
    local head_ref
    head_ref="$(git symbolic-ref --quiet --short "refs/remotes/$REMOTE/HEAD" || true)"
    if [[ -n "$head_ref" ]]; then
        echo "${head_ref#${REMOTE}/}"
        return 0
    fi

    # Fallback: query the remote directly for its HEAD symbolic ref.
    # Example output line: "ref: refs/heads/main\tHEAD" -> extract "main".
    # Some git versions emit spaces instead of tabs, so match any whitespace.
    local ls_remote_head
    ls_remote_head="$(git ls-remote --symref "$REMOTE" HEAD 2>/dev/null | awk '$NF=="HEAD" {print $1}' || true)"
    if [[ -n "$ls_remote_head" ]]; then
        ls_remote_head="${ls_remote_head#ref: }"
        ls_remote_head="${ls_remote_head#refs/heads/}"
        if [[ -n "$ls_remote_head" ]]; then
            echo "$ls_remote_head"
            return 0
        fi
    fi

    return 1
}

choose_remote_default_branch() {
    local candidate

    if candidate="$(detect_remote_head || true)" && [[ -n "$candidate" ]]; then
        echo "$candidate"
        return 0
    fi

    for candidate in main master; do
        if git rev-parse --verify "$REMOTE/$candidate" >/dev/null 2>&1; then
            echo "$candidate"
            return 0
        fi
    done

    return 1
}

if [[ -z "${BRANCH:-}" ]]; then
    CURRENT_BRANCH="$(git symbolic-ref --quiet --short HEAD || true)"
    if [[ -n "$CURRENT_BRANCH" && "$CURRENT_BRANCH" != "HEAD" ]]; then
        BRANCH="$CURRENT_BRANCH"
    else
        if [[ "$LOCAL_ONLY" -eq 0 ]]; then
            REMOTE_HEAD="$(choose_remote_default_branch || true)"
            if [[ -n "$REMOTE_HEAD" ]]; then
                BRANCH="$REMOTE_HEAD"
                echo "No local branch detected; defaulting to remote default branch '$BRANCH'."
            else
                echo "Unable to detect a branch. Set BRANCH explicitly."
                exit 1
            fi
        elif git rev-parse --verify HEAD >/dev/null 2>&1; then
            BRANCH="HEAD"
            echo "No branch or remote found; using current HEAD in local-only mode."
        else
            echo "Unable to detect a branch. Set BRANCH explicitly."
            exit 1
        fi
    fi
fi

if [[ "$LOCAL_ONLY" -eq 0 ]]; then
    if ! git rev-parse --verify "$REMOTE/$BRANCH" >/dev/null 2>&1; then
        if [[ "$EXPLICIT_BRANCH" -eq 1 ]]; then
            echo "Branch '$BRANCH' not found on remote '$REMOTE'."
            exit 1
        fi

        if [[ -z "$REMOTE_HEAD" ]]; then
            REMOTE_HEAD="$(choose_remote_default_branch || true)"
        fi

        if [[ -n "$REMOTE_HEAD" ]]; then
            FALLBACK_BRANCH="$REMOTE_HEAD"
            echo "Branch '$BRANCH' not found on remote '$REMOTE'."
            if [[ -t 0 && -t 1 ]]; then
                read -r -p "Use remote default branch '$FALLBACK_BRANCH' instead? [Y/n]: " FALLBACK_REPLY
                if [[ "$FALLBACK_REPLY" =~ ^[Nn]$ ]]; then
                    echo "Set BRANCH to an existing remote branch and rerun."
                    exit 1
                fi
            fi
            BRANCH="$FALLBACK_BRANCH"
            echo "Falling back to remote default branch '$BRANCH'."
        else
            echo "Branch '$BRANCH' not found on remote '$REMOTE', and no remote default branch detected."
            echo "Set BRANCH to an existing remote branch and rerun."
            exit 1
        fi
    fi
elif ! git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
    echo "Local branch or ref '$BRANCH' not found. Set BRANCH explicitly."
    exit 1
fi

DIRTY=0
if ! git diff --quiet || ! git diff --cached --quiet; then
    DIRTY=1
fi

HAS_HEAD=1
if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
    HAS_HEAD=0
fi

if [[ "$DIRTY" -eq 1 ]]; then
    if [[ "$HAS_HEAD" -eq 0 ]]; then
        echo "Working tree has changes but the repository has no commits to stash."
        echo "Please commit or remove changes before running this script."
        exit 1
    fi
    STASH_NAME="pre-update-$(date +%Y%m%d%H%M%S)"
    echo "Stashing local changes as '$STASH_NAME'..."
    git stash push -u -m "$STASH_NAME" >/dev/null
fi

if [[ "$LOCAL_ONLY" -eq 0 ]]; then
    echo "Checking out '$BRANCH'..."
    git checkout -B "$BRANCH" "$REMOTE/$BRANCH" >/dev/null

    echo "Resetting working tree to '$REMOTE/$BRANCH'..."
    git reset --hard "$REMOTE/$BRANCH" >/dev/null
else
    TARGET_REF="$BRANCH"
    echo "Checking out local '$TARGET_REF' (no remote fetch)..."
    git checkout "$TARGET_REF" >/dev/null
    echo "Resetting working tree to '$TARGET_REF'..."
    git reset --hard "$TARGET_REF" >/dev/null
fi

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
