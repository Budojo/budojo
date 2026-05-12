<?php

declare(strict_types=1);

namespace App\Observers;

use App\Actions\Document\DeleteDocumentAction;
use App\Enums\CommunityPostType;
use App\Enums\CommunityPostVisibility;
use App\Models\Athlete;
use App\Models\CommunityPost;
use App\Models\User;
use App\Notifications\CommunityBeltCelebrationNotification;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;

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
        $oldBeltRaw = $originalBelt instanceof \BackedEnum ? $originalBelt->value : $originalBelt;
        $oldBeltString = \is_string($oldBeltRaw) ? $oldBeltRaw : '';
        $newBeltString = $athlete->belt->value;

        /** @var CommunityPost $post */
        $post = CommunityPost::create([
            'academy_id' => $athlete->academy_id,
            'type' => CommunityPostType::BeltPromotion,
            'visibility' => CommunityPostVisibility::Academy,
            'payload' => [
                'athlete_id' => $athlete->id,
                // Snapshot the athlete's name at promotion time so the
                // feed can render the celebration line without joining
                // back to the athletes table on every render (and
                // without the cascade-delete of the athlete erasing
                // the historical record). `created_by_user_id` carries
                // the EDITOR (often the owner), not the athlete, so
                // the SPA can't derive the athlete name from that
                // field — Copilot review on PR #615.
                'athlete_name' => trim($athlete->first_name . ' ' . $athlete->last_name),
                'old_belt' => $oldBeltString,
                'new_belt' => $newBeltString,
                'promoted_at' => now()->toISOString(),
            ],
            'created_by_user_id' => $userId,
        ]);

        $this->fanoutBeltCelebration($athlete, $post, (int) $userId, $oldBeltString, $newBeltString);
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

    /**
     * Notify every academy user (owner + athletes) about the
     * promotion, EXCLUDING the editor who recorded it
     * (M9 PR-F slice 3, #606). Default-off: only users who have
     * explicitly opted in to `community_belt_celebration` get the
     * inbox row.
     *
     * Best-effort like the comment-reply fanout: the celebration
     * post insert has already committed, and the controller's 200
     * path on the underlying PATCH must remain — failures land in
     * the audit log without surfacing to the caller.
     */
    private function fanoutBeltCelebration(
        Athlete $athlete,
        CommunityPost $post,
        int $editorId,
        string $oldBelt,
        string $newBelt,
    ): void {
        // Recipients are every user with a stake in this academy:
        //   - the owner (via $athlete->academy->user_id; column is
        //     NOT NULL so no null guard needed)
        //   - every athlete in the academy via the athletes table
        //     linking to a user_id (nullable — invited-but-not-
        //     accepted rows excluded by `whereNotNull`).
        // Excludes the editor. Distinct user_id.
        $ownerId = $athlete->academy?->user_id;
        $athleteUserIds = Athlete::query()
            ->where('academy_id', $athlete->academy_id)
            ->whereNotNull('user_id')
            ->where('user_id', '!=', $editorId)
            ->pluck('user_id');

        $recipientIds = $athleteUserIds
            ->when(
                $ownerId !== $editorId,
                fn ($collection) => $collection->push($ownerId),
            )
            ->unique()
            ->values()
            ->all();

        if ($recipientIds === []) {
            return;
        }

        /** @var \Illuminate\Database\Eloquent\Collection<int, User> $recipients */
        $recipients = User::query()->whereIn('id', $recipientIds)->get();

        $eligible = $recipients->filter(
            fn (User $u) => NotificationPreferences::isEnabled($u, NotificationCategory::COMMUNITY_BELT_CELEBRATION),
        );

        if ($eligible->isEmpty()) {
            return;
        }

        try {
            Notification::send(
                $eligible,
                new CommunityBeltCelebrationNotification($athlete, $post, $oldBelt, $newBelt),
            );
        } catch (\Throwable $e) {
            Log::warning('community_belt_celebration notification fanout failed', [
                'post_id' => $post->id,
                'athlete_id' => $athlete->id,
                'recipient_count' => $eligible->count(),
                'exception' => $e::class,
                'message' => $e->getMessage(),
            ]);
        }
    }
}
