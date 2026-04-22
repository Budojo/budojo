<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Models\User;

class RegisterUserAction
{
    public function execute(string $name, string $email, string $password): User
    {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => $password,
        ]);
    }
}
