<?php

declare(strict_types=1);

use App\Actions\Academy\UploadAcademyLogoAction;
use App\Actions\Athlete\DeleteAthletePhotoAction;
use App\Actions\Athlete\UploadAthletePhotoAction;
use App\Actions\Document\UploadDocumentAction;
use App\Actions\User\UploadAvatarAction;
use App\Enums\DocumentType;
use App\Models\Athlete;
use App\Models\Document;
use App\Models\User;
use App\Support\Sync\SyncDatabase;
use App\Support\Sync\SyncFiles;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * The files side of the sync (#2030 part 2, PRD § 5.2): documents, athletes'
 * photos, avatars and the academy's logo travel apart from the database, one
 * file each on Drive, named by its content (`files/<sha256>.bjs`).
 *
 * Every row that names a file also records the SHA-256 of its bytes, so the
 * device that receives a database knows which content each row expects. A
 * file is matched by that hash, never by its path: photos are named by the
 * athlete's id, and ids diverge between two devices.
 */
beforeEach(function (): void {
    config()->set('budojo.runtime', 'desktop');
    Storage::fake('local');
    Storage::fake('public');
});

/** An athlete whose photo is on disk, with the hash its row records. */
function syncFilesAthleteWithPhoto(User $owner, string $bytes, string $path = 'athletes/photos/1.jpg'): Athlete
{
    Storage::disk('public')->put($path, $bytes);
    $athlete = Athlete::factory()->for($owner->academy)->create();
    $athlete->forceFill(['photo_path' => $path, 'photo_sha256' => hash('sha256', $bytes)])->save();

    return $athlete;
}

describe('every write records the content it stored', function (): void {
    it('an athlete photo', function (): void {
        $athlete = Athlete::factory()->for(userWithAcademy()->academy)->create();

        $athlete = app(UploadAthletePhotoAction::class)->execute($athlete, UploadedFile::fake()->image('p.png', 40, 40));

        expect($athlete->photo_sha256)->toBe(hash('sha256', (string) Storage::disk('public')->get((string) $athlete->photo_path)));
    });

    it('an avatar', function (): void {
        $user = app(UploadAvatarAction::class)->execute(userWithAcademy(), UploadedFile::fake()->image('a.png', 40, 40));

        expect($user->avatar_sha256)->toBe(hash('sha256', (string) Storage::disk('public')->get((string) $user->avatar_path)));
    });

    it('the academy logo', function (): void {
        $academy = app(UploadAcademyLogoAction::class)->execute(userWithAcademy()->academy, UploadedFile::fake()->image('l.png', 40, 40));

        expect($academy->logo_sha256)->toBe(hash('sha256', (string) Storage::disk('public')->get((string) $academy->logo_path)));
    });

    it('a document, as stored on disk', function (): void {
        $athlete = Athlete::factory()->for(userWithAcademy()->academy)->create();

        $document = app(UploadDocumentAction::class)->execute(
            $athlete,
            DocumentType::IdCard,
            UploadedFile::fake()->create('id.pdf', 20, 'application/pdf'),
        );

        expect($document->file_sha256)->toBe(hash('sha256', (string) Storage::disk('local')->get($document->file_path)));
    });

    it('and forgets it with the file', function (): void {
        $athlete = syncFilesAthleteWithPhoto(userWithAcademy(), 'a photo');

        $athlete = app(DeleteAthletePhotoAction::class)->execute($athlete);

        expect($athlete->photo_sha256)->toBeNull();
    });
});

describe('GET /api/v1/sync/files', function (): void {
    it('lists each content the database names once, with its size, and whether this device has it', function (): void {
        $owner = userWithAcademy();
        syncFilesAthleteWithPhoto($owner, 'a photo', 'athletes/photos/1.jpg');
        // The same picture for a second athlete: one content, two rows.
        syncFilesAthleteWithPhoto($owner, 'a photo', 'athletes/photos/2.jpg');

        $this->actingAs($owner)->getJson('/api/v1/sync/files')
            ->assertOk()
            ->assertExactJson(['data' => [
                ['sha256' => hash('sha256', 'a photo'), 'size' => 7, 'present' => true, 'complete' => true],
            ]]);
    });

    it('says a content is incomplete while one row naming it still lacks its file', function (): void {
        // The phone held this PDF for athlete A; the PC uploaded the same PDF
        // for athlete B. The content is here, but B's copy is not.
        $owner = userWithAcademy();
        Storage::disk('local')->put('documents/a.pdf', 'the same pdf');
        foreach (['documents/a.pdf', 'documents/b.pdf'] as $path) {
            $athlete = Athlete::factory()->for($owner->academy)->create();
            Document::factory()->for($athlete)->create(['file_path' => $path, 'file_sha256' => hash('sha256', 'the same pdf')]);
        }

        $this->actingAs($owner)->getJson('/api/v1/sync/files')
            ->assertOk()
            ->assertJsonPath('data.0.present', true)
            ->assertJsonPath('data.0.complete', false);
    });

    it('marks a content missing when its file is not on this device', function (): void {
        $owner = userWithAcademy();
        $athlete = Athlete::factory()->for($owner->academy)->create();
        $athlete->forceFill(['photo_path' => 'athletes/photos/9.jpg', 'photo_sha256' => hash('sha256', 'elsewhere')])->save();

        $this->actingAs($owner)->getJson('/api/v1/sync/files')
            ->assertOk()
            ->assertJsonPath('data.0.present', false)
            ->assertJsonPath('data.0.complete', false)
            ->assertJsonPath('data.0.size', null);
    });

    it('marks it missing when the path holds other content: ids differ between devices', function (): void {
        $owner = userWithAcademy();
        Storage::disk('public')->put('athletes/photos/57.jpg', 'this device’s athlete 57');
        $athlete = Athlete::factory()->for($owner->academy)->create();
        $athlete->forceFill(['photo_path' => 'athletes/photos/57.jpg', 'photo_sha256' => hash('sha256', 'the other device’s athlete 57')])->save();

        $this->actingAs($owner)->getJson('/api/v1/sync/files')
            ->assertOk()
            ->assertJsonPath('data.0.present', false);
    });

    it('covers documents, avatars and the logo, and leaves out rows with no file', function (): void {
        $owner = userWithAcademy();
        Storage::disk('local')->put('documents/a.pdf', 'a document');
        $athlete = Athlete::factory()->for($owner->academy)->create();
        Document::factory()->for($athlete)->create(['file_path' => 'documents/a.pdf', 'file_sha256' => hash('sha256', 'a document')]);
        Storage::disk('public')->put('users/avatars/1.png', 'an avatar');
        $owner->forceFill(['avatar_path' => 'users/avatars/1.png', 'avatar_sha256' => hash('sha256', 'an avatar')])->save();
        Storage::disk('public')->put('academy-logos/1/l.png', 'a logo');
        $owner->academy->forceFill(['logo_path' => 'academy-logos/1/l.png', 'logo_sha256' => hash('sha256', 'a logo')])->save();
        Athlete::factory()->for($owner->academy)->create();

        $listed = $this->actingAs($owner)->getJson('/api/v1/sync/files')->assertOk()->json('data.*.sha256');

        expect($listed)->toEqualCanonicalizing([
            hash('sha256', 'a document'),
            hash('sha256', 'an avatar'),
            hash('sha256', 'a logo'),
        ]);
    });
});

describe('GET /api/v1/sync/files/{sha256}', function (): void {
    it('hands back the bytes of a content this device has', function (): void {
        $owner = userWithAcademy();
        syncFilesAthleteWithPhoto($owner, 'a photo');

        $response = $this->actingAs($owner)->get('/api/v1/sync/files/' . hash('sha256', 'a photo'));

        $response->assertOk()->assertHeader('Content-Type', 'application/octet-stream');
        expect($response->streamedContent())->toBe('a photo');
    });

    it('is not found for a content the database does not name, or this device lacks', function (): void {
        $owner = userWithAcademy();
        $athlete = Athlete::factory()->for($owner->academy)->create();
        $athlete->forceFill(['photo_path' => 'athletes/photos/9.jpg', 'photo_sha256' => hash('sha256', 'elsewhere')])->save();

        $this->actingAs($owner)->get('/api/v1/sync/files/' . hash('sha256', 'never named'))->assertNotFound();
        $this->actingAs($owner)->get('/api/v1/sync/files/' . hash('sha256', 'elsewhere'))->assertNotFound();
    });

    it('is not found for something that is not a SHA-256', function (): void {
        $this->actingAs(userWithAcademy())->get('/api/v1/sync/files/..%2F..%2F.env')->assertNotFound();
    });
});

describe('PUT /api/v1/sync/files/{sha256}', function (): void {
    it('writes the content to every path the database names for it', function (): void {
        $owner = userWithAcademy();
        foreach ([1, 2] as $id) {
            $athlete = Athlete::factory()->for($owner->academy)->create();
            $athlete->forceFill(['photo_path' => "athletes/photos/{$id}.jpg", 'photo_sha256' => hash('sha256', 'a photo')])->save();
        }

        $this->actingAs($owner)
            ->call('PUT', '/api/v1/sync/files/' . hash('sha256', 'a photo'), content: 'a photo')
            ->assertNoContent();

        expect(Storage::disk('public')->get('athletes/photos/1.jpg'))->toBe('a photo')
            ->and(Storage::disk('public')->get('athletes/photos/2.jpg'))->toBe('a photo');
    });

    it('replaces what this device held at that path for another athlete', function (): void {
        $owner = userWithAcademy();
        Storage::disk('public')->put('athletes/photos/57.jpg', 'this device’s athlete 57');
        $athlete = Athlete::factory()->for($owner->academy)->create();
        $athlete->forceFill(['photo_path' => 'athletes/photos/57.jpg', 'photo_sha256' => hash('sha256', 'the other athlete 57')])->save();

        $this->actingAs($owner)
            ->call('PUT', '/api/v1/sync/files/' . hash('sha256', 'the other athlete 57'), content: 'the other athlete 57')
            ->assertNoContent();

        expect(Storage::disk('public')->get('athletes/photos/57.jpg'))->toBe('the other athlete 57');
    });

    it('writes a document to the private disk', function (): void {
        $owner = userWithAcademy();
        $athlete = Athlete::factory()->for($owner->academy)->create();
        Document::factory()->for($athlete)->create(['file_path' => 'documents/b.enc', 'file_sha256' => hash('sha256', 'ciphertext')]);

        $this->actingAs($owner)
            ->call('PUT', '/api/v1/sync/files/' . hash('sha256', 'ciphertext'), content: 'ciphertext')
            ->assertNoContent();

        expect(Storage::disk('local')->get('documents/b.enc'))->toBe('ciphertext');
        Storage::disk('public')->assertMissing('documents/b.enc');
    });

    it('refuses bytes that are not the content named, and writes nothing', function (): void {
        $owner = userWithAcademy();
        $athlete = Athlete::factory()->for($owner->academy)->create();
        $athlete->forceFill(['photo_path' => 'athletes/photos/1.jpg', 'photo_sha256' => hash('sha256', 'a photo')])->save();

        $this->actingAs($owner)
            ->call('PUT', '/api/v1/sync/files/' . hash('sha256', 'a photo'), content: 'something else')
            ->assertStatus(422)
            ->assertJsonPath('code', 'mismatch');

        Storage::disk('public')->assertMissing('athletes/photos/1.jpg');
    });

    it('takes no content the database does not name', function (): void {
        $this->actingAs(userWithAcademy())
            ->call('PUT', '/api/v1/sync/files/' . hash('sha256', 'stray'), content: 'stray')
            ->assertNotFound();

        expect(Storage::disk('public')->allFiles())->toBe([])
            ->and(Storage::disk('local')->allFiles())->toBe([]);
    });
});

/**
 * A version's database as another device sent it (#2118): Budojo's history,
 * and the four tables whose rows name files, with the columns `SyncFiles` reads.
 *
 * @param  list<string>  $statements  the rows, as SQL
 * @param  list<string>|null  $migrations  the history it has run; every migration this code carries by default
 */
function syncFilesVersionDatabase(array $statements, ?array $migrations = null, string $journal = 'delete'): string
{
    $path = tempnam(sys_get_temp_dir(), 'budojo-test-version-');
    $pdo = new PDO("sqlite:{$path}");
    $pdo->exec("pragma journal_mode = {$journal}");
    $pdo->exec('create table migrations (id integer primary key, migration varchar, batch integer)');
    $insert = $pdo->prepare('insert into migrations (migration, batch) values (?, 1)');
    foreach ($migrations ?? SyncDatabase::codeMigrations() as $migration) {
        $insert->execute([$migration]);
    }
    $pdo->exec('create table documents (id integer primary key, file_path varchar, file_sha256 varchar, deleted_at datetime)');
    $pdo->exec('create table athletes (id integer primary key, photo_path varchar, photo_sha256 varchar, deleted_at datetime)');
    $pdo->exec('create table users (id integer primary key, avatar_path varchar, avatar_sha256 varchar)');
    $pdo->exec('create table academies (id integer primary key, logo_path varchar, logo_sha256 varchar)');
    foreach ($statements as $statement) {
        $pdo->exec($statement);
    }
    // Closed, the statement too, so a WAL database is written back into its file.
    $insert = null;
    $pdo = null;
    $bytes = (string) file_get_contents($path);
    unlink($path);

    return $bytes;
}

describe('POST /api/v1/sync/files/named', function (): void {
    it('lists each content a version’s database names, once, sorted', function (): void {
        $database = syncFilesVersionDatabase([
            "insert into documents (file_path, file_sha256) values ('documents/a.enc', '" . hash('sha256', 'a certificate') . "')",
            "insert into documents (file_path, file_sha256) values ('documents/b.enc', '" . hash('sha256', 'a certificate') . "')",
            "insert into athletes (photo_path, photo_sha256) values ('athletes/photos/1.jpg', '" . hash('sha256', 'a photo') . "')",
            // A trashed athlete keeps its photo, as `GET /sync/files` lists it.
            "insert into athletes (photo_path, photo_sha256, deleted_at) values ('athletes/photos/2.jpg', '" . hash('sha256', 'a trashed athlete') . "', '2026-10-01 10:00:00')",
            "insert into users (avatar_path, avatar_sha256) values ('users/avatars/1.png', '" . hash('sha256', 'an avatar') . "')",
            "insert into academies (logo_path, logo_sha256) values ('academy-logos/1/l.png', '" . hash('sha256', 'a logo') . "')",
            'insert into athletes (photo_path, photo_sha256) values (null, null)',
        ]);

        $named = $this->actingAs(userWithAcademy())
            ->call('POST', '/api/v1/sync/files/named', content: $database, server: ['CONTENT_TYPE' => 'application/octet-stream'])
            ->assertOk()
            ->json('data');

        $expected = [
            hash('sha256', 'a certificate'),
            hash('sha256', 'a photo'),
            hash('sha256', 'a trashed athlete'),
            hash('sha256', 'an avatar'),
            hash('sha256', 'a logo'),
        ];
        sort($expected);
        expect($named)->toBe($expected);
    });

    it('names what `GET /sync/files` names: a trashed document’s content is not', function (): void {
        $database = syncFilesVersionDatabase([
            "insert into documents (file_path, file_sha256, deleted_at) values ('documents/a.enc', '" . hash('sha256', 'deleted') . "', '2026-10-01 10:00:00')",
        ]);

        $this->actingAs(userWithAcademy())
            ->call('POST', '/api/v1/sync/files/named', content: $database)
            ->assertOk()
            ->assertExactJson(['data' => []]);
    });

    it('reads the database it is given, never this device’s own', function (): void {
        $owner = userWithAcademy();
        syncFilesAthleteWithPhoto($owner, 'this device’s photo');

        $this->actingAs($owner)
            ->call('POST', '/api/v1/sync/files/named', content: syncFilesVersionDatabase([]))
            ->assertOk()
            ->assertExactJson(['data' => []]);
    });

    it('refuses what it cannot read: not a database, a newer one, one older than the content hashes', function (): void {
        $owner = userWithAcademy();
        $history = SyncDatabase::codeMigrations();
        $hashed = array_search(SyncFiles::HASHED_SINCE, $history, true);
        expect($hashed)->toBeInt();

        $this->actingAs($owner)
            ->call('POST', '/api/v1/sync/files/named', content: "PK\x03\x04 a zip, not a database")
            ->assertStatus(422)
            ->assertJsonPath('code', 'unreadable');
        $this->actingAs($owner)
            ->call('POST', '/api/v1/sync/files/named', content: syncFilesVersionDatabase([], [...$history, '2099_01_01_000000_from_a_later_budojo']))
            ->assertStatus(422)
            ->assertJsonPath('code', 'newer');
        $this->actingAs($owner)
            ->call('POST', '/api/v1/sync/files/named', content: syncFilesVersionDatabase([], array_slice($history, 0, (int) $hashed)))
            ->assertStatus(422)
            ->assertJsonPath('code', 'unreadable');
    });

    it('leaves no copy of the database behind', function (): void {
        $before = glob(sys_get_temp_dir() . '/budojo-named-*') ?: [];

        $this->actingAs(userWithAcademy())
            ->call('POST', '/api/v1/sync/files/named', content: syncFilesVersionDatabase([]))
            ->assertOk();
        $this->actingAs(userWithAcademy())
            ->call('POST', '/api/v1/sync/files/named', content: 'not a database')
            ->assertStatus(422);
        // A database in WAL mode leaves `-wal` and `-shm` beside the copy, read only too.
        $this->actingAs(userWithAcademy())
            ->call('POST', '/api/v1/sync/files/named', content: syncFilesVersionDatabase([], journal: 'wal'))
            ->assertOk();

        expect(glob(sys_get_temp_dir() . '/budojo-named-*') ?: [])->toBe($before);
    });

    it('leaves the app’s own connection as it was', function (): void {
        $owner = userWithAcademy();

        $this->actingAs($owner)
            ->call('POST', '/api/v1/sync/files/named', content: syncFilesVersionDatabase([
                "insert into users (avatar_path, avatar_sha256) values ('users/avatars/9.png', '" . hash('sha256', 'theirs') . "')",
            ]))
            ->assertOk();

        expect(User::query()->whereKey($owner->id)->exists())->toBeTrue()
            ->and(DB::getDefaultConnection())->not->toBe('sync_named');
    });
});

describe('the hashes of files stored before this', function (): void {
    it('are filled in from disk, and a missing file stays without one', function (): void {
        $owner = userWithAcademy();
        Storage::disk('public')->put('athletes/photos/1.jpg', 'an old photo');
        $kept = Athlete::factory()->for($owner->academy)->create();
        $gone = Athlete::factory()->for($owner->academy)->create();
        DB::table('athletes')->where('id', $kept->id)->update(['photo_path' => 'athletes/photos/1.jpg', 'photo_sha256' => null]);
        DB::table('athletes')->where('id', $gone->id)->update(['photo_path' => 'athletes/photos/2.jpg', 'photo_sha256' => null]);
        Storage::disk('local')->put('documents/old.pdf', 'an old document');
        $document = Document::factory()->for($kept)->create(['file_path' => 'documents/old.pdf']);
        DB::table('documents')->where('id', $document->id)->update(['file_sha256' => null]);

        $migration = require database_path('migrations/2026_10_02_000001_fill_content_sha256_for_sync.php');
        $migration->up();

        expect(DB::table('athletes')->where('id', $kept->id)->value('photo_sha256'))->toBe(hash('sha256', 'an old photo'))
            ->and(DB::table('athletes')->where('id', $gone->id)->value('photo_sha256'))->toBeNull()
            ->and(DB::table('documents')->where('id', $document->id)->value('file_sha256'))->toBe(hash('sha256', 'an old document'));
    });
});

describe('who may move files', function (): void {
    it('is absent on the web profile: 404', function (): void {
        config()->set('budojo.runtime', 'web');

        $this->actingAs(userWithAcademy())->getJson('/api/v1/sync/files')->assertNotFound();
    });

    it('is the owner only', function (): void {
        $this->actingAs(User::factory()->athlete()->create())->getJson('/api/v1/sync/files')->assertForbidden();
        $this->actingAs(User::factory()->athlete()->create())
            ->call('POST', '/api/v1/sync/files/named', content: syncFilesVersionDatabase([]))
            ->assertForbidden();
    });
});
