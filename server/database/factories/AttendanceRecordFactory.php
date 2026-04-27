<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Athlete;
use App\Models\AttendanceRecord;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AttendanceRecord>
 */
class AttendanceRecordFactory extends Factory
{
    protected $model = AttendanceRecord::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'athlete_id' => Athlete::factory(),
            // Default: a random date in the last 30 days, so tests exercising
            // "recent attendance" don't need to pick dates by hand.
            'attended_on' => now()->subDays($this->faker->numberBetween(0, 30))->toDateString(),
            'notes' => null,
        ];
    }

    /** Factory state: attendance on a specific date. */
    public function on(string $date): static
    {
        return $this->state(['attended_on' => $date]);
    }

    /** Factory state: attendance with a note attached. */
    public function withNote(string $note): static
    {
        return $this->state(['notes' => $note]);
    }
}
