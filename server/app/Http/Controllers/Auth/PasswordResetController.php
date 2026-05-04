<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\RequestPasswordResetAction;
use App\Actions\Auth\ResetPasswordAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;

class PasswordResetController extends Controller
{
    public function __construct(
        private readonly RequestPasswordResetAction $requestAction,
        private readonly ResetPasswordAction $resetAction,
    ) {
    }

    /**
     * `POST /api/v1/auth/forgot-password` — request a password-reset link
     * by email. Always returns 202 to defeat account enumeration; the
     * email is queued only when the address actually corresponds to a
     * user (handled inside the broker).
     */
    public function request(ForgotPasswordRequest $request): Response
    {
        $this->requestAction->execute($request->string('email')->toString());

        return response()->noContent(202);
    }

    /**
     * `POST /api/v1/auth/reset-password` — consume a token + set a new
     * password. 200 on success.
     *
     * Two distinct 422 shapes the SPA must handle:
     *   1. **Form-level validation errors** (the FormRequest fires
     *      first): missing email, malformed email, missing token,
     *      missing password, `password` < 8 chars, `password` not
     *      confirmed → `errors` carries the offending field name
     *      (`email` / `token` / `password` / `password_confirmation`).
     *   2. **Broker failures** (token invalid / expired / unknown
     *      email / token already consumed): collapsed to an
     *      `errors.email` payload by the controller below — the SPA
     *      treats this as "the link is invalid or has expired" and
     *      offers a "Request a new link" CTA without trying to
     *      differentiate which branch failed.
     */
    public function reset(ResetPasswordRequest $request): JsonResponse
    {
        $status = $this->resetAction->execute(
            email: $request->string('email')->toString(),
            token: $request->string('token')->toString(),
            password: $request->string('password')->toString(),
        );

        if ($status !== Password::PASSWORD_RESET) {
            // Surface the broker's failure as a validation error on
            // `email` — that's the field the SPA's reset-password form
            // can highlight without leaking which check failed (token
            // expired vs. user gone vs. token already consumed).
            throw ValidationException::withMessages([
                'email' => __($status),
            ]);
        }

        return response()->json(['message' => __($status)]);
    }
}
