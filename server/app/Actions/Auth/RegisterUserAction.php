<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Mail\WelcomeMail;
use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Support\Facades\Mail;

class RegisterUserAction
{
    public function execute(string $name, string $email, string $password): User
    {
        $user = User::create([
            'name' => $name,
            'email' => $email,
            'password' => $password,
        ]);

        // The Registered event triggers Laravel's verification-email
        // notification (the User model implements MustVerifyEmail).
        // The welcome mail below is a SEPARATE concern — onboarding-
        // shaped, not transactional — so we dispatch it explicitly
        // rather than piggybacking on a Registered listener. Both
        // ride the queue worker (M5 PR-B); a Resend brown-out retries
        // up to 3 times via the daemon's `--tries=3`.
        event(new Registered($user));
        Mail::to($user)->queue(new WelcomeMail($user));

        return $user;
    }
}
