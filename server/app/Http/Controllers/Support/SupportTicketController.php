<?php

declare(strict_types=1);

namespace App\Http\Controllers\Support;

use App\Actions\Support\SubmitSupportTicketAction;
use App\Enums\SupportTicketCategory;
use App\Http\Controllers\Controller;
use App\Http\Requests\Support\SubmitSupportTicketRequest;
use App\Http\Resources\SupportTicketResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;

class SupportTicketController extends Controller
{
    public function __construct(
        private readonly SubmitSupportTicketAction $submitAction,
    ) {
    }

    public function store(SubmitSupportTicketRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $ticket = $this->submitAction->execute(
            user: $user,
            subjectLine: $request->string('subject')->toString(),
            category: SupportTicketCategory::from($request->string('category')->toString()),
            body: $request->string('body')->toString(),
        );

        // 202 Accepted — the row is persisted but the side-effect
        // (mail delivery) is asynchronous via the queue. Same shape
        // as the feedback endpoint (#311) so SPA error handling stays
        // uniform.
        return SupportTicketResource::make($ticket)
            ->response()
            ->setStatusCode(202);
    }
}
