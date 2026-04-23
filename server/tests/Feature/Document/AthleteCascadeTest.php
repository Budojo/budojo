<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\Document;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Storage::fake('local');
});

it('cascade soft-deletes all documents when the athlete is soft-deleted', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $documents = Document::factory(3)->for($athlete)->create();

    $athlete->delete();

    foreach ($documents as $doc) {
        expect(Document::withTrashed()->find($doc->id)?->deleted_at)->not->toBeNull();
        expect(Document::find($doc->id))->toBeNull();
    }
});

it('wipes the physical files from disk when the athlete is soft-deleted', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $paths = [];
    for ($i = 0; $i < 3; $i++) {
        $path = "documents/doc-{$i}.pdf";
        Storage::disk('local')->put($path, "content-{$i}");
        Document::factory()->for($athlete)->create(['file_path' => $path]);
        $paths[] = $path;
    }

    $athlete->delete();

    foreach ($paths as $path) {
        Storage::disk('local')->assertMissing($path);
    }
});

it('does not affect documents of other athletes', function (): void {
    $user = userWithAcademy();
    $athlete1 = Athlete::factory()->for($user->academy)->create();
    $athlete2 = Athlete::factory()->for($user->academy)->create();
    Document::factory(2)->for($athlete1)->create();
    $keepThese = Document::factory(2)->for($athlete2)->create();

    $athlete1->delete();

    foreach ($keepThese as $doc) {
        expect(Document::find($doc->id))->not->toBeNull();
        expect(Document::find($doc->id)?->deleted_at)->toBeNull();
    }
});
