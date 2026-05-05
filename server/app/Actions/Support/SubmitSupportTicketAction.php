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
        // Both metadata fields originate from request headers (untrusted
        // input) and feed string-typed columns of fixed width. Truncate
        // before persistence so an absurdly long User-Agent or a spoofed
        // X-Budojo-Version can't 500 the request via a "data too long"
        // SQL error. mb_substr keeps the truncation multi-byte-safe.
        $persistedVersion = $appVersion !== '' ? mb_substr($appVersion, 0, 32) : null;
        $persistedUa = $userAgent !== '' ? mb_substr($userAgent, 0, 512) : null;

        /** @var SupportTicket $ticket */
        $ticket = SupportTicket::create([
            'user_id' => $user->id,
            'subject' => $subjectLine,
            'category' => $category,
            'body' => $body,
            'app_version' => $persistedVersion,
            'user_agent' => $persistedUa,
        ]);

        // Capture the image bytes synchronously and pass them inline to
        // the Mailable. The previous shape forwarded the request's temp
        // upload path; that path is bound to the request lifecycle and
        // is gone by the time the queue worker processes the job, so
        // the attachment was unreliable. The validator caps uploads at
        // 5 MB, well within Laravel's LONGTEXT jobs.payload column, so
        // serialising the bytes into the queue payload is the simpler
        // and more durable choice (no tmp-disk + cleanup ceremony).
        $imageBytes = null;
        $imageOriginalName = null;
        if ($image !== null) {
            $imageBytes = file_get_contents($image->getRealPath() ?: '');
            if ($imageBytes === false) {
                $imageBytes = null;
            }
            $imageOriginalName = $image->getClientOriginalName();
        }

        try {
            Mail::to(self::SUPPORT_EMAIL)->queue(new SupportTicketMail(
                subjectLine: $subjectLine,
                category: $category,
                body: $body,
                userEmail: $user->email,
                userName: $user->name,
                appVersion: $persistedVersion ?? 'unknown',
                userAgent: $persistedUa ?? 'unknown',
                imageBytes: $imageBytes,
                imageOriginalName: $imageOriginalName,
            ));
        } catch (\Throwable $e) {
            report($e);
        }

        return $ticket;
    }
}
