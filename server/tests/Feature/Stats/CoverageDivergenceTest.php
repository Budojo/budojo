<?php

declare(strict_types=1);

use App\Actions\Stats\AthleteSyllabusCoverageAction;
use App\Actions\Stats\SyllabusCoverageAction;
use App\Models\AcademyClass;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\Lesson;
use App\Models\SyllabusTopic;
use Carbon\CarbonImmutable;

/**
 * The two coverage headlines count differently, on purpose (#1748).
 *
 * Stats → Programme asks a question about the PROGRAMME: a technique taught
 * once is not covered, which is the self-deception `thin` exists to prevent.
 * The athlete's Programme tab asks a question about a PERSON: were they there
 * for what the academy taught? Holding them to two lessons of a class the
 * academy ran once is not a fact about them (#1710).
 *
 * Both screens now say which rule they count by. This test is what keeps the
 * difference from being "harmonised" away on one side only: setting
 * `COVERED_AT` to 1, or putting the athlete numerator back to `seen`, turns it
 * red.
 */
it('counts one lesson as thin for the academy and as attended for the athlete who was there', function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-11-18'));
    $academy = userWithAcademy()->academy;
    $class = AcademyClass::factory()->for($academy)->create(['weekday' => 3, 'starts_at' => '19:00']);
    $guard = SyllabusTopic::factory()->for($academy)->create(['name' => 'Closed guard', 'sort_order' => 1]);
    $armbar = SyllabusTopic::factory()->under($guard)->create(['name' => 'Armbar', 'sort_order' => 1]);
    $athlete = Athlete::factory()->for($academy)->create(['joined_at' => '2026-09-01']);

    $lesson = Lesson::factory()->for($academy)->create([
        'academy_class_id' => $class->id,
        'held_on' => '2026-10-07',
    ]);
    $lesson->topics()->sync([$armbar->id]);
    AttendanceRecord::factory()->create([
        'athlete_id' => $athlete->id,
        'lesson_id' => $lesson->id,
        'attended_on' => '2026-10-07',
    ]);

    $academyTotals = app(SyllabusCoverageAction::class)->execute($academy)['totals'];
    $athleteTotals = app(AthleteSyllabusCoverageAction::class)->execute($athlete)['totals'];

    expect($academyTotals['covered'])->toBe(0)
        ->and($academyTotals['thin'])->toBe(1)
        ->and($academyTotals['percentage'])->toBe(0)
        ->and($athleteTotals['attended'])->toBe(1)
        ->and($athleteTotals['seen'])->toBe(0)
        ->and($athleteTotals['percentage'])->toBe(100);
});
