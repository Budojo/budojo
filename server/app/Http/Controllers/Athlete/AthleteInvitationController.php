<?php

declare(strict_types=1);

namespace App\Http\Controllers\Athlete;

use App\Actions\Athlete\SendAthleteInvitationAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Athlete\InviteAthleteRequest;
use App\Http\Resources\AthleteInvitationResource;
use App\Models\Athlete;
use App\Models\AthleteInvitation;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

/**
 * Owner-side endpoints for the athlete invitation lifecycle (#445, M7 PR-B):
 *
 * - `POST  /api/v1/athletes/{athlete}/invite`         — create or refresh a pending invite
 * - `POST  /api/v1/athletes/{athlete}/invite/resend`  — same shape, kept as a separate URL so the SPA UI can wire two distinct buttons unambiguously (and a future audit hook can differentiate first-send from resend)
 * - `DELETE /api/v1/athletes/{athlete}/invitations/{invitation}` — revoke
 *
 * Controllers stay thin: validate via the Form Request, delegate to
 * the Action, return a Resource. No business logic here.
 */
class AthleteInvitationController extends Controller
{
    public function __construct(private readonly SendAthleteInvitationAction $sender)
    {
    }

    public function store(InviteAthleteRequest $request, Athlete $athlete): JsonResponse
    {
        $sender = $request->user();
        \assert($sender !== null);

        $result = $this->sender->execute($sender, $athlete);

        return new AthleteInvitationResource($result['invitation'])
            ->response()
            ->setStatusCode(SymfonyResponse::HTTP_CREATED);
    }

    /**
     * Resend re-uses `SendAthleteInvitationAction::execute()` — same
     * action handles both first-send and refresh of a pending row.
     * Distinct route so the SPA UI can wire two buttons + so a future
     * audit hook can branch on the URL. 200 here (vs 201 on store) so
     * the SPA can tell first-send from resend on the wire.
     */
    public function resend(InviteAthleteRequest $request, Athlete $athlete): AthleteInvitationResource
    {
        $sender = $request->user();
        \assert($sender !== null);

        $result = $this->sender->execute($sender, $athlete);

        return new AthleteInvitationResource($result['invitation']);
    }

    public function destroy(InviteAthleteRequest $request, Athlete $athlete, AthleteInvitation $invitation): Response
    {
        // Defensive: route binding doesn't enforce that the invitation
        // belongs to the path athlete. Mismatch raises Laravel's
        // standard ModelNotFoundException → 404 with the same response
        // body shape the framework returns for any other unknown route
        // model — so a caller can't distinguish "exists but belongs to
        // a different athlete" from "doesn't exist at all".
        if ($invitation->athlete_id !== $athlete->id) {
            throw new ModelNotFoundException()->setModel(AthleteInvitation::class);
        }

        $this->sender->revoke($invitation);

        return response()->noContent();
    }
}
