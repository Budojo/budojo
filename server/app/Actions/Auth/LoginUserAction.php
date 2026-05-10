<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Models\User;
use Illuminate\Support\Facades\Hash;

class LoginUserAction
{
    /**
     * Authenticate by email + password and return a {@see LoginResult}
     * carrying both the authenticated user (on success) AND the
     * matched-by-email user_id (regardless of password outcome).
     *
     * Why the result shape: the controller uses the matched id to
     * attribute a wrong-password audit row to the targeted account
     * (#430 / #559) without a second `User::query()->where('email')`
     * round-trip on every failed attempt — the high-volume path
     * (brute-force / typo-of-the-day floods).
     */
    public function execute(string $email, string $password): LoginResult
    {
        $user = User::where('email', $email)->first();

        if ($user === null) {
            return new LoginResult(user: null, matchedUserId: null);
        }

        if (! Hash::check($password, $user->password)) {
            return new LoginResult(user: null, matchedUserId: $user->id);
        }

        return new LoginResult(user: $user, matchedUserId: $user->id);
    }
}
