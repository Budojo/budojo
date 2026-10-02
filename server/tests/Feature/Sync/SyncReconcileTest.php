<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\Document;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;

/**
 * After a fast-forward (#2030, PRD § 5.2): the database came from the other
 * device, and no Observer or Action ran for what it changed. The files its
 * rows no longer name are deleted, by the rules the deleting Actions follow,
 * and the cache, which answers from the old database, is cleared.
 */
beforeEach(function (): void {
    Storage::fake('local');
    Storage::fake('public');
});

it('deletes a document file no row names: deleted on the other device', function (): void {
    $kept = Document::factory()->create();
    Storage::disk('local')->put($kept->file_path, 'certificate');
    Storage::disk('local')->put('documents/deleted-on-the-phone.enc', 'certificate');

    $this->artisan('budojo:sync-reconcile')->assertSuccessful();

    Storage::disk('local')->assertExists($kept->file_path);
    Storage::disk('local')->assertMissing('documents/deleted-on-the-phone.enc');
});

it('deletes the file of a soft-deleted document, as DeleteDocumentAction does', function (): void {
    $document = Document::factory()->create();
    Storage::disk('local')->put($document->file_path, 'certificate');
    $document->delete();

    $this->artisan('budojo:sync-reconcile')->assertSuccessful();

    Storage::disk('local')->assertMissing($document->file_path);
});

it('keeps a soft-deleted athlete’s photo, as deleting an athlete does', function (): void {
    $athlete = Athlete::factory()->create(['photo_path' => 'athletes/photos/1.jpg']);
    Storage::disk('public')->put('athletes/photos/1.jpg', 'photo');
    Storage::disk('public')->put('athletes/photos/2.jpg', 'photo');
    $athlete->delete();

    $this->artisan('budojo:sync-reconcile')->assertSuccessful();

    Storage::disk('public')->assertExists('athletes/photos/1.jpg');
    Storage::disk('public')->assertMissing('athletes/photos/2.jpg');
});

it('sweeps logos and avatars by the rows that name them', function (): void {
    $academy = Academy::factory()->create(['logo_path' => 'academy-logos/1/logo.png']);
    $user = User::factory()->create(['avatar_path' => 'users/avatars/1.jpg']);
    Storage::disk('public')->put('academy-logos/1/logo.png', 'logo');
    Storage::disk('public')->put('academy-logos/1/old.png', 'logo');
    Storage::disk('public')->put('users/avatars/1.jpg', 'avatar');
    Storage::disk('public')->put('users/avatars/9.jpg', 'avatar');

    $this->artisan('budojo:sync-reconcile')
        ->expectsOutputToContain('2 file(s)')
        ->assertSuccessful();

    Storage::disk('public')->assertExists($academy->logo_path);
    Storage::disk('public')->assertExists($user->avatar_path);
    Storage::disk('public')->assertMissing('academy-logos/1/old.png');
    Storage::disk('public')->assertMissing('users/avatars/9.jpg');
});

it('leaves everything outside the folders it owns alone', function (): void {
    Storage::disk('local')->put('backups/budojo-backup-20261001-090000.zip', 'archive');
    Storage::disk('public')->put('exports/report.csv', 'csv');

    $this->artisan('budojo:sync-reconcile')->assertSuccessful();

    Storage::disk('local')->assertExists('backups/budojo-backup-20261001-090000.zip');
    Storage::disk('public')->assertExists('exports/report.csv');
});

it('clears the cache, which would answer from the old database', function (): void {
    Cache::put('attendance-summary:1', 'from before the swap');

    $this->artisan('budojo:sync-reconcile')->assertSuccessful();

    expect(Cache::has('attendance-summary:1'))->toBeFalse();
});

it('keeps only this device\'s journal: the swapped-in database brought the other device\'s (#2031)', function (): void {
    config()->set('budojo.sync.device', 'phone9c1e');
    foreach (['01K6F3Q8Z4M7X2N5P9R1T3V6W8' => 'pc4f2a', '01K6F3Q8Z4M7X2N5P9R1T3V6W9' => 'phone9c1e'] as $id => $device) {
        \Illuminate\Support\Facades\DB::table('sync_journal')->insert([
            'id' => $id, 'device' => $device, 'at' => '2026-10-02T10:00:00.000000Z', 'method' => 'POST',
            'route' => 'athletes.store', 'params' => '{}', 'body' => null, 'created' => '{}', 'before' => null,
        ]);
        \Illuminate\Support\Facades\DB::table('sync_entries')->insert(['id' => $id, 'device' => $device, 'outcome' => 'own', 'created' => '{}']);
    }

    $this->artisan('budojo:sync-reconcile')->assertSuccessful();

    expect(\Illuminate\Support\Facades\DB::table('sync_journal')->pluck('device')->all())->toBe(['phone9c1e'])
        // What the database dealt with stays, every device's.
        ->and(\Illuminate\Support\Facades\DB::table('sync_entries')->count())->toBe(2);
});
