<?php

declare(strict_types=1);

use App\Enums\UserRole;
use App\Models\User;
use App\Support\CommunityLink;

/**
 * Community notifications are sent to both owners and athletes, who
 * read the SAME feed at DIFFERENT routes: owners at /dashboard/community,
 * athletes at the role-guarded /dashboard/me/feed. A role-blind link
 * 404s for one of them (#1071 — owners hit the athlete-only guard).
 */
it('builds the owner community route for an owner recipient', function (): void {
    $owner = new User(['role' => UserRole::Owner]);

    expect(CommunityLink::forPost($owner, 42))->toBe('/dashboard/community#post-42');
});

it('builds the athlete feed route for an athlete recipient', function (): void {
    $athlete = new User(['role' => UserRole::Athlete]);

    expect(CommunityLink::forPost($athlete, 42))->toBe('/dashboard/me/feed#post-42');
});
