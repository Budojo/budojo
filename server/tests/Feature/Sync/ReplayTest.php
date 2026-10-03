<?php

declare(strict_types=1);

use App\Actions\Attendance\MarkAttendanceAction;
use App\Actions\Payment\RecordAthletePaymentAction;
use App\Actions\Sync\ReplayJournalAction;
use App\Enums\TrainingMode;
use App\Models\AcademyClass;
use App\Models\Athlete;
use App\Models\SyllabusTopic;
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

    it('raises a conflict for a month paid with no method on the phone and in cash on the PC', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 10])->assertCreated());
        expect($entries[0]['body'])->toHaveKey('payment_method', null);
        $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 10, 'payment_method' => 'cash'])->assertCreated();

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict'])
            ->and(json_decode((string) DB::table('sync_conflicts')->where('entry_id', $entries[0]['id'])->value('detail'), true))
            ->toMatchArray(['field' => 'payment_method', 'mine' => null, 'here' => 'cash']);
    });

    it('keeps the day a payment sent with no date was paid, and replays it without a conflict', function (): void {
        $this->travelTo(CarbonImmutable::parse('2026-10-03 12:00:00', 'Europe/Rome'));
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 10, 'paid_at' => null])->assertCreated());
        expect($entries[0]['body']['paid_at'])->toBe('2026-10-03');

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'applied']);
    });

    it('leaves no decrypted upload behind once a photo is replayed', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->post("/api/v1/athletes/{$this->luca}/photo", ['photo' => UploadedFile::fake()->image('luca.png', 20, 20)])
            ->assertOk());
        $before = glob(sys_get_temp_dir() . '/budojo-replay-*') ?: [];

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'applied'])
            ->and(array_values(array_diff(glob(sys_get_temp_dir() . '/budojo-replay-*') ?: [], $before)))->toBe([]);
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

    it('keeps the fee the PC set when the phone saves the academy’s whole form, and asks when both renamed it', function (): void {
        $academy = $this->owner->academy;
        $form = fn (string $name): array => ['name' => $name, 'monthly_fee_cents' => 9500];
        $entries = onThePhone(fn () => $this->actingAs($this->owner)->patchJson('/api/v1/academy', $form('Kaizen Roma'))->assertOk());
        $this->actingAs($this->owner)->patchJson('/api/v1/academy', ['monthly_fee_cents' => 12000])->assertOk();

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'applied']);
        expect($academy->fresh()->name)->toBe('Kaizen Roma')
            ->and($academy->fresh()->monthly_fee_cents)->toBe(12000);

        // Saved with nothing changed: the write recorded no row, and still
        // the academy is the row its form is about.
        $unchanged = onThePhone(fn () => $this->actingAs($this->owner)->patchJson('/api/v1/academy', ['name' => 'Kaizen Roma', 'monthly_fee_cents' => 12000])->assertOk());
        expect(end($unchanged)['before'])->toBeNull();
        $this->actingAs($this->owner)->patchJson('/api/v1/academy', ['monthly_fee_cents' => 13000])->assertOk();
        replayOnThePc($unchanged);
        expect($academy->fresh()->monthly_fee_cents)->toBe(13000);

        $renamed = onThePhone(fn () => $this->actingAs($this->owner)->patchJson('/api/v1/academy', ['name' => 'Kaizen Trastevere', 'monthly_fee_cents' => 13000])->assertOk());
        $this->actingAs($this->owner)->patchJson('/api/v1/academy', ['name' => 'Kaizen Prati'])->assertOk();

        // The first entry is kept on the phone too: this database skips it.
        $last = end($renamed)['id'];
        expect(replayOnThePc($renamed)[$last])->toBe('conflict')
            ->and($academy->fresh()->name)->toBe('Kaizen Prati');
    });

    it('keeps a phone number the PC changed whole, when the phone’s form carried both halves along', function (): void {
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['phone_country_code' => '+39', 'phone_national_number' => '3331234567'])->assertOk();
        $entries = onThePhone(fn () => $this->actingAs($this->owner)->putJson("/api/v1/athletes/{$this->luca}", [
            'first_name' => 'Lucas', 'last_name' => 'Bianchi', 'belt' => 'white', 'stripes' => 0, 'status' => 'active',
            'joined_at' => '2026-09-01', 'phone_country_code' => '+39', 'phone_national_number' => '3331234567',
        ])->assertOk());
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['phone_country_code' => '+39', 'phone_national_number' => '3479876543'])->assertOk();

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'applied']);
        $luca = Athlete::query()->findOrFail($this->luca);
        expect($luca->first_name)->toBe('Lucas')
            ->and($luca->phone_national_number)->toBe('3479876543');
    });

    it('keeps the address the PC changed or added when the phone’s form carried its own along, and asks when both changed it', function (): void {
        $roma = ['line1' => 'Via Roma 1', 'city' => 'Roma', 'postal_code' => '00100', 'province' => 'RM', 'country' => 'IT'];
        $milano = ['line1' => 'Via Milano 2', 'city' => 'Milano', 'postal_code' => '20100', 'province' => 'MI', 'country' => 'IT'];
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['address' => $roma])->assertOk();
        $form = fn (string $name, ?array $address): array => ['first_name' => $name, 'last_name' => 'Bianchi', 'belt' => 'white', 'stripes' => 0, 'status' => 'active', 'joined_at' => '2026-09-01', 'address' => $address];
        $city = fn (): ?string => DB::table('addresses')->where('addressable_type', Athlete::class)->where('addressable_id', $this->luca)->value('city');

        // The phone renames Luca with his Roma address along; the PC moves him to Milano.
        $entries = onThePhone(fn () => $this->actingAs($this->owner)->putJson("/api/v1/athletes/{$this->luca}", $form('Lucas', $roma))->assertOk());
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['address' => $milano])->assertOk();
        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'applied'])
            ->and($city())->toBe('Milano');

        // The phone moves him to Torino; the PC meanwhile to Napoli.
        $torino = [...$milano, 'city' => 'Torino', 'postal_code' => '10100', 'province' => 'TO'];
        $napoli = [...$milano, 'city' => 'Napoli', 'postal_code' => '80100', 'province' => 'NA'];
        $moved = onThePhone(fn () => $this->actingAs($this->owner)->putJson("/api/v1/athletes/{$this->luca}", $form('Lucas', $torino))->assertOk());
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['address' => $napoli])->assertOk();
        $last = end($moved)['id'];
        expect(replayOnThePc($moved)[$last])->toBe('conflict')
            ->and($city())->toBe('Napoli');

        // The phone clears it, and the PC left it alone: cleared.
        $cleared = onThePhone(fn () => $this->actingAs($this->owner)->putJson("/api/v1/athletes/{$this->luca}", $form('Lucas', null))->assertOk());
        $last = end($cleared)['id'];
        expect(replayOnThePc($cleared)[$last])->toBe('applied')
            ->and($city())->toBeNull();
    });

    it('clears an address the phone added and cleared, whatever ids its owner has here', function (): void {
        $roma = ['line1' => 'Via Roma 1', 'city' => 'Roma', 'postal_code' => '00100', 'province' => 'RM', 'country' => 'IT'];
        $entries = onThePhone(function () use ($roma): void {
            $marco = (int) $this->actingAs($this->owner)->postJson('/api/v1/athletes', [
                'first_name' => 'Marco', 'last_name' => 'Rossi', 'belt' => 'white', 'stripes' => 0, 'status' => 'active',
                'joined_at' => '2026-09-01', 'address' => $roma,
            ])->assertCreated()->json('data.id');
            $this->actingAs($this->owner)->putJson("/api/v1/athletes/{$marco}", [
                'first_name' => 'Marco', 'last_name' => 'Rossi', 'belt' => 'white', 'stripes' => 0, 'status' => 'active',
                'joined_at' => '2026-09-01', 'address' => null,
            ])->assertOk();
        });
        // The PC adds Giulia meanwhile: Marco gets another id here.
        replayAthlete($this, 'Giulia');

        expect(array_values(replayOnThePc($entries)))->toBe(['applied', 'applied']);
        $marco = Athlete::query()->where('first_name', 'Marco')->sole();
        expect(DB::table('addresses')->where('addressable_type', Athlete::class)->where('addressable_id', $marco->id)->exists())->toBeFalse();
    });

    it('keeps the street the PC changed when the phone corrects the city, its form carrying the rest along', function (): void {
        $roma = ['line1' => 'Via Roma 1', 'city' => 'Roma', 'postal_code' => '00100', 'province' => 'RM', 'country' => 'IT'];
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['address' => $roma])->assertOk();
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->patchJson("/api/v1/athletes/{$this->luca}", ['address' => [...$roma, 'city' => 'Fiumicino']])->assertOk());
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['address' => [...$roma, 'line1' => 'Via Appia 9']])->assertOk();

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'applied']);
        $address = DB::table('addresses')->where('addressable_type', Athlete::class)->where('addressable_id', $this->luca)->sole();
        expect($address->city)->toBe('Fiumicino')
            ->and($address->line1)->toBe('Via Appia 9');
    });

    it('finds a photo removed on both devices already removed, and asks when the PC put another one', function (): void {
        $photo = fn (string $name, int $size) => $this->actingAs($this->owner)
            ->post("/api/v1/athletes/{$this->luca}/photo", ['photo' => UploadedFile::fake()->image($name, $size, $size)])->assertOk();
        $photo('luca.png', 20);
        $removed = onThePhone(fn () => $this->actingAs($this->owner)->deleteJson("/api/v1/athletes/{$this->luca}/photo")->assertSuccessful());
        $this->actingAs($this->owner)->deleteJson("/api/v1/athletes/{$this->luca}/photo")->assertSuccessful();

        expect(replayOnThePc($removed))->toBe([$removed[0]['id'] => 'already']);

        $photo('again.png', 24);
        $again = onThePhone(fn () => $this->actingAs($this->owner)->deleteJson("/api/v1/athletes/{$this->luca}/photo")->assertSuccessful());
        // Another picture: other bytes at the same path.
        $photo('newer.png', 32);
        $pcPhoto = Athlete::query()->findOrFail($this->luca)->photo_sha256;

        expect(replayOnThePc($again)[end($again)['id']])->toBe('conflict')
            ->and(Athlete::query()->findOrFail($this->luca)->photo_sha256)->toBe($pcPhoto);
    });

    it('keeps an address the PC cleared when the phone’s form carried it along', function (): void {
        $roma = ['line1' => 'Via Roma 1', 'city' => 'Roma', 'postal_code' => '00100', 'province' => 'RM', 'country' => 'IT'];
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['address' => $roma])->assertOk();
        $entries = onThePhone(fn () => $this->actingAs($this->owner)->putJson("/api/v1/athletes/{$this->luca}", [
            'first_name' => 'Lucas', 'last_name' => 'Bianchi', 'belt' => 'white', 'stripes' => 0, 'status' => 'active',
            'joined_at' => '2026-09-01', 'address' => $roma,
        ])->assertOk());
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['address' => null])->assertOk();

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'applied'])
            ->and(Athlete::query()->findOrFail($this->luca)->first_name)->toBe('Lucas')
            ->and(DB::table('addresses')->where('addressable_type', Athlete::class)->where('addressable_id', $this->luca)->exists())->toBeFalse();
    });

    it('asks when the academy logo changed on both devices, never replacing the PC’s', function (): void {
        $logo = fn (int $size) => $this->actingAs($this->owner)
            ->post('/api/v1/academy/logo', ['logo' => UploadedFile::fake()->image('logo.png', $size, $size)])->assertSuccessful();
        $academy = $this->owner->academy;

        $uploaded = onThePhone(fn () => $logo(40));
        $logo(48);
        $pcLogo = $academy->fresh()->logo_sha256;
        expect(replayOnThePc($uploaded)[end($uploaded)['id']])->toBe('conflict')
            ->and($academy->fresh()->logo_sha256)->toBe($pcLogo);

        $removed = onThePhone(fn () => $this->actingAs($this->owner)->deleteJson('/api/v1/academy/logo')->assertSuccessful());
        $logo(56);
        $pcLogo = $academy->fresh()->logo_sha256;
        expect(replayOnThePc($removed)[end($removed)['id']])->toBe('conflict')
            ->and($academy->fresh()->logo_sha256)->toBe($pcLogo);
    });

    it('undoes a row the phone made and removed, whatever id it has here', function (): void {
        $giulia = replayAthlete($this, 'Giulia');
        $entries = onThePhone(function (): void {
            $this->actingAs($this->owner)->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$this->luca]])->assertCreated();
            $record = DB::table('attendance_records')->where('athlete_id', $this->luca)->value('id');
            $this->actingAs($this->owner)->deleteJson("/api/v1/attendance/{$record}")->assertSuccessful();
            $marco = replayAthlete($this, 'Marco');
            $this->actingAs($this->owner)->deleteJson("/api/v1/athletes/{$marco}")->assertSuccessful();
        });
        // The PC checks Giulia in and adds Paolo meanwhile: Luca's record and
        // Marco take other ids here.
        $this->actingAs($this->owner)->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$giulia]])->assertCreated();
        replayAthlete($this, 'Paolo');

        expect(array_count_values(replayOnThePc($entries)))->toBe(['applied' => 4])
            ->and(DB::table('attendance_records')->where('athlete_id', $this->luca)->whereNull('deleted_at')->count())->toBe(0)
            ->and(Athlete::query()->where('first_name', 'Marco')->exists())->toBeFalse();
    });

    it('asks when the phone removes a presence the PC put in a lesson meanwhile', function (): void {
        $class = AcademyClass::factory()->for($this->owner->academy)->create(['name' => 'Gi', 'weekday' => 4, 'starts_at' => '19:00', 'kind' => TrainingMode::Gi]);
        // Both devices: Luca present on 1 October, in no class.
        $presence = (int) $this->actingAs($this->owner)->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$this->luca]])->assertCreated()->json('data.0.id');
        $entries = onThePhone(fn () => $this->actingAs($this->owner)->deleteJson("/api/v1/attendance/{$presence}")->assertSuccessful());
        // The PC checks him into the class: his presence joins its lesson.
        $this->actingAs($this->owner)->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$this->luca], 'academy_class_id' => $class->id])->assertSuccessful();

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict'])
            ->and(DB::table('sync_conflicts')->where('entry_id', $entries[0]['id'])->value('reason'))->toBe('changed')
            ->and(DB::table('attendance_records')->where('athlete_id', $this->luca)->whereNull('deleted_at')->whereNotNull('lesson_id')->count())->toBe(1);
    });

    it('undoes a check-in the phone made in its own lesson, while the PC checked someone into another class that day', function (): void {
        $x = AcademyClass::factory()->for($this->owner->academy)->create(['name' => 'Gi', 'weekday' => 4, 'starts_at' => '19:00', 'kind' => TrainingMode::Gi]);
        $y = AcademyClass::factory()->for($this->owner->academy)->create(['name' => 'No-gi', 'weekday' => 4, 'starts_at' => '20:30', 'kind' => TrainingMode::Gi]);
        $giulia = replayAthlete($this, 'Giulia');
        $entries = onThePhone(function () use ($x): void {
            $presence = (int) $this->actingAs($this->owner)->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$this->luca], 'academy_class_id' => $x->id])->assertCreated()->json('data.0.id');
            $this->actingAs($this->owner)->deleteJson("/api/v1/attendance/{$presence}")->assertSuccessful();
        });
        $this->actingAs($this->owner)->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$giulia], 'academy_class_id' => $y->id])->assertCreated();

        expect(array_count_values(replayOnThePc($entries)))->toBe(['applied' => 2])
            ->and(DB::table('attendance_records')->where('athlete_id', $this->luca)->whereNull('deleted_at')->count())->toBe(0);
    });

    it('finds the academy logo removed on both devices no conflict', function (): void {
        $this->actingAs($this->owner)->post('/api/v1/academy/logo', ['logo' => UploadedFile::fake()->image('logo.png', 64, 64)])->assertSuccessful();
        $entries = onThePhone(fn () => $this->actingAs($this->owner)->deleteJson('/api/v1/academy/logo')->assertSuccessful());
        $this->actingAs($this->owner)->deleteJson('/api/v1/academy/logo')->assertSuccessful();

        expect(replayOnThePc($entries)[$entries[0]['id']])->not->toBe('conflict');
    });

    it('finds the owner rejoining the roster on both devices no conflict', function (): void {
        $this->actingAs($this->owner)->postJson('/api/v1/me/athlete')->assertSuccessful();
        $this->actingAs($this->owner)->deleteJson('/api/v1/me/athlete')->assertSuccessful();
        $entries = onThePhone(fn () => $this->actingAs($this->owner)->postJson('/api/v1/me/athlete')->assertSuccessful());
        $this->actingAs($this->owner)->postJson('/api/v1/me/athlete')->assertSuccessful();

        expect(replayOnThePc($entries)[$entries[0]['id']])->not->toBe('conflict')
            ->and(DB::table('athletes')->where('user_id', $this->owner->id)->where('is_self', true)->whereNull('deleted_at')->count())->toBe(1);
    });

    it('never asks about what an athlete’s delete took along: a document the PC deleted already', function (): void {
        config()->set('documents.encryption_key', base64_encode(random_bytes(32)));
        $document = (int) $this->actingAs($this->owner)
            ->post("/api/v1/athletes/{$this->luca}/documents", ['type' => 'id_card', 'file' => UploadedFile::fake()->createWithContent('id.pdf', '%PDF-1.4 an id card')])
            ->assertCreated()->json('data.id');
        $entries = onThePhone(fn () => $this->actingAs($this->owner)->deleteJson("/api/v1/athletes/{$this->luca}")->assertSuccessful());
        $this->actingAs($this->owner)->deleteJson("/api/v1/documents/{$document}")->assertSuccessful();

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'applied'])
            ->and(DB::table('sync_conflicts')->count())->toBe(0);
    });

    it('finds an athlete deleted on both devices already deleted, not a conflict', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)->deleteJson("/api/v1/athletes/{$this->luca}")->assertSuccessful());
        $this->actingAs($this->owner)->deleteJson("/api/v1/athletes/{$this->luca}")->assertSuccessful();

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'already'])
            ->and(DB::table('sync_conflicts')->count())->toBe(0);
    });
});

describe('a lesson’s topics, tagged on two devices (#2102)', function (): void {
    beforeEach(function (): void {
        $this->class = AcademyClass::factory()->for($this->owner->academy)->create(['name' => 'Gi', 'weekday' => 4, 'starts_at' => '19:00', 'kind' => TrainingMode::Gi]);
        [$this->guard, $this->sweep, $this->armbar] = SyllabusTopic::factory()->for($this->owner->academy)->count(3)->create()->modelKeys();
        $this->tag = fn (array $topics) => $this->actingAs($this->owner)->putJson('/api/v1/lessons/topics', [
            'academy_class_id' => $this->class->id,
            'held_on' => '2026-10-01',
            'topic_ids' => $topics,
        ])->assertOk();
        $this->topicsHere = fn (): array => DB::table('lesson_topic')->orderBy('syllabus_topic_id')->pluck('syllabus_topic_id')->map(fn ($id) => (int) $id)->all();
    });

    it('keeps what the replaced set was in the entry, so a replay can tell', function (): void {
        ($this->tag)([$this->guard]);
        $entries = onThePhone(fn () => ($this->tag)([$this->sweep]));

        expect(array_values($entries[0]['before']['lessons'] ?? [])[0]['topic_ids'] ?? null)->toBe([$this->guard]);
    });

    it('applies the phone’s tags when the PC left the lesson alone', function (): void {
        ($this->tag)([$this->guard]);
        $entries = onThePhone(fn () => ($this->tag)([$this->sweep, $this->armbar]));

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'applied'])
            ->and(($this->topicsHere)())->toBe([$this->sweep, $this->armbar]);
    });

    it('finds the same tags on both devices already true', function (): void {
        ($this->tag)([$this->guard]);
        $entries = onThePhone(fn () => ($this->tag)([$this->sweep]));
        ($this->tag)([$this->sweep]);

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'already']);
    });

    it('asks when both devices re-tagged the lesson otherwise, and keeps the PC’s tags meanwhile', function (): void {
        ($this->tag)([$this->guard]);
        $entries = onThePhone(fn () => ($this->tag)([$this->sweep]));
        ($this->tag)([$this->armbar]);

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict'])
            ->and(json_decode((string) DB::table('sync_conflicts')->where('entry_id', $entries[0]['id'])->value('detail'), true))
            ->toMatchArray(['reason' => 'changed', 'field' => 'topic_ids', 'saw' => [$this->guard], 'here' => [$this->armbar]])
            ->and(($this->topicsHere)())->toBe([$this->armbar]);
    });

    it('sends the class and day with the phone’s tags or notes for «Tieni la mia»', function (): void {
        ($this->tag)([$this->guard]);
        $entries = onThePhone(function (): void {
            ($this->tag)([$this->sweep]);
            $this->actingAs($this->owner)->putJson('/api/v1/lessons/notes', ['academy_class_id' => $this->class->id, 'held_on' => '2026-10-01', 'notes' => 'Guard passing'])->assertOk();
        });
        ($this->tag)([$this->armbar]);
        $this->actingAs($this->owner)->putJson('/api/v1/lessons/notes', ['academy_class_id' => $this->class->id, 'held_on' => '2026-10-01', 'notes' => 'Armbar from guard'])->assertOk();
        expect(array_values(replayOnThePc($entries)))->toBe(['conflict', 'conflict']);

        foreach ($this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')->json('data') as $conflict) {
            foreach ($conflict['retry'] as $request) {
                $this->actingAs($this->owner)->json($request['method'], $request['url'], $request['body'])->assertOk();
            }
        }

        expect(($this->topicsHere)())->toBe([$this->sweep])
            ->and(DB::table('lessons')->where('held_on', 'like', '2026-10-01%')->value('notes'))->toBe('Guard passing');
    });

    it('finds by its class and day a lesson each device made, and tags it, never losing it', function (): void {
        $giulia = replayAthlete($this, 'Giulia');
        $entries = onThePhone(function (): void {
            $this->actingAs($this->owner)->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$this->luca], 'academy_class_id' => $this->class->id])->assertSuccessful();
            ($this->tag)([$this->sweep]);
        });
        $this->actingAs($this->owner)->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$giulia], 'academy_class_id' => $this->class->id])->assertSuccessful();

        expect(array_values(replayOnThePc($entries)))->not->toContain('conflict')
            ->and(($this->topicsHere)())->toBe([$this->sweep]);
    });

    it('finds the lesson by its class and day when it has another id here', function (): void {
        $giulia = replayAthlete($this, 'Giulia');
        $entries = onThePhone(function (): void {
            $this->actingAs($this->owner)->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$this->luca], 'academy_class_id' => $this->class->id])->assertSuccessful();
            ($this->tag)([$this->sweep]);
        });
        // The PC made the week before's lesson first: Thursday's takes another id here.
        $this->actingAs($this->owner)->putJson('/api/v1/lessons/topics', ['academy_class_id' => $this->class->id, 'held_on' => '2026-09-24', 'topic_ids' => [$this->guard]])->assertOk();
        $this->actingAs($this->owner)->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$giulia], 'academy_class_id' => $this->class->id])->assertSuccessful();
        // The check-in made the phone's lesson: its id there, against Thursday's here.
        expect($entries[0]['created']['lessons'][0] ?? null)->not->toBeNull()
            ->and(DB::table('lessons')->where('held_on', 'like', '2026-10-01%')->value('id'))->not->toBe($entries[0]['created']['lessons'][0]);

        expect(array_values(replayOnThePc($entries)))->not->toContain('conflict');
        $thursday = DB::table('lessons')->where('held_on', 'like', '2026-10-01%')->value('id');
        expect(DB::table('lesson_topic')->where('lesson_id', $thursday)->pluck('syllabus_topic_id')->map(fn ($id) => (int) $id)->all())->toBe([$this->sweep]);
    });

    it('stays a conflict when the entry is replayed again: a lesson each device made keeps its recorded set', function (): void {
        $entries = onThePhone(fn () => ($this->tag)([$this->sweep]));
        expect(end($entries)['before'])->not->toBeNull();
        ($this->tag)([$this->armbar]);
        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict']);

        // A second rebase: the entry kept again, replayed on a database that has not dealt with it.
        $kept = RebasePending::entriesOf('phone9c1e');
        DB::table('sync_entries')->where('id', $entries[0]['id'])->delete();
        DB::table('sync_conflicts')->where('entry_id', $entries[0]['id'])->delete();
        DB::table('sync_journal')->where('id', $entries[0]['id'])->delete();

        expect(replayOnThePc($kept))->toBe([$entries[0]['id'] => 'conflict'])
            ->and(($this->topicsHere)())->toBe([$this->armbar]);
    });

    it('counts only the topics still in the programme here: one removed on the PC is no conflict', function (): void {
        ($this->tag)([$this->guard, $this->armbar]);
        $entries = onThePhone(fn () => ($this->tag)([$this->guard, $this->sweep]));
        SyllabusTopic::query()->findOrFail($this->armbar)->delete();

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'applied']);
    });

    it('applies as it always did a topics entry written before sets were recorded', function (): void {
        ($this->tag)([$this->guard]);
        $entries = onThePhone(fn () => ($this->tag)([$this->sweep]));
        $entries[0]['before'] = null;

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'applied'])
            ->and(($this->topicsHere)())->toBe([$this->sweep]);
    });

    it('keeps the PC’s tags when the phone saved the lesson’s topics unchanged', function (): void {
        ($this->tag)([$this->guard]);
        $entries = onThePhone(fn () => ($this->tag)([$this->guard]));
        ($this->tag)([$this->armbar]);

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'already'])
            ->and(($this->topicsHere)())->toBe([$this->armbar]);
    });

    it('asks when each device made the lesson and tagged it otherwise', function (): void {
        $entries = onThePhone(fn () => ($this->tag)([$this->sweep]));
        ($this->tag)([$this->armbar]);

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict'])
            ->and(($this->topicsHere)())->toBe([$this->armbar]);
    });
});

describe('«Da decidere»: the owner’s answers (#2031)', function (): void {
    /** A `changed` conflict on Luca’s last name: Bianco on the phone, Verdi on the PC. */
    function conflictOnLucasName(mixed $test): array
    {
        $entries = onThePhone(fn () => $test->actingAs($test->owner)->patchJson("/api/v1/athletes/{$test->luca}", ['last_name' => 'Bianco'])->assertOk());
        $test->actingAs($test->owner)->patchJson("/api/v1/athletes/{$test->luca}", ['last_name' => 'Verdi'])->assertOk();
        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict']);

        return $entries;
    }

    it('lists what waits, with whom it is about and the request that makes the phone’s write true', function (): void {
        $entries = conflictOnLucasName($this);

        $this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $entries[0]['id'])
            ->assertJsonPath('data.0.device', 'phone9c1e')
            ->assertJsonPath('data.0.reason', 'changed')
            ->assertJsonPath('data.0.detail.field', 'last_name')
            ->assertJsonPath('data.0.subject.athlete.id', $this->luca)
            ->assertJsonPath('data.0.subject.athlete.name', 'Luca Verdi')
            ->assertJsonPath('data.0.subject.athlete.belt', 'white')
            ->assertJsonPath('data.0.retry', [['method' => 'PATCH', 'url' => "/api/v1/athletes/{$this->luca}", 'body' => ['last_name' => 'Bianco']]]);
    });

    it('keeps the phone’s write: the page sends the retry, then the answer, and nothing waits any more', function (): void {
        $entries = conflictOnLucasName($this);
        $retry = $this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')->json('data.0.retry.0');

        $this->actingAs($this->owner)->json($retry['method'], $retry['url'], $retry['body'])->assertOk();
        $this->actingAs($this->owner)->postJson("/api/v1/sync/conflicts/{$entries[0]['id']}/decision", ['decision' => 'mine'])->assertNoContent();

        expect(Athlete::query()->findOrFail($this->luca)->last_name)->toBe('Bianco')
            ->and(DB::table('sync_conflicts')->where('entry_id', $entries[0]['id'])->value('decision'))->toBe('mine');
        $this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')->assertJsonCount(0, 'data');
    });

    it('undoes the month first when the phone paid it otherwise, and offers nothing when the fee would make another amount', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 10, 'payment_method' => 'cash'])->assertCreated());
        $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 10, 'payment_method' => 'pos'])->assertCreated();
        replayOnThePc($entries);

        $retry = $this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')->json('data.0.retry');
        expect(array_column($retry, 'method'))->toBe(['DELETE', 'POST'])
            ->and($retry[0]['url'])->toBe("/api/v1/athletes/{$this->luca}/payments/2026/10");
        foreach ($retry as $request) {
            $this->actingAs($this->owner)->json($request['method'], $request['url'], $request['body'] ?? [])->assertSuccessful();
        }
        expect(DB::table('athlete_payments')->where('athlete_id', $this->luca)->value('payment_method'))->toBe('cash');

        $fee = onThePhone(fn () => $this->actingAs($this->owner)
            ->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 11, 'payment_method' => 'cash'])->assertCreated());
        $this->owner->academy->update(['monthly_fee_cents' => 10000]);
        replayOnThePc([end($fee)]);
        $amount = collect($this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')->json('data'))->firstWhere('detail.field', 'amount_cents');
        expect($amount['retry'])->toBeNull();
    });

    it('asks about a month the PC paid within a quarter, and offers nothing for a write whose athlete is gone', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 9, 'payment_method' => 'cash'])->assertCreated());
        $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 8, 'period_months' => 3, 'payment_method' => 'pos'])->assertCreated();

        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict'])
            ->and(DB::table('sync_conflicts')->where('entry_id', $entries[0]['id'])->value('reason'))->toBe('refused');

        $gone = onThePhone(fn () => $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['first_name' => 'Lucas'])->assertOk());
        $this->actingAs($this->owner)->deleteJson("/api/v1/athletes/{$this->luca}")->assertSuccessful();
        replayOnThePc([end($gone)]);
        $conflict = collect($this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')->json('data'))->firstWhere('reason', 'gone');
        expect($conflict['retry'])->toBeNull();
    });

    it('sends again only the field the conflict is about: the PC’s other changes to the form stay', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)->putJson("/api/v1/athletes/{$this->luca}", [
            'first_name' => 'Luca', 'last_name' => 'Bianco', 'belt' => 'white', 'stripes' => 0, 'status' => 'active', 'joined_at' => '2026-09-01',
        ])->assertOk());
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['first_name' => 'Lucas', 'last_name' => 'Verdi'])->assertOk();
        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict']);

        $retry = $this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')->json('data.0.retry.0');
        // The PC's first name is out; what still holds here what the phone sent goes along.
        expect($retry['body'])->not->toHaveKey('first_name')
            ->and($retry['body'])->toMatchArray(['last_name' => 'Bianco', 'belt' => 'white']);
        $this->actingAs($this->owner)->json($retry['method'], $retry['url'], $retry['body'])->assertOk();

        $luca = Athlete::query()->findOrFail($this->luca);
        expect($luca->first_name)->toBe('Lucas')->and($luca->last_name)->toBe('Bianco');
    });

    it('sends again every field the phone changed in that form, not only the one in conflict', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['last_name' => 'Bianco', 'email' => 'luca@example.test'])->assertOk());
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['first_name' => 'Lucas', 'last_name' => 'Verdi'])->assertOk();
        replayOnThePc($entries);

        $retry = $this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')->json('data.0.retry.0');
        expect($retry['body'])->toEqualCanonicalizing(['last_name' => 'Bianco', 'email' => 'luca@example.test']);
        $this->actingAs($this->owner)->json($retry['method'], $retry['url'], $retry['body'])->assertOk();
        $luca = Athlete::query()->findOrFail($this->luca);
        expect($luca->only(['first_name', 'last_name', 'email']))->toBe(['first_name' => 'Lucas', 'last_name' => 'Bianco', 'email' => 'luca@example.test']);
    });

    it('keeps the street the PC changed when «Tieni la mia» puts back the city the phone corrected', function (): void {
        $roma = ['line1' => 'Via Roma 1', 'city' => 'Roma', 'postal_code' => '00100', 'province' => 'RM', 'country' => 'IT'];
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['address' => $roma])->assertOk();
        $entries = onThePhone(fn () => $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['address' => [...$roma, 'city' => 'Fiumicino']])->assertOk());
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['address' => [...$roma, 'line1' => 'Via Appia 9', 'city' => 'Ostia']])->assertOk();
        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict']);

        $retry = $this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')->json('data.0.retry.0');
        $this->actingAs($this->owner)->json($retry['method'], $retry['url'], $retry['body'])->assertOk();
        $address = DB::table('addresses')->where('addressable_type', Athlete::class)->where('addressable_id', $this->luca)->sole();
        expect($address->line1)->toBe('Via Appia 9')->and($address->city)->toBe('Fiumicino');
    });

    it('clears the address again, and nothing else, when the phone had cleared it with its whole form', function (): void {
        $roma = ['line1' => 'Via Roma 1', 'city' => 'Roma', 'postal_code' => '00100', 'province' => 'RM', 'country' => 'IT'];
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['address' => $roma])->assertOk();
        $entries = onThePhone(fn () => $this->actingAs($this->owner)->putJson("/api/v1/athletes/{$this->luca}", [
            'first_name' => 'Luca', 'last_name' => 'Bianchi', 'belt' => 'white', 'stripes' => 0, 'status' => 'active', 'joined_at' => '2026-09-01', 'address' => null,
        ])->assertOk());
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['first_name' => 'Lucas', 'address' => [...$roma, 'city' => 'Ostia']])->assertOk();
        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict']);

        $retry = $this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')->json('data.0.retry.0');
        expect($retry['body'])->toHaveKey('address', null)
            ->and($retry['body'])->not->toHaveKey('first_name');
        $this->actingAs($this->owner)->json($retry['method'], $retry['url'], $retry['body'])->assertOk();
        expect(Athlete::query()->findOrFail($this->luca)->first_name)->toBe('Lucas')
            ->and(DB::table('addresses')->where('addressable_type', Athlete::class)->where('addressable_id', $this->luca)->exists())->toBeFalse();
    });

    it('sends the phone’s address whole when each device added one', function (): void {
        $roma = ['line1' => 'Via Roma 1', 'city' => 'Roma', 'postal_code' => '00100', 'province' => 'RM', 'country' => 'IT'];
        // The phone adds an address and renames him in one save; the PC does both otherwise.
        $entries = onThePhone(fn () => $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['last_name' => 'Bianco', 'address' => $roma])->assertOk());
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['last_name' => 'Verdi', 'address' => [...$roma, 'line1' => 'Via Milano 2', 'city' => 'Milano', 'postal_code' => '20100', 'province' => 'MI']])->assertOk();
        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict']);

        $retry = $this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')->json('data.0.retry.0');
        $this->actingAs($this->owner)->json($retry['method'], $retry['url'], $retry['body'])->assertOk();
        expect(Athlete::query()->findOrFail($this->luca)->last_name)->toBe('Bianco')
            ->and(DB::table('addresses')->where('addressable_type', Athlete::class)->where('addressable_id', $this->luca)->value('city'))->toBe('Roma');
    });

    it('sends back the last name and the city the phone changed in one save, whichever is in conflict', function (): void {
        $roma = ['line1' => 'Via Roma 1', 'city' => 'Roma', 'postal_code' => '00100', 'province' => 'RM', 'country' => 'IT'];
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['address' => $roma])->assertOk();
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->patchJson("/api/v1/athletes/{$this->luca}", ['last_name' => 'Bianco', 'address' => [...$roma, 'city' => 'Fiumicino']])->assertOk());
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['last_name' => 'Verdi', 'address' => [...$roma, 'line1' => 'Via Appia 9']])->assertOk();
        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict']);

        $retry = $this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')->json('data.0.retry.0');
        $this->actingAs($this->owner)->json($retry['method'], $retry['url'], $retry['body'])->assertOk();
        $address = DB::table('addresses')->where('addressable_type', Athlete::class)->where('addressable_id', $this->luca)->sole();
        expect(Athlete::query()->findOrFail($this->luca)->last_name)->toBe('Bianco')
            ->and($address->city)->toBe('Fiumicino')
            ->and($address->line1)->toBe('Via Appia 9');
    });

    it('sends only the address a whole-form save added, never the form the PC changed meanwhile', function (): void {
        $roma = ['line1' => 'Via Roma 1', 'city' => 'Roma', 'postal_code' => '00100', 'province' => 'RM', 'country' => 'IT'];
        $entries = onThePhone(fn () => $this->actingAs($this->owner)->putJson("/api/v1/athletes/{$this->luca}", [
            'first_name' => 'Luca', 'last_name' => 'Bianchi', 'belt' => 'white', 'stripes' => 0, 'status' => 'active', 'joined_at' => '2026-09-01', 'address' => $roma,
        ])->assertOk());
        expect($entries[0]['before'])->toBeNull();
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['address' => [...$roma, 'city' => 'Milano', 'postal_code' => '20100', 'province' => 'MI']])->assertOk();
        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict']);
        // While the question waits, the PC promotes and renames him.
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['belt' => 'blue', 'last_name' => 'Verdi'])->assertOk();

        $retry = $this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')->json('data.0.retry.0');
        $this->actingAs($this->owner)->json($retry['method'], $retry['url'], $retry['body'])->assertOk();
        $luca = Athlete::query()->findOrFail($this->luca);
        expect([$luca->belt->value, $luca->last_name])->toBe(['blue', 'Verdi'])
            ->and(DB::table('addresses')->where('addressable_type', Athlete::class)->where('addressable_id', $this->luca)->value('city'))->toBe('Roma');
    });

    it('sends a closure’s dates with the label the phone changed: the form requires them', function (): void {
        $closure = (int) $this->actingAs($this->owner)->postJson('/api/v1/academy/closures', ['label' => 'Natale', 'starts_on' => '2026-12-24', 'ends_on' => '2026-12-26'])->assertCreated()->json('data.id');
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->patchJson("/api/v1/academy/closures/{$closure}", ['label' => 'Vacanze di Natale', 'starts_on' => '2026-12-24', 'ends_on' => '2026-12-26'])->assertOk());
        $this->actingAs($this->owner)->patchJson("/api/v1/academy/closures/{$closure}", ['label' => 'Chiusura natalizia', 'starts_on' => '2026-12-24', 'ends_on' => '2026-12-26'])->assertOk();
        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict']);

        $retry = $this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')->json('data.0.retry.0');
        $this->actingAs($this->owner)->json($retry['method'], $retry['url'], $retry['body'])->assertOk();
        expect(DB::table('academy_closures')->where('id', $closure)->value('label'))->toBe('Vacanze di Natale');
    });

    it('leaves the academy’s training days out of a retry when the phone did not change them', function (): void {
        $this->actingAs($this->owner)->patchJson('/api/v1/academy', ['training_days' => [1, 3]])->assertOk();
        $entries = onThePhone(fn () => $this->actingAs($this->owner)->patchJson('/api/v1/academy', ['name' => 'Kaizen Roma', 'training_days' => [1, 3]])->assertOk());
        $this->actingAs($this->owner)->patchJson('/api/v1/academy', ['name' => 'Kaizen Prati', 'training_days' => [1, 3, 5]])->assertOk();
        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict']);

        $retry = $this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')->json('data.0.retry.0');
        expect($retry['body'])->not->toHaveKey('training_days');
        $this->actingAs($this->owner)->json($retry['method'], $retry['url'], $retry['body'])->assertOk();
        $academy = $this->owner->academy->fresh();
        expect($academy->name)->toBe('Kaizen Roma')
            ->and($academy->training_days)->toBe([1, 3, 5]);
    });

    it('sends the address a conflict recorded by v2.77.0 names, though it keeps no created', function (): void {
        $roma = ['line1' => 'Via Roma 1', 'city' => 'Roma', 'postal_code' => '00100', 'province' => 'RM', 'country' => 'IT'];
        $entries = onThePhone(fn () => $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['last_name' => 'Bianco', 'address' => $roma])->assertOk());
        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$this->luca}", ['address' => [...$roma, 'city' => 'Milano', 'postal_code' => '20100', 'province' => 'MI']])->assertOk();
        expect(replayOnThePc($entries))->toBe([$entries[0]['id'] => 'conflict']);
        // As v2.77.0 recorded it: no `created` in the entry.
        $row = DB::table('sync_conflicts')->where('entry_id', $entries[0]['id'])->sole();
        $entry = json_decode((string) $row->entry, true);
        unset($entry['created']);
        DB::table('sync_conflicts')->where('entry_id', $entries[0]['id'])->update(['entry' => json_encode($entry)]);

        $retry = $this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')->json('data.0.retry.0');
        $this->actingAs($this->owner)->json($retry['method'], $retry['url'], $retry['body'])->assertOk();
        expect(DB::table('addresses')->where('addressable_type', Athlete::class)->where('addressable_id', $this->luca)->value('city'))->toBe('Roma');
    });

    it('offers no retry when the method and the amount both differ: the fee here makes another amount', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 10, 'payment_method' => 'cash'])->assertCreated());
        $this->owner->academy->update(['monthly_fee_cents' => 10000]);
        $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 10, 'payment_method' => 'pos'])->assertCreated();
        replayOnThePc($entries);

        $this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')
            ->assertJsonPath('data.0.detail.field', 'payment_method')
            ->assertJsonPath('data.0.retry', null);
    });

    it('names no one for a write whose athlete has no row here, and offers no retry for one the rules refused', function (): void {
        $entries = onThePhone(function (): void {
            $marco = (int) $this->actingAs($this->owner)->postJson('/api/v1/athletes', [
                'first_name' => 'Marco', 'last_name' => 'Rossi', 'email' => 'marco@example.test',
                'belt' => 'white', 'stripes' => 0, 'status' => 'active', 'joined_at' => '2026-09-01',
            ])->assertCreated()->json('data.id');
            $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$marco}/payments", ['year' => 2026, 'month' => 10, 'payment_method' => 'cash'])->assertCreated();
        });
        // On the PC that email is Mario's, who takes the id Marco had on the phone.
        $this->actingAs($this->owner)->postJson('/api/v1/athletes', [
            'first_name' => 'Mario', 'last_name' => 'Bianchi', 'email' => 'marco@example.test',
            'belt' => 'white', 'stripes' => 0, 'status' => 'active', 'joined_at' => '2026-09-01',
        ])->assertCreated();
        replayOnThePc($entries);

        $conflicts = collect($this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')->json('data'))->keyBy('id');
        expect($conflicts[$entries[0]['id']]['reason'])->toBe('refused')
            ->and($conflicts[$entries[0]['id']]['retry'])->toBeNull()
            ->and($conflicts[$entries[1]['id']]['reason'])->toBe('gone')
            ->and($conflicts[$entries[1]['id']]['subject'])->toBeNull();
    });

    it('lists every conflict though one names parameters its route no longer takes, with its time in UTC', function (): void {
        $entries = conflictOnLucasName($this);
        DB::table('sync_conflicts')->insert([
            'entry_id' => '01K6F3Q8Z4M7X2N5P9R1T3V6W8', 'device' => 'phone9c1e', 'route' => 'athletes.update', 'reason' => 'failed',
            'detail' => '{}', 'entry' => json_encode(['method' => 'PATCH', 'params' => [], 'body' => ['last_name' => 'X']]),
        ]);

        $conflicts = collect($this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')->assertOk()->json('data'))->keyBy('id');
        expect($conflicts['01K6F3Q8Z4M7X2N5P9R1T3V6W8']['retry'])->toBeNull()
            ->and($conflicts[$entries[0]['id']]['recorded_at'])->toMatch('/T\d{2}:\d{2}:\d{2}(\+00:00|Z)$/');
    });

    it('names the athlete of a check-in or a document the route names, and how many others a check-in names', function (): void {
        $giulia = replayAthlete($this, 'Giulia');
        // Giulia's presence first, so Luca's record has an id that is no athlete's.
        $this->actingAs($this->owner)->postJson('/api/v1/attendance', ['date' => '2026-09-30', 'athlete_ids' => [$giulia]])->assertCreated();
        $this->actingAs($this->owner)->postJson('/api/v1/attendance', ['date' => '2026-09-29', 'athlete_ids' => [$giulia]])->assertCreated();
        $record = (int) $this->actingAs($this->owner)->postJson('/api/v1/attendance', ['date' => '2026-10-01', 'athlete_ids' => [$this->luca]])->json('data.0.id');
        expect($record)->not->toBe($this->luca)->and($record)->not->toBe($giulia);
        $conflict = fn (string $id, string $route, array $params, ?array $body) => DB::table('sync_conflicts')->insert([
            'entry_id' => $id, 'device' => 'phone9c1e', 'route' => $route, 'reason' => 'failed', 'detail' => '{}',
            'entry' => json_encode(['method' => 'POST', 'params' => $params, 'body' => $body]),
        ]);
        $conflict('01K6F3Q8Z4M7X2N5P9R1T3V6W1', 'attendance.destroy', ['attendance' => $record], null);
        $conflict('01K6F3Q8Z4M7X2N5P9R1T3V6W2', 'attendance.store', [], ['date' => '2026-10-02', 'athlete_ids' => [$giulia, $this->luca]]);

        $subjects = collect($this->actingAs($this->owner)->getJson('/api/v1/sync/conflicts')->json('data'))->pluck('subject', 'id');
        expect($subjects['01K6F3Q8Z4M7X2N5P9R1T3V6W1']['athlete']['id'])->toBe($this->luca)
            ->and($subjects['01K6F3Q8Z4M7X2N5P9R1T3V6W2']['athlete'])->toMatchArray(['id' => $giulia, 'name' => 'Giulia Bianchi', 'first_name' => 'Giulia', 'belt' => 'white'])
            ->and($subjects['01K6F3Q8Z4M7X2N5P9R1T3V6W2']['others'])->toBe(1);
    });

    it('keeps the phone’s in one call: the write made true here and the answer, both journaled', function (): void {
        $entries = conflictOnLucasName($this);

        $this->actingAs($this->owner)->postJson("/api/v1/sync/conflicts/{$entries[0]['id']}/keep-mine")->assertNoContent();

        expect(Athlete::query()->findOrFail($this->luca)->last_name)->toBe('Bianco')
            ->and(DB::table('sync_conflicts')->where('entry_id', $entries[0]['id'])->value('decision'))->toBe('mine')
            ->and(DB::table('sync_journal')->where('device', 'pc4f2a')->orderBy('id')->pluck('route')->slice(-2)->values()->all())
            ->toBe(['athletes.update', 'sync.conflicts.decide']);
    });

    it('keeps nothing when the payment is refused after the month was undone: the PC’s payment stays', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 10, 'payment_method' => 'cash'])->assertCreated());
        $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 10, 'payment_method' => 'pos'])->assertCreated();
        replayOnThePc($entries);
        // The payment fails once the month is undone: reached once, so the undo ran.
        $this->mock(RecordAthletePaymentAction::class, fn (MockInterface $mock) => $mock
            ->shouldReceive('execute')->once()->andThrow(new RuntimeException('disk full')));
        Route::getRoutes()->getByName('athletes.payments.store')?->flushController();
        $journal = DB::table('sync_journal')->pluck('route')->all();

        $this->actingAs($this->owner)->postJson("/api/v1/sync/conflicts/{$entries[0]['id']}/keep-mine")->assertUnprocessable();

        // The undo's entry too: left in the journal, it would undo the month on the phone.
        expect(DB::table('athlete_payments')->where('athlete_id', $this->luca)->value('payment_method'))->toBe('pos')
            ->and(DB::table('sync_conflicts')->where('entry_id', $entries[0]['id'])->value('decided_at'))->toBeNull()
            ->and(DB::table('sync_journal')->pluck('route')->all())->toBe($journal);
    });

    it('refuses to keep a write nothing would make true here', function (): void {
        $entries = onThePhone(fn () => $this->actingAs($this->owner)
            ->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 9, 'payment_method' => 'cash'])->assertCreated());
        $this->actingAs($this->owner)->postJson("/api/v1/athletes/{$this->luca}/payments", ['year' => 2026, 'month' => 8, 'period_months' => 3, 'payment_method' => 'pos'])->assertCreated();
        replayOnThePc($entries);

        $this->actingAs($this->owner)->postJson("/api/v1/sync/conflicts/{$entries[0]['id']}/keep-mine")->assertUnprocessable();
    });

    it('records each answer once, and takes one for a conflict this database does not hold', function (): void {
        $entries = conflictOnLucasName($this);

        $this->actingAs($this->owner)->postJson("/api/v1/sync/conflicts/{$entries[0]['id']}/decision", ['decision' => 'theirs'])->assertNoContent();
        $this->actingAs($this->owner)->postJson("/api/v1/sync/conflicts/{$entries[0]['id']}/decision", ['decision' => 'mine'])->assertNoContent();
        $this->actingAs($this->owner)->postJson('/api/v1/sync/conflicts/01K6F3Q8Z4M7X2N5P9R1T3V6W8/decision', ['decision' => 'theirs'])->assertNoContent();
        $this->actingAs($this->owner)->postJson("/api/v1/sync/conflicts/{$entries[0]['id']}/decision", ['decision' => 'maybe'])->assertUnprocessable();

        expect(DB::table('sync_conflicts')->where('entry_id', $entries[0]['id'])->value('decision'))->toBe('theirs');
    });

    it('journals the answer, so a rebase on the other device takes it there too', function (): void {
        $entries = conflictOnLucasName($this);
        // The PC answers: on a paired device the answer is an entry of its own.
        $this->actingAs($this->owner)->postJson("/api/v1/sync/conflicts/{$entries[0]['id']}/decision", ['decision' => 'theirs'])->assertNoContent();
        $answer = DB::table('sync_journal')->where('device', 'pc4f2a')->where('route', 'sync.conflicts.decide')->sole();
        // On a database where the conflict still waits, and that has not dealt with the answer.
        DB::table('sync_conflicts')->update(['decided_at' => null, 'decision' => null]);
        DB::table('sync_entries')->where('id', $answer->id)->delete();
        // The journal stays aside, as at a rebase's stage.
        $kept = RebasePending::entriesOf('pc4f2a');
        DB::table('sync_journal')->where('device', 'pc4f2a')->delete();

        $outcomes = app(ReplayJournalAction::class)->execute('pc4f2a', $kept);

        expect($outcomes[$answer->id])->toBe('applied')
            ->and(DB::table('sync_conflicts')->where('entry_id', $entries[0]['id'])->value('decision'))->toBe('theirs');
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
