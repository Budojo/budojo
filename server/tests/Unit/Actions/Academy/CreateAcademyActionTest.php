<?php

declare(strict_types=1);

use App\Actions\Academy\CreateAcademyAction;
use App\Actions\Address\SyncAddressAction;
use App\Models\Academy;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

it('creates an academy with a slug + ties it to the calling user (#1021)', function (): void {
    /** @var User $user */
    $user = User::factory()->create();

    $action = new CreateAcademyAction(new SyncAddressAction());
    $academy = $action->execute(user: $user, name: 'Akademia Roma BJJ');

    expect($academy)->toBeInstanceOf(Academy::class);
    expect($academy->user_id)->toBe($user->id);
    expect($academy->name)->toBe('Akademia Roma BJJ');
    // Slug shape: kebab(name) + '-' + 8 chars. The 8-char suffix is
    // randomised — pin only the prefix so the spec isn't flaky.
    expect($academy->slug)->toStartWith('akademia-roma-bjj-');
    expect(strlen($academy->slug))->toBe(strlen('akademia-roma-bjj-') + 8);
});

it('upserts the polymorphic address row when one is supplied', function (): void {
    /** @var User $user */
    $user = User::factory()->create();
    $address = [
        'line1' => 'Via Roma 1',
        'city' => 'Torino',
        'province' => 'TO',
        'postal_code' => '10100',
        'country' => 'IT',
    ];

    $action = new CreateAcademyAction(new SyncAddressAction());
    $academy = $action->execute(user: $user, name: 'Test BJJ', address: $address);

    expect($academy->address)->not->toBeNull();
    expect($academy->address->city)->toBe('Torino');
});

it('rolls back the academy row when the address sync throws — transactional invariant', function (): void {
    /** @var User $user */
    $user = User::factory()->create();
    $countBefore = DB::table('academies')->count();

    // SyncAddressAction stub that throws after the academy was created.
    $brokenSync = new class () extends SyncAddressAction {
        public function execute($morph, ?array $payload): void
        {
            throw new \RuntimeException('simulated address-sync failure');
        }
    };

    $action = new CreateAcademyAction($brokenSync);

    expect(fn () => $action->execute(
        user: $user,
        name: 'Test',
        address: ['line1' => '1', 'city' => 'X', 'province' => 'P', 'postal_code' => '0', 'country' => 'IT'],
    ))->toThrow(\RuntimeException::class, 'simulated address-sync failure');

    expect(DB::table('academies')->count())->toBe($countBefore);
});

it('persists training_days as JSON when supplied', function (): void {
    /** @var User $user */
    $user = User::factory()->create();

    $action = new CreateAcademyAction(new SyncAddressAction());
    $academy = $action->execute(
        user: $user,
        name: 'BJJ Days',
        trainingDays: [1, 3, 5], // Monday / Wednesday / Friday
    );

    expect($academy->training_days)->toBe([1, 3, 5]);
});
