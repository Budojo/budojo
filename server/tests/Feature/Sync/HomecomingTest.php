<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\AthletePromotion;
use App\Models\AttendanceRecord;
use App\Models\Lesson;
use App\Models\User;
use App\Support\Sync\Homecoming;
use App\Support\Sync\HomecomingSince;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * The homecoming («il rientro», PRD § 6.2, #2039): once the other device's
 * version is swapped in, a card on Oggi says what its work brought. The
 * reconcile reads the other device's journal, which came with the database,
 * from what this device held when it staged the version.
 */

/** A ULID the tests can order by hand: the n-th entry. */
function homecomingId(int $n): string
{
    return '01K6A' . str_pad((string) $n, 21, '0', STR_PAD_LEFT);
}

/**
 * An entry of a device's kept journal, as the swapped-in database brings it.
 *
 * @param  array<string, list<int>>  $created
 */
function homecomingEntry(int $n, string $device, string $route, array $created = []): void
{
    DB::table('sync_journal')->insert([
        'id' => homecomingId($n),
        'device' => $device,
        'at' => '2026-10-01T19:' . str_pad((string) $n, 2, '0', STR_PAD_LEFT) . ':00Z',
        'method' => 'POST',
        'route' => $route,
        'params' => '{}',
        'body' => null,
        'created' => json_encode((object) $created, JSON_THROW_ON_ERROR),
        'before' => null,
    ]);
}

beforeEach(function (): void {
    config()->set('budojo.runtime', 'desktop');
    Storage::fake('local');
    Storage::fake('public');
    $this->dir = sys_get_temp_dir() . '/budojo-homecoming-' . bin2hex(random_bytes(6));
    mkdir($this->dir);
    config()->set('budojo.sync.database', "{$this->dir}/budojo.sqlite");
    config()->set('budojo.sync.device', 'pc1a2b3c4d');
});

afterEach(function (): void {
    foreach (glob("{$this->dir}/*") ?: [] as $file) {
        unlink($file);
    }
    rmdir($this->dir);
});

describe('the reconcile after a pull', function (): void {
    it('tells what the other device brought since this one last held its work', function (): void {
        $gi = Lesson::factory()->create(['name' => 'BJJ Gi']);
        $nogi = Lesson::factory()->create(['name' => 'No-gi']);
        $presences = AttendanceRecord::factory()->count(3)->create(['lesson_id' => $gi->id]);
        $nogiPresence = AttendanceRecord::factory()->create(['lesson_id' => $nogi->id]);
        $classless = AttendanceRecord::factory()->create(['lesson_id' => null]);
        $removed = AttendanceRecord::factory()->create(['lesson_id' => $gi->id]);
        $removed->delete();
        $payments = AthletePayment::factory()->count(2)->sequence(['amount_cents' => 6000], ['amount_cents' => 4500])->create();
        $athlete = Athlete::factory()->create();
        $promotion = AthletePromotion::factory()->create();

        // Held before: the last pull brought these.
        homecomingEntry(1, 'phone9f8e7d6c', 'attendance.store', ['attendance_records' => [$presences[0]->id]]);
        HomecomingSince::remember(['phone9f8e7d6c' => homecomingId(1)]);
        homecomingEntry(2, 'phone9f8e7d6c', 'attendance.store', ['attendance_records' => [$presences[1]->id, $presences[2]->id, $removed->id]]);
        homecomingEntry(3, 'phone9f8e7d6c', 'attendance.store', ['attendance_records' => [$nogiPresence->id, $classless->id]]);
        homecomingEntry(4, 'phone9f8e7d6c', 'athletes.payments.store', ['athlete_payments' => $payments->pluck('id')->all()]);
        homecomingEntry(5, 'phone9f8e7d6c', 'athletes.store', ['athletes' => [$athlete->id]]);
        homecomingEntry(6, 'phone9f8e7d6c', 'athletes.promotions.store', ['athlete_promotions' => [$promotion->id]]);
        homecomingEntry(7, 'phone9f8e7d6c', 'athletes.update');
        homecomingEntry(8, 'phone9f8e7d6c', 'attendance.destroy');
        // This device's own: never news to it.
        homecomingEntry(9, 'pc1a2b3c4d', 'athletes.update');

        $this->artisan('budojo:sync-reconcile')->assertSuccessful();

        $this->actingAs(userWithAcademy())->getJson('/api/v1/sync/homecoming')
            ->assertOk()
            ->assertExactJson(['data' => [
                'device' => 'phone9f8e7d6c',
                'at' => '2026-10-01T19:08:00Z',
                'through' => homecomingId(8),
                'attendance' => [
                    ['lesson' => 'BJJ Gi', 'count' => 2],
                    ['lesson' => null, 'count' => 1],
                    ['lesson' => 'No-gi', 'count' => 1],
                ],
                'payments' => ['count' => 2, 'amount_cents' => 10500],
                'athletes' => 1,
                'promotions' => 1,
                'other' => 2,
            ]]);
        expect(file_exists(HomecomingSince::path()))->toBeFalse()
            ->and(DB::table('sync_journal')->where('device', 'phone9f8e7d6c')->count())->toBe(0);
    });

    it('adds a second pull to the one the owner has not seen yet', function (): void {
        $presence = AttendanceRecord::factory()->create(['lesson_id' => Lesson::factory()->create(['name' => 'BJJ Gi'])->id]);
        Homecoming::keep([
            'device' => 'phone9f8e7d6c',
            'at' => '2026-09-30T20:00:00Z',
            'through' => homecomingId(3),
            'attendance' => [['lesson' => 'BJJ Gi', 'count' => 5], ['lesson' => 'No-gi', 'count' => 6]],
            'payments' => ['count' => 1, 'amount_cents' => 6000],
            'athletes' => 0,
            'promotions' => 0,
            'other' => 1,
        ]);
        HomecomingSince::remember(['phone9f8e7d6c' => homecomingId(3)]);
        homecomingEntry(4, 'phone9f8e7d6c', 'attendance.store', ['attendance_records' => [$presence->id]]);
        homecomingEntry(5, 'phone9f8e7d6c', 'athletes.update');

        $this->artisan('budojo:sync-reconcile')->assertSuccessful();

        expect(Homecoming::read())->toBe([
            'device' => 'phone9f8e7d6c',
            'at' => '2026-10-01T19:05:00Z',
            'through' => homecomingId(5),
            'attendance' => [['lesson' => 'BJJ Gi', 'count' => 6], ['lesson' => 'No-gi', 'count' => 6]],
            'payments' => ['count' => 1, 'amount_cents' => 6000],
            'athletes' => 0,
            'promotions' => 0,
            'other' => 2,
        ]);
    });

    it('tells it once when a start that died after keeping it reconciles again', function (): void {
        HomecomingSince::remember([]);
        homecomingEntry(1, 'phone9f8e7d6c', 'athletes.update');
        $this->artisan('budojo:sync-reconcile')->assertSuccessful();
        $told = Homecoming::read();
        // The journal as it was, and the `since` the dead start never cleared.
        HomecomingSince::remember([]);
        homecomingEntry(1, 'phone9f8e7d6c', 'athletes.update');

        $this->artisan('budojo:sync-reconcile')->assertSuccessful();

        expect(Homecoming::read())->toBe($told)
            ->and($told['other'] ?? null)->toBe(1);
    });

    it('tells nothing after a stage that kept no since: a restore, or a first pull', function (): void {
        homecomingEntry(1, 'phone9f8e7d6c', 'athletes.update');

        $this->artisan('budojo:sync-reconcile')->assertSuccessful();

        expect(file_exists(Homecoming::path()))->toBeFalse();
    });

    it('tells nothing when the other device brought nothing new', function (): void {
        HomecomingSince::remember(['phone9f8e7d6c' => homecomingId(1)]);
        homecomingEntry(1, 'phone9f8e7d6c', 'athletes.update');

        $this->artisan('budojo:sync-reconcile')->assertSuccessful();

        expect(file_exists(Homecoming::path()))->toBeFalse()
            ->and(file_exists(HomecomingSince::path()))->toBeFalse();
    });
});

describe('GET and DELETE /api/v1/sync/homecoming', function (): void {
    beforeEach(function (): void {
        $this->arrived = [
            'device' => 'phone9f8e7d6c',
            'at' => '2026-10-01T19:00:00Z',
            'through' => homecomingId(4),
            'attendance' => [],
            'payments' => ['count' => 0, 'amount_cents' => 0],
            'athletes' => 1,
            'promotions' => 0,
            'other' => 0,
        ];
    });

    it('answers 204 while nothing waits to be seen', function (): void {
        $this->actingAs(userWithAcademy())->getJson('/api/v1/sync/homecoming')->assertNoContent();
    });

    it('forgets the homecoming the owner has seen', function (): void {
        Homecoming::keep($this->arrived);

        $this->actingAs(userWithAcademy())
            ->deleteJson('/api/v1/sync/homecoming?through=' . homecomingId(4))
            ->assertNoContent();

        expect(Homecoming::read())->toBeNull();
    });

    it('keeps one a later pull added to: the owner has not seen that part', function (): void {
        Homecoming::keep([...$this->arrived, 'through' => homecomingId(6)]);

        $this->actingAs(userWithAcademy())
            ->deleteJson('/api/v1/sync/homecoming?through=' . homecomingId(4))
            ->assertNoContent();

        expect(Homecoming::read()['through'] ?? null)->toBe(homecomingId(6));
    });

    it('refuses a through that is no entry id', function (): void {
        $this->actingAs(userWithAcademy())
            ->deleteJson('/api/v1/sync/homecoming?through=yesterday')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('through');
    });

    it('is the owner\'s alone', function (): void {
        Homecoming::keep($this->arrived);

        $this->actingAs(User::factory()->athlete()->create())->getJson('/api/v1/sync/homecoming')->assertForbidden();
    });
});
