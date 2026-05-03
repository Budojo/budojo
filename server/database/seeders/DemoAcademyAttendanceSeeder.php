<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class DemoAcademyAttendanceSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->command->warn('DemoAcademyAttendanceSeeder skipped — only runs in local/testing environments.');

            return;
        }

        $admin = User::where('email', 'admin@example.it')->first();
        $academy = $admin?->academy;
        if ($academy === null) {
            throw new \RuntimeException('DemoAcademyAttendanceSeeder requires the admin academy — run AdminSeeder + DemoAcademySeeder first.');
        }

        $fixture = DemoAcademySeeder::fixture();

        $probabilities = [];
        foreach ($fixture->athletes as $athlete) {
            $key = "{$athlete->firstName} {$athlete->lastName}";
            $probabilities[$key] = $athlete->attendanceProbability ?? $fixture->defaultProbability;
        }

        $athletes = Athlete::where('academy_id', $academy->id)->get();

        AttendanceRecord::whereIn('athlete_id', $athletes->pluck('id'))
            ->withTrashed()
            ->forceDelete();

        $today = Carbon::today();
        $start = $today->copy()->subDays($fixture->simulationWindowDays);
        $now = Carbon::now();
        $rows = [];

        foreach (self::eachTrainingDay($start, $today, $fixture->trainingDaysOfWeek) as $date) {
            foreach ($athletes as $athlete) {
                if ($athlete->joined_at->gt($date)) {
                    continue;
                }

                $key = "{$athlete->first_name} {$athlete->last_name}";
                $probability = $probabilities[$key] ?? $fixture->defaultProbability;

                if (! self::draw($probability)) {
                    continue;
                }

                $rows[] = [
                    'athlete_id' => $athlete->id,
                    'attended_on' => $date->toDateString(),
                    'notes' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
        }

        foreach (array_chunk($rows, 500) as $chunk) {
            AttendanceRecord::insert($chunk);
        }
    }

    /**
     * @param  list<int>  $trainingDays
     * @return iterable<Carbon>
     */
    private static function eachTrainingDay(Carbon $start, Carbon $end, array $trainingDays): iterable
    {
        for ($date = $start->copy(); $date->lte($end); $date->addDay()) {
            if (\in_array($date->dayOfWeek, $trainingDays, true)) {
                yield $date->copy();
            }
        }
    }

    private static function draw(float $probability): bool
    {
        return random_int(0, 9999) < (int) round($probability * 10000);
    }
}
