#!/usr/bin/env bash
#
# reviewer-replies.sh — bulk-reply to every open inline comment left by the
# Claude reviewer (or any configured BOT_LOGIN) on a PR with the same
# message, then resolve every review thread authored by that bot.
#
# Usage:
#   ./reviewer-replies.sh <PR_NUMBER> "<reply message>"
#   ./reviewer-replies.sh 289 "Fixed in ee27fb6. Both valid catches: ..."
#
# Override the bot login if the reviewer comments are posted under a
# different account (e.g. github-actions[bot] when the action falls back to
# GITHUB_TOKEN authoring instead of the dedicated claude[bot] identity):
#   BOT_LOGIN='github-actions[bot]' ./reviewer-replies.sh 289 "Fixed in ..."
#
# Replaces the old copilot-replies.sh (chore #790). Same idempotency story:
#   1. The `/comments` endpoint exposes `user.login`. We filter top-level
#      threads by that login and reply once per thread. Re-running does not
#      duplicate replies — the script skips any top-level comment that
#      already has a reply authored by the current `gh auth` user.
#   2. The reply-then-resolve dance is two GraphQL calls per thread.
#      Resolve step queries reviewThreads, filters to BOT_LOGIN-authored
#      threads only. Human-reviewer threads (and threads where someone
#      else replied first) stay open until a human resolves them.
#
# Discipline note (from memory):
#   Replies should cite the fix commit SHA. Pass the message accordingly,
#   e.g. "Fixed in <sha>. <one-sentence-rationale>".

set -euo pipefail

usage() {
  echo "usage: $0 <pr-number> '<reply message>'" >&2
  echo "       BOT_LOGIN='<login>' $0 <pr-number> '<reply message>'  # override bot login" >&2
  exit 2
}

[ "$#" -eq 2 ] || usage

PR="$1"
MESSAGE="$2"
REPO="Budojo/budojo"
BOT_LOGIN="${BOT_LOGIN:-claude[bot]}"
ME="$(gh api user --jq '.login')"

# Reply to every TOP-LEVEL bot comment (in_reply_to_id == null) that
# I haven't replied to yet. The "already replied" check looks for any
# nested reply on the SAME comment id whose author is `$ME`.
ALL_COMMENTS_JSON=$(gh api "repos/$REPO/pulls/$PR/comments")

BOT_TOP_LEVEL=$(echo "$ALL_COMMENTS_JSON" \
  | jq -r --arg bot "$BOT_LOGIN" \
    '.[] | select(.user.login == $bot) | select(.in_reply_to_id == null) | .id')

if [ -z "$BOT_TOP_LEVEL" ]; then
  echo "no $BOT_LOGIN comments on PR #$PR"
else
  for CID in $BOT_TOP_LEVEL; do
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

# Resolve only the BOT_LOGIN-authored review threads. The GraphQL query
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
  --jq "$(printf '.data.repository.pullRequest.reviewThreads.nodes[]
        | select(.isResolved == false)
        | select((.comments.nodes[0].author.login // \"\") == \"%s\")
        | .id' "$BOT_LOGIN")" \
  | while read -r TID; do
      [ -n "$TID" ] || continue
      gh api graphql \
        -f query="mutation { resolveReviewThread(input: {threadId: \"$TID\"}) { thread { isResolved } } }" \
        --jq '.data.resolveReviewThread.thread.isResolved' > /dev/null
      echo "resolved thread $TID"
    done

echo "done"
