{{-- Markdown support-ticket email (#423). Variables flow through
     Blade's `{{ }}` HTML-escape, which prevents raw HTML injection.
     Blade's HTML escape does NOT, however, prevent markdown syntax
     in `$body` from being interpreted by the markdown-to-HTML pass —
     a user typing `**bold**` or `[link](evil)` in their support
     message would still be re-rendered. Wrapping the body in a fenced
     code block opts out of markdown parsing entirely so the support
     inbox sees what the user typed, character for character. --}}
@component('mail::message')
# New support request

A user has filed a support ticket through the in-app form.

**From:** {{ $userName }} &lt;{{ $userEmail }}&gt;
**Category:** {{ $category }}
**Subject:** {{ $subjectLine }}

---

```
{{ $body }}
```

---

Reply directly to this email to respond — the user is set as Reply-To,
so the message will land in their mailbox without any further routing.

Thanks,<br>
The Budojo system
@endcomponent
