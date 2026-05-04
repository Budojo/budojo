{{-- Markdown account-deletion confirmation email (M5 PR-C). Variables:
     $name (User->name — user-supplied at registration, HTML-escaped by
     Blade's `{{ }}` default), $scheduledFor (formatted server-side),
     $clientUrl (config-driven). The Blade default escaping is what
     makes $name safe to render here; if a future Mailable variant
     ever uses `{!! !!}` to bypass escaping, $name would become an XSS
     surface and would need explicit sanitisation. --}}
@component('mail::message')
# We've scheduled the deletion of your Budojo account, {{ $name }}.

You requested to delete your Budojo account, and we've started the process.

**What happens next**

- On **{{ $scheduledFor }}**, we'll permanently delete your account, your
  academy, every athlete record you've created, every uploaded document,
  every attendance row, and every payment row tied to your data. This is
  irreversible.
- Until that date, you can change your mind. Sign in at the link below,
  go to your **profile page**, and click **"Cancel deletion"**. The
  process stops, your account reactivates, nothing is lost.

@component('mail::button', ['url' => $clientUrl])
Sign in to cancel
@endcomponent

**Why 30 days, not immediate**: the grace period is deliberate. Accidental
clicks happen; this window gives you a real way back.

If you didn't request this and someone else has access to your account,
sign in immediately, cancel the deletion, and rotate your password from
the profile page. Reply to this email if you need help.

Thanks for using Budojo.

The Budojo team
@endcomponent
