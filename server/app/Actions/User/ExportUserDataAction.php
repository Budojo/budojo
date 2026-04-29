<?php

declare(strict_types=1);

namespace App\Actions\User;

use App\Models\Academy;
use App\Models\Address;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Models\AttendanceRecord;
use App\Models\Document;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * Compiles every byte we hold about an authenticated user into a single
 * machine-readable structure. Powers GET /api/v1/me/export — the
 * GDPR Art. 20 (data portability) endpoint requested in #222.
 *
 * The output is intentionally **flat domain data**, not API resources:
 *   - no HATEOAS links (the export is for the user, not for our SPA)
 *   - no pagination wrappers
 *   - no derived "current month paid" — those are controller-level
 *     conveniences, not part of the persisted data the user owns
 *
 * A single envelope at the top (`version`, `exported_at`, `data`) keeps
 * the file self-describing — a future schema evolution can bump
 * `version` and downstream tooling stays able to discriminate.
 */
class ExportUserDataAction
{
    public const SCHEMA_VERSION = '1.0';

    /**
     * @return array{version: string, exported_at: string, data: array<string, mixed>}
     */
    public function execute(User $user): array
    {
        // Eager-load every relation we ship so the array build doesn't
        // fan into N+1 even on academies with hundreds of athletes.
        $user->load([
            'academy.address',
            'academy.athletes.address',
            'academy.athletes.documents',
            'academy.athletes.payments',
            'academy.athletes.attendanceRecords',
            'tokens',
        ]);

        return [
            'version' => self::SCHEMA_VERSION,
            'exported_at' => Carbon::now()->toIso8601String(),
            'data' => [
                'user' => $this->serializeUser($user),
                'academy' => $user->academy === null ? null : $this->serializeAcademy($user->academy),
                'athletes' => $user->academy === null
                    ? []
                    : $user->academy->athletes->map(fn (Athlete $a): array => $this->serializeAthlete($a))->all(),
                'personal_access_tokens' => $user->tokens
                    ->map(fn ($t): array => [
                        'id' => $t->id,
                        'name' => $t->name,
                        'last_used_at' => $t->last_used_at?->toIso8601String(),
                        'expires_at' => $t->expires_at?->toIso8601String(),
                        'created_at' => $t->created_at?->toIso8601String(),
                    ])
                    ->all(),
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function serializeUser(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'email_verified_at' => $user->email_verified_at?->toIso8601String(),
            'created_at' => $user->created_at->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    private function serializeAcademy(Academy $academy): array
    {
        return [
            'id' => $academy->id,
            'name' => $academy->name,
            'slug' => $academy->slug,
            'phone_country_code' => $academy->phone_country_code,
            'phone_national_number' => $academy->phone_national_number,
            'website' => $academy->website,
            'facebook' => $academy->facebook,
            'instagram' => $academy->instagram,
            'monthly_fee_cents' => $academy->monthly_fee_cents,
            'training_days' => $academy->training_days,
            'logo_path' => $academy->logo_path,
            'address' => $this->serializeAddress($academy->address),
            'created_at' => $academy->created_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    private function serializeAthlete(Athlete $athlete): array
    {
        return [
            'id' => $athlete->id,
            'first_name' => $athlete->first_name,
            'last_name' => $athlete->last_name,
            'email' => $athlete->email,
            'phone_country_code' => $athlete->phone_country_code,
            'phone_national_number' => $athlete->phone_national_number,
            'website' => $athlete->website,
            'facebook' => $athlete->facebook,
            'instagram' => $athlete->instagram,
            'date_of_birth' => $athlete->date_of_birth?->toDateString(),
            'belt' => $athlete->belt->value,
            'stripes' => $athlete->stripes,
            'status' => $athlete->status->value,
            'joined_at' => $athlete->joined_at->toDateString(),
            'created_at' => $athlete->created_at?->toIso8601String(),
            'address' => $this->serializeAddress($athlete->address),
            'documents' => $athlete->documents
                ->map(fn (Document $d): array => $this->serializeDocument($d))
                ->all(),
            'payments' => $athlete->payments
                ->map(fn (AthletePayment $p): array => $this->serializePayment($p))
                ->all(),
            'attendances' => $athlete->attendanceRecords
                ->map(fn (AttendanceRecord $r): array => $this->serializeAttendance($r))
                ->all(),
        ];
    }

    /** @return array<string, mixed>|null */
    private function serializeAddress(?Address $address): ?array
    {
        if ($address === null) {
            return null;
        }

        return [
            'line1' => $address->line1,
            'line2' => $address->line2,
            'city' => $address->city,
            'postal_code' => $address->postal_code,
            'province' => $address->province?->value,
            'country' => $address->country->value,
        ];
    }

    /** @return array<string, mixed> */
    private function serializeDocument(Document $doc): array
    {
        return [
            'id' => $doc->id,
            'type' => $doc->type->value,
            'original_name' => $doc->original_name,
            'mime_type' => $doc->mime_type,
            'size_bytes' => $doc->size_bytes,
            'issued_at' => $doc->issued_at?->toDateString(),
            'expires_at' => $doc->expires_at?->toDateString(),
            'notes' => $doc->notes,
            'deleted_at' => $doc->deleted_at?->toIso8601String(),
            'created_at' => $doc->created_at?->toIso8601String(),
            // `file_path` is intentionally surfaced — the ZIP formatter
            // uses it to reconstruct the file tree; bare-JSON consumers
            // can ignore it.
            'storage_path' => $doc->file_path,
        ];
    }

    /** @return array<string, mixed> */
    private function serializePayment(AthletePayment $payment): array
    {
        return [
            'id' => $payment->id,
            'year' => $payment->year,
            'month' => $payment->month,
            'amount_cents' => $payment->amount_cents,
            'paid_at' => $payment->paid_at->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    private function serializeAttendance(AttendanceRecord $record): array
    {
        return [
            'id' => $record->id,
            'attended_on' => $record->attended_on->toDateString(),
            'created_at' => $record->created_at?->toIso8601String(),
        ];
    }
}
