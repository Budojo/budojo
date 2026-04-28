<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Models\User;
use Illuminate\Auth\Events\Registered;

class RegisterUserAction
{
    public function execute(string $name, string $email, string $password): User
    {
        $user = User::create([
            'name' => $name,
            'email' => $email,
            'password' => $password,
        ]);

        event(new Registered($user));

        return $user;
    }
}
