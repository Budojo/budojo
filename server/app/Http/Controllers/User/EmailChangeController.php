<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Actions\Account\CancelPendingEmailChangeAction;
use App\Actions\Account\RequestEmailChangeAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Account\RequestEmailChangeRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

/**
 * Authenticated `/me/email-change` resource — the user's own controls over
 * their pending email change (#476). The unauthenticated token-verify
 * counterpart lives in `Auth\EmailVerificationController::verifyChange`,
 * next to the primary-email verify it mirrors.
 *
 * - `POST /me/email-change`   — request a change
 * - `DELETE /me/email-change` — cancel an outstanding change
 */
class EmailChangeController extends Controller
{
    public function __construct(
        private readonly RequestEmailChangeAction $requestAction,
        private readonly CancelPendingEmailChangeAction $cancelAction,
    ) {
    }

    public function requestChange(RequestEmailChangeRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $this->requestAction->execute($user, $request->string('email')->toString());

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

    public function cancel(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();

        $this->cancelAction->execute($user);

        return response()->noContent();
    }
}
