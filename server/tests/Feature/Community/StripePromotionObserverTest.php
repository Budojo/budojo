<?php

declare(strict_types=1);

use App\Enums\Belt;
use App\Enums\CommunityPostType;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePromotion;
use App\Models\CommunityPost;

/**
 * Post-v2.9.0 stripe-promotion observer + history log. Observer
 * fires on `Athlete::stripes` change, writes an
 * AthletePromotion(kind: stripe) row AND a `stripe_promotion`
 * CommunityPost. No notification fanout for stripes (they're
 * frequent — feed card is the surface).
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
});

it('creates a stripe_promotion post when stripes change for an authenticated owner', function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create([
        'belt' => Belt::Blue,
        'stripes' => 1,
    ]);

    $this->actingAs($this->owner);

    $athlete->update(['stripes' => 2]);

    /** @var CommunityPost $post */
    $post = CommunityPost::query()->where('type', CommunityPostType::StripePromotion)->first();
    expect($post)->not->toBeNull()
        ->and($post->academy_id)->toBe($this->academy->id)
        ->and($post->created_by_user_id)->toBe($this->owner->id)
        ->and($post->payload)->toHaveKey('athlete_id', $athlete->id)
        ->and($post->payload)->toHaveKey('belt', 'blue')
        ->and($post->payload)->toHaveKey('old_stripes', 1)
        ->and($post->payload)->toHaveKey('new_stripes', 2);
});

it('also writes an AthletePromotion(kind: stripe) row on stripes change', function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create([
        'belt' => Belt::Blue,
        'stripes' => 0,
    ]);

    $this->actingAs($this->owner);

    $athlete->update(['stripes' => 1]);

    /** @var AthletePromotion $row */
    $row = AthletePromotion::query()->where('athlete_id', $athlete->id)->first();
    expect($row)->not->toBeNull()
        ->and($row->kind)->toBe('stripe')
        ->and($row->from_stripes)->toBe(0)
        ->and($row->to_stripes)->toBe(1)
        ->and($row->from_belt)->toBeNull()
        ->and($row->to_belt)->toBeNull()
        ->and($row->recorded_by_user_id)->toBe($this->owner->id);
});

it('writes an AthletePromotion(kind: belt) row on belt change', function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create(['belt' => Belt::White]);

    $this->actingAs($this->owner);

    $athlete->update(['belt' => Belt::Blue]);

    /** @var AthletePromotion $row */
    $row = AthletePromotion::query()->where('athlete_id', $athlete->id)->first();
    expect($row)->not->toBeNull()
        ->and($row->kind)->toBe('belt')
        ->and($row->from_belt?->value)->toBe('white')
        ->and($row->to_belt?->value)->toBe('blue')
        ->and($row->from_stripes)->toBeNull()
        ->and($row->to_stripes)->toBeNull();
});

it('emits ONLY a belt_promotion post when belt + stripes change together (stripe reset is a side-effect)', function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create([
        'belt' => Belt::White,
        'stripes' => 4,
    ]);

    $this->actingAs($this->owner);

    // Common BJJ promotion: bumping to the next belt resets the
    // stripe counter — both columns change in one save. The feed
    // should read as ONE celebration ("got the blue belt"), not
    // "got a new stripe — 4 → 0" alongside it. The audit log row
    // is still written for traceability (Copilot review on #654).
    $athlete->update(['belt' => Belt::Blue, 'stripes' => 0]);

    expect(CommunityPost::query()->count())->toBe(1)
        ->and(CommunityPost::query()->where('type', CommunityPostType::BeltPromotion)->count())->toBe(1)
        ->and(CommunityPost::query()->where('type', CommunityPostType::StripePromotion)->count())->toBe(0)
        // Both log rows still written so the timeline shows the stripe reset.
        ->and(AthletePromotion::query()->count())->toBe(2);
});

it('does NOT emit a stripe_promotion post on a stripe decrease (manual correction)', function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create([
        'belt' => Belt::Blue,
        'stripes' => 3,
    ]);

    $this->actingAs($this->owner);

    // Owner fixes a typo on the athletes form: thought it was 3 stripes,
    // actually 2. No feed celebration; the audit log still records.
    $athlete->update(['stripes' => 2]);

    expect(CommunityPost::query()->count())->toBe(0)
        ->and(AthletePromotion::query()->count())->toBe(1);
});

it('skips ALL writes when no authenticated user (console seeder context)', function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create([
        'belt' => Belt::Blue,
        'stripes' => 1,
    ]);

    // No actingAs — Auth::id() returns null.
    $athlete->update(['stripes' => 2]);

    expect(CommunityPost::query()->count())->toBe(0)
        ->and(AthletePromotion::query()->count())->toBe(0);
});

it('does NOT fire a community_stripe_celebration notification (stripes carry no fanout in V1)', function (): void {
    \Illuminate\Support\Facades\Notification::fake();

    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create([
        'belt' => Belt::Blue,
        'stripes' => 1,
    ]);

    $this->actingAs($this->owner);

    $athlete->update(['stripes' => 2]);

    \Illuminate\Support\Facades\Notification::assertNothingSent();
});
