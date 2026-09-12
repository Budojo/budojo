<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Models\AcademyClass;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Validation\Rule;

/**
 * A lesson is addressed by the class it belongs to and the day it falls on
 * (#1564), not by an id — because when the owner is planning it, the row does
 * not exist yet. Shared by every write that has to materialise it.
 */
trait ResolvesLessonSlot
{
    public function academyClass(): AcademyClass
    {
        /** @var AcademyClass */
        return AcademyClass::query()->findOrFail($this->integer('academy_class_id'));
    }

    public function heldOn(): CarbonImmutable
    {
        // `string()` and not a cast: the rules above already pinned the shape
        // to `Y-m-d`, and the helper says so to PHPStan as well as to a reader.
        return CarbonImmutable::parse($this->string('held_on')->toString())->startOfDay();
    }

    /**
     * @return array<string, mixed>
     */
    protected function lessonSlotRules(): array
    {
        /** @var User|null $user */
        $user = $this->user();

        return [
            'academy_class_id' => [
                'required',
                'integer',
                Rule::exists('academy_classes', 'id')
                    ->where('academy_id', $user?->activeAcademyId() ?? 0),
            ],
            // No bound at either end. Backfill has had no floor since #181,
            // and the ceiling is the whole point here: a lesson dated ahead
            // of today is a plan, and it stays uncounted until somebody is
            // checked into it.
            'held_on' => ['required', 'date_format:Y-m-d'],
        ];
    }

    /**
     * @return array<string, string>
     */
    protected function lessonSlotMessages(): array
    {
        return [
            'academy_class_id.exists' => 'That class is not on this academy\'s timetable.',
        ];
    }
}
