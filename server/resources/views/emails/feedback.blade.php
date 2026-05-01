{{-- Plain-text feedback email. One recipient (the product owner), so
     no theming, no responsive HTML — just the data laid out in the
     order the owner reads it.

     `{!! ... !!}` (NOT `{{ ... }}`) for every user-supplied or
     server-derived field. Blade's default `{{ }}` calls `htmlspecialchars`
     even when the Mailable renders this as `text/plain`, so a user
     typing `Athletes & sorting < broken` would arrive as
     `Athletes &amp; sorting &lt; broken` in the owner's inbox. The
     unescaped form is safe here because (a) the Content-Type IS
     text/plain — no HTML interpretation client-side — and (b) the
     recipient is fixed (the owner), so there is no XSS surface
     even if a client did render HTML. --}}

NEW FEEDBACK SUBMITTED
======================

Subject: {!! $subjectLine !!}

----------------------------------------
Description
----------------------------------------

{!! $description !!}

----------------------------------------
Context
----------------------------------------

User email:   {!! $userEmail !!}
Academy id:   {!! $academyId ?? '(none — user has no academy yet)' !!}
App version:  {!! $appVersion !!}
User-Agent:   {!! $userAgent !!}
@if ($hasImage)
Attachment:   yes — see attached file
@else
Attachment:   none
@endif
