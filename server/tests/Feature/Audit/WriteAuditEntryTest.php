<?php

declare(strict_types=1);

use App\Actions\Audit\WriteAuditEntry;
use App\Models\Athlete;
use App\Models\AuditEntry;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

beforeEach(function (): void {
    Carbon::setTestNow(Carbon::parse('2026-05-21 09:00:00'));
});

afterEach(function (): void {
    Carbon::setTestNow();
});

// ─── Happy path ────────────────────────────────────────────────────

it('persists every column on a typical observer write', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create(['first_name' => 'Mario', 'last_name' => 'Rossi']);

    $action = app(WriteAuditEntry::class);
    $entry = $action->execute(
        action: 'athlete.belt.promoted',
        actor: $user,
        academy: $user->academy,
        subjectType: Athlete::class,
        subjectId: $mario->id,
        subjectLabel: 'Mario Rossi',
        before: ['belt' => 'blue', 'stripes' => 4],
        after: ['belt' => 'purple', 'stripes' => 0],
        ip: '203.0.113.42',
        userAgent: 'Mozilla/5.0 (Macintosh) Test/1.0',
    );

    expect($entry)->not->toBeNull();
    expect($entry->action)->toBe('athlete.belt.promoted');
    expect($entry->actor_user_id)->toBe($user->id);
    expect($entry->actor_label)->toBe($user->full_name);
    expect($entry->academy_id)->toBe($user->academy->id);
    expect($entry->subject_type)->toBe(Athlete::class);
    expect($entry->subject_id)->toBe($mario->id);
    expect($entry->subject_label)->toBe('Mario Rossi');
    expect($entry->before)->toBe(['belt' => 'blue', 'stripes' => 4]);
    expect($entry->after)->toBe(['belt' => 'purple', 'stripes' => 0]);
    expect($entry->ip)->toBe('203.0.113.42');
    expect($entry->user_agent)->toBe('Mozilla/5.0 (Macintosh) Test/1.0');
    expect($entry->created_at?->toDateTimeString())->toBe('2026-05-21 09:00:00');
});

// ─── System actor (no logged-in user) ───────────────────────────────

it('writes actor_label="system" when no actor is supplied', function (): void {
    $action = app(WriteAuditEntry::class);
    $entry = $action->execute(action: 'audit.pruned');

    expect($entry)->not->toBeNull();
    expect($entry->actor_user_id)->toBeNull();
    expect($entry->actor_label)->toBe('system');
});

// ─── Defensive truncation of user_agent ─────────────────────────────

it('truncates user-agent to 512 characters at write time', function (): void {
    $longUa = str_repeat('A', 1024);

    $entry = app(WriteAuditEntry::class)->execute(
        action: 'athlete.created',
        userAgent: $longUa,
    );

    expect($entry)->not->toBeNull();
    expect(mb_strlen($entry->user_agent ?? ''))->toBe(512);
    expect($entry->user_agent)->toBe(str_repeat('A', 512));
});

// ─── Failure mode — never throws upward ─────────────────────────────

it('swallows write failures and logs them as warning (no exception bubbles)', function (): void {
    Log::shouldReceive('warning')->once();

    // Force a write failure by removing the underlying table. The
    // `\Throwable` catch in WriteAuditEntry must convert the
    // QueryException into a `null` return + Log::warning, so the
    // user request never fails because audit logging failed.
    //
    // RefreshDatabase rolls the database back at the end of the
    // test, so the table reappears for sibling specs. This path is
    // DB-engine agnostic (works on SQLite + MySQL identically),
    // unlike a VARCHAR-length overflow which SQLite silently
    // accepts.
    Schema::drop('audit_entries');

    $entry = app(WriteAuditEntry::class)->execute(action: 'athlete.created');

    expect($entry)->toBeNull();
});

// ─── JSON cast round-trip ───────────────────────────────────────────

it('reads before/after back as arrays via the model cast', function (): void {
    app(WriteAuditEntry::class)->execute(
        action: 'payment.updated',
        before: ['amount_cents' => 5000],
        after: ['amount_cents' => 6000],
    );

    $entry = AuditEntry::first();
    expect($entry)->not->toBeNull();
    expect($entry->before)->toBeArray();
    expect($entry->before['amount_cents'])->toBe(5000);
    expect($entry->after['amount_cents'])->toBe(6000);
});

// ─── Append-only — no updated_at column drift ───────────────────────

it('does not write or surface an updated_at column (append-only)', function (): void {
    app(WriteAuditEntry::class)->execute(action: 'athlete.created');
    $entry = AuditEntry::first();

    // Eloquent's `$timestamps = false` keeps the model silent on
    // updated_at; the column doesn't exist on the table either.
    expect(array_key_exists('updated_at', $entry->getAttributes()))->toBeFalse();
});
