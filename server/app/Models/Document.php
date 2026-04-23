<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\DocumentType;
use Database\Factories\DocumentFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property int                 $id
 * @property int                 $athlete_id
 * @property DocumentType        $type
 * @property string              $file_path
 * @property string              $original_name
 * @property string              $mime_type
 * @property int                 $size_bytes
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
    'issued_at',
    'expires_at',
    'notes',
])]
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
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => DocumentType::class,
            'issued_at' => 'date',
            'expires_at' => 'date',
            'size_bytes' => 'integer',
        ];
    }
}
