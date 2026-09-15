<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\DocumentType;
use App\Observers\Audit\DocumentAuditObserver;
use Database\Factories\DocumentFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Query\Builder as QueryBuilder;

/**
 * @property int                 $id
 * @property int                 $athlete_id
 * @property DocumentType        $type
 * @property string              $file_path
 * @property string              $original_name
 * @property string              $mime_type
 * @property int                 $size_bytes
 * @property bool                $is_encrypted At-rest encryption flag (#224). True ⇒ bytes on disk are AES-256-GCM ciphertext via `App\Support\DocumentEncryption`; false ⇒ plaintext (pre-#224 uploads, or non-medical types that don't carry special-category data).
 * @property \Carbon\Carbon|null $issued_at
 * @property \Carbon\Carbon|null $expires_at
 * @property string|null         $notes
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 * @property \Carbon\Carbon|null $deleted_at
 */
#[Fillable([
    'athlete_id',
    'type',
    'file_path',
    'original_name',
    'mime_type',
    'size_bytes',
    'is_encrypted',
    'issued_at',
    'expires_at',
    'notes',
])]
#[ObservedBy([DocumentAuditObserver::class])]
class Document extends Model
{
    /** @use HasFactory<DocumentFactory> */
    use HasFactory;

    use SoftDeletes;

    /** @return BelongsTo<Athlete, $this> */
    public function athlete(): BelongsTo
    {
        return $this->belongsTo(Athlete::class);
    }

    /**
     * Drop the medical certificates a later one has replaced.
     *
     * A row is **superseded** when the same athlete has another live
     * medical-certificate row with a strictly greater `expires_at` — or the
     * same `expires_at` and a greater `id`, so a re-upload of an identical
     * date supersedes exactly one way round and never both at once. Live
     * means `deleted_at is null`: a trashed certificate replaces nothing,
     * including one the 24-month purge has taken.
     *
     * Only medical certificates have a renewal cycle the product models, so
     * only they can be superseded. An ID card, an insurance paper and an
     * `other` row pass through untouched — there is no "the new one" for
     * those, only more documents.
     *
     * Rows with `expires_at = null` sit outside the rule entirely: they
     * neither supersede nor are superseded. An undated row says nothing
     * about when coverage ends, so it cannot be evidence that coverage was
     * renewed — and it is already invisible to every caller of this scope,
     * which all filter on a date.
     *
     * @param  Builder<$this>  $query
     * @return Builder<$this>
     */
    public function scopeNotSuperseded(Builder $query): Builder
    {
        return $query->where(function (Builder $kept): void {
            $kept
                ->where('documents.type', '!=', DocumentType::MedicalCertificate->value)
                ->orWhereNotExists(function (QueryBuilder $newer): void {
                    $newer
                        ->selectRaw('1')
                        ->from('documents as newer_cert')
                        ->whereColumn('newer_cert.athlete_id', 'documents.athlete_id')
                        ->where('newer_cert.type', DocumentType::MedicalCertificate->value)
                        ->whereNull('newer_cert.deleted_at')
                        ->whereNotNull('newer_cert.expires_at')
                        ->whereNotNull('documents.expires_at')
                        ->where(function (QueryBuilder $later): void {
                            $later
                                ->whereColumn('newer_cert.expires_at', '>', 'documents.expires_at')
                                ->orWhere(function (QueryBuilder $tie): void {
                                    $tie
                                        ->whereColumn('newer_cert.expires_at', '=', 'documents.expires_at')
                                        ->whereColumn('newer_cert.id', '>', 'documents.id');
                                });
                        });
                });
        });
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => DocumentType::class,
            'issued_at' => 'date',
            'expires_at' => 'date',
            'size_bytes' => 'integer',
            'is_encrypted' => 'boolean',
        ];
    }
}
