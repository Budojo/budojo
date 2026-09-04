<?php

declare(strict_types=1);

use App\Actions\Attendance\DeleteAttendanceAction;
use App\Actions\Attendance\MarkAttendanceAction;
use App\Actions\Attendance\UnmarkTodayAttendanceAction;
use App\Enums\AttendanceSource;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\Carnet;
use App\Models\CarnetEntry;
use Carbon\CarbonImmutable;

// helpers live in tests/Pest.php

beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    $this->athlete = Athlete::factory()->for($this->academy)->create();
    $this->carnet = Carnet::factory()->for($this->athlete)->purchasedOn('2026-01-10')->create();
});

it('gives the entry back when the owner deletes the presence', function (): void {
    app(MarkAttendanceAction::class)->execute(
        $this->academy,
        CarbonImmutable::parse('2026-03-05'),
        [$this->athlete->id],
    );
    expect(CarnetEntry::count())->toBe(1);

    $record = AttendanceRecord::firstOrFail();
    app(DeleteAttendanceAction::class)->execute($record);

    expect(CarnetEntry::count())->toBe(0);
    // The presence itself is only tombstoned — that is the audit trail.
    expect(AttendanceRecord::withTrashed()->count())->toBe(1);
});

it('costs exactly one entry to correct a mistake', function (): void {
    // The flow the refund exists for: mark the wrong day, delete it, mark the
    // right one. Without the refund this would cost two entries.
    $mark = app(MarkAttendanceAction::class);

    $mark->execute($this->academy, CarbonImmutable::parse('2026-03-05'), [$this->athlete->id]);
    app(DeleteAttendanceAction::class)->execute(AttendanceRecord::firstOrFail());
    $mark->execute($this->academy, CarbonImmutable::parse('2026-03-06'), [$this->athlete->id]);

    expect(CarnetEntry::count())->toBe(1);
    expect(CarnetEntry::firstOrFail()->used_on->toDateString())->toBe('2026-03-06');
});

it('gives the entry back when the athlete reverts their own self-mark', function (): void {
    $this->academy->update(['training_days' => [(int) CarbonImmutable::today()->dayOfWeek]]);

    AttendanceRecord::create([
        'athlete_id' => $this->athlete->id,
        'attended_on' => CarbonImmutable::today()->toDateString(),
        'source' => AttendanceSource::Self,
    ]);
    $record = AttendanceRecord::firstOrFail();
    CarnetEntry::factory()->for($this->carnet)->create([
        'attendance_record_id' => $record->id,
        'used_on' => $record->attended_on->toDateString(),
    ]);

    app(UnmarkTodayAttendanceAction::class)->execute($this->athlete);

    expect(CarnetEntry::count())->toBe(0);
});

it('leaves an uncharged presence alone on delete', function (): void {
    // No carnet in range, so nothing was charged — deleting must not explode.
    $athlete = Athlete::factory()->for($this->academy)->create();
    app(MarkAttendanceAction::class)->execute(
        $this->academy,
        CarbonImmutable::parse('2026-03-05'),
        [$athlete->id],
    );
    $record = AttendanceRecord::where('athlete_id', $athlete->id)->firstOrFail();

    app(DeleteAttendanceAction::class)->execute($record);

    expect(AttendanceRecord::withTrashed()->where('athlete_id', $athlete->id)->count())->toBe(1);
});

it('releases only the entry of the deleted presence', function (): void {
    $mark = app(MarkAttendanceAction::class);
    $mark->execute($this->academy, CarbonImmutable::parse('2026-03-05'), [$this->athlete->id]);
    $mark->execute($this->academy, CarbonImmutable::parse('2026-03-06'), [$this->athlete->id]);
    expect(CarnetEntry::count())->toBe(2);

    $first = AttendanceRecord::where('attended_on', '2026-03-05')->firstOrFail();
    app(DeleteAttendanceAction::class)->execute($first);

    expect(CarnetEntry::count())->toBe(1);
    expect(CarnetEntry::firstOrFail()->used_on->toDateString())->toBe('2026-03-06');
});
