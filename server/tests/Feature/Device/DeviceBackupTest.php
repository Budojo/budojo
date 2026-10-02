<?php

declare(strict_types=1);

use App\Support\Sync\SyncDatabase;
use Illuminate\Testing\TestResponse;

/**
 * A backup the PC took, brought to a phone by its own page (#2079, PRD § 5.4):
 * the door names the academy it holds, and the one the phone holds, then
 * stages it for the shell to swap in at its next start.
 *
 * The archive is the desktop's (`desktop/src/backup.ts`): `budojo.sqlite`, the
 * `storage/` tree and `manifest.json`.
 */

/**
 * A Budojo database as the PC's backup holds it: its migrations, an academy and
 * a roster. Only the tables the door reads.
 *
 * @param  list<string>  $migrations
 * @param  list<array{belt: string, status?: string, deleted_at?: string}>  $athletes
 */
function backupTestDatabase(string $path, array $migrations, string $academy = 'Kaizen', array $athletes = []): void
{
    $pdo = new PDO("sqlite:{$path}");
    $pdo->exec('create table migrations (id integer primary key, migration varchar, batch integer)');
    $insert = $pdo->prepare('insert into migrations (migration, batch) values (?, 1)');
    foreach ($migrations as $migration) {
        $insert->execute([$migration]);
    }
    $pdo->exec('create table academies (id integer primary key, name varchar)');
    $pdo->prepare('insert into academies (name) values (?)')->execute([$academy]);
    $pdo->exec('create table athletes (id integer primary key, belt varchar, status varchar, deleted_at datetime null)');
    $roster = $pdo->prepare('insert into athletes (belt, status, deleted_at) values (?, ?, ?)');
    foreach ($athletes as $athlete) {
        $roster->execute([$athlete['belt'], $athlete['status'] ?? 'active', $athlete['deleted_at'] ?? null]);
    }
}

/**
 * The bytes of a backup archive. `$entries` maps a name in the zip to its
 * content, a `null` content making a folder entry, as the desktop's zip has.
 *
 * @param  array<string, string|null>  $entries
 */
function backupTestArchive(string $dir, array $entries): string
{
    $path = "{$dir}/archive-" . bin2hex(random_bytes(4)) . '.zip';
    $zip = new ZipArchive();
    $zip->open($path, ZipArchive::CREATE);
    foreach ($entries as $name => $content) {
        $content === null ? $zip->addEmptyDir($name) : $zip->addFromString($name, $content);
    }
    $zip->close();
    $bytes = (string) file_get_contents($path);
    unlink($path);

    return $bytes;
}

/** @return array<string, string|null> a backup of the PC's academy, with its files and the PC's logs */
function backupTestEntries(string $dir, ?array $migrations = null): array
{
    $database = "{$dir}/pc-" . bin2hex(random_bytes(4)) . '.sqlite';
    backupTestDatabase($database, $migrations ?? SyncDatabase::codeMigrations(), 'Kaizen', [
        ['belt' => 'white'], ['belt' => 'white'], ['belt' => 'blue'],
        ['belt' => 'purple', 'status' => 'inactive'],
        ['belt' => 'brown', 'deleted_at' => '2026-09-01 10:00:00'],
    ]);
    $bytes = (string) file_get_contents($database);
    unlink($database);

    return [
        'budojo.sqlite' => $bytes,
        'manifest.json' => json_encode(['format' => 1, 'appVersion' => '2.74.1', 'schemaVersion' => '2026_09_27_100000_add_federation_details_to_athletes_table', 'createdAt' => '2026-10-01T16:51:32.000Z']),
        'storage/' => null,
        'storage/app/' => null,
        'storage/app/public/athletes/photos/1.jpg' => 'the photo',
        'storage/app/private/documents/1/certificate.pdf.enc' => 'a sealed certificate',
        'storage/logs/laravel.log' => 'the PC\'s log',
        'storage/framework/cache/data/ab/cd' => 'the PC\'s cache',
    ];
}

function backupTestSend(mixed $test, string $action, string $bytes, ?string $secret = 'shell-secret-for-the-tests'): TestResponse
{
    $server = ['CONTENT_TYPE' => 'application/zip', 'HTTP_ACCEPT' => 'application/json'];
    if ($secret !== null) {
        $server['HTTP_X_BUDOJO_SHELL'] = $secret;
    }

    return $test->call('POST', "/api/v1/device/backup/{$action}", [], [], [], $server, $bytes);
}

beforeEach(function (): void {
    config()->set('budojo.runtime', 'mobile');
    config()->set('budojo.shell.secret', 'shell-secret-for-the-tests');
    $this->dir = sys_get_temp_dir() . '/budojo-backup-' . bin2hex(random_bytes(6));
    mkdir($this->dir);
    $this->live = "{$this->dir}/budojo.sqlite";
    backupTestDatabase($this->live, SyncDatabase::codeMigrations(), 'Prova');
    config()->set('budojo.sync.database', $this->live);
    $this->storage = "{$this->dir}/app";
    mkdir($this->storage);
    config()->set('budojo.sync.storage', $this->storage);
});

afterEach(function (): void {
    Illuminate\Support\Facades\File::deleteDirectory($this->dir);
});

describe('inspecting a backup', function (): void {
    it('names the academy it holds, by its active athletes and their belts, and when the PC took it', function (): void {
        backupTestSend($this, 'inspect', backupTestArchive($this->dir, backupTestEntries($this->dir)))
            ->assertOk()
            ->assertJsonPath('data.backup.taken_at', '2026-10-01T16:51:32.000Z')
            ->assertJsonPath('data.backup.app_version', '2.74.1')
            ->assertJsonPath('data.backup.academy', ['name' => 'Kaizen', 'athletes' => 3, 'belts' => ['white' => 2, 'blue' => 1]]);
    });

    it('names the academy this device holds beside it, for the owner to choose', function (): void {
        $owner = userWithAcademy();

        backupTestSend($this, 'inspect', backupTestArchive($this->dir, backupTestEntries($this->dir)))
            ->assertOk()
            ->assertJsonPath('data.here.name', $owner->academy?->name)
            ->assertJsonPath('data.here.athletes', 0);
    });

    it('says the device holds none when it holds none', function (): void {
        backupTestSend($this, 'inspect', backupTestArchive($this->dir, backupTestEntries($this->dir)))
            ->assertOk()
            ->assertJsonPath('data.here', null);
    });

    it('writes nothing', function (): void {
        backupTestSend($this, 'inspect', backupTestArchive($this->dir, backupTestEntries($this->dir)))->assertOk();

        expect(file_exists("{$this->live}.staged"))->toBeFalse()
            ->and(is_dir("{$this->storage}.staged"))->toBeFalse();
    });
});

describe('restoring a backup', function (): void {
    it('stages its database beside the live one, for the shell to swap in', function (): void {
        $entries = backupTestEntries($this->dir);

        backupTestSend($this, 'restore', backupTestArchive($this->dir, $entries))->assertNoContent();

        expect(file_get_contents("{$this->live}.staged"))->toBe($entries['budojo.sqlite']);
    });

    it('stages the academy\'s files beside its own, and never the PC\'s logs or cache', function (): void {
        backupTestSend($this, 'restore', backupTestArchive($this->dir, backupTestEntries($this->dir)))->assertNoContent();

        $staged = "{$this->storage}.staged";
        expect(file_get_contents("{$staged}/public/athletes/photos/1.jpg"))->toBe('the photo')
            ->and(file_get_contents("{$staged}/private/documents/1/certificate.pdf.enc"))->toBe('a sealed certificate')
            ->and(glob("{$this->dir}/*", GLOB_MARK))->not->toContain("{$this->storage}.staged.part/");
        $all = iterator_to_array(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($staged, FilesystemIterator::SKIP_DOTS)));
        expect(count($all))->toBe(2);
    });

    it('replaces the files an abandoned restore staged', function (): void {
        mkdir("{$this->storage}.staged");
        file_put_contents("{$this->storage}.staged/stale.txt", 'from an earlier attempt');

        backupTestSend($this, 'restore', backupTestArchive($this->dir, backupTestEntries($this->dir)))->assertNoContent();

        expect(file_exists("{$this->storage}.staged/stale.txt"))->toBeFalse();
    });

    it('leaves the live academy alone until the shell swaps', function (): void {
        $before = file_get_contents($this->live);

        backupTestSend($this, 'restore', backupTestArchive($this->dir, backupTestEntries($this->dir)))->assertNoContent();

        expect(file_get_contents($this->live))->toBe($before)
            ->and(scandir($this->storage))->toBe(['.', '..']);
    });
});

describe('what is refused, and stages nothing', function (): void {
    /** @param array<string, string|null> $entries */
    function backupTestRefused(mixed $test, string $bytes, string $code): void
    {
        foreach (['inspect', 'restore'] as $action) {
            backupTestSend($test, $action, $bytes)->assertUnprocessable()->assertJsonPath('code', $code);
        }
        expect(file_exists("{$test->live}.staged"))->toBeFalse()
            ->and(is_dir("{$test->storage}.staged"))->toBeFalse()
            ->and(is_dir("{$test->storage}.staged.part"))->toBeFalse();
    }

    it('something that is not a zip', function (): void {
        backupTestRefused($this, 'not an archive at all', 'unreadable');
    });

    it('a zip with no manifest: an unknown archive is not a safe one', function (): void {
        $entries = backupTestEntries($this->dir);
        unset($entries['manifest.json']);

        backupTestRefused($this, backupTestArchive($this->dir, $entries), 'unreadable');
    });

    it('a manifest of a format this Budojo does not know', function (): void {
        $entries = backupTestEntries($this->dir);
        $entries['manifest.json'] = json_encode(['format' => 2, 'appVersion' => '9.0.0', 'schemaVersion' => 'x', 'createdAt' => 'y']);

        backupTestRefused($this, backupTestArchive($this->dir, $entries), 'unreadable');
    });

    it('a backup with no database', function (): void {
        $entries = backupTestEntries($this->dir);
        unset($entries['budojo.sqlite']);

        backupTestRefused($this, backupTestArchive($this->dir, $entries), 'unreadable');
    });

    it('a backup from a newer Budojo: update first, as a restore on the PC says', function (): void {
        $entries = backupTestEntries($this->dir, [...SyncDatabase::codeMigrations(), '2099_01_01_000000_from_the_future']);

        backupTestRefused($this, backupTestArchive($this->dir, $entries), 'newer');
    });

    it('a file named outside the academy\'s folder, which is never written: inspect refuses it too', function (): void {
        $entries = backupTestEntries($this->dir);
        // From `app.staged.part`, one level up is this test's own folder.
        $entries['storage/app/../escaped.txt'] = 'out of bounds';

        backupTestRefused($this, backupTestArchive($this->dir, $entries), 'unreadable');

        expect(file_exists("{$this->dir}/escaped.txt"))->toBeFalse();
    });
});

describe('a stage refused after a restore was staged', function (): void {
    beforeEach(function (): void {
        $this->restored = backupTestEntries($this->dir);
        backupTestSend($this, 'restore', backupTestArchive($this->dir, $this->restored))->assertNoContent();
    });

    it('leaves that restore whole when a second restore is refused', function (): void {
        $newer = backupTestEntries($this->dir, [...SyncDatabase::codeMigrations(), '2099_01_01_000000_from_the_future']);

        backupTestSend($this, 'restore', backupTestArchive($this->dir, $newer))->assertUnprocessable();

        expect(file_get_contents("{$this->live}.staged"))->toBe($this->restored['budojo.sqlite'])
            ->and(file_get_contents("{$this->storage}.staged/public/athletes/photos/1.jpg"))->toBe('the photo');
    });

    it('leaves that restore whole when a version is refused', function (): void {
        $this->actingAs(userWithAcademy())
            ->call('PUT', '/api/v1/sync/stage', [], [], [], ['CONTENT_TYPE' => 'application/octet-stream'], 'not a database')
            ->assertUnprocessable();

        expect(file_get_contents("{$this->live}.staged"))->toBe($this->restored['budojo.sqlite'])
            ->and(is_dir("{$this->storage}.staged"))->toBeTrue();
    });

    it('replaces that restore, database and files, when a version is staged', function (): void {
        $version = "{$this->dir}/version.sqlite";
        backupTestDatabase($version, SyncDatabase::codeMigrations(), 'Versione');

        $this->actingAs(userWithAcademy())
            ->call('PUT', '/api/v1/sync/stage', [], [], [], ['CONTENT_TYPE' => 'application/octet-stream'], (string) file_get_contents($version))
            ->assertNoContent();

        expect(file_get_contents("{$this->live}.staged"))->toBe(file_get_contents($version))
            ->and(is_dir("{$this->storage}.staged"))->toBeFalse();
    });
});

it('a version the sync stages after an abandoned restore comes in without that restore\'s files', function (): void {
    $owner = userWithAcademy();
    mkdir("{$this->storage}.staged");
    file_put_contents("{$this->storage}.staged/photo.jpg", 'an abandoned restore');
    $version = "{$this->dir}/version.sqlite";
    backupTestDatabase($version, SyncDatabase::codeMigrations());

    $this->actingAs($owner)
        ->call('PUT', '/api/v1/sync/stage', [], [], [], ['CONTENT_TYPE' => 'application/octet-stream'], (string) file_get_contents($version))
        ->assertNoContent();

    expect(file_exists("{$this->live}.staged"))->toBeTrue()
        ->and(is_dir("{$this->storage}.staged"))->toBeFalse();
});

describe('who may bring a backup in', function (): void {
    it('is nobody without the shell\'s secret', function (): void {
        $bytes = backupTestArchive($this->dir, backupTestEntries($this->dir));

        backupTestSend($this, 'inspect', $bytes, null)->assertNotFound();
        backupTestSend($this, 'restore', $bytes, 'a-guess')->assertNotFound();
        expect(file_exists("{$this->live}.staged"))->toBeFalse();
    });

    it('is nobody on the web', function (): void {
        config()->set('budojo.runtime', 'web');

        backupTestSend($this, 'restore', backupTestArchive($this->dir, backupTestEntries($this->dir)))->assertNotFound();
    });
});
