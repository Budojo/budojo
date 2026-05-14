<?php

declare(strict_types=1);

use App\Authorization\Capability;
use App\Authorization\RoleCapabilities;
use App\Enums\MembershipRole;

/**
 * (#427 / #428 / #716) Walks the capability matrix in PRD § 4 row by
 * row and asserts every cell matches. A drift between the spec table
 * and `RoleCapabilities::MATRIX` fails the spec — the spec lines
 * below are deliberately a verbatim copy of the matrix's "✓" cells.
 */

/**
 * @return array<string, list<Capability>>
 */
function prdExpectedMatrix(): array
{
    return [
        'owner' => [
            Capability::AcademySettingsRead, Capability::AcademySettingsUpdate,
            Capability::TeamList, Capability::TeamInvite, Capability::TeamRevoke, Capability::TeamChangeRole,
            Capability::AthletesRead, Capability::AthletesCreateUpdate, Capability::AthletesDelete, Capability::AthletesRestore,
            Capability::DocumentsRead, Capability::DocumentsUpload, Capability::DocumentsDelete,
            Capability::AttendanceRead, Capability::AttendanceRecord,
            Capability::PaymentsRead, Capability::PaymentsMarkPaid, Capability::PaymentsMarkUnpaid,
            Capability::PromotionsRecord,
            Capability::CommunityPostEvent, Capability::CommunityFeedInteract,
            Capability::StatsView,
        ],
        'admin' => [
            Capability::AcademySettingsRead, Capability::AcademySettingsUpdate,
            Capability::TeamList, Capability::TeamInvite, Capability::TeamRevoke,
            Capability::AthletesRead, Capability::AthletesCreateUpdate, Capability::AthletesDelete, Capability::AthletesRestore,
            Capability::DocumentsRead, Capability::DocumentsUpload, Capability::DocumentsDelete,
            Capability::AttendanceRead, Capability::AttendanceRecord,
            Capability::PaymentsRead, Capability::PaymentsMarkPaid, Capability::PaymentsMarkUnpaid,
            Capability::PromotionsRecord,
            Capability::CommunityPostEvent, Capability::CommunityFeedInteract,
            Capability::StatsView,
        ],
        'instructor' => [
            Capability::AcademySettingsRead,
            Capability::TeamList,
            Capability::AthletesRead, Capability::AthletesCreateUpdate,
            Capability::DocumentsRead, Capability::DocumentsUpload,
            Capability::AttendanceRead, Capability::AttendanceRecord,
            Capability::PaymentsRead, Capability::PaymentsMarkPaid,
            Capability::PromotionsRecord,
            Capability::CommunityPostEvent, Capability::CommunityFeedInteract,
            Capability::StatsView,
        ],
        'assistant' => [
            Capability::AcademySettingsRead,
            Capability::TeamList,
            Capability::AthletesRead,
            Capability::DocumentsRead,
            Capability::AttendanceRead, Capability::AttendanceRecord,
            Capability::PaymentsRead, Capability::PaymentsMarkPaid,
            Capability::CommunityFeedInteract,
            Capability::StatsView,
        ],
    ];
}

it('matches the PRD § 4 matrix row by row', function (): void {
    foreach (MembershipRole::cases() as $role) {
        $expected = prdExpectedMatrix()[$role->value];
        foreach (Capability::cases() as $capability) {
            $allowed = RoleCapabilities::allows($role, $capability);
            $expectedAllowed = in_array($capability, $expected, true);

            expect($allowed)->toBe(
                $expectedAllowed,
                sprintf(
                    'role=%s capability=%s expected=%s got=%s',
                    $role->value,
                    $capability->value,
                    $expectedAllowed ? 'true' : 'false',
                    $allowed ? 'true' : 'false',
                ),
            );
        }
    }
});

it('capabilitiesFor() returns the same set as the underlying matrix', function (): void {
    foreach (MembershipRole::cases() as $role) {
        $expected = prdExpectedMatrix()[$role->value];
        $actual = RoleCapabilities::capabilitiesFor($role);

        // Use sets-equal rather than ordered-equal — the matrix
        // is conceptually a set and the order is presentational.
        $expectedValues = array_map(static fn (Capability $c) => $c->value, $expected);
        $actualValues = array_map(static fn (Capability $c) => $c->value, $actual);
        sort($expectedValues);
        sort($actualValues);

        expect($actualValues)->toEqual($expectedValues);
    }
});

it('matrix() exposes every MembershipRole as a key', function (): void {
    $matrix = RoleCapabilities::matrix();
    $roleValues = array_map(static fn (MembershipRole $r) => $r->value, MembershipRole::cases());

    expect(array_keys($matrix))->toEqualCanonicalizing($roleValues);
});

it('every Capability case appears in at least one role (no orphan capabilities)', function (): void {
    $allInMatrix = [];
    foreach (RoleCapabilities::matrix() as $caps) {
        foreach ($caps as $c) {
            $allInMatrix[$c->value] = true;
        }
    }

    foreach (Capability::cases() as $cap) {
        expect($allInMatrix)->toHaveKey(
            $cap->value,
            sprintf('Capability::%s is defined but no role grants it', $cap->name),
        );
    }
});

it('only owner can change another member\'s role', function (): void {
    expect(RoleCapabilities::allows(MembershipRole::Owner, Capability::TeamChangeRole))->toBeTrue();
    expect(RoleCapabilities::allows(MembershipRole::Admin, Capability::TeamChangeRole))->toBeFalse();
    expect(RoleCapabilities::allows(MembershipRole::Instructor, Capability::TeamChangeRole))->toBeFalse();
    expect(RoleCapabilities::allows(MembershipRole::Assistant, Capability::TeamChangeRole))->toBeFalse();
});

it('only owner and admin can mark unpaid (one-way payment downgrade)', function (): void {
    expect(RoleCapabilities::allows(MembershipRole::Owner, Capability::PaymentsMarkUnpaid))->toBeTrue();
    expect(RoleCapabilities::allows(MembershipRole::Admin, Capability::PaymentsMarkUnpaid))->toBeTrue();
    expect(RoleCapabilities::allows(MembershipRole::Instructor, Capability::PaymentsMarkUnpaid))->toBeFalse();
    expect(RoleCapabilities::allows(MembershipRole::Assistant, Capability::PaymentsMarkUnpaid))->toBeFalse();
});

it('assistant cannot create athletes', function (): void {
    expect(RoleCapabilities::allows(MembershipRole::Assistant, Capability::AthletesCreateUpdate))->toBeFalse();
    expect(RoleCapabilities::allows(MembershipRole::Assistant, Capability::AthletesRead))->toBeTrue();
});
