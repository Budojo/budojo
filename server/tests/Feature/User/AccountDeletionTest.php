<?php

declare(strict_types=1);

use App\Actions\User\PurgeAccountAction;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\AttendanceRecord;
use App\Models\Document;
use App\Models\PendingDeletion;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

// ─── POST /me/deletion-request ────────────────────────────────────────────────

it('enters a 30-day grace period when the user requests account deletion', function (): void {
    $user = userWithAcademy();
    $user->update(['password' => Hash::make('correct-horse-battery')]);

    $response = $this->actingAs($user)->postJson('/api/v1/me/deletion-request', [
        'password' => 'correct-horse-battery',
    ]);

    $response->assertStatus(202)
        ->assertJsonPath('data.grace_days', 30)
        ->assertJsonStructure(['data' => ['requested_at', 'scheduled_for', 'grace_days']]);

    expect(PendingDeletion::query()->where('user_id', $user->id)->count())->toBe(1);
    $pending = PendingDeletion::query()->where('user_id', $user->id)->first();
    expect((int) $pending->scheduled_for->diffInDays($pending->requested_at, true))->toBe(30);
    expect(strlen($pending->confirmation_token))->toBe(64);
});

it('rejects the deletion request with 422 when the password is wrong', function (): void {
    $user = userWithAcademy();
    $user->update(['password' => Hash::make('correct-horse-battery')]);

    $this->actingAs($user)->postJson('/api/v1/me/deletion-request', [
        'password' => 'definitely-wrong',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['password']);

    expect(PendingDeletion::query()->where('user_id', $user->id)->exists())->toBeFalse();
});

it('is idempotent — a second deletion-request returns the existing pending row', function (): void {
    $user = userWithAcademy();
    $user->update(['password' => Hash::make('passw')]);

    $first = $this->actingAs($user)
        ->postJson('/api/v1/me/deletion-request', ['password' => 'passw'])
        ->json('data');

    $second = $this->actingAs($user)
        ->postJson('/api/v1/me/deletion-request', ['password' => 'passw'])
        ->json('data');

    expect($first['scheduled_for'])->toBe($second['scheduled_for']);
    expect(PendingDeletion::query()->where('user_id', $user->id)->count())->toBe(1);
});

it('returns 401 on /me/deletion-request without auth', function (): void {
    $this->postJson('/api/v1/me/deletion-request', ['password' => 'whatever'])
        ->assertUnauthorized();
});

// ─── DELETE /me/deletion-request ──────────────────────────────────────────────

it('cancels a pending deletion via DELETE /me/deletion-request', function (): void {
    $user = userWithAcademy();
    $user->update(['password' => Hash::make('p')]);
    $this->actingAs($user)->postJson('/api/v1/me/deletion-request', ['password' => 'p'])->assertStatus(202);

    $this->actingAs($user)->deleteJson('/api/v1/me/deletion-request')
        ->assertOk()
        ->assertJsonPath('data.cancelled', true);

    expect(PendingDeletion::query()->where('user_id', $user->id)->exists())->toBeFalse();
});

it('returns 200 with cancelled:false when there is nothing to cancel', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)->deleteJson('/api/v1/me/deletion-request')
        ->assertOk()
        ->assertJsonPath('data.cancelled', false);
});

// ─── /auth/me deletion_pending field ──────────────────────────────────────────

it('exposes deletion_pending=null on /auth/me when there is no pending row', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)->getJson('/api/v1/auth/me')
        ->assertOk()
        ->assertJsonPath('data.deletion_pending', null);
});

it('exposes deletion_pending shape on /auth/me when the user has requested deletion', function (): void {
    $user = userWithAcademy();
    $user->update(['password' => Hash::make('p')]);
    $this->actingAs($user)->postJson('/api/v1/me/deletion-request', ['password' => 'p']);

    $this->actingAs($user)->getJson('/api/v1/auth/me')
        ->assertOk()
        ->assertJsonStructure(['data' => ['deletion_pending' => ['requested_at', 'scheduled_for']]]);
});

// ─── PurgeAccountAction ───────────────────────────────────────────────────────

it('PurgeAccountAction hard-deletes user + academy + athletes (including soft-deleted) + cascade tables', function (): void {
    Storage::fake('local');

    $user = userWithAcademy();
    $academy = $user->academy;
    /** @var Athlete $aliveAthlete */
    $aliveAthlete = Athlete::factory()->for($academy)->create();
    /** @var Athlete $softDeletedAthlete */
    $softDeletedAthlete = Athlete::factory()->for($academy)->create(['deleted_at' => now()]);

    AthletePayment::factory()->for($aliveAthlete)
        ->create(['year' => 2026, 'month' => 4, 'amount_cents' => 5000]);
    AttendanceRecord::factory()->for($aliveAthlete)->create();

    $upload = UploadedFile::fake()->create('cert.pdf', 100, 'application/pdf');
    $stored = $upload->store('documents', 'local');
    Document::factory()->for($aliveAthlete)->create([
        'file_path' => $stored,
        'mime_type' => 'application/pdf',
    ]);

    app(PurgeAccountAction::class)->execute($user);

    // User row gone for real, no soft-delete tombstone left behind.
    expect(\App\Models\User::query()->where('id', $user->id)->count())->toBe(0);
    expect(\App\Models\Academy::query()->where('id', $academy->id)->count())->toBe(0);

    // Athletes — even the soft-deleted one — gone via FK cascade.
    expect(Athlete::query()->withTrashed()->whereIn('id', [$aliveAthlete->id, $softDeletedAthlete->id])->count())
        ->toBe(0);

    // Cascade tables empty for this academy/user.
    expect(AthletePayment::query()->where('athlete_id', $aliveAthlete->id)->count())->toBe(0);
    expect(AttendanceRecord::query()->where('athlete_id', $aliveAthlete->id)->count())->toBe(0);

    // Document file wiped from disk.
    expect(Storage::disk('local')->exists($stored))->toBeFalse();
});

it('PurgeAccountAction does not touch other users data', function (): void {
    $userA = userWithAcademy();
    $userB = userWithAcademy();
    Athlete::factory()->for($userB->academy)->create(['first_name' => 'Untouched']);

    app(PurgeAccountAction::class)->execute($userA);

    expect(\App\Models\User::query()->where('id', $userB->id)->count())->toBe(1);
    expect(Athlete::query()->where('first_name', 'Untouched')->count())->toBe(1);
});
