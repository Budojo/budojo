<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Academy;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AdminSeeder extends Seeder
{
    public function run(): void
    {
        $admin = User::firstOrCreate(
            ['email' => 'admin@example.it'],
            [
                'name' => 'Admin Budojo',
                'password' => Hash::make('password'),
                'email_verified_at' => now(),
                'remember_token' => Str::random(10),
            ],
        );

        if ($admin->academy === null) {
            Academy::create([
                'user_id' => $admin->id,
                'name' => 'Budojo HQ',
                'slug' => 'budojo-hq-' . Str::lower(Str::random(8)),
                'address' => 'Via Roma 1, Milano',
            ]);
        }
    }
}
