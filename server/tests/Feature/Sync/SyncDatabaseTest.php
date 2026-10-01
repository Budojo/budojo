<?php

declare(strict_types=1);

use App\Models\User;

/**
 * The database side of a version (#2030, PRD § 5.2): the app exports the
 * database to pack it into a version, and stages a newer one for the shell to
 * swap in at its next start.
 *
 * The test connection is in memory and inside a transaction, where `VACUUM
 * INTO` cannot run, so these tests give the sync a database file of its own
 * (`budojo.sync.database`), as the desktop and the phone have.
 */

/** A small SQLite file with a migrations table, as every Budojo database has. */
function syncTestDatabase(string $path, string $newestMigration, string $athlete = 'Luca Bianchi'): void
{
    $pdo = new PDO("sqlite:{$path}");
    $pdo->exec('create table migrations (id integer primary key, migration varchar, batch integer)');
    $insert = $pdo->prepare('insert into migrations (migration, batch) values (?, 1)');
    $insert->execute(['2026_01_01_000000_create_users_table']);
    $insert->execute([$newestMigration]);
    $pdo->exec('create table athletes (id integer primary key, name varchar)');
    $pdo->prepare('insert into athletes (name) values (?)')->execute([$athlete]);
}

/** The bytes of another device's database, as the app would hand them over. */
function syncTestIncoming(string $dir, string $newestMigration, string $athlete = 'Giulia Rossi'): string
{
    $path = "{$dir}/incoming-" . bin2hex(random_bytes(4)) . '.sqlite';
    syncTestDatabase($path, $newestMigration, $athlete);

    return (string) file_get_contents($path);
}

function syncTestCodeSchema(): string
{
    $files = array_keys(app('migrator')->getMigrationFiles(database_path('migrations')));
    sort($files);

    return (string) end($files);
}

beforeEach(function (): void {
    config()->set('budojo.runtime', 'desktop');
    $this->dir = sys_get_temp_dir() . '/budojo-sync-' . bin2hex(random_bytes(6));
    mkdir($this->dir);
    $this->live = "{$this->dir}/budojo.sqlite";
    syncTestDatabase($this->live, '2026_09_01_000000_add_things');
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
            ->assertHeader('X-Budojo-Schema', '2026_09_01_000000_add_things');
        $snapshot = "{$this->dir}/snapshot.sqlite";
        file_put_contents($snapshot, $response->streamedContent());
        expect(file_get_contents($snapshot, length: 16))->toBe("SQLite format 3\0");
        $names = new PDO("sqlite:{$snapshot}")->query('select name from athletes')->fetchAll(PDO::FETCH_COLUMN);
        expect($names)->toBe(['Luca Bianchi']);
    });

    it('leaves no snapshot behind once it is sent', function (): void {
        $before = glob(sys_get_temp_dir() . '/budojo-export-*') ?: [];

        $this->actingAs(userWithAcademy())->get('/api/v1/sync/export')->streamedContent();

        expect(glob(sys_get_temp_dir() . '/budojo-export-*') ?: [])->toEqual($before);
    });
});

describe('PUT /api/v1/sync/stage', function (): void {
    it('stages a database this app can open, beside the live one', function (): void {
        $bytes = syncTestIncoming($this->dir, '2026_08_01_000000_older');

        $this->actingAs(userWithAcademy())
            ->call('PUT', '/api/v1/sync/stage', content: $bytes, server: ['CONTENT_TYPE' => 'application/octet-stream'])
            ->assertNoContent();

        expect(file_get_contents("{$this->live}.staged"))->toBe($bytes)
            ->and(new PDO("sqlite:{$this->live}")->query('select name from athletes')->fetchColumn())
            ->toBe('Luca Bianchi');
    });

    it('takes a database of the schema this app runs', function (): void {
        $this->actingAs(userWithAcademy())
            ->call('PUT', '/api/v1/sync/stage', content: syncTestIncoming($this->dir, syncTestCodeSchema()))
            ->assertNoContent();
    });

    it('refuses a database from a newer Budojo, as a restore does, and stages nothing', function (): void {
        $this->actingAs(userWithAcademy())
            ->call('PUT', '/api/v1/sync/stage', content: syncTestIncoming($this->dir, '2099_01_01_000000_from_the_future'))
            ->assertStatus(422)
            ->assertJsonPath('code', 'newer');

        expect(file_exists("{$this->live}.staged"))->toBeFalse();
    });

    it('refuses something that is not a SQLite database', function (): void {
        $this->actingAs(userWithAcademy())
            ->call('PUT', '/api/v1/sync/stage', content: "PK\x03\x04 a zip, not a database")
            ->assertStatus(422)
            ->assertJsonPath('code', 'unreadable');

        expect(file_exists("{$this->live}.staged"))->toBeFalse();
    });

    it('refuses a database cut short', function (): void {
        $bytes = syncTestIncoming($this->dir, '2026_08_01_000000_older');

        $this->actingAs(userWithAcademy())
            ->call('PUT', '/api/v1/sync/stage', content: substr($bytes, 0, intdiv(strlen($bytes), 2)))
            ->assertStatus(422)
            ->assertJsonPath('code', 'unreadable');
    });

    it('refuses a SQLite database that is not a Budojo one: no migrations', function (): void {
        $path = "{$this->dir}/bare.sqlite";
        new PDO("sqlite:{$path}")->exec('create table notes (id integer primary key)');

        $this->actingAs(userWithAcademy())
            ->call('PUT', '/api/v1/sync/stage', content: (string) file_get_contents($path))
            ->assertStatus(422)
            ->assertJsonPath('code', 'unreadable');
    });

    it('replaces a staged database that was never swapped in', function (): void {
        $user = userWithAcademy();
        $this->actingAs($user)->call('PUT', '/api/v1/sync/stage', content: syncTestIncoming($this->dir, '2026_08_01_000000_a', 'First'));
        $second = syncTestIncoming($this->dir, '2026_08_02_000000_b', 'Second');

        $this->actingAs($user)->call('PUT', '/api/v1/sync/stage', content: $second)->assertNoContent();

        expect(file_get_contents("{$this->live}.staged"))->toBe($second);
    });
});

describe('who may sync', function (): void {
    it('is absent on the web profile: 404, never advertised', function (): void {
        config()->set('budojo.runtime', 'web');

        $this->actingAs(userWithAcademy())->get('/api/v1/sync/export')->assertNotFound();
    });

    it('is the owner only: an athlete account is refused', function (): void {
        $this->actingAs(User::factory()->athlete()->create())->get('/api/v1/sync/export')->assertForbidden();
    });

    it('is nobody signed out', function (): void {
        $this->getJson('/api/v1/sync/export')->assertUnauthorized();
    });
});
