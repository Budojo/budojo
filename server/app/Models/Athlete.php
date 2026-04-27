<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Observers\AthleteObserver;
use Database\Factories\AthleteFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property int                     $id
 * @property int                     $academy_id
 * @property string                  $first_name
 * @property string                  $last_name
 * @property string|null             $email
 * @property string|null             $phone_country_code     E.164 prefix incl. `+`, e.g. `+39`. Pair with `phone_national_number` (#75).
 * @property string|null             $phone_national_number  Unformatted national digits, e.g. `3331234567`. Both columns null OR both filled.
 * @property \Carbon\Carbon|null     $date_of_birth
 * @property Belt                    $belt
 * @property int                     $stripes
 * @property AthleteStatus           $status
 * @property \Carbon\Carbon          $joined_at
 * @property \Carbon\Carbon|null     $created_at
 * @property \Carbon\Carbon|null     $updated_at
 * @property \Carbon\Carbon|null     $deleted_at
 */
#[Fillable(['academy_id', 'first_name', 'last_name', 'email', 'phone_country_code', 'phone_national_number', 'date_of_birth', 'belt', 'stripes', 'status', 'joined_at'])]
#[ObservedBy([AthleteObserver::class])]
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

    /** @return HasMany<Document, $this> */
    public function documents(): HasMany
    {
        return $this->hasMany(Document::class);
    }

    /** @return HasMany<AttendanceRecord, $this> */
    public function attendanceRecords(): HasMany
    {
        return $this->hasMany(AttendanceRecord::class);
    }

    /** @return HasMany<AthletePayment, $this> */
    public function payments(): HasMany
    {
        return $this->hasMany(AthletePayment::class);
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
