<?php

declare(strict_types=1);

use App\Actions\Support\SubmitSupportTicketAction;
use App\Enums\SupportTicketCategory;
use App\Mail\SupportTicketMail;
use App\Models\SupportTicket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Mail::fake();
    // Throttle limiters carry state across PEST tests in the same
    // process; clear the throttle key the unnamed `throttle:5,1`
    // middleware uses for /support so individual tests in this file
    // don't bleed into each other.
    RateLimiter::clear('throttle:5,1');
});

afterEach(function (): void {
    RateLimiter::clear('throttle:5,1');
});

it('persists a support ticket row and queues the email', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/support', [
            'subject' => 'Cannot reset my password',
            'category' => 'account',
            'body' => 'I clicked the reset link in my inbox and it returns a 404 every time.',
        ])
        ->assertStatus(202)
        ->assertJsonStructure(['data' => ['id', 'created_at']]);

    expect(SupportTicket::query()->count())->toBe(1);

    $ticket = SupportTicket::query()->first();
    expect($ticket)->not->toBeNull();
    expect($ticket->user_id)->toBe($user->id);
    expect($ticket->subject)->toBe('Cannot reset my password');
    expect($ticket->category)->toBe(SupportTicketCategory::Account);
    expect($ticket->body)->toContain('reset link');

    Mail::assertQueued(SupportTicketMail::class, function (SupportTicketMail $mail) use ($user): bool {
        expect($mail->subjectLine)->toBe('Cannot reset my password');
        expect($mail->category)->toBe(SupportTicketCategory::Account);
        expect($mail->body)->toContain('reset link');
        expect($mail->userEmail)->toBe($user->email);
        expect($mail->userName)->toBe($user->name);
        expect($mail->hasTo(SubmitSupportTicketAction::SUPPORT_EMAIL))->toBeTrue();
        expect($mail->hasReplyTo($user->email))->toBeTrue();

        return true;
    });
});

it('accepts each of the four categories', function (string $value, SupportTicketCategory $expected): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/support', [
            'subject' => 'Subject for the category test',
            'category' => $value,
            'body' => 'A reasonably long body that satisfies the validator threshold.',
        ])
        ->assertStatus(202);

    /** @var SupportTicket $ticket */
    $ticket = SupportTicket::query()->latest('id')->first();
    expect($ticket->category)->toBe($expected);
})->with([
    ['account', SupportTicketCategory::Account],
    ['billing', SupportTicketCategory::Billing],
    ['bug', SupportTicketCategory::Bug],
    ['other', SupportTicketCategory::Other],
]);

it('rejects with 422 when subject is missing', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/support', [
            'category' => 'account',
            'body' => 'A reasonably long body that satisfies the validator threshold.',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['subject']);

    Mail::assertNothingQueued();
    expect(SupportTicket::query()->count())->toBe(0);
});

it('rejects with 422 when category is missing', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/support', [
            'subject' => 'Need help with billing',
            'body' => 'A reasonably long body that satisfies the validator threshold.',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['category']);

    Mail::assertNothingQueued();
});

it('rejects with 422 when category is not a valid enum case', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/support', [
            'subject' => 'Need help with marketing',
            'category' => 'marketing',
            'body' => 'A reasonably long body that satisfies the validator threshold.',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['category']);
});

it('rejects with 422 when body is missing', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/support', [
            'subject' => 'Subject is fine',
            'category' => 'bug',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['body']);
});

it('rejects with 422 when subject is too short', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/support', [
            'subject' => 'X',
            'category' => 'bug',
            'body' => 'A reasonably long body that satisfies the validator threshold.',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['subject']);
});

it('rejects with 422 when body is too short', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/support', [
            'subject' => 'Valid subject',
            'category' => 'bug',
            'body' => 'short',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['body']);
});

it('rejects with 401 when unauthenticated', function (): void {
    $this->postJson('/api/v1/support', [
        'subject' => 'Anonymous support request',
        'category' => 'account',
        'body' => 'A reasonably long body that satisfies the validator threshold.',
    ])->assertStatus(401);

    Mail::assertNothingQueued();
});

it('throttles after the 5th request in the same minute (429)', function (): void {
    $user = userWithAcademy();

    for ($i = 0; $i < 5; $i++) {
        $this->actingAs($user)
            ->postJson('/api/v1/support', [
                'subject' => "Request number {$i}",
                'category' => 'other',
                'body' => 'A reasonably long body that satisfies the validator threshold.',
            ])
            ->assertStatus(202);
    }

    $this->actingAs($user)
        ->postJson('/api/v1/support', [
            'subject' => 'Sixth request — should be throttled',
            'category' => 'other',
            'body' => 'A reasonably long body that satisfies the validator threshold.',
        ])
        ->assertStatus(429);
});

it('persists the row even when the queue insert blows up (best-effort mail)', function (): void {
    // Force the queue to throw — the action must report() and continue,
    // so the ticket row still lands and the user gets a 202.
    Mail::shouldReceive('to')->andThrow(new RuntimeException('queue down'));

    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/support', [
            'subject' => 'Queue is dead — request must still 202',
            'category' => 'other',
            'body' => 'Best-effort mail: a queue insert failure must not 500 the request.',
        ])
        ->assertStatus(202);

    expect(SupportTicket::query()->count())->toBe(1);
});

it('persists category as the enum string value, not the case name', function (): void {
    // Explicit guard against the enum-casing footgun: the DB column
    // stores `account` / `billing` / `bug` / `other`, NOT `Account`
    // / `Bug`. A future migration that reads the column raw must see
    // lower-case values.
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/support', [
            'subject' => 'Casing guard',
            'category' => 'billing',
            'body' => 'Asserting the persisted form on the underlying column.',
        ])
        ->assertStatus(202);

    $row = \DB::table('support_tickets')->latest('id')->first();
    expect($row)->not->toBeNull();
    expect($row->category)->toBe('billing');
});

it('handles a user without an academy gracefully (user_id is the only link)', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->postJson('/api/v1/support', [
            'subject' => 'Pre-setup help request',
            'category' => 'account',
            'body' => 'I cannot complete the setup wizard — the form rejects my postcode.',
        ])
        ->assertStatus(202);

    $ticket = SupportTicket::query()->first();
    expect($ticket)->not->toBeNull();
    expect($ticket->user_id)->toBe($user->id);
});
