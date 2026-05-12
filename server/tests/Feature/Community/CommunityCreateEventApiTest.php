<?php

declare(strict_types=1);

use App\Enums\CommunityPostType;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\CommunityPost;
use App\Models\User;

/**
 * Feature tests for `POST /api/v1/community/events` — owner-only
 * event creation (unblocks M9 PR-F slice 2).
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
});

it('creates an event post scoped to the owners academy', function (): void {
    $response = $this->actingAs($this->owner)
        ->postJson('/api/v1/community/events', [
            'title' => 'Open mat — Saturday',
            'description' => 'All belts welcome.',
            'starts_at' => '2026-06-13T10:00:00Z',
            'location_text' => 'Via Roma 10, Milano',
            'max_attendees' => 30,
        ])
        ->assertCreated();

    expect($response->json('data.type'))->toBe('event')
        ->and($response->json('data.payload.title'))->toBe('Open mat — Saturday')
        ->and($response->json('data.payload.max_attendees'))->toBe(30)
        ->and($response->json('data.created_by.id'))->toBe($this->owner->id);

    expect(
        CommunityPost::query()
        ->where('academy_id', $this->academy->id)
        ->where('type', CommunityPostType::Event)
        ->count(),
    )->toBe(1);
});

it('trims whitespace around title / description / location_text', function (): void {
    $response = $this->actingAs($this->owner)
        ->postJson('/api/v1/community/events', [
            'title' => '   Open mat   ',
            'description' => "  All welcome  \n",
            'starts_at' => '2026-06-13T10:00:00Z',
            'location_text' => '  Via Roma 10  ',
        ])
        ->assertCreated();

    expect($response->json('data.payload.title'))->toBe('Open mat')
        ->and($response->json('data.payload.description'))->toBe('All welcome')
        ->and($response->json('data.payload.location_text'))->toBe('Via Roma 10');
});

it('rejects an empty title with 422', function (): void {
    $this->actingAs($this->owner)
        ->postJson('/api/v1/community/events', [
            'title' => '   ',
            'starts_at' => '2026-06-13T10:00:00Z',
        ])
        ->assertStatus(422);
});

it('rejects a malformed starts_at with 422', function (): void {
    $this->actingAs($this->owner)
        ->postJson('/api/v1/community/events', [
            'title' => 'Open mat',
            'starts_at' => 'not-a-date',
        ])
        ->assertStatus(422);
});

it('rejects an athlete caller with 403 envelope', function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create(['user_id' => null]);
    /** @var User $athleteUser */
    $athleteUser = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $athleteUser->id]);

    $this->actingAs($athleteUser)
        ->postJson('/api/v1/community/events', [
            'title' => 'Sneaky',
            'starts_at' => '2026-06-13T10:00:00Z',
        ])
        ->assertStatus(403)
        ->assertExactJson(['message' => 'Forbidden.']);

    expect(CommunityPost::query()->where('type', CommunityPostType::Event)->count())->toBe(0);
});

it('rejects an owner with no linked academy with 403', function (): void {
    /** @var User $orphan */
    $orphan = User::factory()->create(['role' => 'owner']);

    $this->actingAs($orphan)
        ->postJson('/api/v1/community/events', [
            'title' => 'Lonely',
            'starts_at' => '2026-06-13T10:00:00Z',
        ])
        ->assertStatus(403);
});

it('rejects unauthenticated callers with 401', function (): void {
    $this->postJson('/api/v1/community/events', [
        'title' => 'Open mat',
        'starts_at' => '2026-06-13T10:00:00Z',
    ])->assertStatus(401);
});

it('accepts optional lat / lon within bounds + rejects out-of-range values', function (): void {
    $this->actingAs($this->owner)
        ->postJson('/api/v1/community/events', [
            'title' => 'Mapped',
            'starts_at' => '2026-06-13T10:00:00Z',
            'location_lat' => 45.4642,
            'location_lon' => 9.19,
        ])
        ->assertCreated();

    $this->actingAs($this->owner)
        ->postJson('/api/v1/community/events', [
            'title' => 'OOB',
            'starts_at' => '2026-06-13T10:00:00Z',
            'location_lat' => 100,
        ])
        ->assertStatus(422);

    $this->actingAs($this->owner)
        ->postJson('/api/v1/community/events', [
            'title' => 'OOB',
            'starts_at' => '2026-06-13T10:00:00Z',
            'location_lon' => -200,
        ])
        ->assertStatus(422);
});
