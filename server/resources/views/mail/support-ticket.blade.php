{{-- Markdown support-ticket email (#423). Rendered through Laravel's
     stock `mail::message` layout. Variables flow through Blade's
     `{{ }}` HTML-escape, which is correct here — the message is
     delivered as text/html and the user-supplied $subjectLine + $body
     must NOT be interpreted as markup. --}}
@component('mail::message')
# New support request

A user has filed a support ticket through the in-app form.

**From:** {{ $userName }} &lt;{{ $userEmail }}&gt;
**Category:** {{ $category }}
**Subject:** {{ $subjectLine }}

---

{{ $body }}

---

Reply directly to this email to respond — the user is set as Reply-To,
so the message will land in their mailbox without any further routing.

Thanks,<br>
The Budojo system
@endcomponent
