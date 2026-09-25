<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Models\AcademyClass;
use App\Models\Lesson;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

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

    /**
     * A write dated today or later lands on a day the class runs (#1859).
     *
     * Planning reaches any week of the season now, and a date a client got
     * wrong would create a lesson on a Wednesday for a Monday class: a plan
     * nobody is ever checked into, on the season map as unconfirmed for good.
     *
     * Two things keep no rule. The past, because backfill has had no floor
     * since #181 and a class can have changed weekday since the evening being
     * recorded. And a lesson that already exists, because a plan made before
     * the class moved day must stay editable — otherwise it could never be
     * cleared.
     *
     * For a FormRequest's `after()`; it stays quiet while the slot itself is
     * invalid, so the caller sees that error and not this one.
     */
    protected function futureSlotOnClassWeekday(): \Closure
    {
        return function (Validator $validator): void {
            if ($validator->errors()->hasAny(['academy_class_id', 'held_on'])) {
                return;
            }

            $heldOn = $this->heldOn();
            if ($heldOn->lessThan(CarbonImmutable::today())) {
                return;
            }

            $class = $this->academyClass();
            if ($heldOn->dayOfWeek === $class->weekday) {
                return;
            }

            $alreadyThere = Lesson::query()
                ->where('academy_class_id', $class->id)
                ->whereDate('held_on', $heldOn->toDateString())
                ->exists();

            if (! $alreadyThere) {
                $validator->errors()->add('held_on', 'That class does not run on that day.');
            }
        };
    }
}
