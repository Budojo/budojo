<?php

declare(strict_types=1);

namespace App\Support\Sync\Journal;

/**
 * Which writes the journal records (#2031): the academy's data, which a
 * rebase must carry to the other device. Never the account's own security
 * and settings, the session, the sync itself, or what a local profile does
 * not have (invitations, the community).
 */
final class JournalRoutes
{
    private const array JOURNALED = ['academy.', 'athletes.', 'attendance.', 'documents.', 'lessons.', 'me.athlete.', 'me.attendance.'];

    // The athlete's email change stays: with no athlete accounts on a local
    // device, it is a plain field the owner edits there.
    private const array NEVER = ['athletes.invite.', 'athletes.invitations.'];

    public static function journals(?string $name): bool
    {
        if ($name === null) {
            return false;
        }
        foreach (self::NEVER as $prefix) {
            if (str_starts_with($name, $prefix)) {
                return false;
            }
        }
        foreach (self::JOURNALED as $prefix) {
            if (str_starts_with($name, $prefix)) {
                return true;
            }
        }

        return false;
    }
}
