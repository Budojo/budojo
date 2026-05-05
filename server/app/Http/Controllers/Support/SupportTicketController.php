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
            // Server-derived context — never asked from the user. The
            // SPA sets X-Budojo-Version on every request via an HTTP
            // interceptor; the User-Agent is the standard browser one.
            appVersion: (string) $request->header('X-Budojo-Version', ''),
            userAgent: $request->userAgent() ?? '',
            // Optional screenshot. The FormRequest already validated
            // mime type + size; here we just thread it through.
            image: $request->file('image'),
        );

        // 202 Accepted — the row is persisted but the side-effect
        // (mail delivery) is asynchronous via the queue.
        return SupportTicketResource::make($ticket)
            ->response()
            ->setStatusCode(202);
    }
}
