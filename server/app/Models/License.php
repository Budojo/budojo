<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * An activation key this instance has accepted (#1290).
 *
 * Deliberately dumb. The row holds the key exactly as it was pasted and the
 * moment it was accepted — nothing derived. Everything a key claims (licensee,
 * expiry) lives inside the signed payload and is re-read by
 * `LicenseKey::verify()` on every use; a cached `expires_at` column would be a
 * second source of truth that an UPDATE could quietly desynchronise from what
 * was actually signed.
 *
 * Activations accumulate rather than overwrite: a renewal is a new row, and the
 * most recent one is the licence in force. The history is worth keeping — it is
 * the only record of what was activated when.
 *
 * @property int $id
 * @property string $key
 * @property \Carbon\CarbonImmutable $activated_at
 */
class License extends Model
{
    /** @var list<string> */
    protected $fillable = [
        'key',
        'activated_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'activated_at' => 'immutable_datetime',
        ];
    }
}
