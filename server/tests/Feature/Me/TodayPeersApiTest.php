<?php

declare(strict_types=1);

use App\Enums\AttendanceSource;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\User;
use Carbon\Carbon;

/**
 * `GET /api/v1/me/attendance/today/peers` (#958) — peers from the
 * caller's academy whose attendance row exists for today. Drives the
 * "Chi viene stasera?" preview row above the self-mark button.
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
});

/**
 * @return array{User, Athlete}
 */
function authedPeerAthlete(Academy $academy): array
{
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['user_id' => null]);
    /** @var User $user */
    $user = User::factory()->create(['role' => 'athlete']);
    $athlete->update(['user_id' => $user->id]);

    return [$user, $athlete];
}

it('returns athletes from the same academy who have an attendance row for today', function (): void {
    [$user, $athlete] = authedPeerAthlete($this->academy);
    [, $peerA] = authedPeerAthlete($this->academy);
    [, $peerB] = authedPeerAthlete($this->academy);

    // Two peers marked today.
    AttendanceRecord::factory()->for($peerA)->create([
        'attended_on' => Carbon::today()->toDateString(),
        'source' => AttendanceSource::Self,
    ]);
    AttendanceRecord::factory()->for($peerB)->create([
        'attended_on' => Carbon::today()->toDateString(),
        'source' => AttendanceSource::Instructor,
    ]);

    $response = $this->actingAs($user)
        ->getJson('/api/v1/me/attendance/today/peers')
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id')->all();
    expect($ids)->toContain($peerA->id, $peerB->id);
});

it('excludes athletes from OTHER academies', function (): void {
    [$user] = authedPeerAthlete($this->academy);
    $otherAcademy = userWithAcademy()->academy;
    [, $otherPeer] = authedPeerAthlete($otherAcademy);

    AttendanceRecord::factory()->for($otherPeer)->create([
        'attended_on' => Carbon::today()->toDateString(),
        'source' => AttendanceSource::Self,
    ]);

    $response = $this->actingAs($user)
        ->getJson('/api/v1/me/attendance/today/peers')
        ->assertOk();

    expect($response->json('data'))->toBe([]);
});

it('excludes athletes who opted out via attendance_peer_visible = false', function (): void {
    [$user] = authedPeerAthlete($this->academy);
    [$peerUser, $peerAthlete] = authedPeerAthlete($this->academy);
    $peerUser->update(['attendance_peer_visible' => false]);

    AttendanceRecord::factory()->for($peerAthlete)->create([
        'attended_on' => Carbon::today()->toDateString(),
        'source' => AttendanceSource::Self,
    ]);

    $response = $this->actingAs($user)
        ->getJson('/api/v1/me/attendance/today/peers')
        ->assertOk();

    expect($response->json('data'))->toBe([]);
});

it('does NOT leak full last_name — only the initial', function (): void {
    [$user] = authedPeerAthlete($this->academy);
    [, $peer] = authedPeerAthlete($this->academy);
    $peer->update(['first_name' => 'Mario', 'last_name' => 'Rossi']);
    AttendanceRecord::factory()->for($peer)->create([
        'attended_on' => Carbon::today()->toDateString(),
        'source' => AttendanceSource::Self,
    ]);

    $response = $this->actingAs($user)
        ->getJson('/api/v1/me/attendance/today/peers')
        ->assertOk();

    $row = $response->json('data.0');
    expect($row['first_name'])->toBe('Mario');
    expect($row['last_name_initial'])->toBe('R');
    expect($row)->not->toHaveKey('last_name');
});

it('excludes yesterday rows (today-only)', function (): void {
    [$user] = authedPeerAthlete($this->academy);
    [, $peer] = authedPeerAthlete($this->academy);

    AttendanceRecord::factory()->for($peer)->create([
        'attended_on' => Carbon::yesterday()->toDateString(),
        'source' => AttendanceSource::Self,
    ]);

    $response = $this->actingAs($user)
        ->getJson('/api/v1/me/attendance/today/peers')
        ->assertOk();

    expect($response->json('data'))->toBe([]);
});

it('returns empty list when nobody is marked yet', function (): void {
    [$user] = authedPeerAthlete($this->academy);

    $this->actingAs($user)
        ->getJson('/api/v1/me/attendance/today/peers')
        ->assertOk()
        ->assertExactJson(['data' => []]);
});

it('caps the preview at 8 athletes', function (): void {
    [$user] = authedPeerAthlete($this->academy);
    // 10 peers, all marked today — preview should top out at 8.
    for ($i = 0; $i < 10; $i++) {
        [, $peer] = authedPeerAthlete($this->academy);
        AttendanceRecord::factory()->for($peer)->create([
            'attended_on' => Carbon::today()->toDateString(),
            'source' => AttendanceSource::Self,
        ]);
    }

    $response = $this->actingAs($user)
        ->getJson('/api/v1/me/attendance/today/peers')
        ->assertOk();

    expect(count($response->json('data')))->toBe(8);
});

it('returns 404 when the caller has no linked athlete row', function (): void {
    $owner = userWithAcademy();

    $this->actingAs($owner)
        ->getJson('/api/v1/me/attendance/today/peers')
        ->assertStatus(404)
        ->assertExactJson(['message' => 'No athlete profile found.']);
});

it('rejects unauthenticated callers with 401', function (): void {
    $this->getJson('/api/v1/me/attendance/today/peers')->assertStatus(401);
});
