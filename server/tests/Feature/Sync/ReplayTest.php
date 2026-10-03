<?php

declare(strict_types=1);

use App\Actions\Attendance\MarkAttendanceAction;
use App\Actions\Sync\ReplayJournalAction;
use App\Models\Athlete;
use App\Support\Sync\RebasePending;
use Carbon\CarbonImmutable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Mockery\MockInterface;

/**
 * The rebase (#2031 step 3, PRD § 5.2): the phone's kept writes, replayed on
 * the PC's database through the same routes and Actions.
 *
 * The phone's writes are made here, journaled as the phone, then undone: what
 * stays is the entries its journal would carry. The PC then writes on the same
 * base, and the replay carries the phone's entries onto the result.
 */
beforeEach(function (): void {
    config()->set('budojo.runtime', 'desktop');
    config()->set('budojo.sync.device', 'pc4f2a');
    Storage::fake('local');
    Storage::fake('public');
    $this->owner = userWithAcademy();
    $this->owner->academy->update(['monthly_fee_cents' => 9500]);
    $this->luca = replayAthlete($this, 'Luca');
});

/** An athlete through the API, as the owner. */
function replayAthlete(mixed $test, string $firstName): int
{
    return (int) $test->actingAs($test->owner)->postJson('/api/v1/athletes', [
        'first_name' => $firstName,
        'last_name' => 'Bianchi',
        'belt' => 'white',
        'stripes' => 0,
        'status' => 'active',
        'joined_at' => '2026-09-01',
    ])->assertCreated()->json('data.id');
}

/**
 * Writes made on the phone, then undone: the entries its journal keeps.
 *
 * @return list<array<string, mixed>>
 */
function onThePhone(\Closure $writes): array
{
    config()->set('budojo.sync.device', 'phone9c1e');
    DB::beginTransaction();

    try {
        $writes();
        $entries = RebasePending::entriesOf('phone9c1e');
    } finally {
        DB::rollBack();
        config()->set('budojo.sync.device', 'pc4f2a');
    }

    return $entries;
}

/** @param list<array<string, mixed>> $entries */
function replayOnThePc(array $entries): array
{
    return app(ReplayJournalAction::class)->execute('phone9c1e', $entries);
}

describe('the phone’s writes on the PC’s database', function (): void {
    it('carries a check-in made on the phone onto what the PC did meanwhile', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$this->luca]])
            ->assertCreated());
        $giulia = replayAthlete($this, 'Giulia');

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'applied'])
            ->and(DB::table('attendance_records')->where('athlete_id', $this->luca)->count())->toBe(1)
            ->and(Athlete::query()->find($giulia))->not->toBeNull();
    });

    it('gives an athlete the phone created a new id here, and pays the right one', function (): void {
        $entries = onThePhone(function (): void {
            $marco = replayAthlete($this, 'Marco');
            $this->actingAs($this->owner)
                ->postJson("/api/v1/athletes/{$marco}/payments", ['year' => 2026, 'month' => 10, 'payment_method' => 'cash'])
                ->assertCreated();
        });
        // The PC creates an athlete meanwhile: it takes the id Marco had on the phone.
        $giulia = replayAthlete($this, 'Giulia');

        replayOnThePc($entries);

        $marco = Athlete::query()->where('first_name', 'Marco')->sole();
        expect($marco->id)->not->toBe($giulia)
            ->and(DB::table('athlete_payments')->where('athlete_id', $marco->id)->count())->toBe(1)
            ->and(DB::table('athlete_payments')->where('athlete_id', $giulia)->count())->toBe(0)
            // The kept entry speaks this database's ids now.
            ->and(json_decode((string) DB::table('sync_journal')->where('id', $entries[1]['id'])->value('params'), true))
            ->toBe(['athlete' => $marco->id]);
    });

    it('turns a write that fails here into a conflict, undone, and never stops the replay', function (): void {
        $entries = onThePhone(function (): void {
            $this->actingAs($this->owner)
                ->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$this->luca]])
                ->assertCreated();
            replayAthlete($this, 'Marco');
        });
        // The check-in's Action writes a row, then fails: the controller is
        // made again, so it takes the failing one.
        $this->mock(MarkAttendanceAction::class, fn (MockInterface $mock) => $mock
            ->shouldReceive('execute')
            ->andReturnUsing(function (): never {
                DB::table('attendance_records')->insert(['athlete_id' => $this->luca, 'attended_on' => '2026-10-02', 'created_at' => now(), 'updated_at' => now()]);

                throw new RuntimeException('disk full');
            }));
        Route::getRoutes()->getByName('attendance.store')?->flushController();

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict', $entries[1]['id'] => 'applied'])
            ->and(DB::table('sync_conflicts')->where('entry_id', $entries[0]['id'])->value('reason'))->toBe('failed')
            ->and(DB::table('attendance_records')->where('athlete_id', $this->luca)->count())->toBe(0)
            ->and(Athlete::query()->where('first_name', 'Marco')->exists())->toBeTrue();
    });

    it('finds a presence marked on both devices already true, and marks it once', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$this->luca]]));
        $this->actingAs($this->owner)->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$this->luca]]);

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'already'])
            ->and(DB::table('attendance_records')->where('athlete_id', $this->luca)->count())->toBe(1);
    });

    it('never overwrites a field the PC changed since: a conflict, with both sides, for the owner', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->patchJson("/api/v1/athletes/{$this->luca}", ['first_name' => 'Lucas'])->assertOk());
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['first_name' => 'Luke'])->assertOk();

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict'])
            ->and(Athlete::query()->find($this->luca)?->first_name)->toBe('Luke');
        $conflict = DB::table('sync_conflicts')->where('entry_id', $entries[0]['id'])->sole();
        expect($conflict->reason)->toBe('changed')
            ->and(json_decode((string) $conflict->detail, true))->toMatchArray(['field' => 'first_name', 'saw' => 'Luca', 'here' => 'Luke']);
    });

    it('never overwrites a photo the PC changed since: an upload names no column, so it is about every one it changed', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->post("/api/v1/athletes/{$this->luca}/photo", ['photo' => UploadedFile::fake()->image('phone.png', 20, 20)])
            ->assertOk());
        $this->actingAs($this->owner)
            ->post("/api/v1/athletes/{$this->luca}/photo", ['photo' => UploadedFile::fake()->image('pc.png', 30, 30)])
            ->assertOk();
        $pcPhoto = Athlete::query()->findOrFail($this->luca)->photo_sha256;

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict'])
            ->and(DB::table('sync_conflicts')->where('entry_id', $entries[0]['id'])->value('reason'))->toBe('changed')
            ->and(Athlete::query()->findOrFail($this->luca)->photo_sha256)->toBe($pcPhoto);
    });

    it('applies an edit the PC made the same way already, without a conflict', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->patchJson("/api/v1/athletes/{$this->luca}", ['first_name' => 'Lucas']));
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['first_name' => 'Lucas']);

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'already'])
            ->and(DB::table('sync_conflicts')->count())->toBe(0);
    });

    it('raises a conflict for a payment on an athlete the PC deleted: never dropped', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 10]));
        $this->actingAs($this->owner)->deleteJson("/api/v1/athletes/{$this->luca}")->assertSuccessful();

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict'])
            ->and(DB::table('sync_conflicts')->where('entry_id', $entries[0]['id'])->value('reason'))->toBe('gone');
    });

    it('finds the same month paid the same way on both devices already true', function (): void {
        $paid = ['year' => 2026, 'month' => 10, 'payment_method' => 'cash', 'paid_at' => '2026-10-01'];
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->postJson("/api/v1/athletes/{$this->luca}/payments", $paid)->assertCreated());
        $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$this->luca}/payments", $paid)->assertCreated();

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'already']);
    });

    it('raises a conflict for the same month paid otherwise on each device: for money the month is not enough', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 10, 'payment_method' => 'cash'])
            ->assertCreated());
        $this->actingAs($this->owner)
            ->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 10, 'payment_method' => 'pos'])
            ->assertCreated();

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict']);
        $conflict = DB::table('sync_conflicts')->where('entry_id', $entries[0]['id'])->sole();
        expect($conflict->reason)->toBe('differs')
            ->and(json_decode((string) $conflict->detail, true))->toMatchArray(['field' => 'payment_method', 'mine' => 'cash', 'here' => 'pos'])
            ->and(DB::table('athlete_payments')->where('athlete_id', $this->luca)->value('payment_method'))->toBe('pos');
    });

    it('applies nothing twice: a replay run again skips what it dealt with', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$this->luca]]));

        replayOnThePc($entries);
        DB::table('sync_journal')->delete();
        $again = replayOnThePc($entries);

        expect($again)->toBe([$entries[0]['id'] => 'skipped'])
            ->and(DB::table('attendance_records')->where('athlete_id', $this->luca)->count())->toBe(1);
    });

    it('records each outcome and keeps every entry it dealt with, to push with the next version', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$this->luca]]));

        replayOnThePc($entries);

        expect(DB::table('sync_entries')->where('id', $entries[0]['id'])->value('outcome'))->toBe('applied')
            ->and(DB::table('sync_journal')->where('device', 'phone9c1e')->pluck('id')->all())->toBe([$entries[0]['id']]);
    });
});

describe('what a replay never does silently (#2101 review)', function (): void {
    it('keeps the PC’s change to a field the phone’s whole form only carried along', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)->putJson("/api/v1/athletes/{$this->luca}", [
            'first_name' => 'Lucas',
            'last_name' => 'Bianchi',
            'belt' => 'white',
            'stripes' => 0,
            'status' => 'active',
            'joined_at' => '2026-09-01',
        ])->assertOk());
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['last_name' => 'Verdi'])->assertOk();

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'applied']);
        $luca = Athlete::query()->findOrFail($this->luca);
        expect($luca->first_name)->toBe('Lucas')
            ->and($luca->last_name)->toBe('Verdi');
    });

    it('never deletes a month’s payment other than the one the phone deleted', function (): void {
        // October, paid in cash before the two devices parted.
        $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 10, 'payment_method' => 'cash'])->assertCreated();
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->deleteJson("/api/v1/athletes/{$this->luca}/payments/2026/10")->assertSuccessful());
        // The PC undid it too, and recorded October by POS.
        $this->actingAs($this->owner)->deleteJson("/api/v1/athletes/{$this->luca}/payments/2026/10")->assertSuccessful();
        $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 10, 'payment_method' => 'pos'])->assertCreated();

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict'])
            ->and(DB::table('sync_conflicts')->where('entry_id', $entries[0]['id'])->value('reason'))->toBe('changed')
            ->and(DB::table('athlete_payments')->where('athlete_id', $this->luca)->value('payment_method'))->toBe('pos');
    });

    it('still undoes a month’s payment the PC left as it was', function (): void {
        $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 10, 'payment_method' => 'cash'])->assertCreated();
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->deleteJson("/api/v1/athletes/{$this->luca}/payments/2026/10")->assertSuccessful());

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'applied'])
            ->and(DB::table('athlete_payments')->where('athlete_id', $this->luca)->count())->toBe(0);
    });

    it('keeps a payment’s amount, period and date with its entry, and raises a conflict when the fee here would make it otherwise', function (): void {
        $this->travelTo(CarbonImmutable::parse('2026-10-03 12:00:00', 'Europe/Rome'));
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 10, 'payment_method' => 'cash'])->assertCreated());
        expect($entries[0]['body'])->toMatchArray(['amount_cents' => 9500, 'period_months' => 1, 'paid_at' => '2026-10-03']);
        // The PC raised the fee meanwhile.
        $this->owner->academy->update(['monthly_fee_cents' => 10000]);

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict'])
            ->and(json_decode((string) DB::table('sync_conflicts')->where('entry_id', $entries[0]['id'])->value('detail'), true))
            ->toMatchArray(['reason' => 'differs', 'field' => 'amount_cents', 'mine' => 9500, 'here' => 10000])
            ->and(DB::table('athlete_payments')->where('athlete_id', $this->luca)->count())->toBe(0);
    });

    it('runs on the clock of the moment it was written: a payment marked on the 3rd is paid on the 3rd', function (): void {
        $this->travelTo(CarbonImmutable::parse('2026-10-03 18:00:00', 'Europe/Rome'));
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 10])->assertCreated());
        // An entry journaled before it carried its own date.
        unset($entries[0]['body']['paid_at']);
        $this->travelTo(CarbonImmutable::parse('2026-10-05 10:00:00', 'Europe/Rome'));

        replayOnThePc($entries);

        expect((string) DB::table('athlete_payments')->where('athlete_id', $this->luca)->value('paid_at'))->toStartWith('2026-10-03')
            ->and(now()->toDateString())->toBe('2026-10-05');
    });

    it('never moves a write onto another row when the replay made fewer rows than the phone', function (): void {
        $giulia = replayAthlete($this, 'Giulia');
        $entries = onThePhone(function () use ($giulia): void {
            $this->actingAs($this->owner)->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$this->luca, $giulia]])->assertCreated();
            $lucas = DB::table('attendance_records')->where('athlete_id', $this->luca)->value('id');
            $this->actingAs($this->owner)->deleteJson("/api/v1/attendance/{$lucas}")->assertSuccessful();
        });
        // The PC marked Luca already: the replay makes Giulia's record alone.
        $this->actingAs($this->owner)->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$this->luca]])->assertCreated();

        $outcomes = replayOnThePc($entries);

        expect($outcomes[$entries[1]['id']])->toBe('conflict')
            ->and(DB::table('sync_conflicts')->where('entry_id', $entries[1]['id'])->value('reason'))->toBe('gone')
            ->and(DB::table('attendance_records')->where('athlete_id', $giulia)->whereNull('deleted_at')->count())->toBe(1)
            ->and(DB::table('attendance_records')->where('athlete_id', $this->luca)->whereNull('deleted_at')->count())->toBe(1);
    });

    it('never pays whoever has the id of an athlete the phone created and the PC refused', function (): void {
        $entries = onThePhone(function (): void {
            $marco = (int) $this->actingAs($this->owner)->postJson('/api/v1/athletes', [
                'first_name' => 'Marco', 'last_name' => 'Rossi', 'email' => 'marco@example.test',
                'belt' => 'white', 'stripes' => 0, 'status' => 'active', 'joined_at' => '2026-09-01',
            ])->assertCreated()->json('data.id');
            $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$marco}/payments", ['year' => 2026, 'month' => 10, 'payment_method' => 'cash'])->assertCreated();
        });
        // On the PC that email is Mario's, who takes the id Marco had on the phone.
        $mario = (int) $this->actingAs($this->owner)->postJson('/api/v1/athletes', [
            'first_name' => 'Mario', 'last_name' => 'Rossi', 'email' => 'marco@example.test',
            'belt' => 'white', 'stripes' => 0, 'status' => 'active', 'joined_at' => '2026-09-01',
        ])->assertCreated()->json('data.id');

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict', $entries[1]['id'] => 'conflict'])
            ->and(DB::table('sync_conflicts')->where('entry_id', $entries[1]['id'])->value('reason'))->toBe('gone')
            ->and(DB::table('athlete_payments')->where('athlete_id', $mario)->count())->toBe(0);
    });

    it('finds an athlete deleted on both devices already deleted, not a conflict', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)->deleteJson("/api/v1/athletes/{$this->luca}")->assertSuccessful());
        $this->actingAs($this->owner)->deleteJson("/api/v1/athletes/{$this->luca}")->assertSuccessful();

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'already'])
            ->and(DB::table('sync_conflicts')->count())->toBe(0);
    });
});

describe('the rebase across the swap (#2031 step 3)', function (): void {
    beforeEach(function (): void {
        $this->dir = sys_get_temp_dir() . '/budojo-rebase-' . bin2hex(random_bytes(4));
        mkdir($this->dir);
        config()->set('budojo.sync.database', "{$this->dir}/budojo.sqlite");
    });

    afterEach(function (): void {
        array_map('unlink', glob("{$this->dir}/*") ?: []);
        rmdir($this->dir);
    });

    it('sets the journal aside at the stage, and the reconcile replays it on the database swapped in', function (): void {
        $entries = onThePhone(function (): void {
            $this->actingAs($this->owner)->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$this->luca]]);
            // What `PUT /sync/stage?rebase=1` does before it stages the PC's database.
            RebasePending::setAside('phone9c1e');
        });
        // The PC's database, swapped in on the phone: what the PC did meanwhile.
        $giulia = replayAthlete($this, 'Giulia');
        config()->set('budojo.sync.device', 'phone9c1e');

        $this->artisan('budojo:sync-reconcile')->assertSuccessful();

        expect(DB::table('attendance_records')->where('athlete_id', $this->luca)->count())->toBe(1)
            ->and(DB::table('sync_entries')->where('id', $entries[0]['id'])->value('outcome'))->toBe('applied')
            ->and(file_exists(RebasePending::path()))->toBeFalse()
            ->and(Athlete::query()->find($giulia))->not->toBeNull();
    });

    it('keeps a photo uploaded offline through the swap: the replay gives it its row before anything is swept', function (): void {
        $entries = onThePhone(function (): void {
            $this->actingAs($this->owner)
                ->post("/api/v1/athletes/{$this->luca}/photo", ['photo' => UploadedFile::fake()->image('luca.png', 20, 20)])
                ->assertOk();
            RebasePending::setAside('phone9c1e');
        });
        config()->set('budojo.sync.device', 'phone9c1e');

        $this->artisan('budojo:sync-reconcile')->assertSuccessful();

        $path = Athlete::query()->findOrFail($this->luca)->photo_path;
        expect(DB::table('sync_entries')->where('id', $entries[0]['id'])->value('outcome'))->toBe('applied')
            ->and($path)->not->toBeNull()
            ->and(Storage::disk('public')->exists((string) $path))->toBeTrue();
    });

    it('never replays a rebase set aside for an earlier stage: every stage clears it', function (): void {
        onThePhone(function (): void {
            $this->actingAs($this->owner)->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$this->luca]]);
            RebasePending::setAside('phone9c1e');
        });

        \App\Support\Sync\Staged::clear();

        expect(RebasePending::read())->toBeNull();
    });
});
