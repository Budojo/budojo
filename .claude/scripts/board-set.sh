#!/usr/bin/env bash
#
# board-set.sh — set the project-board status field for an issue or PR
# in the budojo project (Project #2).
#
# Usage:
#   ./board-set.sh <issue-or-pr-number> <todo|in-progress|done>
#   ./board-set.sh 287 in-progress
#
# What it does:
#   1. Looks up the GitHub object's node ID via `gh issue view` / `gh pr view`.
#   2. Adds it to the project (idempotent — re-adding returns the same item).
#   3. Sets the Status field to the requested value.
#
# Why: this 3-step pipeline used to live as inline bash in every PR I opened.
# Hardcoded IDs (project, field, options) live ONLY here so the rest of the
# workflow stops carrying GraphQL boilerplate.

set -euo pipefail

PROJECT_ID="PVT_kwHOAsnvsM4BVW8P"
STATUS_FIELD_ID="PVTSSF_lAHOAsnvsM4BVW8PzhQzRlk"

usage() {
  echo "usage: $0 <issue-or-pr-number> <todo|in-progress|done>" >&2
  exit 2
}

[ "$#" -eq 2 ] || usage

NUMBER="$1"
STATUS="$2"

case "$STATUS" in
  todo)        OPTION_ID="f75ad846" ;;
  in-progress) OPTION_ID="47fc9ee4" ;;
  done)        OPTION_ID="98236657" ;;
  *)
    echo "error: unknown status '$STATUS' (expected todo | in-progress | done)" >&2
    usage
    ;;
esac

# `gh issue view` works for both issues AND PRs — GitHub returns the same
# node-id shape for either, just different `__typename`. Saves a separate
# code path to disambiguate the input number.
NODE_ID=$(gh issue view "$NUMBER" --json id --jq '.id' 2>/dev/null \
        || gh pr view "$NUMBER" --json id --jq '.id')

if [ -z "$NODE_ID" ]; then
  echo "error: no issue or PR #$NUMBER found in this repo" >&2
  exit 1
fi

ITEM_ID=$(gh api graphql \
  -f query='mutation($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
      item { id }
    }
  }' \
  -f projectId="$PROJECT_ID" \
  -f contentId="$NODE_ID" \
  --jq '.data.addProjectV2ItemById.item.id')

gh api graphql \
  -f query="mutation {
    updateProjectV2ItemFieldValue(input: {
      projectId: \"$PROJECT_ID\"
      itemId: \"$ITEM_ID\"
      fieldId: \"$STATUS_FIELD_ID\"
      value: { singleSelectOptionId: \"$OPTION_ID\" }
    }) {
      projectV2Item { id }
    }
  }" \
  --jq '.data.updateProjectV2ItemFieldValue.projectV2Item.id' \
  > /dev/null

echo "#$NUMBER → $STATUS (item $ITEM_ID)"
