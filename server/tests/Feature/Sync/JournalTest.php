<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * The journal (#2031, `docs/sync/protocol.md` § A journal entry): every write
 * the owner makes on a paired device is recorded by its route, so a rebase
 * can replay it through the same Actions on another device's database.
 *
 * Two tables, with different lives:
 * - `sync_entries`: the id of every entry this database has dealt with, and
 *   the ids it created. It travels with the database, and makes the replay
 *   idempotent.
 * - `sync_journal`: this device's kept entries, in full, until every other
 *   device holds them.
 */
beforeEach(function (): void {
    config()->set('budojo.runtime', 'desktop');
    config()->set('budojo.sync.device', 'pc4f2a');
    Storage::fake('local');
    Storage::fake('public');
    $this->owner = userWithAcademy();
});

/** @param array<string, mixed> $extra */
function journalAthlete(mixed $test, array $extra = []): \Illuminate\Testing\TestResponse
{
    return $test->actingAs($test->owner)->postJson('/api/v1/athletes', [
        'first_name' => 'Luca',
        'last_name' => 'Bianchi',
        'belt' => 'white',
        'stripes' => 0,
        'status' => 'active',
        'joined_at' => '2026-09-01',
        ...$extra,
    ]);
}

/** @return list<array<string, mixed>> */
function journalEntries(): array
{
    return DB::table('sync_journal')->orderBy('id')->get()
        ->map(static fn (object $row): array => (array) $row)
        ->all();
}

describe('a write on a paired device', function (): void {
    it('is recorded by its route, with what it created', function (): void {
        $id = journalAthlete($this)->assertCreated()->json('data.id');

        $entries = journalEntries();
        expect($entries)->toHaveCount(1);
        $entry = $entries[0];
        expect($entry['device'])->toBe('pc4f2a')
            ->and($entry['method'])->toBe('POST')
            ->and($entry['route'])->toBe('athletes.store')
            ->and(json_decode($entry['params'], true))->toBe([])
            ->and(json_decode($entry['body'], true))->toMatchArray(['first_name' => 'Luca', 'belt' => 'white'])
            // Every row it made, those of the Actions behind it too: the
            // athlete's first belt is a promotion a later entry can name.
            ->and(json_decode($entry['created'], true))->toMatchArray(['athletes' => [$id], 'athlete_promotions' => [1]])
            ->and($entry['before'])->toBeNull()
            ->and($entry['id'])->toMatch('/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/');
    });

    it('is dealt with in the same database, with the ids it created', function (): void {
        $id = journalAthlete($this)->json('data.id');
        $entry = journalEntries()[0];

        $recorded = DB::table('sync_entries')->where('id', $entry['id'])->first();
        expect($recorded)->not->toBeNull()
            ->and($recorded->device)->toBe('pc4f2a')
            ->and($recorded->outcome)->toBe('own')
            ->and($recorded->created)->toBe($entry['created']);
    });

    it('records what an update saw before, by table and id', function (): void {
        $id = journalAthlete($this)->json('data.id');

        $this->actingAs($this->owner)->patchJson("/api/v1/athletes/{$id}", ['first_name' => 'Marco'])->assertOk();

        $update = journalEntries()[1];
        expect($update['route'])->toBe('athletes.update')
            ->and(json_decode($update['params'], true))->toBe(['athlete' => $id])
            ->and(json_decode((string) $update['before'], true)['athletes'][(string) $id])->toMatchArray(['first_name' => 'Luca']);
    });

    it('keeps an uploaded file by its content, for a replay to upload again', function (): void {
        $id = journalAthlete($this)->json('data.id');
        $photo = UploadedFile::fake()->image('p.png', 20, 20);
        $bytes = (string) file_get_contents($photo->getRealPath());

        $this->actingAs($this->owner)->post("/api/v1/athletes/{$id}/photo", ['photo' => $photo])->assertOk();

        $body = json_decode((string) journalEntries()[1]['body'], true);
        $sha = hash('sha256', $bytes);
        expect($body['photo'])->toBe(['$file' => ['sha256' => $sha, 'name' => 'p.png', 'type' => 'image/png']]);
        Storage::disk('local')->assertExists("sync/journal/{$sha}");
    });

    it('gets an id above every one this device has recorded, even when the clock steps back', function (): void {
        Carbon::setTestNow('2026-10-02 12:00:00');
        journalAthlete($this);
        Carbon::setTestNow('2026-10-02 11:00:00');
        journalAthlete($this, ['first_name' => 'Gianni']);
        Carbon::setTestNow();

        [$first, $second] = journalEntries();
        expect(strcmp($second['id'], $first['id']))->toBeGreaterThan(0)
            ->and(json_decode((string) $second['body'], true)['first_name'])->toBe('Gianni');
    });
});

describe('nothing is recorded', function (): void {
    it('on a device that is not paired', function (): void {
        config()->set('budojo.sync.device', null);

        journalAthlete($this)->assertCreated();

        expect(journalEntries())->toBe([])
            ->and(DB::table('sync_entries')->count())->toBe(0);
    });

    it('for a write that failed', function (): void {
        journalAthlete($this, ['belt' => 'not-a-belt'])->assertUnprocessable();

        expect(journalEntries())->toBe([]);
    });

    it('for a write that is not academy data: the account, the session, the sync itself', function (): void {
        $this->actingAs($this->owner)->patchJson('/api/v1/me/locale', ['locale' => 'it'])->assertSuccessful();

        expect(journalEntries())->toBe([]);
    });
});

describe('the journal over the API', function (): void {
    it('hands the app this device\'s kept entries, oldest first', function (): void {
        journalAthlete($this);
        journalAthlete($this, ['first_name' => 'Gianni']);

        $this->actingAs($this->owner)->getJson('/api/v1/sync/journal')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.route', 'athletes.store')
            ->assertJsonPath('data.0.device', 'pc4f2a')
            ->assertJsonPath('data.1.body.first_name', 'Gianni');
    });

    it('clears the entries every other device holds, and keeps the rest and their files', function (): void {
        $id = journalAthlete($this)->json('data.id');
        $this->actingAs($this->owner)->post("/api/v1/athletes/{$id}/photo", ['photo' => UploadedFile::fake()->image('p.png', 20, 20)]);
        journalAthlete($this, ['first_name' => 'Gianni']);
        [$first, $photo, $third] = journalEntries();
        $sha = json_decode((string) $photo['body'], true)['photo']['$file']['sha256'];

        $this->actingAs($this->owner)->deleteJson('/api/v1/sync/journal?through=' . $photo['id'])->assertNoContent();

        expect(array_column(journalEntries(), 'id'))->toBe([$third['id']]);
        Storage::disk('local')->assertMissing("sync/journal/{$sha}");
        // Clearing the journal forgets nothing the database dealt with.
        expect(DB::table('sync_entries')->count())->toBe(3);
    });

    it('says, for each device, the newest of its entries this database holds', function (): void {
        journalAthlete($this);
        journalAthlete($this, ['first_name' => 'Gianni']);
        DB::table('sync_entries')->insert([
            'id' => '01K6F3Q8Z4M7X2N5P9R1T3V6W8', 'device' => 'phone9c1e', 'outcome' => 'applied', 'created' => '{}',
        ]);
        $newest = journalEntries()[1]['id'];

        $this->actingAs($this->owner)->getJson('/api/v1/sync/holds')
            ->assertOk()
            ->assertExactJson(['data' => ['pc4f2a' => $newest, 'phone9c1e' => '01K6F3Q8Z4M7X2N5P9R1T3V6W8']]);
    });

    it('is the owner\'s, on a device that syncs', function (): void {
        $this->actingAs(User::factory()->athlete()->create())->getJson('/api/v1/sync/journal')->assertForbidden();
        config()->set('budojo.runtime', 'web');
        $this->actingAs($this->owner)->getJson('/api/v1/sync/journal')->assertNotFound();
    });
});

it('never journals on the web, paired or not', function (): void {
    config()->set('budojo.runtime', 'web');

    journalAthlete($this)->assertCreated();

    expect(journalEntries())->toBe([]);
});

it('keeps an athlete created and the entry that created it together', function (): void {
    $id = journalAthlete($this)->json('data.id');

    expect(Athlete::query()->find($id))->not->toBeNull()
        ->and(DB::table('sync_entries')->count())->toBe(1);
});
