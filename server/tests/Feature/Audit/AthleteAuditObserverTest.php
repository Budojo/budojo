<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\AuditEntry;
use Laravel\Sanctum\Sanctum;

it('writes athlete.created on insert with the actor + academy + after snapshot', function (): void {
    $user = userWithAcademy();
    Sanctum::actingAs($user);

    $mario = Athlete::factory()->for($user->academy)->create([
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'email' => 'mario@example.com',
    ]);

    $entry = AuditEntry::query()
        ->where('subject_type', Athlete::class)
        ->where('subject_id', $mario->id)
        ->where('action', 'athlete.created')
        ->first();

    expect($entry)->not->toBeNull();
    expect($entry->actor_user_id)->toBe($user->id);
    expect($entry->academy_id)->toBe($user->academy->id);
    expect($entry->subject_label)->toBe('Mario Rossi');
    expect($entry->after)->toBeArray();
    expect($entry->after['first_name'])->toBe('Mario');
    // Email is PII-redacted on write — hash-prefix, not the raw value.
    expect($entry->after['email'])->not->toBe('mario@example.com');
    expect($entry->after['email'])->toEndWith('...');
});

it('writes athlete.belt.promoted with belt-specific verb when belt changes', function (): void {
    $user = userWithAcademy();
    Sanctum::actingAs($user);
    $mario = Athlete::factory()->for($user->academy)->create([
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'belt' => 'blue',
    ]);

    AuditEntry::query()->delete();

    $mario->belt = 'purple';
    $mario->save();

    $entry = AuditEntry::query()->first();
    expect($entry)->not->toBeNull();
    expect($entry->action)->toBe('athlete.belt.promoted');
    expect($entry->before)->toMatchArray(['belt' => 'blue']);
    expect($entry->after)->toMatchArray(['belt' => 'purple']);
});

it('writes athlete.updated (not the belt verb) when a non-belt field changes', function (): void {
    $user = userWithAcademy();
    Sanctum::actingAs($user);
    $mario = Athlete::factory()->for($user->academy)->create([
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'belt' => 'blue',
    ]);

    AuditEntry::query()->delete();

    $mario->first_name = 'Mario II';
    $mario->save();

    $entry = AuditEntry::query()->first();
    expect($entry)->not->toBeNull();
    expect($entry->action)->toBe('athlete.updated');
});

it('writes athlete.deleted with the pre-deletion snapshot captured in `before`', function (): void {
    $user = userWithAcademy();
    Sanctum::actingAs($user);
    $mario = Athlete::factory()->for($user->academy)->create([
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
    ]);

    AuditEntry::query()->delete();

    $mario->delete();

    $entry = AuditEntry::query()->where('action', 'athlete.deleted')->first();
    expect($entry)->not->toBeNull();
    expect($entry->before)->toBeArray();
    expect($entry->before['first_name'])->toBe('Mario');
    // The subject_label survives soft-delete — denormalised at write time.
    expect($entry->subject_label)->toBe('Mario Rossi');
});

it('writes actor_label="system" when no user is authenticated', function (): void {
    // No Sanctum::actingAs — simulate a queue/cron write.
    $user = userWithAcademy();
    Athlete::factory()->for($user->academy)->create();

    $entry = AuditEntry::query()->where('action', 'athlete.created')->first();
    expect($entry)->not->toBeNull();
    expect($entry->actor_user_id)->toBeNull();
    expect($entry->actor_label)->toBe('system');
});
