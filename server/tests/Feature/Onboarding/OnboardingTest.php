<?php

declare(strict_types=1);

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

it('/me/onboarding endpoints all 401 without authentication', function (): void {
    $this->getJson('/api/v1/me/onboarding')->assertUnauthorized();
    $this->postJson('/api/v1/me/onboarding/steps', ['step' => OnboardingStep::ADD_ATHLETE])
        ->assertUnauthorized();
    $this->postJson('/api/v1/me/onboarding/dismiss')->assertUnauthorized();
});
