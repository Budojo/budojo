{{-- Markdown athlete-invitation email (#445, M7 PR-B). The single CTA
     URL carries the raw invite token; the SPA's public
     /athlete-invite/{token} route reads it and renders the form. --}}
@component('mail::message')
# You've been invited to Budojo

@if ($academyName !== '')
**{{ $ownerName }}** at **{{ $academyName }}** has invited you, {{ $athleteName }}, to join Budojo as an athlete.
@else
**{{ $ownerName }}** has invited you, {{ $athleteName }}, to join Budojo as an athlete.
@endif

Once you accept, you'll be able to see your own profile, your training history, your payments, and your documents — all in one place.

@component('mail::button', ['url' => $inviteUrl])
Accept the invitation
@endcomponent

This link is valid for {{ $expiryDays }} days. If you do nothing, the invitation simply expires — your roster record stays intact and {{ $ownerName }} can re-invite you any time.

If you weren't expecting this email, you can safely ignore it.

Thanks,<br>
The Budojo team
@endcomponent
