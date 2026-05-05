## What

Second polish round on the v1.17 release PR (#438). After the first chore PR (#442) merged, the v1.17 train picked up #439 / #440 / #441 (change-password, avatar, support form). I closed-and-reopened #438 and posted `@copilot review` to retrigger a fresh review pass; Copilot landed 5 new comments — all valid, all small, all addressed here.

## How

- **`user-avatar.component.html`** — the size-modifier was applied via `[class]="'avatar--' + size()"`, which OVERWRITES the static `class="avatar"` attribute and silently drops the base styles (border-radius, background, the whole circular shape). Switched to additive `[class.avatar--chip]` / `[class.avatar--card]` bindings so the static `class="avatar"` survives.
- **`server/routes/api_v1.php`** — the comment on `POST /me/avatar` still said "server-side resize to 256×256". The action stores original bytes (no resize). Comment rewritten to match what the code actually does, with the GD-encoder gap noted so future readers don't try to reintroduce a resize without first fixing the Dockerfile.
- **`UploadAvatarAction`** — `getRealPath()` and `file_get_contents()` can both return `false` on a hostile or corrupt UploadedFile. The previous `(string) file_get_contents(...)` cast `false` to `""` and Storage::put returned `true` on the empty file, leaving `avatar_path` pointing at a 0-byte image while the API returned 200. Added explicit `=== false` guards that throw before the model write.
- **`mail/support-ticket.blade.php`** — the previous fenced code block (` ```...``` `) was escapable: a user typing triple-backticks on a line of their own would close the fence and let the rest of their message render as markdown. Switched to `<pre><code>{{ $body }}</code></pre>`. Markdown's pre-HTML pass leaves raw HTML alone, so the body shows verbatim regardless of what characters the user types.
- **Migration timestamp dedup** — `2026_05_05_120000_add_avatar_path_to_users_table.php` and `2026_05_05_120000_create_support_tickets_table.php` shared the same timestamp prefix; ordering depended on filename sort, fragile to future renames. Bumped support-tickets to `..._120001_...` so the migration sequence is unambiguous.

## Test plan

- [x] PEST: 446 passed (1437 assertions).
- [x] Vitest: 632 passed.
- [ ] CI on this PR.

## References

- Origin: PR #438 (release v1.17 develop→main) Copilot review v2 on the post-merge train.
- Touches code originally landed in #411 (avatar), #423 (support form).
