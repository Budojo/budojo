---
description: Cluster a batch of customer feedback into themes with priorities. Pass a file path or paste the email dump inline; dispatches a fresh sub-agent that synthesises themes, counts mentions, and proposes priority. Output is a draft for the user to edit, not a decision.
argument-hint: '<path-or-inline-text>'
---

# /feedback-digest

Synthesise a batch of customer feedback emails into actionable themes. The use case is: 5+ feedback emails have accumulated, reading them one-by-one is slow, the question is "what patterns are recurring and which deserve a roadmap slot."

## Steps

1. **Resolve the input.** The argument is either:
   - A file path (e.g. `/tmp/feedback-batch.md`) — read it.
   - Inline text — use the argument verbatim.
   - Empty — ask the user to paste a feedback dump or pass a path.

2. **Validate.** If the input is < 200 chars, push back: "this is too small to cluster, just read the items directly." Don't run the agent for tiny batches.

3. **Dispatch the `general-purpose` sub-agent** with this brief:

   > **Customer feedback synthesis. Output is a draft, not a decision.**
   >
   > Below is a batch of customer feedback (emails / in-app submissions / reviews). Cluster the items into themes — group reports that describe the same underlying problem regardless of how they word it. For each theme, output:
   >
   > - **Title** — a one-line description in the user's voice (not jargon).
   > - **Mentions** — how many distinct items in the batch reference this theme.
   > - **Severity signal** — does the user describe the issue as blocking ("the app is unusable"), painful ("I have to redo X every time"), or annoying ("would be nicer if X")? Cite the exact phrasing.
   > - **Existing tracking** — search the repo for any `# v1.X.Y` user-facing changelog mention or known related issue. If there is one, surface its number; if not, say "no tracking issue yet."
   > - **Proposed action** — one of: `ship a fix` (concrete bug), `roadmap candidate` (feature gap), `documentation` (user confused but the feature works), `won't fix` (out of scope or already addressed).
   >
   > Order themes by `(severity * mentions)`. Top 3 first; smaller themes after as a single "long tail" line.
   >
   > **Critical**: this is for the maintainer to read in 60 seconds and decide what to act on. Be opinionated about priority, but flag where you're guessing. Don't invent themes from a single isolated mention.

4. **Search for related changelog entries.** Before dispatching the agent, do a quick `grep -i "<keyword>" docs/changelog/user-facing/*.md` for obvious keywords ("cache", "blank page", "slow", etc.) and pass the results to the agent so it can correlate.

5. **Output** the agent's themes back to the user as a tight markdown table. Then ask: "Do you want me to open issues for any of these, or roadmap-track them in a future M{N} PRD?"

## Notes

- This is on-demand. Don't loop / poll / schedule — running it without new feedback wastes tokens and produces stale output.
- The agent is `general-purpose` because it does both reading and reasoning across files.
- The maintainer (you) makes the call on what to do with each theme — agent is the synthesizer, not the decider.
