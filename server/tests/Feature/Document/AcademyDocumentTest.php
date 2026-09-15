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

it('keeps exactly one owner on an athlete document too', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();

    $response = $this->actingAs($user)
        ->postJson("/api/v1/athletes/{$athlete->id}/documents", [
            'type' => 'id_card',
            'file' => UploadedFile::fake()->create('carta.pdf', 12, 'application/pdf'),
        ])
        ->assertCreated();

    $document = Document::query()->findOrFail($response->json('data.id'));

    // The relation writes the column, so neither Action names one — and a row
    // cannot acquire both owners by anybody forgetting to clear the other.
    expect($document->academy_id)->toBeNull()
        ->and($document->athlete_id)->toBe($athlete->id);
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
    $policy = Document::factory()->forAcademy($user->academy)->create([
        'type' => DocumentType::Insurance,
        'expires_at' => now()->addDays(5)->toDateString(),
    ]);

    // The active-athlete scope (#1740) lives on the athlete join. A liability
    // policy has no training status, so it must not be filtered by one.
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
