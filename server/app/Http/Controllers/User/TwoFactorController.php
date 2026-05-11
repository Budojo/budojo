<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\TwoFactorAuth;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * TOTP-based two-factor authentication endpoints (#412).
 *
 * Three-step enrolment:
 *   1. `POST /me/two-factor/enrol`       → mints a secret, stores it
 *      UNCONFIRMED on the user, returns the otpauth:// URI for
 *      QR-code rendering on the SPA.
 *   2. `POST /me/two-factor/confirm`     → user types a TOTP from
 *      their authenticator; valid → flip `confirmed_at` + mint 8
 *      backup codes; return the plaintext codes ONCE.
 *   3. `POST /me/two-factor/recovery-codes/regenerate` → re-mint 8
 *      codes, invalidating any old ones. Only callable while 2FA is
 *      already active.
 *
 * Disable:
 *   `DELETE /me/two-factor` → wipes all three columns. Requires the
 *   current password as a re-auth gate (defense-in-depth: if a
 *   stolen session reaches the dashboard, the attacker still can't
 *   strip 2FA without the password).
 *
 * **Status**: `GET /me/two-factor` returns the current enrolment
 * shape so the SPA can render the right panel
 * (not-enrolled / pending-confirmation / active).
 */
class TwoFactorController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'data' => [
                'enabled' => $user->two_factor_confirmed_at !== null,
                'pending' => $user->two_factor_secret !== null
                    && $user->two_factor_confirmed_at === null,
                'recovery_codes_remaining' => $user->two_factor_confirmed_at !== null
                    ? \count($user->two_factor_recovery_codes ?? [])
                    : 0,
            ],
        ]);
    }

    public function enrol(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->two_factor_confirmed_at !== null) {
            throw ValidationException::withMessages([
                'two_factor' => 'two_factor_already_enabled',
            ]);
        }

        $secret = TwoFactorAuth::generateSecret();
        $user->forceFill([
            'two_factor_secret' => $secret,
            'two_factor_recovery_codes' => null,
            'two_factor_confirmed_at' => null,
        ])->save();

        return response()->json([
            'data' => [
                'secret' => $secret,
                'provisioning_uri' => TwoFactorAuth::provisioningUri($user, $secret),
            ],
        ]);
    }

    public function confirm(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'code' => ['required', 'string', 'size:6'],
        ]);

        if ($user->two_factor_secret === null) {
            throw ValidationException::withMessages([
                'two_factor' => 'two_factor_not_enrolled',
            ]);
        }

        if ($user->two_factor_confirmed_at !== null) {
            throw ValidationException::withMessages([
                'two_factor' => 'two_factor_already_enabled',
            ]);
        }

        if (! TwoFactorAuth::verifyTotp($user->two_factor_secret, $validated['code'])) {
            throw ValidationException::withMessages([
                'code' => 'invalid_totp',
            ]);
        }

        $codes = TwoFactorAuth::generateRecoveryCodes();
        $user->forceFill([
            'two_factor_recovery_codes' => $codes,
            'two_factor_confirmed_at' => now(),
        ])->save();

        // Plaintext codes returned ONCE here. The SPA must surface
        // them with a "save these somewhere safe — you won't see
        // them again" warning, mirror Google / GitHub / etc.
        return response()->json([
            'data' => [
                'recovery_codes' => $codes,
            ],
        ]);
    }

    public function regenerateRecoveryCodes(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->two_factor_confirmed_at === null) {
            throw ValidationException::withMessages([
                'two_factor' => 'two_factor_not_active',
            ]);
        }

        $codes = TwoFactorAuth::generateRecoveryCodes();
        $user->forceFill(['two_factor_recovery_codes' => $codes])->save();

        return response()->json([
            'data' => [
                'recovery_codes' => $codes,
            ],
        ]);
    }

    public function destroy(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'password' => ['required', 'string'],
        ]);

        if (! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'password' => 'invalid_password',
            ]);
        }

        $user->forceFill([
            'two_factor_secret' => null,
            'two_factor_recovery_codes' => null,
            'two_factor_confirmed_at' => null,
        ])->save();

        return response()->json(['data' => ['disabled' => true]]);
    }
}
