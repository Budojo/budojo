<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Enums\CommunityPostType;
use App\Enums\CommunityPostVisibility;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\CommunityPost;
use App\Models\User;

/**
 * PR-A2 — belt-promotion observer (#608). The AthleteObserver auto-
 * creates a `belt_promotion` community post on belt-column change,
 * scoped to the athlete's academy and attributed to the authenticated
 * user. PR-B (post-M7) adds the API + SPA that read these posts; this
 * test pins the write side so by the time the read surface lands,
 * real academies already have data to display.
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
});

it('creates a belt_promotion post when an athlete is promoted by an authenticated owner', function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create([
        'belt' => Belt::White,
    ]);

    $this->actingAs($this->owner);

    $athlete->update(['belt' => Belt::Blue]);

    expect(CommunityPost::query()->count())->toBe(1);

    /** @var CommunityPost $post */
    $post = CommunityPost::query()->first();
    expect($post->academy_id)->toBe($this->academy->id)
        ->and($post->type)->toBe(CommunityPostType::BeltPromotion)
        ->and($post->visibility)->toBe(CommunityPostVisibility::Academy)
        ->and($post->created_by_user_id)->toBe($this->owner->id)
        ->and($post->payload)->toHaveKey('athlete_id', $athlete->id)
        ->and($post->payload)->toHaveKey('athlete_name', trim($athlete->first_name . ' ' . $athlete->last_name))
        ->and($post->payload)->toHaveKey('old_belt', 'white')
        ->and($post->payload)->toHaveKey('new_belt', 'blue')
        ->and($post->payload['promoted_at'])->toBeString();
});

it('creates a post on every subsequent belt change for the same athlete', function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create(['belt' => Belt::White]);

    $this->actingAs($this->owner);

    $athlete->update(['belt' => Belt::Blue]);
    $athlete->refresh();
    $athlete->update(['belt' => Belt::Purple]);

    expect(CommunityPost::query()->count())->toBe(2);

    $payloads = CommunityPost::query()->orderBy('id')->get()->pluck('payload')->toArray();
    expect($payloads[0]['old_belt'])->toBe('white')->and($payloads[0]['new_belt'])->toBe('blue')
        ->and($payloads[1]['old_belt'])->toBe('blue')->and($payloads[1]['new_belt'])->toBe('purple');
});

it('does NOT create a post when a non-belt field changes', function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create(['belt' => Belt::Blue]);

    $this->actingAs($this->owner);

    $athlete->update(['first_name' => 'Renamed']);
    $athlete->update(['stripes' => 3]);

    expect(CommunityPost::query()->count())->toBe(0);
});

it('does NOT create a post on initial athlete creation', function (): void {
    $this->actingAs($this->owner);

    Athlete::factory()->for($this->academy)->create(['belt' => Belt::White]);

    expect(CommunityPost::query()->count())->toBe(0);
});

it('skips the post when no authenticated user (console seeder context)', function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create(['belt' => Belt::White]);

    // No actingAs — Auth::id() returns null. Simulates a console
    // command or a queue job bumping a belt programmatically.
    $athlete->update(['belt' => Belt::Blue]);

    expect(CommunityPost::query()->count())->toBe(0);
});

it('attributes the post to the academy the athlete belongs to, not the owner-user current academy', function (): void {
    // Edge case: the auth user owns Academy A, but the promoted
    // athlete belongs to Academy B. (This SHOULDN'T happen via the
    // normal HTTP flow because controllers reject cross-academy
    // PATCH, but the observer should still scope the post correctly
    // to the athlete's row, not the auth user's owned academy.)
    /** @var User $otherOwner */
    $otherOwner = userWithAcademy();
    /** @var Academy $otherAcademy */
    $otherAcademy = $otherOwner->academy;

    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($otherAcademy)->create(['belt' => Belt::White]);

    // Acting as `this->owner` (a different owner) — the post should
    // STILL be scoped to $otherAcademy (the athlete's), not
    // $this->academy.
    $this->actingAs($this->owner);

    $athlete->update(['belt' => Belt::Blue]);

    /** @var CommunityPost $post */
    $post = CommunityPost::query()->first();
    expect($post->academy_id)->toBe($otherAcademy->id)
        ->and($post->created_by_user_id)->toBe($this->owner->id);
});
