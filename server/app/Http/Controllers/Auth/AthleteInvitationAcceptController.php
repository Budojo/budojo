<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\AcceptAthleteInvitationAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\AcceptAthleteInvitationRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public-facing controller for the athlete invitation accept flow
 * (#445, M7 PR-C). Two endpoints, both unauthenticated — the raw
 * token in the URL is the auth.
 *
 * - GET  /api/v1/athlete-invite/{token}/preview  — pre-fill snapshot
 * - POST /api/v1/athlete-invite/{token}/accept   — consume + login
 */
class AthleteInvitationAcceptController extends Controller
{
    public function __construct(private readonly AcceptAthleteInvitationAction $action)
    {
    }

    /**
     * Preview never reveals data the URL holder can't already see if
     * the token is valid. We return a flat shape with the athlete's
     * first / last name, the email we'll create the account with, and
     * the academy's public-facing name. 404 on any non-pending state
     * (unknown / revoked / expired / accepted) so the SPA renders the
     * friendly error page.
     */
    public function preview(Request $request, string $token): JsonResponse
    {
        $invitation = $this->action->preview($token);

        if ($invitation === null) {
            return response()->json(['message' => 'Invitation not found.'], 404);
        }

        // The action's `preview()` only returns rows where the
        // pending() scope hit + eagerly loads both relations. Since
        // athlete_id / academy_id are FK-required, the relations are
        // hydrated by the time we land here.
        $athlete = $invitation->athlete;
        $academy = $invitation->academy;

        return response()->json([
            'data' => [
                'first_name' => $athlete->first_name,
                'last_name' => $athlete->last_name,
                'email' => $invitation->email,
                'academy_name' => $academy->name,
                'expires_at' => $invitation->expires_at->toIso8601String(),
            ],
        ]);
    }

    public function accept(AcceptAthleteInvitationRequest $request, string $token): JsonResponse
    {
        /** @var array{password: string, accept_privacy: bool, accept_terms: bool} $validated */
        $validated = $request->validated();

        $result = $this->action->execute($token, $validated['password']);

        return response()->json([
            'data' => [
                'token' => $result['token']->plainTextToken,
                'user' => [
                    'id' => $result['user']->id,
                    'name' => $result['user']->name,
                    'email' => $result['user']->email,
                    'role' => $result['user']->role->value,
                ],
            ],
        ], 201);
    }
}
