@component('mail::message')
# Welcome to {{ $academyName }} on Budojo, {{ $name }}.

Your invitation is accepted. From here on, every time your instructor
records something for you — attendance, a payment, a belt promotion, a
document — you can see it in your athlete dashboard.

@component('mail::button', ['url' => $clientUrl . '/dashboard/me'])
Open your dashboard
@endcomponent

A couple of things worth knowing:

- **What you'll see**. Your attendance history, your monthly payments,
  any documents the academy keeps for you (medical certificate, ID
  card), and your belt progression. Read-only — your instructor
  records everything; you keep a clear view.
- **Notifications.** When new posts land in your academy feed,
  someone reacts to a post you wrote, or your medical certificate
  starts approaching expiry, Budojo can push you a notification. The
  defaults are sensible; tweak them under
  [{{ $clientUrl }}/dashboard/profile]({{ $clientUrl }}/dashboard/profile)
  → Notifications when you log in.
- **Privacy.** Your data lives in the EU (DigitalOcean Frankfurt).
  The full GDPR notice is at
  [{{ $clientUrl }}/privacy]({{ $clientUrl }}/privacy).

Welcome aboard.

Thanks,<br>
The Budojo team
@endcomponent
