<?php

declare(strict_types=1);

namespace App\Http\Controllers\Account;

use App\Actions\Account\CancelPendingEmailChangeAction;
use App\Actions\Account\ConfirmEmailChangeAction;
use App\Actions\Account\RequestEmailChangeAction;
use App\Exceptions\EmailChangeTokenInvalidException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Account\RequestEmailChangeRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

/**
 * Owner / athlete self-edit endpoints for the email-change-with-
 * verification flow (#476). The controller is thin: validate via the
 * Form Request, delegate to the Action, return a JSON envelope.
 *
 * - `POST /me/email-change`        — request a change (auth required)
 * - `DELETE /me/email-change`      — cancel an outstanding change (auth required)
 * - `POST /email-change/{token}/verify` — public; the click is the auth
 */
class EmailChangeController extends Controller
{
    public function __construct(
        private readonly RequestEmailChangeAction $request,
        private readonly ConfirmEmailChangeAction $confirm,
        private readonly CancelPendingEmailChangeAction $cancel,
    ) {
    }

    public function requestChange(RequestEmailChangeRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $this->request->execute($user, $request->string('email')->toString());

        // 202 Accepted — the change has been LOGGED but not APPLIED.
        // Mirrors the password-reset response shape: the user has more
        // work to do (click the email) before the resource state
        // changes. The body carries a stable string the SPA can read
        // for telemetry; copy is i18n'd client-side.
        return response()->json(
            ['message' => 'verification_link_sent'],
            SymfonyResponse::HTTP_ACCEPTED,
        );
    }

    public function cancel(\Illuminate\Http\Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();

        $this->cancel->execute($user);

        return response()->noContent();
    }

    /**
     * Public verify endpoint. The token in the URL IS the auth — same
     * shape as the athlete-invite preview endpoint. Returns 200 with a
     * stable `{message}` body on success; 410 Gone (with the same
     * stable string the action throws) on expired / consumed / unknown
     * token.
     *
     * Deliberately does NOT auto-login — the conservative anti-leak
     * choice. The SPA's verify-email-change page renders a confirmed
     * panel + bounces to `/auth/login`.
     */
    public function verify(string $token): JsonResponse
    {
        try {
            $this->confirm->execute($token);
        } catch (EmailChangeTokenInvalidException) {
            return response()->json(
                ['message' => 'invalid_or_expired_link'],
                SymfonyResponse::HTTP_GONE,
            );
        }

        return response()->json(['message' => 'email_change_confirmed']);
    }
}
