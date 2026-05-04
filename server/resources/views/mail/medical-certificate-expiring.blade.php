{{-- Markdown medical-cert expiry digest (M5 PR-D). Variables:
     $ownerName + $academyName (User->name + Academy->name — both
     user-supplied at registration / setup, HTML-escaped by Blade
     default), $documents (Eloquent collection of Document with
     ->athlete eager-loaded; iterated below), $clientUrl (config). --}}
@component('mail::message')
# Medical certificates expiring at {{ $academyName }}

Hi {{ $ownerName }} — these athletes have a medical certificate that's
about to expire (or already has). Worth chasing them now so they don't
get locked out of training.

@component('mail::table')
| Athlete | Document expiry | Status |
| --- | :---: | :---: |
@foreach ($documents as $doc)
| {{ $doc->athlete->first_name }} {{ $doc->athlete->last_name }} | {{ $doc->expires_at?->format('Y-m-d') ?? '—' }} | @php $today = \Carbon\Carbon::today(); $exp = $doc->expires_at; @endphp @if ($exp === null) — @elseif ($exp->isToday()) **Expires today** @elseif ($exp->isPast()) **Already expired** @else In {{ $today->diffInDays($exp) }} days @endif |
@endforeach
@endcomponent

@component('mail::button', ['url' => $clientUrl . '/dashboard/documents'])
Open expiring documents
@endcomponent

This is a daily digest — you'll get one of these whenever certificates
hit the **30, 7, or 0 days remaining** thresholds. Renewing a cert
inside Budojo (upload a new one, set the new expiry date) takes the
athlete out of the next digest automatically.

Thanks,<br>
The Budojo team
@endcomponent
