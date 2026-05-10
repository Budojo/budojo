<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Public, signed-URL endpoint for the one-click unsubscribe flow
 * embedded in non-transactional emails (#417). Two callers:
 *
 *   - **`GET /unsubscribe/{userId}/{category}`** (browser click on
 *     the email footer link): flips the preference off and
 *     redirects to the SPA confirmation page.
 *   - **`POST /unsubscribe/{userId}/{category}`** (Gmail / Yahoo
 *     bulk-sender List-Unsubscribe-Post one-click): same effect,
 *     responds with 200 OK and an empty body — the email client
 *     never renders a UI.
 *
 * The URL is signed by `App\Support\UnsubscribeUrl::for`; the
 * `signed` middleware on the route validates the signature
 * server-side. Expired / tampered signatures get the framework's
 * default 403 from the middleware before reaching the controller.
 *
 * **Unknown category** — defensive 410. The category list is
 * controlled by the catalog (`App\Support\NotificationCategory`);
 * a deprecated category in an old email link should land on a
 * "this link is no longer valid" page rather than silently no-op.
 *
 * **Unknown user_id** — same 410. The signature was valid (caller
 * couldn't have forged it without our app key) but the row is gone
 * — the user hard-deleted their account in the grace window.
 * Nothing to flip; show the same "no longer valid" landing.
 */
class UnsubscribeController extends Controller
{
    public function get(Request $request, int $userId, string $category): RedirectResponse
    {
        $error = $this->apply($userId, $category);
        if ($error !== null) {
            return redirect($this->clientUrl() . '/unsubscribed?status=invalid');
        }

        return redirect($this->clientUrl() . '/unsubscribed?category=' . urlencode($category));
    }

    /**
     * One-click POST entry for List-Unsubscribe-Post (RFC 8058).
     * Email clients send a no-body POST and expect a 2xx response;
     * they do NOT render anything — the user's "Unsubscribe" tap
     * inside the inbox is the entire UX. We mirror the GET's
     * preference flip and return 200 OK regardless of the apply
     * outcome (the email client doesn't surface failures).
     */
    public function post(Request $request, int $userId, string $category): Response
    {
        $this->apply($userId, $category);

        return response('', 200);
    }

    /**
     * Returns null on success, or an opaque error tag the caller
     * can use to choose its response shape. Never throws.
     */
    private function apply(int $userId, string $category): ?string
    {
        if (! \in_array($category, NotificationCategory::all(), true)) {
            return 'unknown_category';
        }

        $user = User::find($userId);
        if ($user === null) {
            return 'unknown_user';
        }

        NotificationPreferences::update($user, [$category => false]);

        return null;
    }

    private function clientUrl(): string
    {
        $url = config('app.client_url');
        $resolved = \is_string($url) ? $url : 'http://localhost:4200';

        return rtrim($resolved, '/');
    }
}
