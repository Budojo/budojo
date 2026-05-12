<?php

declare(strict_types=1);

namespace App\Actions\Community;

use App\Enums\CommunityPostType;
use App\Enums\CommunityPostVisibility;
use App\Models\Athlete;
use App\Models\CommunityPost;
use App\Models\User;
use App\Notifications\CommunityEventNewNotification;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;

/**
 * Create an event-type community post on behalf of an academy owner.
 *
 * Payload shape matches the factory-built events the feed already
 * renders: `title`, `description` (optional), `starts_at` (ISO 8601
 * UTC string), `location_text` (free-form, optional), `location_lat`
 * / `location_lon` (V2 map view — accept nullable here so the V2
 * migration doesn't need to rewrite existing rows), `max_attendees`
 * (optional, null = uncapped).
 *
 * Authorization (caller is an owner + posting under their owned
 * academy) lives in the FormRequest.
 *
 * Eager-loads the relations `CommunityPostResource` projects so the
 * controller can echo the wire shape on the 201 without a follow-up
 * round-trip.
 *
 * **Fanout (M9 PR-F slice 2, #606)**: after inserting, the Action
 * notifies every academy user EXCEPT the editor whose
 * `community_event_new` preference is enabled (default-on). The
 * fanout is best-effort — failures are logged and DO NOT roll back
 * the event-post write.
 *
 * @phpstan-type EventPayload array{
 *   title: string,
 *   description?: string|null,
 *   starts_at: string,
 *   location_text?: string|null,
 *   location_lat?: float|null,
 *   location_lon?: float|null,
 *   max_attendees?: int|null,
 * }
 */
class CreateEventAction
{
    /**
     * @param  EventPayload  $payload
     */
    public function execute(User $author, int $academyId, array $payload): CommunityPost
    {
        $startsAt = CarbonImmutable::parse($payload['starts_at'])->toIso8601String();

        /** @var CommunityPost $post */
        $post = CommunityPost::create([
            'academy_id' => $academyId,
            'type' => CommunityPostType::Event,
            'visibility' => CommunityPostVisibility::Academy,
            'payload' => [
                'title' => $payload['title'],
                'description' => $payload['description'] ?? null,
                'starts_at' => $startsAt,
                'location_text' => $payload['location_text'] ?? null,
                'location_lat' => $payload['location_lat'] ?? null,
                'location_lon' => $payload['location_lon'] ?? null,
                'max_attendees' => $payload['max_attendees'] ?? null,
            ],
            'created_by_user_id' => $author->id,
        ]);

        $post->load([
            'createdBy:id,first_name,last_name,handle,avatar_path,updated_at',
            'createdBy.athlete:id,user_id,belt',
        ]);

        $this->fanoutEventNew($post, $author, $academyId);

        return $post;
    }

    /**
     * Notify every academy user (athletes linked to a user_id) whose
     * `community_event_new` preference is enabled, excluding the
     * editor. Default-on category — absent-key recipients receive the
     * notification.
     *
     * Best-effort like the other PR-F fanouts: failures are captured
     * via `Log::warning` so the controller's 201 path is unaffected
     * by a DB / driver hiccup on the inbox INSERT.
     */
    private function fanoutEventNew(CommunityPost $post, User $editor, int $academyId): void
    {
        // Athletes in the academy with a linked user (invited-but-
        // not-accepted rows have user_id NULL and are skipped).
        // Excludes the editor.
        $recipientIds = Athlete::query()
            ->where('academy_id', $academyId)
            ->whereNotNull('user_id')
            ->where('user_id', '!=', $editor->id)
            ->pluck('user_id')
            ->unique()
            ->values()
            ->all();

        if ($recipientIds === []) {
            return;
        }

        /** @var \Illuminate\Database\Eloquent\Collection<int, User> $recipients */
        $recipients = User::query()->whereIn('id', $recipientIds)->get();

        $eligible = $recipients->filter(
            fn (User $u) => NotificationPreferences::isEnabled($u, NotificationCategory::COMMUNITY_EVENT_NEW),
        );

        if ($eligible->isEmpty()) {
            return;
        }

        try {
            Notification::send($eligible, new CommunityEventNewNotification($post));
        } catch (\Throwable $e) {
            Log::warning('community_event_new notification fanout failed', [
                'post_id' => $post->id,
                'academy_id' => $academyId,
                'recipient_count' => $eligible->count(),
                'exception' => $e::class,
                'message' => $e->getMessage(),
            ]);
        }
    }
}
