<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\User;
use App\Services\PwnedPasswordsClient;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Support\Facades\Notification;

/**
 * What the desktop profile does with the surfaces it lacks (#1229). Every test
 * here has a web twin elsewhere in the suite that still passes unchanged —
 * the point is that the same code answers differently by profile, not that
 * anything was removed.
 */

// ── Gated routes answer 404, never 403 ───────────────────────────────────────

it('hides the community surface on the desktop', function (): void {
    config()->set('budojo.runtime', 'desktop');
    $owner = userWithAcademy();

    $this->actingAs($owner)->getJson('/api/v1/community/feed')->assertNotFound();
    $this->actingAs($owner)->postJson('/api/v1/community/posts', ['body' => 'hi'])->assertNotFound();
});

it('hides athlete invitations on the desktop', function (): void {
    config()->set('budojo.runtime', 'desktop');
    $owner = userWithAcademy();
    $athlete = Athlete::factory()->for($owner->academy)->create(['email' => 'a@example.test']);

    $this->actingAs($owner)->postJson("/api/v1/athletes/{$athlete->id}/invite")->assertNotFound();
    $this->getJson('/api/v1/athlete-invite/' . str_repeat('a', 64) . '/preview')->assertNotFound();
});

it('hides web push on the desktop', function (): void {
    config()->set('budojo.runtime', 'desktop');
    $owner = userWithAcademy();

    $this->actingAs($owner)->getJson('/api/v1/me/push-subscriptions')->assertNotFound();
});

it('hides public profiles on the desktop', function (): void {
    // Inside the auth group, so the probe is authenticated: this pins the
    // capability gate, not the 401 that would fire first for a stranger.
    config()->set('budojo.runtime', 'desktop');
    $viewer = userWithAcademy();
    User::factory()->create(['handle' => 'someone']);

    $this->actingAs($viewer)->getJson('/api/v1/users/someone/profile')->assertNotFound();
});

it('keeps every one of those routes on the web profile', function (): void {
    // The mirror image: the gate is the profile, not the code.
    config()->set('budojo.runtime', 'web');
    $owner = userWithAcademy();

    $this->actingAs($owner)->getJson('/api/v1/community/feed')->assertOk();
    $this->actingAs($owner)->getJson('/api/v1/me/push-subscriptions')->assertOk();
});

it('rejects an unknown capability name in a route definition loudly', function (): void {
    // A typo in routes/api_v1.php must not silently gate nothing.
    $middleware = new App\Http\Middleware\RequireCapability();

    expect(fn () => $middleware->handle(request(), fn () => response(), 'no_such_thing'))
        ->toThrow(InvalidArgumentException::class);
});

// ── Registration on a runtime with no mail transport ─────────────────────────

it('registers a desktop user already verified and sends no verification mail', function (): void {
    // With no transport the verification link can never arrive; requiring it
    // would lock the owner out of every athlete and document write forever.
    config()->set('budojo.runtime', 'desktop');
    Notification::fake();

    $this->postJson('/api/v1/auth/register', [
        'first_name' => 'Owner',
        'last_name' => 'Desktop',
        'email' => 'owner@desktop.test',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
        'terms_accepted' => true,
    ])->assertCreated();

    $user = User::where('email', 'owner@desktop.test')->firstOrFail();

    expect($user->hasVerifiedEmail())->toBeTrue();
    Notification::assertNotSentTo($user, VerifyEmail::class);
});

it('still registers a web user unverified with the verification mail queued', function (): void {
    config()->set('budojo.runtime', 'web');
    Notification::fake();

    $this->postJson('/api/v1/auth/register', [
        'first_name' => 'Owner',
        'last_name' => 'Web',
        'email' => 'owner@web.test',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
        'terms_accepted' => true,
    ])->assertCreated();

    $user = User::where('email', 'owner@web.test')->firstOrFail();

    expect($user->hasVerifiedEmail())->toBeFalse();
    Notification::assertSentTo($user, VerifyEmail::class);
});

it('lets an unverified user through the verified.api gate on the desktop', function (): void {
    // Belt and braces for a database that predates auto-verify: the gate is
    // meaningless where the link cannot arrive.
    config()->set('budojo.runtime', 'desktop');
    $owner = User::factory()->unverified()->create();
    App\Models\Academy::factory()->for($owner, 'owner')->create();

    $this->actingAs($owner->fresh())
        ->postJson('/api/v1/athletes', [
            'first_name' => 'New',
            'last_name' => 'Athlete',
            'belt' => 'white',
            'status' => 'active',
            'joined_at' => '2026-01-10',
        ])
        ->assertCreated();
});

// ── Password breach check needs outbound HTTPS ──────────────────────────────

it('skips the breach check on the desktop even for a breached password', function (): void {
    config()->set('budojo.runtime', 'desktop');
    $this->app->instance(PwnedPasswordsClient::class, new class () extends PwnedPasswordsClient {
        public function __construct()
        {
        }

        public function isPwned(string $password): bool
        {
            return true;
        }
    });

    $this->postJson('/api/v1/auth/register', [
        'first_name' => 'Owner',
        'last_name' => 'Desktop',
        'email' => 'breached@desktop.test',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
        'terms_accepted' => true,
    ])->assertCreated();
});

it('still enforces the breach check on the web', function (): void {
    config()->set('budojo.runtime', 'web');
    $this->app->instance(PwnedPasswordsClient::class, new class () extends PwnedPasswordsClient {
        public function __construct()
        {
        }

        public function isPwned(string $password): bool
        {
            return true;
        }
    });

    $this->postJson('/api/v1/auth/register', [
        'first_name' => 'Owner',
        'last_name' => 'Web',
        'email' => 'breached@web.test',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
        'terms_accepted' => true,
    ])->assertUnprocessable();
});
