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
        if (! app()->environment(['local', 'testing'])) {
            $this->command->warn('AdminSeeder skipped — only runs in local/testing environments.');

            return;
        }

        $password = config('seeder.local_admin_password');

        if (! \is_string($password) || $password === '') {
            throw new \RuntimeException('LOCAL_ADMIN_PASSWORD must be set in .env before running AdminSeeder.');
        }

        $admin = User::firstOrCreate(['email' => 'admin@example.it'], ['name' => 'Admin Budojo', 'password' => Hash::make($password)]);

        if ($admin->wasRecentlyCreated) {
            $admin->forceFill([
                'email_verified_at' => now(),
                'remember_token' => Str::random(10),
            ])->save();
        }

        if ($admin->academy === null) {
            $academy = Academy::create([
                'user_id' => $admin->id,
                'name' => 'Budojo HQ',
                'slug' => 'budojo-hq-' . Str::lower(Str::random(8)),
            ]);
            // Structured address (#72). Seeded through the same morph
            // relation the API writes to so the dev DB matches production
            // shape exactly.
            $academy->address()->create([
                'line1' => 'Via Roma 1',
                'line2' => null,
                'city' => 'Milano',
                'postal_code' => '20100',
                'province' => 'MI',
                'country' => 'IT',
            ]);
        }
    }
}
