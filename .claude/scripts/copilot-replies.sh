#!/usr/bin/env bash
#
# copilot-replies.sh — bulk-reply to every open Copilot review comment on
# a PR with the same message, then resolve all open review threads.
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
REPO="m-bonanno/budojo"

# Reply to every TOP-LEVEL Copilot comment (in_reply_to_id == null). The
# /comments endpoint returns `user.login == "Copilot"` (capital C, no
# bracketed [bot] suffix). Replies are nested children, skip them so the
# script stays idempotent.
COMMENT_IDS=$(gh api "repos/$REPO/pulls/$PR/comments" \
  --jq '.[] | select(.user.login == "Copilot") | select(.in_reply_to_id == null) | .id')

if [ -z "$COMMENT_IDS" ]; then
  echo "no Copilot comments on PR #$PR"
else
  for CID in $COMMENT_IDS; do
    gh api "repos/$REPO/pulls/$PR/comments/$CID/replies" \
      -X POST \
      -f body="$MESSAGE" > /dev/null
    echo "replied to comment $CID"
  done
fi

# Resolve every still-open review thread on the PR. GraphQL endpoint —
# distinct from the REST /comments above. Idempotent: already-resolved
# threads aren't touched.
gh api graphql \
  -f query="query {
    repository(owner: \"m-bonanno\", name: \"budojo\") {
      pullRequest(number: $PR) {
        reviewThreads(first: 50) {
          nodes { id isResolved }
        }
      }
    }
  }" \
  --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | .id' \
  | while read -r TID; do
      [ -n "$TID" ] || continue
      gh api graphql \
        -f query="mutation { resolveReviewThread(input: {threadId: \"$TID\"}) { thread { isResolved } } }" \
        --jq '.data.resolveReviewThread.thread.isResolved' > /dev/null
      echo "resolved thread $TID"
    done

echo "done"
