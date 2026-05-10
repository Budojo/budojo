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
 * **Unknown category / unknown user_id** — the signature was valid
 * (caller couldn't have forged it without our app key) but either
 * the category isn't in the catalog (`App\Support\NotificationCategory`)
 * or the user row is gone (hard-deleted via the grace window). The
 * GET path 302-redirects to `/unsubscribed?status=invalid` so the SPA
 * renders the "this link is no longer valid" landing; the POST path
 * (RFC 8058 List-Unsubscribe-Post) responds 200 with empty body
 * regardless, since email clients don't surface server-side errors
 * to the user. Nothing to flip in either case.
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
     * Returns null on success, or an opaque error tag the caller can
     * use to choose its response shape. Doesn't throw on validation
     * (unknown category / unknown user) — those resolve to error
     * tags. CAN throw on transport-level failure of the underlying
     * `NotificationPreferences::update` (DB connection drop, write
     * timeout). The framework's default exception handler turns
     * those into a 500; the GET / POST callers don't try to catch
     * them because the email client doesn't surface them anyway.
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
