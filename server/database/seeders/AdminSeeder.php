<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Actions\Address\SyncAddressAction;
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

        // After #479 the User schema is split into `first_name` +
        // `last_name` (+ optional `handle`). The legacy single `name`
        // column was dropped — passing it here would now throw a
        // `SQLSTATE[42S22]: Column not found: 1054 Unknown column
        // 'name'` and brick `php artisan db:seed` for any fresh local
        // checkout, exactly the regression a coder following the
        // README quick-start would hit. Match the new shape verbatim.
        $admin = User::firstOrCreate(
            ['email' => 'admin@example.it'],
            [
                'first_name' => 'Admin',
                'last_name' => 'Budojo',
                'password' => Hash::make($password),
            ],
        );

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
            // Structured address (#72). Goes through `SyncAddressAction`
            // for the same reason every other write does — single source of
            // truth for the morph upsert. If the action ever grows side
            // effects (audit logging, search-index reindex, etc.) seed
            // data picks them up automatically.
            app(SyncAddressAction::class)->execute($academy, [
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
