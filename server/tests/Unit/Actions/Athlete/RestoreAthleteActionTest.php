<?php

declare(strict_types=1);

use App\Actions\Athlete\RestoreAthleteAction;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('flips deleted_at back to null and returns the refreshed model (#1021)', function (): void {
    /** @var User $owner */
    $owner = User::factory()->create();
    /** @var Academy $academy */
    $academy = Academy::factory()->for($owner, 'owner')->create();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create();
    $athlete->delete();
    expect($athlete->fresh()->trashed())->toBeTrue();

    $action = new RestoreAthleteAction();
    $restored = $action->execute($athlete);

    expect($restored->trashed())->toBeFalse();
    expect($restored->id)->toBe($athlete->id);
});

it('is idempotent — calling on a non-trashed athlete is a no-op', function (): void {
    /** @var User $owner */
    $owner = User::factory()->create();
    /** @var Academy $academy */
    $academy = Academy::factory()->for($owner, 'owner')->create();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create();
    expect($athlete->trashed())->toBeFalse();

    $action = new RestoreAthleteAction();
    $result = $action->execute($athlete);

    expect($result->trashed())->toBeFalse();
    expect($result->id)->toBe($athlete->id);
});
