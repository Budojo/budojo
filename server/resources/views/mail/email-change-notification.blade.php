{{-- Audit-trail email to the OLD address when a Budojo email change
     is requested (#476). No clickable action — the V1 mitigation is
     "if this wasn't you, contact support immediately"; a V2 tokenised
     undo link is deferred. --}}
@component('mail::message')
# Email change requested

Hi {{ $userName }},

We received a request to change your Budojo login email to a new address — **{{ $newEmailPartial }}**.

The change will only take effect once the new address is confirmed by clicking the link we just sent there. Until then, your login email stays exactly as it is and nothing has changed on your account.

**If you did not request this change**, please contact us immediately at [{{ $supportEmail }}](mailto:{{ $supportEmail }}) so we can lock the request before it's confirmed.

If this was you, no further action is needed — just click the link in the message we sent to your new address.

Thanks,<br>
The Budojo team
@endcomponent
