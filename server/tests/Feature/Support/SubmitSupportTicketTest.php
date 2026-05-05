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

it('accepts each of the five categories', function (string $value, SupportTicketCategory $expected): void {
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
    ['feedback', SupportTicketCategory::Feedback],
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

it('captures the X-Budojo-Version header + User-Agent into the ticket row', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->withHeaders([
            'X-Budojo-Version' => 'v1.17.0',
            'User-Agent' => 'Mozilla/5.0 (TestRunner) Cypress/15.14',
        ])
        ->postJson('/api/v1/support', [
            'subject' => 'Server-derived metadata test',
            'category' => 'bug',
            'body' => 'The version + UA must land on the row, not be asked from the user.',
        ])
        ->assertStatus(202);

    /** @var SupportTicket $ticket */
    $ticket = SupportTicket::query()->latest('id')->first();
    expect($ticket->app_version)->toBe('v1.17.0');
    expect($ticket->user_agent)->toContain('Cypress/15.14');

    Mail::assertQueued(SupportTicketMail::class, function (SupportTicketMail $mail): bool {
        expect($mail->appVersion)->toBe('v1.17.0');
        expect($mail->userAgent)->toContain('Cypress/15.14');

        return true;
    });
});

it('falls back to "unknown" on the Mailable when the headers are missing', function (): void {
    // The DB columns stay null when the headers aren't sent — the
    // Mailable substitutes "unknown" so the support inbox doesn't
    // render a literal blank line.
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/support', [
            'subject' => 'Missing headers',
            'category' => 'bug',
            'body' => 'A reasonably long body that satisfies the validator threshold.',
        ])
        ->assertStatus(202);

    /** @var SupportTicket $ticket */
    $ticket = SupportTicket::query()->latest('id')->first();
    expect($ticket->app_version)->toBeNull();
    // PHPUnit's HTTP client always sends a User-Agent ("Symfony BrowserKit"),
    // so the row column is never empty in the test harness — but the
    // Mailable's behaviour when both are missing is the contract we
    // care about; assert via direct Mail::queue inspection.

    Mail::assertQueued(SupportTicketMail::class, function (SupportTicketMail $mail): bool {
        expect($mail->appVersion)->toBe('unknown');

        return true;
    });
});

it('truncates an absurdly long User-Agent to fit the 512-char column', function (): void {
    $user = userWithAcademy();

    $longUa = str_repeat('A', 800);

    $this->actingAs($user)
        ->withHeaders(['User-Agent' => $longUa])
        ->postJson('/api/v1/support', [
            'subject' => 'UA truncation guard',
            'category' => 'bug',
            'body' => 'Some testing tools emit very long UA strings that would otherwise blow the schema.',
        ])
        ->assertStatus(202);

    /** @var SupportTicket $ticket */
    $ticket = SupportTicket::query()->latest('id')->first();
    expect(mb_strlen((string) $ticket->user_agent))->toBe(512);
});

it('attaches the optional screenshot to the queued mail without persisting it', function (): void {
    $user = userWithAcademy();

    $screenshot = \Illuminate\Http\UploadedFile::fake()->image('bug.png', 200, 200);

    $this->actingAs($user)
        ->postJson('/api/v1/support', [
            'subject' => 'Bug with screenshot',
            'category' => 'bug',
            'body' => 'See the attached screenshot — the button is mis-aligned.',
            'image' => $screenshot,
        ])
        ->assertStatus(202);

    Mail::assertQueued(SupportTicketMail::class, function (SupportTicketMail $mail): bool {
        expect($mail->imagePath)->not->toBeNull();
        expect($mail->imageOriginalName)->toBe('bug.png');

        return true;
    });
});

it('rejects a non-image upload with 422', function (): void {
    $user = userWithAcademy();

    $pdf = \Illuminate\Http\UploadedFile::fake()->create('report.pdf', 100, 'application/pdf');

    $this->actingAs($user)
        ->postJson('/api/v1/support', [
            'subject' => 'Wrong attachment type',
            'category' => 'bug',
            'body' => 'A reasonably long body that satisfies the validator threshold.',
            'image' => $pdf,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['image']);

    Mail::assertNothingQueued();
});

it('rejects an oversized screenshot (> 5 MB) with 422', function (): void {
    $user = userWithAcademy();

    $tooBig = \Illuminate\Http\UploadedFile::fake()->image('huge.png')->size(5121);

    $this->actingAs($user)
        ->postJson('/api/v1/support', [
            'subject' => 'Oversized screenshot',
            'category' => 'bug',
            'body' => 'A reasonably long body that satisfies the validator threshold.',
            'image' => $tooBig,
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['image']);
});
