<?php

declare(strict_types=1);

namespace App\Observers;

use App\Actions\Document\DeleteDocumentAction;
use App\Enums\CommunityPostType;
use App\Enums\CommunityPostVisibility;
use App\Models\Athlete;
use App\Models\CommunityPost;
use Illuminate\Support\Facades\Auth;

class AthleteObserver
{
    public function __construct(private readonly DeleteDocumentAction $deleteDocument)
    {
    }

    /**
     * Auto-create a `belt_promotion` community post when an athlete's
     * belt column changes (#608, M9 PR-A2). Fires only on updates —
     * initial belt assignment at create time is not a promotion. Skips
     * in console / seeder context where there's no authenticated user
     * to attribute (`Auth::id()` is null).
     *
     * The post creation is inline here for V1; if/when M9 PR-F adds
     * push-notification fan-out (with per-user opt-in gating), this
     * logic moves to a dedicated `CreateBeltPromotionPostAction`. For
     * the simple insert path the observer is the right home.
     */
    public function updated(Athlete $athlete): void
    {
        if (! $athlete->wasChanged('belt')) {
            return;
        }

        $userId = Auth::id();
        if ($userId === null) {
            // No authenticated user — likely a console seeder or a
            // queue worker bumping a belt programmatically. Skip the
            // celebration post; the audit log (#429, future) will
            // capture the belt change separately.
            return;
        }

        $originalBelt = $athlete->getOriginal('belt');

        CommunityPost::create([
            'academy_id' => $athlete->academy_id,
            'type' => CommunityPostType::BeltPromotion,
            'visibility' => CommunityPostVisibility::Academy,
            'payload' => [
                'athlete_id' => $athlete->id,
                'old_belt' => $originalBelt instanceof \BackedEnum ? $originalBelt->value : $originalBelt,
                'new_belt' => $athlete->belt->value,
                'promoted_at' => now()->toISOString(),
            ],
            'created_by_user_id' => $userId,
        ]);
    }

    /**
     * When an athlete is being (soft-)deleted, cascade the same treatment to
     * all their documents: soft-delete the rows and wipe the files from disk.
     *
     * This is the GDPR-friendly policy locked in the M3 PRD. A future "restore
     * athlete" flow would NOT recover the files.
     */
    public function deleting(Athlete $athlete): void
    {
        // lazy() streams rows from the DB in chunks of 1000 rather than
        // hydrating the entire relation into memory — keeps cascade deletion
        // cheap even if an athlete has accumulated many historical documents.
        foreach ($athlete->documents()->lazy() as $document) {
            $this->deleteDocument->execute($document);
        }
    }

    /**
     * On HARD delete (force-delete after a soft-delete window, or a direct
     * `forceDelete()` from the seeder reseed path), wipe the structured
     * address row too. The polymorphic `addresses` table has no FK to
     * the athlete, so without this hook the row would orphan and slowly
     * leak across reseeds. Kept on `forceDeleted` (not `deleting`) so a
     * soft-delete still leaves the address in place — the address is the
     * user's data and follows the same "recoverable until purge" lifecycle
     * as the athlete row itself.
     */
    public function forceDeleted(Athlete $athlete): void
    {
        $athlete->address()->delete();
    }
}
