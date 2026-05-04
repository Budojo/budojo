{{-- Markdown medical-cert expiry digest (M5 PR-D). Variables:
     $ownerName + $academyName (User->name + Academy->name — both
     user-supplied at registration / setup, HTML-escaped by Blade
     default), $rows (collection of pre-rendered per-row data with
     `name`, `expires_on`, `status` already computed by the Mailable
     so the template is dumb-render-only), $clientUrl (config). --}}
@component('mail::message')
# Medical certificates expiring at {{ $academyName }}

Hi {{ $ownerName }} — these athletes have a medical certificate that's
about to expire (or already has expired). Worth chasing them now so
they don't get locked out of training.

@component('mail::table')
| Athlete | Document expiry | Status |
| --- | :---: | :---: |
@foreach ($rows as $row)
| {{ $row['name'] }} | {{ $row['expires_on'] }} | {!! $row['status'] !!} |
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
