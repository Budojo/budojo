<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use Database\Factories\AthleteFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property int                     $id
 * @property int                     $academy_id
 * @property string                  $first_name
 * @property string                  $last_name
 * @property string|null             $email
 * @property string|null             $phone
 * @property \Carbon\Carbon|null     $date_of_birth
 * @property Belt                    $belt
 * @property int                     $stripes
 * @property AthleteStatus           $status
 * @property \Carbon\Carbon          $joined_at
 * @property \Carbon\Carbon|null     $created_at
 * @property \Carbon\Carbon|null     $updated_at
 * @property \Carbon\Carbon|null     $deleted_at
 */
#[Fillable(['academy_id', 'first_name', 'last_name', 'email', 'phone', 'date_of_birth', 'belt', 'stripes', 'status', 'joined_at'])]
class Athlete extends Model
{
    /** @use HasFactory<AthleteFactory> */
    use HasFactory;

    use SoftDeletes;

    /** @return BelongsTo<Academy, $this> */
    public function academy(): BelongsTo
    {
        return $this->belongsTo(Academy::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'belt' => Belt::class,
            'status' => AthleteStatus::class,
            'date_of_birth' => 'date',
            'joined_at' => 'date',
            'stripes' => 'integer',
        ];
    }
}
