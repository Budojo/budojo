<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\ClassKind;
use App\Models\Academy;
use App\Models\AcademyClass;
use App\Models\Lesson;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Lesson>
 */
class LessonFactory extends Factory
{
    protected $model = Lesson::class;

    /**
     * A lesson with no class behind it — the shape a one-off seminar will
     * have. Tests that want the normal case, an occurrence of a timetable
     * slot, go through `forClass()` so the snapshot matches the class the
     * way the action would have written it.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'academy_id' => Academy::factory(),
            'academy_class_id' => null,
            'held_on' => now()->toDateString(),
            'name' => 'Fundamentals',
            'starts_at' => '19:00',
            'kind' => ClassKind::Gi,
            'notes' => null,
        ];
    }

    /** The occurrence of a class on a date, snapshotted like the action does it. */
    public function forClass(AcademyClass $class, string $heldOn): static
    {
        return $this->state([
            'academy_id' => $class->academy_id,
            'academy_class_id' => $class->id,
            'held_on' => $heldOn,
            'name' => $class->name,
            'starts_at' => $class->starts_at,
            'kind' => $class->kind,
        ]);
    }
}
