<?php

declare(strict_types=1);

use App\Enums\DocumentType;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\Document;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Storage::fake('local');
});

// ── The row itself ────────────────────────────────────────────────────────

it('stores a document against the academy, with no athlete', function (): void {
    $user = userWithAcademy();

    $response = $this->actingAs($user)
        ->postJson('/api/v1/academy/documents', [
            'type' => 'insurance',
            'file' => UploadedFile::fake()->create('polizza.pdf', 12, 'application/pdf'),
            'expires_at' => '2027-06-30',
        ])
        ->assertCreated();

    $id = $response->json('data.id');
    $document = Document::query()->findOrFail($id);

    expect($document->athlete_id)->toBeNull()
        ->and($document->academy_id)->toBe($user->academy->id)
        ->and($response->json('data.academy_id'))->toBe($user->academy->id)
        ->and($response->json('data.athlete_id'))->toBeNull();
});

it('will not let the update endpoint move a document between owners', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $doc = Document::factory()->for($athlete)->create(['type' => DocumentType::IdCard]);

    // Neither FK is in `UpdateDocumentRequest::rules()`, so `validated()`
    // drops them. That is what keeps the exactly-one-owner invariant from
    // needing a database constraint — a row cannot acquire a second owner,
    // because no request can name one.
    //
    // The previous version of this test asserted the invariant on a freshly
    // uploaded row, where no code path writes the other column anyway: it
    // could not have failed.
    $this->actingAs($user)
        ->putJson("/api/v1/documents/{$doc->id}", [
            'academy_id' => $user->academy->id,
            'athlete_id' => null,
            'notes' => 'still mine',
        ])
        ->assertOk();

    $fresh = $doc->fresh();
    expect($fresh?->athlete_id)->toBe($athlete->id)
        ->and($fresh?->academy_id)->toBeNull()
        ->and($fresh?->notes)->toBe('still mine');
});

it('refuses a medical certificate on the academy', function (): void {
    $user = userWithAcademy();

    // The one type that is special-category data under GDPR Art. 9 and the
    // one type the upload Action encrypts. An academy does not have a medical
    // fitness certificate; a person does.
    $this->actingAs($user)
        ->postJson('/api/v1/academy/documents', [
            'type' => 'medical_certificate',
            'file' => UploadedFile::fake()->create('cert.pdf', 12, 'application/pdf'),
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('type');
});

it('never encrypts an academy document', function (): void {
    config(['documents.encryption_key' => base64_encode(str_repeat('a', 32))]);
    $user = userWithAcademy();

    $response = $this->actingAs($user)
        ->postJson('/api/v1/academy/documents', [
            'type' => 'insurance',
            'file' => UploadedFile::fake()->create('polizza.pdf', 12, 'application/pdf'),
        ])
        ->assertCreated();

    $document = Document::query()->findOrFail($response->json('data.id'));

    // A liability policy is not special-category data, and encrypting it puts
    // the bytes behind the key in `secrets.bin` — which backups deliberately
    // do not carry (docs/desktop/backup-restore.md).
    expect($document->is_encrypted)->toBeFalse()
        ->and($document->file_path)->not->toEndWith('.enc');
});

// ── The list ──────────────────────────────────────────────────────────────

it('lists the academy papers without any athlete documents', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $mine = Document::factory()->forAcademy($user->academy)->create(['type' => DocumentType::Insurance]);
    Document::factory()->for($athlete)->create(['type' => DocumentType::IdCard]);

    $ids = collect($this->actingAs($user)
        ->getJson('/api/v1/academy/documents')
        ->assertOk()
        ->json('data'))->pluck('id')->all();

    expect($ids)->toBe([$mine->id]);
});

it('does not show one academy its neighbour papers', function (): void {
    $user = userWithAcademy();
    $other = Academy::factory()->create();
    Document::factory()->forAcademy($other)->create();

    $this->actingAs($user)
        ->getJson('/api/v1/academy/documents')
        ->assertOk()
        ->assertJsonCount(0, 'data');
});

// ── The expiring list ─────────────────────────────────────────────────────

it('merges the academy papers into the expiring list, in date order', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();

    $policy = Document::factory()->forAcademy($user->academy)->create([
        'type' => DocumentType::Insurance,
        'expires_at' => now()->addDays(3)->toDateString(),
    ]);
    $card = Document::factory()->for($athlete)->create([
        'type' => DocumentType::IdCard,
        'expires_at' => now()->addDays(10)->toDateString(),
    ]);

    $ids = collect($this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk()
        ->json('data'))->pluck('id')->all();

    // One list, one ordering. The academy's paper is not a second section
    // appended after the athletes' — it is more urgent, so it is first.
    expect($ids)->toBe([$policy->id, $card->id]);
});

it('does not let an inactive athlete filter hide the academy own papers', function (): void {
    $user = userWithAcademy();
    // An INACTIVE athlete with an expiring document, so the #1740 scope this
    // test is named for is actually exercised. Without one it created no
    // athlete at all and the filter was never reached.
    $left = Athlete::factory()->for($user->academy)->create(['status' => 'inactive']);
    Document::factory()->for($left)->create([
        'type' => DocumentType::IdCard,
        'expires_at' => now()->addDays(4)->toDateString(),
    ]);
    $policy = Document::factory()->forAcademy($user->academy)->create([
        'type' => DocumentType::Insurance,
        'expires_at' => now()->addDays(5)->toDateString(),
    ]);

    // The active-athlete scope lives on the athlete join: it takes the
    // inactive athlete's card and leaves the academy's policy, which has no
    // training status to be filtered by.
    $ids = collect($this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk()
        ->json('data'))->pluck('id')->all();

    expect($ids)->toBe([$policy->id]);
});

it('caps the merged list rather than each half', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();

    // 150 + 150 would be 300 rows if each half carried its own cap.
    for ($i = 0; $i < 150; $i++) {
        Document::factory()->for($athlete)->create([
            'type' => DocumentType::IdCard,
            'expires_at' => now()->addDays(1)->toDateString(),
        ]);
        Document::factory()->forAcademy($user->academy)->create([
            'type' => DocumentType::Insurance,
            'expires_at' => now()->addDays(2)->toDateString(),
        ]);
    }

    $this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk()
        ->assertJsonCount(200, 'data');
});

it('leaves missing_medical_certificate looking only at athletes', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    Document::factory()->forAcademy($user->academy)->create([
        'type' => DocumentType::Insurance,
        'expires_at' => now()->addDays(5)->toDateString(),
    ]);

    // It queries athletes, so it is safe as written — but the shape of the
    // envelope changed around it, so assert it rather than assume.
    $missing = collect($this->actingAs($user)
        ->getJson('/api/v1/documents/expiring')
        ->assertOk()
        ->json('missing_medical_certificate'))->pluck('id')->all();

    expect($missing)->toBe([$athlete->id]);
});

// ── Tenant scoping, on a document with no athlete ─────────────────────────

it('refuses to download another academy paper', function (): void {
    $user = userWithAcademy();
    $other = Academy::factory()->create();
    $theirs = Document::factory()->forAcademy($other)->create();

    // `userOwns()` used to reach through `$document->athlete->academy_id`,
    // which is null here. Null never equals an academy id, so the row is
    // refused rather than leaked.
    $this->actingAs($user)
        ->get("/api/v1/documents/{$theirs->id}/download")
        ->assertForbidden();
});

it('refuses to update another academy paper', function (): void {
    $user = userWithAcademy();
    $other = Academy::factory()->create();
    $theirs = Document::factory()->forAcademy($other)->create();

    $this->actingAs($user)
        ->putJson("/api/v1/documents/{$theirs->id}", ['notes' => 'mine now'])
        ->assertForbidden();
});

it('refuses to delete another academy paper', function (): void {
    $user = userWithAcademy();
    $other = Academy::factory()->create();
    $theirs = Document::factory()->forAcademy($other)->create();

    $this->actingAs($user)
        ->deleteJson("/api/v1/documents/{$theirs->id}")
        ->assertForbidden();
});

it('lets the owner update and delete their own academy paper', function (): void {
    $user = userWithAcademy();
    $mine = Document::factory()->forAcademy($user->academy)->create();

    // The other half of each scoping test: refusing everything would pass the
    // three above and ship a feature nobody can use.
    $this->actingAs($user)
        ->putJson("/api/v1/documents/{$mine->id}", ['notes' => 'DAE, rev. 2027'])
        ->assertOk()
        ->assertJsonPath('data.notes', 'DAE, rev. 2027');

    $this->actingAs($user)
        ->deleteJson("/api/v1/documents/{$mine->id}")
        ->assertNoContent();

    expect($mine->fresh()?->deleted_at)->not->toBeNull();
});

it('takes the papers with the academy when it is deleted', function (): void {
    $academy = Academy::factory()->create();
    $document = Document::factory()->forAcademy($academy)->create();

    $academy->delete();

    // `academy_id` cascades, like `athlete_id`. A paper whose academy is gone
    // is not a paper anybody can reach.
    expect(Document::withTrashed()->find($document->id))->toBeNull();
});

// ── The reminder ──────────────────────────────────────────────────────────

it('reminds the owner at a threshold, with its own notification kind', function (): void {
    Illuminate\Support\Carbon::setTestNow('2026-09-15 09:00:00');
    $user = userWithAcademy();
    $policy = Document::factory()->forAcademy($user->academy)->create([
        'type' => DocumentType::Insurance,
        'original_name' => 'polizza-rc.pdf',
        'expires_at' => now()->addDays(7)->toDateString(),
    ]);

    Artisan::call('budojo:send-academy-document-expiry-reminders');

    $row = DB::table('notifications')->latest('created_at')->first();
    $data = json_decode((string) ($row->data ?? '{}'), true);

    // Its own kind, not the medical one: a liability policy behind a checkbox
    // labelled "medical certificate reminders" is an opt-out nobody can find.
    expect($data['kind'])->toBe('academy_document_expiry_reminders')
        ->and($data['document_ids'])->toBe([$policy->id])
        ->and($data['body'])->toContain('polizza-rc.pdf');

    Illuminate\Support\Carbon::setTestNow();
});

it('does not remind twice on the same day', function (): void {
    Illuminate\Support\Carbon::setTestNow('2026-09-15 09:00:00');
    $user = userWithAcademy();
    Document::factory()->forAcademy($user->academy)->create([
        'type' => DocumentType::Insurance,
        'expires_at' => now()->addDays(7)->toDateString(),
    ]);

    Artisan::call('budojo:send-academy-document-expiry-reminders');
    Artisan::call('budojo:send-academy-document-expiry-reminders');

    expect(DB::table('notifications')->count())->toBe(1);

    Illuminate\Support\Carbon::setTestNow();
});

it('stays quiet off-cycle', function (): void {
    Illuminate\Support\Carbon::setTestNow('2026-09-15 09:00:00');
    $user = userWithAcademy();
    Document::factory()->forAcademy($user->academy)->create([
        'type' => DocumentType::Insurance,
        'expires_at' => now()->addDays(15)->toDateString(),
    ]);

    Artisan::call('budojo:send-academy-document-expiry-reminders');

    expect(DB::table('notifications')->count())->toBe(0);

    Illuminate\Support\Carbon::setTestNow();
});

it('leaves an athlete medical certificate to the other command', function (): void {
    Illuminate\Support\Carbon::setTestNow('2026-09-15 09:00:00');
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    Document::factory()->for($athlete)->create([
        'type' => DocumentType::MedicalCertificate,
        'expires_at' => now()->addDays(7)->toDateString(),
    ]);

    Artisan::call('budojo:send-academy-document-expiry-reminders');

    // One expiry must not produce two reminders.
    expect(DB::table('notifications')->count())->toBe(0);

    Illuminate\Support\Carbon::setTestNow();
});

it('refuses to retype an academy paper into a medical certificate', function (): void {
    $user = userWithAcademy();
    $policy = Document::factory()->forAcademy($user->academy)->create([
        'type' => DocumentType::Insurance,
    ]);

    // Refusing it only at upload leaves a back door with teeth: the row would
    // then match `PurgeExpiredMedicalCertificates`, which after 24 months
    // soft-deletes it and wipes the file — a mistyped liability policy would
    // quietly destroy itself.
    $this->actingAs($user)
        ->putJson("/api/v1/documents/{$policy->id}", ['type' => 'medical_certificate'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('type');

    expect($policy->fresh()?->type)->toBe(DocumentType::Insurance);
});

it('still lets an athlete document be retyped to a medical certificate', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $doc = Document::factory()->for($athlete)->create(['type' => DocumentType::Other]);

    // The other half: the restriction is about the OWNER, not about the type.
    // Blocking it everywhere would pass the test above and break a correction
    // the owner has always been able to make.
    $this->actingAs($user)
        ->putJson("/api/v1/documents/{$doc->id}", ['type' => 'medical_certificate'])
        ->assertOk();

    expect($doc->fresh()?->type)->toBe(DocumentType::MedicalCertificate);
});

it('lets the owner switch a notification off and the digest goes quiet', function (): void {
    Illuminate\Support\Carbon::setTestNow('2026-09-15 09:00:00');
    $user = userWithAcademy();
    Document::factory()->forAcademy($user->academy)->create([
        'type' => DocumentType::Insurance,
        'expires_at' => now()->addDays(7)->toDateString(),
    ]);

    $user->forceFill([
        'notification_preferences' => ['academy_document_expiry_reminders' => false],
    ])->save();

    Artisan::call('budojo:send-academy-document-expiry-reminders');

    // It was the only owner-facing reminder in the app that could not be
    // switched off.
    expect(DB::table('notifications')->count())->toBe(0);

    Illuminate\Support\Carbon::setTestNow();
});

// ── GDPR: erasure and portability ─────────────────────────────────────────

it('wipes the academy paper files when the account is purged', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    $athleteDoc = Document::factory()->for($athlete)->create(['file_path' => 'documents/athlete.pdf']);
    $policy = Document::factory()->forAcademy($user->academy)->create(['file_path' => 'documents/policy.pdf']);
    Storage::disk('local')->put($athleteDoc->file_path, 'bytes');
    Storage::disk('local')->put($policy->file_path, 'bytes');

    app(\App\Actions\User\PurgeAccountAction::class)->execute($user);

    // The FK cascade takes the ROW; nothing but this walk takes the file. An
    // erasure that leaves the bytes on disk has not erased anything, and the
    // walk went athlete-first, so academy papers were missed entirely.
    expect(Storage::disk('local')->exists($policy->file_path))->toBeFalse()
        ->and(Storage::disk('local')->exists($athleteDoc->file_path))->toBeFalse();
});

it('includes the academy papers in the data export', function (): void {
    $user = userWithAcademy();
    $policy = Document::factory()->forAcademy($user->academy)->create([
        'type' => DocumentType::Insurance,
        'original_name' => 'polizza-rc.pdf',
    ]);

    $export = app(\App\Actions\User\ExportUserDataAction::class)->execute($user);

    // Portability that silently omits a whole class of the user's documents
    // is not portability.
    $names = collect($export['data']['academy']['documents'])->pluck('original_name')->all();
    expect($names)->toContain('polizza-rc.pdf')
        ->and($export['data']['academy']['documents'][0]['id'])->toBe($policy->id);
});

// ── The activity log ──────────────────────────────────────────────────────

it('records an academy paper upload in the activity log', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/academy/documents', [
            'type' => 'insurance',
            'file' => UploadedFile::fake()->create('polizza.pdf', 12, 'application/pdf'),
        ])
        ->assertCreated();

    $entry = DB::table('audit_entries')->where('action', 'document.uploaded')->latest('id')->first();

    // `athlete?->academy` was null for every academy paper, and the activity
    // page filters on `academy_id` — so uploading the liability policy left
    // no trace at all, which is the opposite of what an audit trail is for.
    expect($entry?->academy_id)->toBe($user->academy->id)
        ->and($entry?->subject_label)->toContain('polizza.pdf')
        ->and($entry?->subject_label)->not->toContain('Athlete #');
});

it('reaches the activity page rather than being filtered out', function (): void {
    $user = userWithAcademy();
    Document::factory()->forAcademy($user->academy)->create(['original_name' => 'DAE.pdf'])->delete();

    $labels = collect($this->actingAs($user)
        ->getJson('/api/v1/audit-entries')
        ->assertOk()
        ->json('data'))->pluck('subject_label')->all();

    expect($labels)->toContain('DAE.pdf (' . $user->academy->name . ')');
});
