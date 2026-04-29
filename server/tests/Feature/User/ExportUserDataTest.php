<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\AttendanceRecord;
use App\Models\Document;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

it('returns the full account dataset as JSON for /me/export', function (): void {
    $user = userWithAcademy();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()
        ->for($user->academy)
        ->create(['first_name' => 'Mario', 'last_name' => 'Rossi', 'belt' => Belt::Blue]);

    AthletePayment::factory()
        ->for($athlete)
        ->create(['year' => 2026, 'month' => 4, 'amount_cents' => 5000]);

    AttendanceRecord::factory()
        ->for($athlete)
        ->create(['attended_on' => '2026-04-15']);

    $response = $this->actingAs($user)->getJson('/api/v1/me/export');

    $response->assertOk()
        ->assertJsonPath('version', '1.0')
        ->assertJsonPath('data.user.id', $user->id)
        ->assertJsonPath('data.user.email', $user->email)
        ->assertJsonPath('data.academy.id', $user->academy->id)
        ->assertJsonPath('data.athletes.0.first_name', 'Mario')
        ->assertJsonPath('data.athletes.0.belt', 'blue')
        ->assertJsonPath('data.athletes.0.payments.0.amount_cents', 5000)
        ->assertJsonPath('data.athletes.0.attendances.0.attended_on', '2026-04-15');

    expect($response->headers->get('Content-Disposition'))
        ->toContain('attachment')
        ->toContain('budojo-export-user-' . $user->id);
});

it('does not leak data from other academies in /me/export', function (): void {
    $userA = userWithAcademy();
    Athlete::factory()->for($userA->academy)->create(['first_name' => 'Alice']);

    $userB = userWithAcademy();
    Athlete::factory()->for($userB->academy)->create(['first_name' => 'Bob']);

    $response = $this->actingAs($userA)->getJson('/api/v1/me/export');

    $response->assertOk()
        ->assertJsonPath('data.athletes.0.first_name', 'Alice')
        ->assertJsonCount(1, 'data.athletes')
        ->assertJsonMissing(['first_name' => 'Bob']);
});

it('returns a ZIP carrying the JSON plus binary documents when format=zip', function (): void {
    Storage::fake('local');

    $user = userWithAcademy();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($user->academy)->create(['first_name' => 'Mario']);

    $upload = UploadedFile::fake()->create('certificato.pdf', 100, 'application/pdf');
    $storedPath = $upload->store('documents', 'local');

    Document::factory()->for($athlete)->create([
        'original_name' => 'certificato.pdf',
        'file_path' => $storedPath,
        'mime_type' => 'application/pdf',
        'size_bytes' => 100,
    ]);

    $response = $this->actingAs($user)->get('/api/v1/me/export?format=zip');

    $response->assertOk();
    expect($response->headers->get('Content-Type'))->toBe('application/zip');
    expect($response->headers->get('Content-Disposition'))
        ->toContain('attachment')
        ->toContain('.zip');

    // Verify the returned bytes are a real ZIP carrying both the JSON
    // and the document binary.
    $zipBytes = $response->streamedContent();
    $tmp = tempnam(sys_get_temp_dir(), 'budojo-test-export-') . '.zip';
    file_put_contents($tmp, $zipBytes);

    $zip = new ZipArchive();
    expect($zip->open($tmp))->toBeTrue();

    $jsonRaw = $zip->getFromName('data.json');
    expect($jsonRaw)->toBeString();
    /** @var array<string, mixed> $decoded */
    $decoded = json_decode((string) $jsonRaw, true);
    expect($decoded['data']['athletes'][0]['first_name'])->toBe('Mario');

    $docEntry = sprintf(
        'documents/athlete-%d/%d-certificato.pdf',
        $athlete->id,
        $athlete->documents->first()->id,
    );
    expect($zip->statName($docEntry))->not->toBeFalse();

    $zip->close();
    @unlink($tmp);
});

it('rejects /me/export when the caller is unauthenticated', function (): void {
    $this->getJson('/api/v1/me/export')
        ->assertStatus(401);
});

it('throttles /me/export to 1 request per minute per user', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)->getJson('/api/v1/me/export')->assertOk();
    $this->actingAs($user)->getJson('/api/v1/me/export')->assertStatus(429);
});
