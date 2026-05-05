<?php

declare(strict_types=1);

namespace App\Actions\Support;

use App\Enums\SupportTicketCategory;
use App\Mail\SupportTicketMail;
use App\Models\SupportTicket;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;

/**
 * Orchestrates a /api/v1/support submission (#423):
 *
 * 1. Persists a `support_tickets` row — the durable audit trail.
 * 2. Queues a `SupportTicketMail` to the support inbox with Reply-To
 *    set to the user, so a reply lands in their mailbox directly.
 *
 * The mail dispatch is **best-effort**. The ticket row is the load-
 * bearing artefact (the user has expressed they want help) — a queue
 * insert failure (DB blip on the jobs table, transient serialization
 * regression) must NOT 500 the request and leave the user thinking
 * nothing happened. We `report()` the throwable so a recurring
 * failure surfaces in the error channel, then return the persisted
 * row regardless. Same pattern as `RegisterUserAction`'s welcome
 * mail.
 */
class SubmitSupportTicketAction
{
    /**
     * Recipient for every support email. Hardcoded by design — single-
     * owner product, single inbox. Mirrors the constant on
     * `SubmitFeedbackAction` (#311); a future "support team" mailbox
     * would extract this to config.
     */
    public const string SUPPORT_EMAIL = 'matteo.bonanno@budojo.it';

    public function execute(
        User $user,
        string $subjectLine,
        SupportTicketCategory $category,
        string $body,
        string $appVersion = '',
        string $userAgent = '',
        ?UploadedFile $image = null,
    ): SupportTicket {
        // Truncate user-agent to the column width — some testing /
        // automation tools emit absurdly long UA strings that would
        // otherwise blow the schema.
        $persistedUa = $userAgent !== '' ? mb_substr($userAgent, 0, 512) : null;

        /** @var SupportTicket $ticket */
        $ticket = SupportTicket::create([
            'user_id' => $user->id,
            'subject' => $subjectLine,
            'category' => $category,
            'body' => $body,
            'app_version' => $appVersion !== '' ? $appVersion : null,
            'user_agent' => $persistedUa,
        ]);

        // The optional image is forwarded to the Mailable as an
        // attachment but never persisted on disk: ticket rows are the
        // audit trail, the image is a transient triage hint. Same shape
        // as the legacy feedback flow.
        $imagePath = $image?->getRealPath();
        if ($imagePath === false) {
            $imagePath = null;
        }

        try {
            Mail::to(self::SUPPORT_EMAIL)->queue(new SupportTicketMail(
                subjectLine: $subjectLine,
                category: $category,
                body: $body,
                userEmail: $user->email,
                userName: $user->name,
                appVersion: $appVersion !== '' ? $appVersion : 'unknown',
                userAgent: $userAgent !== '' ? $userAgent : 'unknown',
                imagePath: $imagePath,
                imageOriginalName: $image?->getClientOriginalName(),
            ));
        } catch (\Throwable $e) {
            report($e);
        }

        return $ticket;
    }
}
