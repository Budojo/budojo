<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Mail\WelcomeMail;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Auth\Events\Registered;
use Illuminate\Support\Facades\Mail;

class RegisterUserAction
{
    public function execute(
        string $name,
        string $email,
        string $password,
        CarbonInterface $termsAcceptedAt,
    ): User {
        // The caller passes the moment of consent as a typed argument
        // (#420). The HTTP path threads `now()` through after the
        // FormRequest's `accepted` rule has confirmed the checkbox;
        // a future CLI / system caller MUST supply its own attested
        // timestamp (a back-office migration, an SSO bootstrap, etc.) —
        // we deliberately don't default to `now()` so that path can't
        // silently fabricate consent that never happened.
        $user = User::create([
            'name' => $name,
            'email' => $email,
            'password' => $password,
            'terms_accepted_at' => $termsAcceptedAt,
        ]);

        // The Registered event triggers Laravel's verification-email
        // notification (the User model implements MustVerifyEmail).
        // The welcome mail below is a SEPARATE concern — onboarding-
        // shaped, not transactional — so we dispatch it explicitly
        // rather than piggybacking on a Registered listener. Both
        // ride the queue worker (M5 PR-B); a Resend brown-out retries
        // up to 3 times via the daemon's `--tries=3`.
        event(new Registered($user));

        // Best-effort queue insert. The welcome mail is non-load-bearing
        // onboarding — a failure here (jobs-table insert error, transient
        // DB connection blip, Mailable serialization bug post-deploy)
        // must NOT throw past this point: the User row is already
        // committed, the controller is about to mint a Sanctum token,
        // and surfacing a 500 to the client would leave the account in
        // a half-created state from the user's POV. We log via report()
        // so a recurring failure surfaces in the error channel without
        // breaking the signup flow.
        try {
            Mail::to($user)->queue(new WelcomeMail($user));
        } catch (\Throwable $e) {
            report($e);
        }

        return $user;
    }
}
