{{-- Markdown welcome email (M5 PR-B). The Markdown Mailable wraps
     the body in Laravel's stock mail.master layout and handles
     `{!! $clientUrl !!}` etc. via Blade's `{{ }}` escaping for us —
     no XSS surface here because none of the variables are user-
     supplied free text (only $name, which Blade html-escapes by
     default). --}}
@component('mail::message')
# Welcome to Budojo, {{ $name }}.

You're in. Your account is created and ready to go.

If you haven't yet, the next step is setting up your **academy** — the gym or
training space Budojo will track athletes, attendance, documents, and payments
for. Two minutes, no credit card.

@component('mail::button', ['url' => $clientUrl])
Set up your academy
@endcomponent

A couple of things worth knowing up-front:

- **Email verification.** A separate verification email is on its way (or
  already in your inbox) — clicking the link there confirms you control
  the address you registered with. We won't email you anything load-
  bearing until you've verified.
- **Privacy.** Your data is stored in the EU (DigitalOcean Frankfurt).
  The full informativa GDPR is at [{{ $clientUrl }}/privacy]({{ $clientUrl }}/privacy);
  the list of every third party that processes Budojo data on your
  behalf is at [{{ $clientUrl }}/sub-processors]({{ $clientUrl }}/sub-processors).
- **Feedback.** There's a feedback form linked from the dashboard
  sidebar — bug reports and "I wish Budojo did X" go straight to the
  product owner's inbox. We read every one.

Welcome aboard.

Thanks,<br>
The Budojo team
@endcomponent
