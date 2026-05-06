{{-- Markdown support-ticket email (#423). Variables flow through
     Blade's `{{ }}` HTML-escape, which prevents raw HTML injection.
     Blade's HTML escape does NOT, however, prevent markdown syntax
     in `$body` from being interpreted by the markdown-to-HTML pass.
     A previous version wrapped the body in a fenced code block, but
     that's escapable: a user typing triple-backticks on a line of
     their own would close the fence and let later content render as
     markdown. Rendering the body inside a `<pre><code>` HTML element
     is robust — markdown's pre-HTML pass leaves raw HTML alone, so
     the body is shown verbatim, character for character. --}}
@component('mail::message')
# New support request

A user has filed a support ticket through the in-app form.

**From:** {{ $userName }} &lt;{{ $userEmail }}&gt;
**Category:** {{ $category }}
**Subject:** {{ $subjectLine }}
**App version:** {{ $appVersion }}
**User-Agent:** {{ $userAgent }}
@if ($hasImage)
**Screenshot:** attached.
@endif

---

<pre><code>{{ $body }}</code></pre>

---

Reply directly to this email to respond — the user is set as Reply-To,
so the message will land in their mailbox without any further routing.

Thanks,<br>
The Budojo system
@endcomponent
