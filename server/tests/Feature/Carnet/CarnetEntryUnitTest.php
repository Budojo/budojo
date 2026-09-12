<?php

declare(strict_types=1);

use App\Actions\Attendance\MarkAttendanceAction;
use App\Enums\AttendanceSource;
use App\Models\AcademyClass;
use App\Models\Athlete;
use App\Models\Carnet;
use App\Models\CarnetEntry;
use Carbon\CarbonImmutable;
use Laravel\Sanctum\Sanctum;

/**
 * What one carnet entry pays for — a lesson or the whole day (#1576).
 *
 * An academy setting, read and written through `/api/v1/academy` like the
 * rest of the carnet offering. The one thing that sets it apart from the
 * price and the size is that changing it rewrites ledgers already sold,
 * which is what the last test pins down.
 */

// helpers live in tests/Pest.php

beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    Sanctum::actingAs($this->user);
});

it('answers lesson as the unit until the owner says otherwise', function (): void {
    $this->getJson('/api/v1/academy')
        ->assertOk()
        ->assertJsonPath('data.carnet_entry_unit', 'lesson');
});

it('persists the unit via PATCH /academy', function (): void {
    $this->patchJson('/api/v1/academy', ['carnet_entry_unit' => 'day'])
        ->assertOk()
        ->assertJsonPath('data.carnet_entry_unit', 'day');

    $this->assertDatabaseHas('academies', ['id' => $this->academy->id, 'carnet_entry_unit' => 'day']);
});

it('rejects a unit it does not know', function (): void {
    $this->patchJson('/api/v1/academy', ['carnet_entry_unit' => 'week'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['carnet_entry_unit']);
});

it('does not let the unit be cleared — there is no "not configured"', function (): void {
    $this->patchJson('/api/v1/academy', ['carnet_entry_unit' => null])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['carnet_entry_unit']);
});

it('recounts the carnets already sold when the unit changes', function (): void {
    $athlete = Athlete::factory()->for($this->academy)->create();
    $carnet = Carnet::factory()->for($athlete)->validFrom('2026-01-10')->create();
    $fundamentals = AcademyClass::factory()->for($this->academy)->create(['weekday' => 4, 'starts_at' => '19:00']);
    $openMat = AcademyClass::factory()->for($this->academy)->create(['weekday' => 4, 'starts_at' => '20:30']);

    $mark = app(MarkAttendanceAction::class);
    foreach ([$fundamentals, $openMat] as $class) {
        $mark->execute($this->academy, CarbonImmutable::parse('2026-03-05'), [$athlete->id], AttendanceSource::Instructor, $class);
    }
    expect(CarnetEntry::where('carnet_id', $carnet->id)->count())->toBe(2);

    $this->patchJson('/api/v1/academy', ['carnet_entry_unit' => 'day'])->assertOk();
    expect(CarnetEntry::where('carnet_id', $carnet->id)->count())->toBe(1);

    $this->patchJson('/api/v1/academy', ['carnet_entry_unit' => 'lesson'])->assertOk();
    expect(CarnetEntry::where('carnet_id', $carnet->id)->count())->toBe(2);
});

it('recounts an archived athlete\'s carnet too — a restore would not', function (): void {
    $athlete = Athlete::factory()->for($this->academy)->create();
    $carnet = Carnet::factory()->for($athlete)->validFrom('2026-01-10')->create();
    $fundamentals = AcademyClass::factory()->for($this->academy)->create(['weekday' => 4, 'starts_at' => '19:00']);
    $openMat = AcademyClass::factory()->for($this->academy)->create(['weekday' => 4, 'starts_at' => '20:30']);

    $mark = app(MarkAttendanceAction::class);
    foreach ([$fundamentals, $openMat] as $class) {
        $mark->execute($this->academy, CarbonImmutable::parse('2026-03-05'), [$athlete->id], AttendanceSource::Instructor, $class);
    }
    $athlete->delete();

    $this->patchJson('/api/v1/academy', ['carnet_entry_unit' => 'day'])->assertOk();

    expect(CarnetEntry::where('carnet_id', $carnet->id)->count())->toBe(1);
});

it('recounts alongside the rest of the PATCH, not only when the unit travels alone', function (): void {
    $athlete = Athlete::factory()->for($this->academy)->create();
    $carnet = Carnet::factory()->for($athlete)->validFrom('2026-01-10')->create();
    $fundamentals = AcademyClass::factory()->for($this->academy)->create(['weekday' => 4, 'starts_at' => '19:00']);
    $openMat = AcademyClass::factory()->for($this->academy)->create(['weekday' => 4, 'starts_at' => '20:30']);

    $mark = app(MarkAttendanceAction::class);
    foreach ([$fundamentals, $openMat] as $class) {
        $mark->execute($this->academy, CarbonImmutable::parse('2026-03-05'), [$athlete->id], AttendanceSource::Instructor, $class);
    }

    $this->patchJson('/api/v1/academy', ['name' => 'Renamed', 'carnet_entry_unit' => 'day'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Renamed');

    expect(CarnetEntry::where('carnet_id', $carnet->id)->count())->toBe(1);
});
