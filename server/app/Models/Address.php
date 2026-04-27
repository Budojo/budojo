<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\Country;
use App\Enums\ItalianProvince;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * Polymorphic address (#72) — attached to any owner via Laravel's `morphTo`.
 * Today the only owner is `Academy`; in M5+ this will extend to athletes
 * and possibly instructors with zero schema change.
 *
 * @property int                       $id
 * @property string                    $addressable_type
 * @property int                       $addressable_id
 * @property string|null               $line1
 * @property string|null               $line2
 * @property string|null               $city
 * @property string|null               $postal_code
 * @property ItalianProvince|null      $province  Cast only when country=IT; non-IT addresses store null here.
 * @property Country                   $country
 * @property \Carbon\Carbon|null       $created_at
 * @property \Carbon\Carbon|null       $updated_at
 */
#[Fillable(['line1', 'line2', 'city', 'postal_code', 'province', 'country'])]
class Address extends Model
{
    /** @use HasFactory<\Database\Factories\AddressFactory> */
    use HasFactory;

    /** @return MorphTo<Model, $this> */
    public function addressable(): MorphTo
    {
        return $this->morphTo();
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'province' => ItalianProvince::class,
            'country' => Country::class,
        ];
    }
}
