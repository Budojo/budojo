<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\AcademyFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int         $id
 * @property int         $user_id
 * @property string      $name
 * @property string      $slug
 * @property string|null $address
 * @property string|null $logo_path
 * @property int|null    $monthly_fee_cents
 */
#[Fillable(['user_id', 'name', 'slug', 'address', 'logo_path', 'monthly_fee_cents'])]
class Academy extends Model
{
    /** @use HasFactory<AcademyFactory> */
    use HasFactory;

    /** @return BelongsTo<User, $this> */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** @return HasMany<Athlete, $this> */
    public function athletes(): HasMany
    {
        return $this->hasMany(Athlete::class);
    }
}
