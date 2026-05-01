#!/usr/bin/env bash
#
# copilot-replies.sh — bulk-reply to every open Copilot review comment on
# a PR with the same message, then resolve the COPILOT-AUTHORED review
# threads (leaving any human-reviewer threads untouched).
#
# Usage:
#   ./copilot-replies.sh <PR_NUMBER> "<reply message>"
#   ./copilot-replies.sh 289 "Fixed in ee27fb6. Both valid catches: ..."
#
# Why this script exists:
#   1. The `/comments` endpoint reports `user.login == "Copilot"` (capital C),
#      while the `/reviews` endpoint reports `copilot-pull-request-reviewer[bot]`.
#      A naive `startswith("copilot")` filter misses the comments. Spent 30 min
#      debugging this once; the script encapsulates the right filter.
#   2. The reply-then-resolve dance is two GraphQL calls per thread; keeping
#      it as a one-liner in chat is error-prone.
#
# Idempotency:
#   - Reply step: skips any top-level comment that already has a reply
#     authored by the current `gh auth` user. Re-running the script
#     therefore does NOT spam duplicate replies. Copilot caught the
#     original non-idempotent shape on #293.
#   - Resolve step: queries reviewThreads with the FIRST comment's author,
#     filters to Copilot-authored threads only. Human-reviewer threads
#     stay open until a human resolves them. Copilot caught the
#     "resolves everyone's threads" shape on #293.
#
# Discipline note (from memory):
#   Replies should cite the fix commit SHA. Pass the message accordingly,
#   e.g. "Fixed in <sha>. <one-sentence-rationale>".

set -euo pipefail

usage() {
  echo "usage: $0 <pr-number> '<reply message>'" >&2
  exit 2
}

[ "$#" -eq 2 ] || usage

PR="$1"
MESSAGE="$2"
REPO="Budojo/budojo"
ME="$(gh api user --jq '.login')"

# Reply to every TOP-LEVEL Copilot comment (in_reply_to_id == null) that
# I haven't replied to yet. The "already replied" check looks for any
# nested reply on the SAME comment id whose author is `$ME`.
ALL_COMMENTS_JSON=$(gh api "repos/$REPO/pulls/$PR/comments")

COPILOT_TOP_LEVEL=$(echo "$ALL_COMMENTS_JSON" \
  | jq -r '.[] | select(.user.login == "Copilot") | select(.in_reply_to_id == null) | .id')

if [ -z "$COPILOT_TOP_LEVEL" ]; then
  echo "no Copilot comments on PR #$PR"
else
  for CID in $COPILOT_TOP_LEVEL; do
    ALREADY_REPLIED=$(echo "$ALL_COMMENTS_JSON" \
      | jq -r --arg cid "$CID" --arg me "$ME" \
        '[.[] | select(.in_reply_to_id == ($cid | tonumber)) | select(.user.login == $me)] | length')
    if [ "$ALREADY_REPLIED" -gt 0 ]; then
      echo "skip comment $CID (already replied as $ME)"
      continue
    fi
    gh api "repos/$REPO/pulls/$PR/comments/$CID/replies" \
      -X POST \
      -f body="$MESSAGE" > /dev/null
    echo "replied to comment $CID"
  done
fi

# Resolve only the Copilot-authored review threads. The GraphQL query
# returns the FIRST comment in each thread; we filter on its author and
# the `isResolved` flag. Human-reviewer threads (and threads where I
# replied first, if any) are intentionally left alone.
gh api graphql \
  -f query="query {
    repository(owner: \"Budojo\", name: \"budojo\") {
      pullRequest(number: $PR) {
        reviewThreads(first: 50) {
          nodes {
            id
            isResolved
            comments(first: 1) {
              nodes { author { login } }
            }
          }
        }
      }
    }
  }" \
  --jq '.data.repository.pullRequest.reviewThreads.nodes[]
        | select(.isResolved == false)
        | select((.comments.nodes[0].author.login // "") | test("(?i)^copilot"))
        | .id' \
  | while read -r TID; do
      [ -n "$TID" ] || continue
      gh api graphql \
        -f query="mutation { resolveReviewThread(input: {threadId: \"$TID\"}) { thread { isResolved } } }" \
        --jq '.data.resolveReviewThread.thread.isResolved' > /dev/null
      echo "resolved thread $TID"
    done

echo "done"
