{{-- Monthly unpaid-athletes digest (M5 PR-E). Variables:
     $ownerName + $academyName (User->name + Academy->name —
     user-supplied, HTML-escaped by Blade default), $monthLabel
     (e.g. "May 2026"), $rows (collection of pre-rendered per-row
     data with `name`, `belt`, `joined` already computed by the
     Mailable), $count (how many athletes still owe), $clientUrl
     (config). --}}
@component('mail::message')
# Athletes still unpaid for {{ $monthLabel }} — {{ $academyName }}

Hi {{ $ownerName }} — these {{ $count }} active {{ $count === 1 ? 'athlete is' : 'athletes are' }} still
without a payment recorded for **{{ $monthLabel }}**. Worth a chase
before the month ends.

@component('mail::table')
| Athlete | Belt | Joined |
| --- | :---: | :---: |
@foreach ($rows as $row)
| {{ $row['name'] }} | {{ $row['belt'] }} | {{ $row['joined'] }} |
@endforeach
@endcomponent

@component('mail::button', ['url' => $clientUrl . '/dashboard/athletes?paid=no'])
Open unpaid list
@endcomponent

This is a once-a-month digest sent on the 16th, after the typical
month-start payment window. Marking an athlete paid (or removing them
from the active roster) takes them out of the next month's digest
automatically. Suspended and inactive athletes are NEVER in the
digest — only active ones who are expected to pay this month.

Thanks,<br>
The Budojo team
@endcomponent
