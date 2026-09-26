<?php

declare(strict_types=1);

use App\Actions\Notification\DeliverOwnerDigestAction;
use App\Mail\UnpaidAthletesDigestMail;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\User;
use App\Notifications\OwnerUnpaidAthletesDigestNotification;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * #1914 — the inbox is a to-do list the owner can tick things off: archived
 * rows leave it, and come back on request; alerts that are no longer true
 * leave it on their own.
 */
beforeEach(function (): void {
    $this->owner = userWithAcademy();
});

afterEach(fn () => Carbon::setTestNow());

/** @param array<string, mixed> $data */
function inboxRow(User $user, array $data, bool $read = false): DatabaseNotification
{
    /** @var DatabaseNotification $row */
    $row = $user->notifications()->create([
        'id' => (string) Str::uuid(),
        'type' => 'test',
        'data' => ['title' => 'T', 'body' => 'B', 'link' => null, ...$data],
        'read_at' => $read ? now() : null,
    ]);

    return $row;
}

function inboxIds(object $test, string $query = ''): array
{
    return collect($test->actingAs($test->owner)->getJson('/api/v1/me/notifications' . $query)->assertOk()->json('data'))
        ->pluck('id')->all();
}

// ─── By hand ─────────────────────────────────────────────────────────────────

it('takes an archived row out of the inbox, and shows it under the archived ones', function (): void {
    $row = inboxRow($this->owner, ['kind' => 'owner_athlete_missed_streak'], read: true);

    $this->actingAs($this->owner)->postJson("/api/v1/me/notifications/{$row->id}/archive")
        ->assertOk()->assertJsonPath('data.id', $row->id);

    expect(inboxIds($this))->not->toContain($row->id)
        ->and(inboxIds($this, '?archived=1'))->toContain($row->id);
});

it('brings an archived row back', function (): void {
    $row = inboxRow($this->owner, ['kind' => 'owner_athlete_missed_streak'], read: true);
    $this->actingAs($this->owner)->postJson("/api/v1/me/notifications/{$row->id}/archive")->assertOk();

    $this->actingAs($this->owner)->postJson("/api/v1/me/notifications/{$row->id}/unarchive")
        ->assertOk()->assertJsonPath('data.archived_at', null);

    expect(inboxIds($this))->toContain($row->id)
        ->and(inboxIds($this, '?archived=1'))->not->toContain($row->id);
});

it('archives only the read rows, all at once', function (): void {
    $read = inboxRow($this->owner, ['kind' => 'a'], read: true);
    $unread = inboxRow($this->owner, ['kind' => 'b']);

    $this->actingAs($this->owner)->postJson('/api/v1/me/notifications/archive-read')
        ->assertOk()->assertJsonPath('data.archived', 1);

    expect(inboxIds($this))->toBe([$unread->id])
        ->and(inboxIds($this, '?archived=1'))->toBe([$read->id]);
});

it('does not count an archived unread row on the bell', function (): void {
    $row = inboxRow($this->owner, ['kind' => 'a']);
    inboxRow($this->owner, ['kind' => 'b']);

    $this->actingAs($this->owner)->postJson("/api/v1/me/notifications/{$row->id}/archive")->assertOk();

    $this->actingAs($this->owner)->getJson('/api/v1/me/notifications')
        ->assertOk()->assertJsonPath('meta.unread_count', 1);
});

it('says when a row was archived, and nothing for one that was not', function (): void {
    Carbon::setTestNow('2026-09-26 10:00:00');
    $row = inboxRow($this->owner, ['kind' => 'a'], read: true);
    $this->actingAs($this->owner)->postJson("/api/v1/me/notifications/{$row->id}/archive")->assertOk();

    $archived = $this->actingAs($this->owner)->getJson('/api/v1/me/notifications?archived=1')->json('data.0');
    expect($archived['archived_at'])->toBe('2026-09-26T10:00:00+00:00');

    inboxRow($this->owner, ['kind' => 'b']);
    expect($this->actingAs($this->owner)->getJson('/api/v1/me/notifications')->json('data.0.archived_at'))->toBeNull();
});

it('will not touch another user\'s notification', function (): void {
    $stranger = User::factory()->create();
    $theirs = inboxRow($stranger, ['kind' => 'a']);

    $this->actingAs($this->owner)->postJson("/api/v1/me/notifications/{$theirs->id}/archive")->assertNotFound();
    $this->actingAs($this->owner)->postJson("/api/v1/me/notifications/{$theirs->id}/unarchive")->assertNotFound();
    expect($theirs->fresh()->archived_at)->toBeNull();
});

// ─── On their own ────────────────────────────────────────────────────────────

it('archives the "has not trained" alert once that athlete trains again', function (): void {
    $giorgi = Athlete::factory()->for($this->owner->academy)->create();
    $anna = Athlete::factory()->for($this->owner->academy)->create();
    $aboutGiorgi = inboxRow($this->owner, ['kind' => 'owner_athlete_missed_streak', 'athlete_id' => $giorgi->id]);
    $aboutAnna = inboxRow($this->owner, ['kind' => 'owner_athlete_missed_streak', 'athlete_id' => $anna->id]);

    AttendanceRecord::factory()->for($giorgi)->create();

    expect($aboutGiorgi->fresh()->archived_at)->not->toBeNull()
        // Anna has not come back: her alert is still true.
        ->and($aboutAnna->fresh()->archived_at)->toBeNull();
});

it('archives an older digest when a newer one of the same kind arrives', function (): void {
    config()->set('budojo.runtime', 'desktop');
    $older = inboxRow($this->owner, ['kind' => 'unpaid_athletes_digest']);
    $otherKind = inboxRow($this->owner, ['kind' => 'medical_cert_expiry_reminders']);
    $athletes = Athlete::factory()->for($this->owner->academy)->count(1)->create();

    app(DeliverOwnerDigestAction::class)->execute(
        $this->owner,
        new UnpaidAthletesDigestMail($this->owner->academy, $athletes, 2026, 9),
        new OwnerUnpaidAthletesDigestNotification($this->owner->academy, $athletes, 2026, 9),
    );

    $newest = $this->owner->notifications()->where('data->kind', 'unpaid_athletes_digest')->whereNull('archived_at')->get();
    expect($newest)->toHaveCount(1)
        ->and($newest->first()->id)->not->toBe($older->id)
        ->and($older->fresh()->archived_at)->not->toBeNull()
        ->and($otherKind->fresh()->archived_at)->toBeNull();
});
