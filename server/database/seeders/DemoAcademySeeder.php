<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Actions\Address\SyncAddressAction;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\User;
use Database\Seeders\Support\DemoAcademyFixture;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class DemoAcademySeeder extends Seeder
{
    public static function fixture(): DemoAcademyFixture
    {
        return DemoAcademyFixture::fromDefaultFile();
    }

    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->command->warn('DemoAcademySeeder skipped — only runs in local/testing environments.');

            return;
        }

        $admin = User::where('email', 'admin@example.it')->first();
        if ($admin === null) {
            throw new \RuntimeException('DemoAcademySeeder requires the admin user — run AdminSeeder first.');
        }

        $fixture = self::fixture();

        $academy = $admin->academy;
        if ($academy === null) {
            $academy = Academy::create([
                'user_id' => $admin->id,
                'name' => $fixture->academyName,
                'slug' => Str::slug($fixture->academyName) . '-' . Str::lower(Str::random(8)),
                'monthly_fee_cents' => $fixture->academyMonthlyFeeCents,
                'training_days' => $fixture->trainingDaysOfWeek !== [] ? $fixture->trainingDaysOfWeek : null,
            ]);
        } else {
            $academy->forceFill([
                'name' => $fixture->academyName,
                'monthly_fee_cents' => $fixture->academyMonthlyFeeCents,
                'training_days' => $fixture->trainingDaysOfWeek !== [] ? $fixture->trainingDaysOfWeek : null,
            ])->save();
        }

        // Address (#72) lives on a polymorphic relation now, so it's seeded
        // through the dedicated upsert action — same code path the API uses.
        app(SyncAddressAction::class)->execute($academy, $fixture->academyAddress);

        Athlete::withTrashed()
            ->where('academy_id', $academy->id)
            ->lazyById()
            ->each(fn (Athlete $athlete) => $athlete->forceDelete());

        foreach ($fixture->athletes as $athlete) {
            Athlete::create([
                'academy_id' => $academy->id,
                'first_name' => $athlete->firstName,
                'last_name' => $athlete->lastName,
                'email' => $athlete->email,
                'phone_country_code' => null,
                'phone_national_number' => null,
                'date_of_birth' => $athlete->dateOfBirth !== null ? Carbon::parse($athlete->dateOfBirth) : null,
                'belt' => $athlete->belt,
                'stripes' => $athlete->stripes,
                'status' => $athlete->status,
                'joined_at' => $athlete->joinedAt !== null
                    ? Carbon::parse($athlete->joinedAt)
                    : Carbon::today()->subDays(random_int(180, 720)),
            ]);
        }
    }
}
