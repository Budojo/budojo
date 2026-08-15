#!/usr/bin/env sh
# Shared protected-branch logic, sourced by `pre-commit` and `pre-push`.
#
# Not a hook itself — the filename is not a git hook name, so git never
# invokes it directly. It exists so the protected list is defined ONCE:
# two hooks disagreeing about which branches are protected is exactly the
# kind of drift that makes a guard untrustworthy.
#
# The rule it enforces (root CLAUDE.md, docs/development/git-flow.md):
# every change lands on a feature branch and reaches `develop`/`main`
# through a PR. Nothing is committed or pushed to them directly.

PROTECTED_BRANCHES="main develop"

is_protected_branch() {
  for protected in $PROTECTED_BRANCHES; do
    if [ "$1" = "$protected" ]; then
      return 0
    fi
  done

  return 1
}

# Printed on refusal. Keeps the escape hatch discoverable — a guard people
# cannot get past when they genuinely need to is a guard they delete.
protected_branch_help() {
  printf '\n  Protected branches: %s\n' "$PROTECTED_BRANCHES"
  printf '  Cut a feature branch instead:\n\n'
  printf '      git checkout -b <type>/<issue>-<description>\n\n'
  printf '  Already committed here by mistake? Move the work, keep the commits:\n\n'
  printf '      git checkout -b <new-branch>          # carries commits + working tree\n'
  printf '      git branch -f %s origin/%s   # reset the protected branch\n\n' "$1" "$1"
  printf '  Automation that legitimately needs to bypass this sets HUSKY=0.\n\n'
}
