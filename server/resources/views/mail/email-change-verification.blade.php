{{-- Markdown email-change verification email (#476). The single CTA
     URL carries the raw verification token; the SPA's public
     /auth/verify-email-change/{token} route reads it and POSTs to the
     server, which applies the change and bounces the user to login. --}}
@component('mail::message')
# Confirm your new Budojo email

Hi {{ $userName }},

We received a request to change your Budojo login email to **this address**. To make the change effective, click the button below within 24 hours.

@component('mail::button', ['url' => $verifyUrl])
Confirm new email
@endcomponent

Until you click the button, your login email stays as it was — nothing has changed yet on your account.

This link expires on {{ $expiresAt->toDayDateTimeString() }}. If you didn't request this change, you can safely ignore this email — no action will be taken.

Thanks,<br>
The Budojo team
@endcomponent
