<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\TopicKind;
use Carbon\Carbon;
use Database\Factories\SyllabusTopicFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * One entry in an academy's programme (#1563) — a position when `parent_id`
 * is null ("Closed guard"), a technique under it otherwise ("Armbar").
 *
 * Per academy, never global: the shipped BJJ starter is copied into rows the
 * academy owns from the first minute, so renaming, cutting and adding are
 * unconstrained. Soft-deleted rather than removed, because a lesson that
 * taught a topic must still be able to say so after the topic is gone.
 *
 * @property int         $id
 * @property int         $academy_id
 * @property int|null    $parent_id
 * @property string      $name
 * @property TopicKind   $kind
 * @property bool        $in_season   In scope for the current season — the coverage denominator
 * @property int         $sort_order
 * @property Carbon      $created_at
 * @property Carbon      $updated_at
 * @property Carbon|null $deleted_at
 */
#[Fillable(['academy_id', 'parent_id', 'name', 'kind', 'in_season', 'sort_order'])]
class SyllabusTopic extends Model
{
    /** @use HasFactory<SyllabusTopicFactory> */
    use HasFactory;
    use SoftDeletes;

    /** @return BelongsTo<Academy, $this> */
    public function academy(): BelongsTo
    {
        return $this->belongsTo(Academy::class);
    }

    /** @return BelongsTo<SyllabusTopic, $this> */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    /**
     * The techniques under a position, in the order the owner keeps them.
     *
     * @return HasMany<SyllabusTopic, $this>
     */
    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('sort_order')->orderBy('name');
    }

    /**
     * Positions only — the top level of the tree.
     *
     * @param  Builder<SyllabusTopic>  $query
     * @return Builder<SyllabusTopic>
     */
    public function scopePositions(Builder $query): Builder
    {
        return $query->whereNull('parent_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'in_season' => 'boolean',
            'sort_order' => 'integer',
            'kind' => TopicKind::class,
        ];
    }
}
