<?php

declare(strict_types=1);

use App\Models\User;
use App\Support\Sync\SyncDatabase;
use Illuminate\Testing\TestResponse;

/**
 * The database side of a version (#2030, PRD § 5.2): the app exports the
 * database to pack it into a version, and stages a newer one for the shell to
 * swap in at its next start.
 *
 * The test connection is in memory and inside a transaction, where `VACUUM
 * INTO` cannot run, so these tests give the sync a database file of its own
 * (`budojo.sync.database`), as the desktop and the phone have.
 */

/**
 * A small SQLite file that has run the given migrations, as a Budojo database
 * of that age has.
 *
 * @param  list<string>  $migrations
 */
function syncTestDatabase(string $path, array $migrations, string $athlete = 'Luca Bianchi'): void
{
    $pdo = new PDO("sqlite:{$path}");
    $pdo->exec('create table migrations (id integer primary key, migration varchar, batch integer)');
    $insert = $pdo->prepare('insert into migrations (migration, batch) values (?, 1)');
    foreach ($migrations as $migration) {
        $insert->execute([$migration]);
    }
    $pdo->exec('create table athletes (id integer primary key, name varchar)');
    $pdo->prepare('insert into athletes (name) values (?)')->execute([$athlete]);
}

/**
 * The migrations a Budojo of some age has run: the first `$count` this code carries.
 *
 * @return list<string>
 */
function syncTestHistory(?int $count = null): array
{
    $all = SyncDatabase::codeMigrations();

    return $count === null ? $all : array_slice($all, 0, $count);
}

/**
 * The bytes of another device's database, as the app would hand them over.
 *
 * @param  list<string>  $migrations
 */
function syncTestIncoming(string $dir, array $migrations, string $athlete = 'Giulia Rossi'): string
{
    $path = "{$dir}/incoming-" . bin2hex(random_bytes(4)) . '.sqlite';
    syncTestDatabase($path, $migrations, $athlete);

    return (string) file_get_contents($path);
}

/** Sends a download as the server would, which is when it deletes the file. */
function syncTestSend(TestResponse $response): string
{
    ob_start();
    $response->baseResponse->sendContent();

    return (string) ob_get_clean();
}

beforeEach(function (): void {
    config()->set('budojo.runtime', 'desktop');
    $this->dir = sys_get_temp_dir() . '/budojo-sync-' . bin2hex(random_bytes(6));
    mkdir($this->dir);
    $this->live = "{$this->dir}/budojo.sqlite";
    syncTestDatabase($this->live, syncTestHistory(20));
    config()->set('budojo.sync.database', $this->live);
});

afterEach(function (): void {
    foreach (glob("{$this->dir}/*") ?: [] as $file) {
        unlink($file);
    }
    rmdir($this->dir);
});

describe('GET /api/v1/sync/export', function (): void {
    it('hands back a snapshot of the database, and the schema it was written with', function (): void {
        $response = $this->actingAs(userWithAcademy())->get('/api/v1/sync/export');

        $response->assertOk()
            ->assertHeader('Content-Type', 'application/octet-stream')
            ->assertHeader('X-Budojo-Schema', syncTestHistory(20)[19]);
        $snapshot = "{$this->dir}/snapshot.sqlite";
        file_put_contents($snapshot, syncTestSend($response));
        expect(file_get_contents($snapshot, length: 16))->toBe("SQLite format 3\0");
        $names = new PDO("sqlite:{$snapshot}")->query('select name from athletes')->fetchAll(PDO::FETCH_COLUMN);
        expect($names)->toBe(['Luca Bianchi']);
    });

    it('deletes the snapshot once it is sent: it is the whole academy', function (): void {
        $response = $this->actingAs(userWithAcademy())->get('/api/v1/sync/export');
        $path = $response->baseResponse->getFile()->getPathname();

        syncTestSend($response);

        expect(file_exists($path))->toBeFalse();
    });

    it('deletes it for a HEAD request too, which sends no body', function (): void {
        $response = $this->actingAs(userWithAcademy())->head('/api/v1/sync/export');
        $path = $response->baseResponse->getFile()->getPathname();

        syncTestSend($response);

        expect(file_exists($path))->toBeFalse();
    });

    it('lets the desktop page read the schema across origins', function (): void {
        expect(config('cors.exposed_headers'))->toContain('X-Budojo-Schema');
    });

    it('never creates a database at a wrong path: the export fails instead', function (): void {
        config()->set('budojo.sync.database', "{$this->dir}/missing.sqlite");

        $this->actingAs(userWithAcademy())->get('/api/v1/sync/export')->assertServerError();

        expect(file_exists("{$this->dir}/missing.sqlite"))->toBeFalse();
    });
});

describe('PUT /api/v1/sync/stage', function (): void {
    it('stages a database of an older Budojo, beside the live one', function (): void {
        $bytes = syncTestIncoming($this->dir, syncTestHistory(15));

        $this->actingAs(userWithAcademy())
            ->call('PUT', '/api/v1/sync/stage', content: $bytes, server: ['CONTENT_TYPE' => 'application/octet-stream'])
            ->assertNoContent();

        expect(file_get_contents("{$this->live}.staged"))->toBe($bytes)
            ->and(new PDO("sqlite:{$this->live}")->query('select name from athletes')->fetchColumn())
            ->toBe('Luca Bianchi');
    });

    it('takes a database of the schema this app runs', function (): void {
        $this->actingAs(userWithAcademy())
            ->call('PUT', '/api/v1/sync/stage', content: syncTestIncoming($this->dir, syncTestHistory()))
            ->assertNoContent();
    });

    it('refuses a database from a newer Budojo, as a restore does, and stages nothing', function (): void {
        $newer = [...syncTestHistory(), '2099_01_01_000000_from_the_future'];

        $this->actingAs(userWithAcademy())
            ->call('PUT', '/api/v1/sync/stage', content: syncTestIncoming($this->dir, $newer))
            ->assertStatus(422)
            ->assertJsonPath('code', 'newer');

        expect(file_exists("{$this->live}.staged"))->toBeFalse();
    });

    it('refuses a database that ran a migration Budojo never had', function (): void {
        $foreign = [...syncTestHistory(15), '2026_05_05_999999_not_ours'];

        $this->actingAs(userWithAcademy())
            ->call('PUT', '/api/v1/sync/stage', content: syncTestIncoming($this->dir, $foreign))
            ->assertStatus(422)
            ->assertJsonPath('code', 'unreadable');
    });

    it('refuses another Laravel app’s database, which never ran Budojo’s own migrations', function (): void {
        $laravel = ['0001_01_01_000000_create_users_table'];

        $this->actingAs(userWithAcademy())
            ->call('PUT', '/api/v1/sync/stage', content: syncTestIncoming($this->dir, $laravel))
            ->assertStatus(422)
            ->assertJsonPath('code', 'unreadable');
    });

    it('refuses something that is not a SQLite database', function (): void {
        $this->actingAs(userWithAcademy())
            ->call('PUT', '/api/v1/sync/stage', content: "PK\x03\x04 a zip, not a database")
            ->assertStatus(422)
            ->assertJsonPath('code', 'unreadable');

        expect(file_exists("{$this->live}.staged"))->toBeFalse();
    });

    it('refuses a database cut short', function (): void {
        $bytes = syncTestIncoming($this->dir, syncTestHistory(15));

        $this->actingAs(userWithAcademy())
            ->call('PUT', '/api/v1/sync/stage', content: substr($bytes, 0, intdiv(strlen($bytes), 2)))
            ->assertStatus(422)
            ->assertJsonPath('code', 'unreadable');
    });

    it('refuses a SQLite database with no migrations at all', function (): void {
        $path = "{$this->dir}/bare.sqlite";
        new PDO("sqlite:{$path}")->exec('create table notes (id integer primary key)');

        $this->actingAs(userWithAcademy())
            ->call('PUT', '/api/v1/sync/stage', content: (string) file_get_contents($path))
            ->assertStatus(422)
            ->assertJsonPath('code', 'unreadable');
    });

    it('replaces a staged database that was never swapped in', function (): void {
        $user = userWithAcademy();
        $this->actingAs($user)->call('PUT', '/api/v1/sync/stage', content: syncTestIncoming($this->dir, syncTestHistory(15), 'First'));
        $second = syncTestIncoming($this->dir, syncTestHistory(16), 'Second');

        $this->actingAs($user)->call('PUT', '/api/v1/sync/stage', content: $second)->assertNoContent();

        expect(file_get_contents("{$this->live}.staged"))->toBe($second);
    });
});

describe('who may sync', function (): void {
    it('is absent on the web profile for everyone: 404, never advertised', function (): void {
        config()->set('budojo.runtime', 'web');

        $this->actingAs(userWithAcademy())->get('/api/v1/sync/export')->assertNotFound();
        $this->actingAs(User::factory()->athlete()->create())->get('/api/v1/sync/export')->assertNotFound();
    });

    it('is the owner only: an athlete account is refused', function (): void {
        $this->actingAs(User::factory()->athlete()->create())->get('/api/v1/sync/export')->assertForbidden();
    });

    it('is nobody signed out', function (): void {
        $this->getJson('/api/v1/sync/export')->assertUnauthorized();
    });
});
