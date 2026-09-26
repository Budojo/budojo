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

it('archives only the read rows, all at once, and says which', function (): void {
    $read = inboxRow($this->owner, ['kind' => 'a'], read: true);
    $unread = inboxRow($this->owner, ['kind' => 'b']);

    $this->actingAs($this->owner)->postJson('/api/v1/me/notifications/archive-read')
        ->assertOk()->assertJsonPath('data.archived', 1)->assertJsonPath('data.ids', [$read->id]);

    expect(inboxIds($this))->toBe([$unread->id])
        ->and(inboxIds($this, '?archived=1'))->toBe([$read->id]);
});

it('brings back a whole batch in one request, and only the user\'s own', function (): void {
    // "Annulla" after "Archivia le lette": every row it took, not only the
    // twenty the page had loaded.
    $rows = collect(range(1, 25))->map(fn (): DatabaseNotification => inboxRow($this->owner, ['kind' => 'a'], read: true));
    $ids = $this->actingAs($this->owner)->postJson('/api/v1/me/notifications/archive-read')->json('data.ids');
    $theirs = inboxRow(User::factory()->create(), ['kind' => 'a'], read: true);
    $theirs->forceFill(['archived_at' => now()])->save();

    $this->actingAs($this->owner)->postJson('/api/v1/me/notifications/unarchive', ['ids' => [...$ids, $theirs->id]])
        ->assertOk()->assertJsonPath('data.unarchived', 25);

    expect($rows->every(fn (DatabaseNotification $r): bool => $r->fresh()->archived_at === null))->toBeTrue()
        ->and($theirs->fresh()->archived_at)->not->toBeNull();
});

it('refuses a batch that is not a list of ids', function (): void {
    $this->actingAs($this->owner)->postJson('/api/v1/me/notifications/unarchive', ['ids' => 'nope'])
        ->assertUnprocessable()->assertJsonValidationErrors(['ids']);
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

    AttendanceRecord::factory()->for($giorgi)->create(['attended_on' => now()->toDateString()]);

    expect($aboutGiorgi->fresh()->archived_at)->not->toBeNull()
        // Anna has not come back: her alert is still true.
        ->and($aboutAnna->fresh()->archived_at)->toBeNull();
});

it('leaves the alert alone when an old register is filled in', function (): void {
    // A presence dated before the alert says nothing about whether the
    // athlete has come back since.
    Carbon::setTestNow('2026-09-20 10:00:00');
    $giorgi = Athlete::factory()->for($this->owner->academy)->create();
    $alert = inboxRow($this->owner, ['kind' => 'owner_athlete_missed_streak', 'athlete_id' => $giorgi->id]);

    AttendanceRecord::factory()->for($giorgi)->create(['attended_on' => '2026-08-20']);

    expect($alert->fresh()->archived_at)->toBeNull();
});

it('archives an older unpaid digest when a newer one arrives', function (): void {
    config()->set('budojo.runtime', 'desktop');
    $older = inboxRow($this->owner, ['kind' => 'unpaid_athletes_digest', 'year' => 2026, 'month' => 8]);
    $sameMonth = inboxRow($this->owner, ['kind' => 'unpaid_athletes_digest', 'year' => 2026, 'month' => 9]);
    // A later month is not made stale by an earlier one (a `--month` backfill).
    $later = inboxRow($this->owner, ['kind' => 'unpaid_athletes_digest', 'year' => 2026, 'month' => 10]);
    // Other digests list only what crossed a threshold today: not a restatement.
    $otherKind = inboxRow($this->owner, ['kind' => 'medical_cert_expiry_reminders']);
    $athletes = Athlete::factory()->for($this->owner->academy)->count(1)->create();

    app(DeliverOwnerDigestAction::class)->execute(
        $this->owner,
        new UnpaidAthletesDigestMail($this->owner->academy, $athletes, 2026, 9),
        new OwnerUnpaidAthletesDigestNotification($this->owner->academy, $athletes, 2026, 9),
    );

    expect($older->fresh()->archived_at)->not->toBeNull()
        ->and($sameMonth->fresh()->archived_at)->not->toBeNull()
        ->and($later->fresh()->archived_at)->toBeNull()
        ->and($otherKind->fresh()->archived_at)->toBeNull()
        ->and($this->owner->notifications()->whereNull('archived_at')->where('data->kind', 'unpaid_athletes_digest')->count())->toBe(2);
});

it('does not archive an older medical-certificate digest with a newer one', function (): void {
    config()->set('budojo.runtime', 'desktop');
    $mario = inboxRow($this->owner, ['kind' => 'medical_cert_expiry_reminders']);
    $documents = new \Illuminate\Database\Eloquent\Collection();

    app(DeliverOwnerDigestAction::class)->execute(
        $this->owner,
        new \App\Mail\MedicalCertificateExpiringMail($this->owner->academy, $documents),
        new \App\Notifications\OwnerMedicalCertExpiringDigestNotification($this->owner->academy, $documents),
    );

    // Tomorrow's "Anna expires in 30 days" is not today's "Mario in 7".
    expect($mario->fresh()->archived_at)->toBeNull();
});
