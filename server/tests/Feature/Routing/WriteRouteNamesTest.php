<?php

declare(strict_types=1);

use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as Router;

/**
 * Every write route has a name, and the names are pinned (#2031).
 *
 * The sync's journal records each write by its route name, and the rebase
 * replays it through the router by that name (`docs/sync/protocol.md`, A
 * journal entry). A journal outlives the code that wrote it: the phone may
 * replay entries a PC recorded under an older Budojo. So a name is part of
 * the sync's contract. Renaming one, or adding a write route without one,
 * must be a decision this test makes visible, not something a refactor does
 * quietly.
 */

/** @return array<string, string> "METHOD uri" => name, for every write under /api/v1 */
function writeRouteNames(): array
{
    $names = [];
    foreach (Router::getRoutes()->getRoutes() as $route) {
        /** @var Route $route */
        $uri = $route->uri();
        if (! str_starts_with($uri, 'api/v1')) {
            continue;
        }
        $methods = array_values(array_intersect($route->methods(), ['POST', 'PUT', 'PATCH', 'DELETE']));
        if ($methods === []) {
            continue;
        }
        $names[$methods[0] . ' ' . substr($uri, strlen('api/v1/'))] = (string) $route->getName();
    }
    ksort($names);

    return $names;
}

it('names every write route, in the journal\'s shape', function (): void {
    foreach (writeRouteNames() as $route => $name) {
        // The client's own check on a journal entry (`core/sync/journal.ts`):
        // dotted segments, each starting with a letter.
        expect($name)->toMatch('/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/', "{$route} has no journal-shaped name");
    }
});

it('gives no two write routes the same name', function (): void {
    $names = array_values(writeRouteNames());

    expect(array_unique($names))->toHaveCount(count($names));
});

it('keeps every name as the journal knows it: a rename is a decision', function (): void {
    expect(writeRouteNames())->toBe([
        'DELETE academy/classes/{academyClass}' => 'academy.classes.destroy',
        'DELETE academy/closures/{closure}' => 'academy.closures.destroy',
        'DELETE academy/fee-tiers/{tier}' => 'academy.fee-tiers.destroy',
        'DELETE academy/logo' => 'academy.logo.destroy',
        'DELETE academy/schedules/{schedule}' => 'academy.schedules.destroy',
        'DELETE academy/syllabus/{syllabusTopic}' => 'academy.syllabus.destroy',
        'DELETE athletes/{athlete}' => 'athletes.destroy',
        'DELETE athletes/{athlete}/carnets/{carnet}' => 'athletes.carnets.destroy',
        'DELETE athletes/{athlete}/invitations/{invitation}' => 'athletes.invitations.destroy',
        'DELETE athletes/{athlete}/payments/{year}/{month}' => 'athletes.payments.destroy',
        'DELETE athletes/{athlete}/photo' => 'athletes.photo.destroy',
        'DELETE athletes/{athlete}/promotion-skips/{belt}/{stripes}' => 'athletes.promotion-skips.destroy',
        'DELETE athletes/{athlete}/promotions/{promotion}' => 'athletes.promotions.destroy',
        'DELETE attendance/{attendance}' => 'attendance.destroy',
        'DELETE community/comments/{comment}' => 'community.comments.destroy',
        'DELETE community/posts/{post}' => 'community.posts.destroy',
        'DELETE documents/{document}' => 'documents.destroy',
        'DELETE me/api-tokens/{id}' => 'me.api-tokens.destroy',
        'DELETE me/athlete' => 'me.athlete.destroy',
        'DELETE me/attendance/today' => 'me.attendance.today.destroy',
        'DELETE me/avatar' => 'me.avatar.destroy',
        'DELETE me/deletion-request' => 'me.deletion-request.destroy',
        'DELETE me/email-change' => 'me.email-change.destroy',
        'DELETE me/push-subscriptions/{id}' => 'me.push-subscriptions.destroy',
        'DELETE me/sessions' => 'me.sessions.destroy-others',
        'DELETE me/sessions/{id}' => 'me.sessions.destroy',
        'DELETE me/two-factor' => 'me.two-factor.destroy',
        'DELETE sync/journal' => 'sync.journal.destroy',
        'PATCH academy' => 'academy.update',
        'PATCH academy/classes/{academyClass}' => 'academy.classes.update',
        'PATCH academy/closures/{closure}' => 'academy.closures.update',
        'PATCH academy/fee-tiers/{tier}' => 'academy.fee-tiers.update',
        'PATCH academy/syllabus/{syllabusTopic}' => 'academy.syllabus.update',
        'PATCH athletes/{athlete}/carnets/{carnet}' => 'athletes.carnets.update',
        'PATCH athletes/{athlete}/promotions/{promotion}' => 'athletes.promotions.update',
        'PATCH me' => 'me.update',
        'PATCH me/active-academy' => 'me.active-academy.update',
        'PATCH me/locale' => 'me.locale.update',
        'PATCH me/notification-preferences' => 'me.notification-preferences.update',
        'POST academy' => 'academy.store',
        'POST academy/classes' => 'academy.classes.store',
        'POST academy/closures' => 'academy.closures.store',
        'POST academy/documents' => 'academy.documents.store',
        'POST academy/fee-tiers' => 'academy.fee-tiers.store',
        'POST academy/logo' => 'academy.logo.upload',
        'POST academy/schedules' => 'academy.schedules.store',
        'POST academy/syllabus' => 'academy.syllabus.store',
        'POST academy/syllabus/seed' => 'academy.syllabus.seed',
        'POST academy/syllabus/{syllabusTopic}/move' => 'academy.syllabus.move',
        'POST athlete-invite/{token}/accept' => 'athlete-invite.accept',
        'POST athletes' => 'athletes.store',
        'POST athletes/import' => 'athletes.import',
        'POST athletes/{athlete}/carnets' => 'athletes.carnets.store',
        'POST athletes/{athlete}/documents' => 'athletes.documents.store',
        'POST athletes/{athlete}/email' => 'athletes.email.update',
        'POST athletes/{athlete}/invite' => 'athletes.invite.store',
        'POST athletes/{athlete}/invite/resend' => 'athletes.invite.resend',
        'POST athletes/{athlete}/payments' => 'athletes.payments.store',
        'POST athletes/{athlete}/photo' => 'athletes.photo.upload',
        'POST athletes/{athlete}/promotion-skips' => 'athletes.promotion-skips.store',
        'POST athletes/{athlete}/promotions' => 'athletes.promotions.store',
        'POST athletes/{athlete}/restore' => 'athletes.restore',
        'POST attendance' => 'attendance.store',
        'POST auth/forgot-password' => 'auth.forgot-password',
        'POST auth/login' => 'auth.login',
        'POST auth/logout' => 'auth.logout',
        'POST auth/register' => 'auth.register',
        'POST auth/reset-password' => 'auth.reset-password',
        'POST community/events' => 'community.events.store',
        'POST community/posts/{post}/comments' => 'community.posts.comments.store',
        'POST community/posts/{post}/reactions' => 'community.posts.reactions.toggle',
        'POST community/posts/{post}/rsvp' => 'community.posts.rsvp.toggle',
        'POST community/videos' => 'community.videos.store',
        'POST device/backup/inspect' => 'device.backup.inspect',
        'POST device/backup/restore' => 'device.backup.restore',
        'POST device/session' => 'device.session',
        'POST email-change/{token}/verify' => 'email-change.verify',
        'POST email/verification-notification' => 'email.verification-notification',
        'POST me/api-tokens' => 'me.api-tokens.store',
        'POST me/athlete' => 'me.athlete.store',
        'POST me/attendance/today' => 'me.attendance.today.store',
        'POST me/avatar' => 'me.avatar.upload',
        'POST me/deletion-request' => 'me.deletion-request.store',
        'POST me/deletion-request/cancel/{token}' => 'me.deletion-request.cancel',
        'POST me/email-change' => 'me.email-change.store',
        'POST me/notifications/archive-read' => 'me.notifications.archive-read',
        'POST me/notifications/read-all' => 'me.notifications.read-all',
        'POST me/notifications/unarchive' => 'me.notifications.unarchive-many',
        'POST me/notifications/{id}/archive' => 'me.notifications.archive',
        'POST me/notifications/{id}/read' => 'me.notifications.read',
        'POST me/notifications/{id}/unarchive' => 'me.notifications.unarchive',
        'POST me/onboarding/dismiss' => 'me.onboarding.dismiss',
        'POST me/onboarding/steps' => 'me.onboarding.steps.store',
        'POST me/password' => 'me.password.update',
        'POST me/push-subscriptions' => 'me.push-subscriptions.store',
        'POST me/push-subscriptions/test' => 'me.push-subscriptions.test',
        'POST me/two-factor/confirm' => 'me.two-factor.confirm',
        'POST me/two-factor/enrol' => 'me.two-factor.enrol',
        'POST me/two-factor/recovery-codes/regenerate' => 'me.two-factor.recovery-codes.regenerate',
        'POST support' => 'support.store',
        'POST sync/conflicts/{entry}/decision' => 'sync.conflicts.decide',
        'POST sync/conflicts/{entry}/keep-mine' => 'sync.conflicts.keep-mine',
        'POST unsubscribe/{userId}/{category}' => 'unsubscribe.store',
        'PUT athletes/{athlete}' => 'athletes.update',
        'PUT documents/{document}' => 'documents.update',
        'PUT lessons/notes' => 'lessons.notes.update',
        'PUT lessons/topics' => 'lessons.topics.update',
        'PUT sync/files/{sha256}' => 'sync.files.store',
        'PUT sync/stage' => 'sync.stage',
    ]);
});
