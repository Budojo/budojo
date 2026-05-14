<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\CommunityPost;
use App\Models\PostComment;
use App\Models\PushSubscription;
use App\Models\User;
use App\Notifications\Channels\WebPushChannel;
use App\Notifications\CommunityReplyNotification;
use Minishlink\WebPush\MessageSentReport;
use Minishlink\WebPush\WebPush;
use Mockery as m;

/**
 * Server-side Web Push fanout (#696). Exercises the custom
 * `WebPushChannel` end-to-end against a mocked `WebPush` so we never
 * hit the real vendor push service in a test run. Three concerns are
 * pinned here:
 *
 *  1. `CommunityReplyNotification::via()` includes the channel — i.e.
 *     the notification will actually invoke `send()` at dispatch time.
 *  2. `send()` queues one push per stored subscription and bumps
 *     `last_seen_at` to "now" on a successful delivery.
 *  3. A `410 Gone` response from the vendor (the user revoked
 *     permission at the OS level) deletes the row.
 *
 * Mockery is wired through PEST's auto-tearDown so we don't need an
 * explicit `Mockery::close()` call per test.
 */
afterEach(function (): void {
    m::close();
});

function fakeCommunityReplyNotification(User $author): CommunityReplyNotification
{
    $owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $owner->academy;
    /** @var CommunityPost $post */
    $post = CommunityPost::factory()->for($academy)->create();
    /** @var PostComment $comment */
    $comment = PostComment::factory()->for($post, 'post')->for($author)->create([
        'body' => 'thanks for sharing',
    ]);

    return new CommunityReplyNotification($comment, $author);
}

function fakeReport(string $endpoint, bool $success, ?int $status = null): MessageSentReport
{
    /** @var MessageSentReport&\Mockery\MockInterface $report */
    $report = m::mock(MessageSentReport::class);
    $report->shouldReceive('getEndpoint')->andReturn($endpoint);
    $report->shouldReceive('isSuccess')->andReturn($success);

    if (! $success) {
        // The `getResponse()` call yields a Psr-7 response carrying
        // the vendor's status code; the channel uses ONLY the status
        // for the 404/410-prune branch, so a minimal mock is enough.
        $response = m::mock(\Psr\Http\Message\ResponseInterface::class);
        $response->shouldReceive('getStatusCode')->andReturn($status);
        $report->shouldReceive('getResponse')->andReturn($response);
        $report->shouldReceive('getReason')->andReturn('mocked');
    }

    return $report;
}

it('CommunityReplyNotification::via() includes the WebPushChannel', function (): void {
    $author = User::factory()->create();
    $notification = fakeCommunityReplyNotification($author);
    $channels = $notification->via(new \stdClass());

    expect($channels)->toContain('database');
    expect($channels)->toContain(WebPushChannel::class);
});

it('queues a push per subscription and bumps last_seen_at on success', function (): void {
    $author = User::factory()->create();
    $recipient = userWithAcademy();
    /** @var PushSubscription $sub */
    $sub = PushSubscription::factory()->for($recipient)->create(['last_seen_at' => null]);

    /** @var WebPush&\Mockery\MockInterface $webPush */
    $webPush = m::mock(WebPush::class);
    $webPush->shouldReceive('queueNotification')->once();
    $webPush->shouldReceive('flush')->once()->andReturnUsing(function () use ($sub) {
        yield fakeReport($sub->endpoint, true);
    });

    $channel = new WebPushChannel($webPush);
    $channel->send($recipient->fresh()->load('pushSubscriptions'), fakeCommunityReplyNotification($author));

    expect($sub->fresh()->last_seen_at)->not->toBeNull();
});

it('reshapes the toWebPush() payload into the Angular SW envelope (#702)', function (): void {
    $author = User::factory()->create();
    $recipient = userWithAcademy();
    $sub = PushSubscription::factory()->for($recipient)->create();

    $capturedPayload = null;
    /** @var WebPush&\Mockery\MockInterface $webPush */
    $webPush = m::mock(WebPush::class);
    $webPush->shouldReceive('queueNotification')
        ->once()
        ->andReturnUsing(function ($subscription, $payload) use (&$capturedPayload) {
            $capturedPayload = $payload;
        });
    $webPush->shouldReceive('flush')->once()->andReturnUsing(function () use ($sub) {
        yield fakeReport($sub->endpoint, true);
    });

    $channel = new WebPushChannel($webPush);
    $channel->send($recipient->fresh()->load('pushSubscriptions'), fakeCommunityReplyNotification($author));

    $decoded = json_decode($capturedPayload, true, flags: JSON_THROW_ON_ERROR);

    // Top-level envelope shape — Angular SwPush expects 'notification'
    // with title / body / data. Without this nesting the OS-level
    // notification never renders.
    expect($decoded)->toHaveKey('notification');
    expect($decoded['notification'])->toHaveKeys(['title', 'body', 'data']);
    // The reply payload's kind / post_id / comment_id / link survive the
    // reshape and ride under `notification.data`.
    expect($decoded['notification']['data'])->toHaveKey('kind', 'community_reply');
    expect($decoded['notification']['data'])->toHaveKey('link');
    // The flat-shape title / body keys MUST NOT leak alongside the
    // envelope — Copilot review on #702 pinned this.
    expect($decoded)->not->toHaveKey('title');
    expect($decoded)->not->toHaveKey('body');
});

it('deletes a subscription row when the vendor returns 410 Gone', function (): void {
    $author = User::factory()->create();
    $recipient = userWithAcademy();
    /** @var PushSubscription $sub */
    $sub = PushSubscription::factory()->for($recipient)->create();

    /** @var WebPush&\Mockery\MockInterface $webPush */
    $webPush = m::mock(WebPush::class);
    $webPush->shouldReceive('queueNotification')->once();
    $webPush->shouldReceive('flush')->once()->andReturnUsing(function () use ($sub) {
        yield fakeReport($sub->endpoint, false, 410);
    });

    $channel = new WebPushChannel($webPush);
    $channel->send($recipient->fresh()->load('pushSubscriptions'), fakeCommunityReplyNotification($author));

    expect(PushSubscription::query()->whereKey($sub->id)->exists())->toBeFalse();
});

it('is a no-op when VAPID keys are not configured on the server', function (): void {
    config()->set('push.vapid.public_key', '');
    config()->set('push.vapid.private_key', '');

    $author = User::factory()->create();
    $recipient = userWithAcademy();
    PushSubscription::factory()->for($recipient)->create();

    /** @var WebPush&\Mockery\MockInterface $webPush */
    $webPush = m::mock(WebPush::class);
    $webPush->shouldNotReceive('queueNotification');
    $webPush->shouldNotReceive('flush');

    $channel = new WebPushChannel($webPush);
    $channel->send($recipient->fresh()->load('pushSubscriptions'), fakeCommunityReplyNotification($author));

    expect(true)->toBeTrue();
});

it('is a no-op when the recipient has zero subscriptions', function (): void {
    $author = User::factory()->create();
    $recipient = userWithAcademy();

    /** @var WebPush&\Mockery\MockInterface $webPush */
    $webPush = m::mock(WebPush::class);
    $webPush->shouldNotReceive('queueNotification');
    $webPush->shouldNotReceive('flush');

    $channel = new WebPushChannel($webPush);
    $channel->send($recipient->fresh()->load('pushSubscriptions'), fakeCommunityReplyNotification($author));

    expect(true)->toBeTrue(); // Reaches here without exception → mock expectations enforced on close.
});
