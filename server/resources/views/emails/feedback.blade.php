{{-- Plain-text feedback email. One recipient (the product owner), so
     no theming, no responsive HTML — just the data laid out in the
     order the owner reads it. --}}

NEW FEEDBACK SUBMITTED
======================

Subject: {{ $subjectLine }}

----------------------------------------
Description
----------------------------------------

{{ $description }}

----------------------------------------
Context
----------------------------------------

User email:   {{ $userEmail }}
Academy id:   {{ $academyId ?? '(none — user has no academy yet)' }}
App version:  {{ $appVersion }}
User-Agent:   {{ $userAgent }}
@if ($hasImage)
Attachment:   yes — see attached file
@else
Attachment:   none
@endif
