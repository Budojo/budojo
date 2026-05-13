<?php

declare(strict_types=1);

namespace App\Observers;

use App\Actions\Document\DeleteDocumentAction;
use App\Enums\CommunityPostType;
use App\Enums\CommunityPostVisibility;
use App\Models\Athlete;
use App\Models\AthletePromotion;
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
     * Auto-react to belt or stripes changes (#608 + post-v2.9.0
     * feature: owner wants a queryable promotion history). Two paths:
     *
     * 1. **Belt change** → writes an `AthletePromotion(kind: belt)`
     *    row to the queryable log AND emits a `belt_promotion`
     *    CommunityPost. Same fanout to `community_belt_celebration`
     *    inbox subscribers.
     * 2. **Stripes change** → writes an `AthletePromotion(kind:
     *    stripe)` row AND emits a `stripe_promotion` CommunityPost.
     *    No notification fanout (stripes are frequent — the post on
     *    the feed is enough; opt-in notification could come later
     *    as `community_stripe_celebration` if requested).
     *
     * Both paths skip in console / seeder context (Auth::id() null)
     * because there's no editor to attribute. The seeder running
     * `Athlete::factory()->create(['belt' => Belt::Blue])` doesn't
     * generate a celebration post.
     */
    public function updated(Athlete $athlete): void
    {
        $beltChanged = $athlete->wasChanged('belt');
        $stripesChanged = $athlete->wasChanged('stripes');
        if (! $beltChanged && ! $stripesChanged) {
            return;
        }

        $userId = Auth::id();
        if ($userId === null) {
            // No authenticated user — likely a console seeder or a
            // queue worker bumping a belt / stripes programmatically.
            // Skip the celebration post AND the AthletePromotion
            // log row; there's no editor to attribute.
            return;
        }

        if ($beltChanged) {
            $this->handleBeltChange($athlete, (int) $userId);
        }
        if ($stripesChanged) {
            $this->handleStripesChange($athlete, (int) $userId);
        }
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

    private function handleBeltChange(Athlete $athlete, int $userId): void
    {
        $originalBelt = $athlete->getOriginal('belt');
        $oldBeltRaw = $originalBelt instanceof \BackedEnum ? $originalBelt->value : $originalBelt;
        $oldBeltString = \is_string($oldBeltRaw) ? $oldBeltRaw : '';
        $newBeltString = $athlete->belt->value;

        AthletePromotion::create([
            'athlete_id' => $athlete->id,
            'kind' => 'belt',
            'from_belt' => $oldBeltString !== '' ? $oldBeltString : null,
            'to_belt' => $newBeltString,
            'from_stripes' => null,
            'to_stripes' => null,
            'recorded_at' => now(),
            'recorded_by_user_id' => $userId,
        ]);

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

        $this->fanoutBeltCelebration($athlete, $post, $userId, $oldBeltString, $newBeltString);
    }

    private function handleStripesChange(Athlete $athlete, int $userId): void
    {
        $oldStripesRaw = $athlete->getOriginal('stripes');
        // `getOriginal` returns mixed; narrow with is_numeric so the
        // cast is PHPStan level 9 safe. Falls back to 0 if the
        // original is somehow not a number — shouldn't happen in
        // practice (the column is `unsignedTinyInteger`).
        $oldStripes = is_numeric($oldStripesRaw) ? (int) $oldStripesRaw : 0;
        $newStripes = $athlete->stripes;

        AthletePromotion::create([
            'athlete_id' => $athlete->id,
            'kind' => 'stripe',
            'from_belt' => null,
            'to_belt' => null,
            'from_stripes' => $oldStripes,
            'to_stripes' => $newStripes,
            'recorded_at' => now(),
            'recorded_by_user_id' => $userId,
        ]);

        CommunityPost::create([
            'academy_id' => $athlete->academy_id,
            'type' => CommunityPostType::StripePromotion,
            'visibility' => CommunityPostVisibility::Academy,
            'payload' => [
                'athlete_id' => $athlete->id,
                'athlete_name' => trim($athlete->first_name . ' ' . $athlete->last_name),
                // Belt is unchanged on a stripe-only event — snapshot
                // for the card render so a future belt change doesn't
                // backdate this post's visual.
                'belt' => $athlete->belt->value,
                'old_stripes' => $oldStripes,
                'new_stripes' => $newStripes,
                'promoted_at' => now()->toISOString(),
            ],
            'created_by_user_id' => $userId,
        ]);

        // No notification fanout for stripes — they're frequent
        // (typically 0→1→2→3→4 within a single belt year). The feed
        // card is the surface. An opt-in `community_stripe_celebration`
        // category lands later if requested.
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
     * path on the underlying PATCH must remain — failures are
     * captured via `Log::warning` and swallowed so they never
     * surface to the caller. There's no durable audit table here;
     * the application log (Sentry / file driver in prod) is the
     * only trail.
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
