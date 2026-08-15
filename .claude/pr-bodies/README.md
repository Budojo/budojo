# `.claude/pr-bodies/` — scratch, not archive

PR bodies are written here as a file and passed with `--body-file`, never as `--body "..."` or a shell heredoc (special characters get mangled in the quoting):

```bash
gh pr create --body-file .claude/pr-bodies/<branch-or-pr>.md
gh pr edit <N> --body-file .claude/pr-bodies/<branch-or-pr>.md
```

One file per PR (`<branch>.md` or `pr-<number>.md`) so several PRs can be in flight without overwriting each other.

## These files are throwaway

**Once the PR is open, GitHub holds the canonical copy.** The local file has served its purpose — it is scratch, not an archive.

Everything here except this README and `.gitkeep` is gitignored. Delete your file after the PR merges; if you forget, prune the directory periodically:

```bash
find .claude/pr-bodies -type f ! -name '.gitkeep' ! -name 'README.md' -delete
```

### Why it matters

112 body files were tracked before the ignore rule landed, and they became the majority of the hits for repo-wide searches — a grep for `graphify` returned 7 dead PR-prose matches and 1 real one. Stale scratch that outranks live code in search results is a tax on every future session. Pruned in #1269; the ignore rule keeps new ones local.
