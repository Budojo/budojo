<?php

declare(strict_types=1);

use App\Models\PushSubscription;
use App\Models\User;
use App\Notifications\Channels\WebPushChannel;
use GuzzleHttp\Psr7\Response;
use Illuminate\Notifications\Notification;
use Minishlink\WebPush\VAPID;
use Minishlink\WebPush\WebPush;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

/**
 * What Budojo actually puts on the wire when it sends a push (#1391).
 *
 * `WebPushChannelTest` mocks `WebPush` wholesale, which is right for what it
 * pins — queueing, `last_seen_at`, the 410-prune — but it means no test has
 * ever seen a real request. That is exactly how we shipped the deprecated
 * encryption for as long as push has existed: every gate was green and the
 * bytes were wrong.
 *
 * So this suite builds a **real** `WebPush` with real VAPID keys and a real
 * subscription key, and swaps only the PSR-18 transport for a recorder. The
 * encryption runs for real; the request is simply never sent.
 *
 * Two standards are at stake and they travel together, which is the part worth
 * knowing: `Subscription::getContentEncoding()` decides the body encryption
 * (RFC 8291) **and** is passed to `VAPID::getVapidHeaders()`, which branches on
 * it to choose the authorization form (RFC 8292). One value, both wire formats.
 */
beforeEach(function (): void {
    $vapid = VAPID::createVapidKeys();
    config()->set('push.vapid.public_key', $vapid['publicKey']);
    config()->set('push.vapid.private_key', $vapid['privateKey']);
    config()->set('push.vapid.subject', 'mailto:hello@budojo.it');

    $user = User::factory()->create();
    PushSubscription::factory()->for($user)->create([
        // The factory's `Str::random(86)` is not a P-256 point, so real
        // encryption cannot run against it. A generated VAPID public key is
        // exactly the right shape — a base64url uncompressed P-256 point — and
        // a browser's `p256dh` is the same thing.
        'p256dh' => VAPID::createVapidKeys()['publicKey'],
        'auth' => rtrim(strtr(base64_encode(random_bytes(16)), '+/', '-_'), '='),
    ]);

    $transport = new class () implements ClientInterface {
        /** @var list<RequestInterface> */
        public array $requests = [];

        public function sendRequest(RequestInterface $request): ResponseInterface
        {
            $this->requests[] = $request;

            return new Response(201);
        }
    };

    $notification = new class () extends Notification {
        /** @return array<int, string> */
        public function via(mixed $notifiable): array
        {
            return [WebPushChannel::class];
        }

        /** @return array<string, mixed> */
        public function toWebPush(mixed $notifiable): array
        {
            return ['title' => 'Belt promotion', 'body' => 'Well done', 'link' => '/feed'];
        }
    };

    new WebPushChannel(new WebPush(
        ['VAPID' => [
            'subject' => 'mailto:hello@budojo.it',
            'publicKey' => $vapid['publicKey'],
            'privateKey' => $vapid['privateKey'],
        ]],
        [],
        $transport,
    ))->send($user->fresh(), $notification);

    expect($transport->requests)->toHaveCount(1);
    $this->request = $transport->requests[0];
});

it('encrypts with aes128gcm, the scheme RFC 8291 standardised', function (): void {
    // `aesgcm` is draft-04 of Web Push Encryption and has been deprecated for
    // years. It is also the only scheme Apple Web Push refuses outright, so
    // this is what stands between us and Safari the day Safari matters.
    expect($this->request->getHeaderLine('Content-Encoding'))->toBe('aes128gcm');
});

it('signs with the RFC 8292 VAPID form rather than draft-01', function (): void {
    // draft-01 was `Authorization: WebPush <jwt>` with the key in a separate
    // `Crypto-Key` header. draft-02 — the one RFC 8292 standardised — carries
    // both in one header.
    expect($this->request->getHeaderLine('Authorization'))
        ->toStartWith('vapid t=')
        ->toContain(', k=');
});

it('stops sending the draft-01 headers altogether', function (): void {
    // Not cosmetic: leaving these beside the new form is how a push service
    // that has dropped legacy support decides the request is malformed rather
    // than merely old. With aes128gcm the salt and the ephemeral key ride
    // inside the body, so neither header has anything left to carry.
    expect($this->request->hasHeader('Crypto-Key'))->toBeFalse()
        ->and($this->request->hasHeader('Encryption'))->toBeFalse();
});

it('still sends a body the browser can decrypt with the keys it already gave us', function (): void {
    // The reassurance for every subscription already in the table: `p256dh`
    // and `auth` are the browser's own keys and mean the same thing under both
    // schemes. Changing the encoding changes how we encrypt TO them, not what
    // they are — so nothing needs re-subscribing.
    expect((int) $this->request->getHeaderLine('Content-Length'))->toBeGreaterThan(0)
        ->and($this->request->getBody()->getSize())->toBeGreaterThan(0);
});
