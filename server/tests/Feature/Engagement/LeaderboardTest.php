<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Monthly mat-hours leaderboard endpoint (#962).
 */

beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
});

function makeLeaderboardAthlete(Academy $academy, int $sessionsThisMonth, ?bool $leaderboardVisible = true): array
{
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create(['user_id' => null]);
    /** @var User $user */
    $user = User::factory()->create([
        'role' => 'athlete',
        'leaderboard_visible' => $leaderboardVisible,
    ]);
    $athlete->update(['user_id' => $user->id]);

    $month = CarbonImmutable::now()->startOfMonth();
    for ($i = 0; $i < $sessionsThisMonth; $i++) {
        AttendanceRecord::factory()->for($athlete)->create([
            'attended_on' => $month->addDays($i)->toDateString(),
        ]);
    }

    return [$user, $athlete];
}

it('returns top 5 athletes ranked by session count desc', function (): void {
    // 6 athletes with sessions 3,5,2,7,1,4 — top 5 (in order) = 7,5,4,3,2
    $counts = [3, 5, 2, 7, 1, 4];
    foreach ($counts as $c) {
        makeLeaderboardAthlete($this->academy, $c);
    }

    $response = $this->actingAs($this->owner)
        ->getJson('/api/v1/attendance/leaderboard')
        ->assertOk();

    $data = $response->json('data');
    expect(count($data))->toBe(5);
    expect(array_column($data, 'sessions'))->toBe([7, 5, 4, 3, 2]);
});

it('caps at 5 even when more athletes are tied at the same threshold', function (): void {
    for ($i = 0; $i < 10; $i++) {
        makeLeaderboardAthlete($this->academy, 3);
    }

    $response = $this->actingAs($this->owner)
        ->getJson('/api/v1/attendance/leaderboard')
        ->assertOk();

    expect(count($response->json('data')))->toBe(5);
});

it('anonymises rows where the user opted out (counts still rank)', function (): void {
    [$user, $athlete] = makeLeaderboardAthlete($this->academy, 10, /* leaderboard_visible */ false);
    $athlete->update(['first_name' => 'Mario', 'last_name' => 'Rossi']);
    $user->update(['leaderboard_visible' => false]);

    $response = $this->actingAs($this->owner)
        ->getJson('/api/v1/attendance/leaderboard')
        ->assertOk();

    $first = $response->json('data.0');
    expect($first['anonymous'])->toBeTrue();
    expect($first['first_name'])->toBe('');
    expect($first['last_name_initial'])->toBe('');
    // The session count is still emitted — rank order is faithful.
    expect($first['sessions'])->toBe(10);
});

it('flags the calling athletes own row with is_self:true', function (): void {
    [$user, $athlete] = makeLeaderboardAthlete($this->academy, 5);
    // A peer with more sessions to ensure self isn't always rank #1.
    makeLeaderboardAthlete($this->academy, 8);

    $response = $this->actingAs($user)
        ->getJson('/api/v1/attendance/leaderboard')
        ->assertOk();

    $selfRow = collect($response->json('data'))->firstWhere('athlete_id', $athlete->id);
    expect($selfRow['is_self'])->toBeTrue();
    // Owners never get is_self because they have no athlete row of their own.
    $ownerResponse = $this->actingAs($this->owner)
        ->getJson('/api/v1/attendance/leaderboard')
        ->assertOk();
    foreach ($ownerResponse->json('data') as $row) {
        expect($row['is_self'])->toBeFalse();
    }
});

it('scopes to the calling athletes academy', function (): void {
    [$user] = makeLeaderboardAthlete($this->academy, 5);
    // Athlete in a different academy with way more sessions.
    $otherAcademy = userWithAcademy()->academy;
    makeLeaderboardAthlete($otherAcademy, 20);

    $response = $this->actingAs($user)
        ->getJson('/api/v1/attendance/leaderboard')
        ->assertOk();

    $maxSessions = max(array_column($response->json('data'), 'sessions'));
    expect($maxSessions)->toBe(5); // Other academy excluded.
});

it('accepts an explicit ?month=YYYY-MM and uses it for the window', function (): void {
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($this->academy)->create();
    AttendanceRecord::factory()->for($athlete)->create([
        'attended_on' => '2026-03-15',
    ]);
    AttendanceRecord::factory()->for($athlete)->create([
        'attended_on' => '2026-04-15',
    ]);

    $marchResponse = $this->actingAs($this->owner)
        ->getJson('/api/v1/attendance/leaderboard?month=2026-03')
        ->assertOk();
    expect($marchResponse->json('data.0.sessions'))->toBe(1);
    expect($marchResponse->json('meta.month'))->toBe('2026-03');

    $aprilResponse = $this->actingAs($this->owner)
        ->getJson('/api/v1/attendance/leaderboard?month=2026-04')
        ->assertOk();
    expect($aprilResponse->json('data.0.sessions'))->toBe(1);
});

it('rejects malformed month with 422', function (): void {
    $this->actingAs($this->owner)
        ->getJson('/api/v1/attendance/leaderboard?month=2026-13')
        ->assertStatus(422);
});

it('returns 404 for callers with no academy context', function (): void {
    // A user with role=athlete but no linked athlete row.
    $orphan = User::factory()->create(['role' => 'athlete']);
    $this->actingAs($orphan)
        ->getJson('/api/v1/attendance/leaderboard')
        ->assertStatus(404);
});

it('rejects unauthenticated callers with 401', function (): void {
    $this->getJson('/api/v1/attendance/leaderboard')->assertStatus(401);
});
