<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\AttendanceRecord;
use App\Models\Carnet;
use App\Models\CarnetEntry;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CarnetEntry>
 */
class CarnetEntryFactory extends Factory
{
    protected $model = CarnetEntry::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'carnet_id' => Carnet::factory(),
            'attendance_record_id' => AttendanceRecord::factory(),
            // Derived from the presence that consumed the entry, not from
            // today: the column is a denormalised copy of `attended_on`, and a
            // factory that invents its own date would let PR 2's consumption
            // tests pass against rows the application could never write.
            'used_on' => static fn (array $attributes): string => AttendanceRecord::findOrFail(
                $attributes['attendance_record_id'],
            )->attended_on->toDateString(),
        ];
    }
}
