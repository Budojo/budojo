<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\AttendanceRecord;
use App\Support\OnboardingStep;

it('GET /me/onboarding returns the initial empty state', function (): void {
    $user = userWithAcademy();

    $response = $this->actingAs($user)->getJson('/api/v1/me/onboarding');

    $response->assertOk()
        ->assertJsonPath('data.dismissed_at', null)
        ->assertJsonPath('data.completed_steps', [])
        ->assertJsonPath('data.available_steps', OnboardingStep::all());
});

it('POST /me/onboarding/steps appends a step and is idempotent on re-post', function (): void {
    $user = userWithAcademy();

    $first = $this->actingAs($user)->postJson('/api/v1/me/onboarding/steps', [
        'step' => OnboardingStep::ADD_ATHLETE,
    ]);
    $first->assertOk()->assertJsonPath('data.completed_steps', [OnboardingStep::ADD_ATHLETE]);

    // Re-post the same step — the array does not grow.
    $second = $this->actingAs($user)->postJson('/api/v1/me/onboarding/steps', [
        'step' => OnboardingStep::ADD_ATHLETE,
    ]);
    $second->assertOk()->assertJsonPath('data.completed_steps', [OnboardingStep::ADD_ATHLETE]);

    $user->refresh();
    expect($user->onboarding_completed_steps)->toBe([OnboardingStep::ADD_ATHLETE]);
});

it('POST /me/onboarding/steps rejects an unknown step key', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/me/onboarding/steps', ['step' => 'not_a_real_step'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['step']);

    $user->refresh();
    expect($user->onboarding_completed_steps)->toBeNull();
});

it('POST /me/onboarding/dismiss stamps the timestamp once and is idempotent', function (): void {
    $user = userWithAcademy();

    $first = $this->actingAs($user)->postJson('/api/v1/me/onboarding/dismiss');
    $first->assertOk();
    $stampedAt = $first->json('data.dismissed_at');
    expect($stampedAt)->not->toBeNull();

    // Re-dismiss — timestamp does NOT advance.
    $second = $this->actingAs($user)->postJson('/api/v1/me/onboarding/dismiss');
    $second->assertOk()->assertJsonPath('data.dismissed_at', $stampedAt);
});

it('GET /me/onboarding reflects the state after dismiss + step completion', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)->postJson('/api/v1/me/onboarding/steps', [
        'step' => OnboardingStep::LOG_ATTENDANCE,
    ]);
    $this->actingAs($user)->postJson('/api/v1/me/onboarding/steps', [
        'step' => OnboardingStep::MARK_PAYMENT,
    ]);
    $this->actingAs($user)->postJson('/api/v1/me/onboarding/dismiss');

    $response = $this->actingAs($user)->getJson('/api/v1/me/onboarding');
    $response->assertOk()
        ->assertJsonPath('data.completed_steps', [
            OnboardingStep::LOG_ATTENDANCE,
            OnboardingStep::MARK_PAYMENT,
        ]);
    expect($response->json('data.dismissed_at'))->not->toBeNull();
});

it('reads the steps off the academy, not off a diary of clicks (#1536)', function (): void {
    // The defect this replaces: an academy with a full roster, a year of
    // attendance and a ledger of payments still reported "0 of 5 done",
    // because the only thing that ever wrote a step was the user pressing
    // the circle on the checklist itself.
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    AttendanceRecord::factory()->for($athlete)->create();
    AthletePayment::factory()->for($athlete)->create();

    $this->actingAs($user)->getJson('/api/v1/me/onboarding')
        ->assertOk()
        ->assertJsonPath('data.completed_steps', [
            OnboardingStep::ADD_ATHLETE,
            OnboardingStep::LOG_ATTENDANCE,
            OnboardingStep::MARK_PAYMENT,
        ]);
});

it('leaves view_stats to the manual tick, because a visit leaves no trace', function (): void {
    $user = userWithAcademy();
    Athlete::factory()->for($user->academy)->create();

    $this->actingAs($user)->getJson('/api/v1/me/onboarding')
        ->assertOk()
        ->assertJsonPath('data.completed_steps', [OnboardingStep::ADD_ATHLETE]);

    $this->actingAs($user)->postJson('/api/v1/me/onboarding/steps', [
        'step' => OnboardingStep::VIEW_STATS,
    ])->assertOk()->assertJsonPath('data.completed_steps', [
        OnboardingStep::ADD_ATHLETE,
        OnboardingStep::VIEW_STATS,
    ]);
});

it('keeps a manual tick for something the academy has not done', function (): void {
    // Someone who ticks a step they do not intend to use keeps it ticked.
    $user = userWithAcademy();

    $this->actingAs($user)->postJson('/api/v1/me/onboarding/steps', [
        'step' => OnboardingStep::UPLOAD_DOCUMENT,
    ])->assertOk()->assertJsonPath('data.completed_steps', [OnboardingStep::UPLOAD_DOCUMENT]);
});

it('does not let another academy satisfy a step', function (): void {
    $mine = userWithAcademy();
    $theirs = userWithAcademy();

    $otherAthlete = Athlete::factory()->for($theirs->academy)->create();
    AttendanceRecord::factory()->for($otherAthlete)->create();

    $this->actingAs($mine)->getJson('/api/v1/me/onboarding')
        ->assertOk()
        ->assertJsonPath('data.completed_steps', []);
});

it('/me/onboarding endpoints all 401 without authentication', function (): void {
    $this->getJson('/api/v1/me/onboarding')->assertUnauthorized();
    $this->postJson('/api/v1/me/onboarding/steps', ['step' => OnboardingStep::ADD_ATHLETE])
        ->assertUnauthorized();
    $this->postJson('/api/v1/me/onboarding/dismiss')->assertUnauthorized();
});
