{{-- Markdown account-deletion confirmation email (M5 PR-C). All
     variables ($name, $scheduledFor, $clientUrl) are HTML-escaped by
     Blade's `{{ }}` default — none of them are user-supplied free
     text, so no XSS surface. --}}
@component('mail::message')
# We've scheduled the deletion of your Budojo account, {{ $name }}.

You requested to delete your Budojo account, and we've started the process.

**What happens next**

- Your account is suspended immediately — you can still sign in, but the
  app will only show this status; no other features are accessible.
- On **{{ $scheduledFor }}**, we'll permanently delete your account, your
  academy, every athlete record you've created, every uploaded document,
  and every attendance and payment row tied to your data. This is
  irreversible.
- Until that date, you can change your mind. Sign in at the link below,
  go to your **profile page**, and click **"Cancel deletion"**. The
  process stops, your account reactivates, nothing is lost.

@component('mail::button', ['url' => $clientUrl])
Sign in to cancel
@endcomponent

**A couple of legal/practical notes**

- **Payment records are anonymised, not deleted.** Italian tax law
  requires us to keep a 10-year audit trail of payment events
  (`amount_cents`, `year`, `month`); we strip the athlete name from
  those rows but the financial entry stays. No personally-identifying
  data survives.
- **Backups**: backups of the database keep your data for up to 30 more
  days after the scheduled deletion, then they rotate out automatically.
  If you need certified earlier deletion of a backup, reply to this
  email and we'll do a manual purge.
- **Why 30 days, not immediate**: the grace period is deliberate.
  Accidental clicks happen; this window gives you a real way back.

If you didn't request this and someone else has access to your account,
sign in immediately, cancel the deletion, and rotate your password from
the profile page. Reply to this email if you need help.

Thanks for using Budojo.

The Budojo team
@endcomponent
