<?php

declare(strict_types=1);

namespace App\Support\MartialArt;

use App\Models\Academy;

/**
 * Whether an academy's martial art can still change (#1800).
 *
 * Only while nothing in the academy is shaped by it. Four tables carry that
 * shape, and deleting from them does not remove it:
 *
 * - **athletes**, trashed included — a soft-deleted purple belt is still a
 *   claim in the old ladder;
 * - **classes** — their `kind` is a mode of the old art;
 * - **lessons** — they outlive their class (`academy_class_id` is
 *   null-on-delete and `kind` is a snapshot), so a timetable taken down still
 *   leaves a season of evenings behind;
 * - **syllabus topics**, trashed included — `Lesson::topics()` reads them
 *   `withTrashed()`, so a programme tidied away still names itself on the
 *   lessons that taught it.
 *
 * The update request and `AcademyResource.martial_art_locked` both ask here,
 * so the rule and what the page shows cannot disagree.
 */
final class MartialArtLock
{
    public static function isLocked(Academy $academy): bool
    {
        return $academy->athletes()->withTrashed()->exists()
            || $academy->classes()->exists()
            || $academy->lessons()->exists()
            || $academy->syllabusTopics()->withTrashed()->exists();
    }
}
