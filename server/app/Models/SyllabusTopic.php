<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\Belt;
use App\Enums\TrainingMode;
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
 * @property TrainingMode   $kind
 * @property bool        $in_season   In scope for the current season — the coverage denominator
 * @property Belt|null   $from_belt   The grade it belongs to the programme from (#1861); null for everyone
 * @property int         $sort_order
 * @property Carbon      $created_at
 * @property Carbon      $updated_at
 * @property Carbon|null $deleted_at
 */
#[Fillable(['academy_id', 'parent_id', 'name', 'kind', 'in_season', 'from_belt', 'sort_order'])]
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

    /**
     * The position a technique sits under.
     *
     * `withTrashed()` for the same reason {@see Lesson::topics()} carries it:
     * a technique whose position has been taken out of the programme must
     * still be able to say which position that was, or the lessons naming it
     * lose half their meaning the moment the owner tidies up.
     *
     * @return BelongsTo<SyllabusTopic, $this>
     */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id')->withTrashed();
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
     * What a class in `$mode` could be told to teach: in season, a technique
     * and not a position, of a kind the mode admits
     * ({@see TrainingMode::admittedTopicModes()}). Living rows only, through
     * the soft-delete scope. The one definition the suggestions (#1566) and
     * tonight's room (#1860) share, so the two can never disagree about scope.
     *
     * @param  Builder<SyllabusTopic>  $query
     * @return Builder<SyllabusTopic>
     */
    public function scopeTeachableIn(Builder $query, TrainingMode $mode): Builder
    {
        $admitted = $mode->admittedTopicModes();

        return $query
            ->where('in_season', true)
            ->whereNotNull('parent_id')
            ->when($admitted !== null, static fn (Builder $q) => $q->whereIn('kind', $admitted));
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'in_season' => 'boolean',
            'sort_order' => 'integer',
            'kind' => TrainingMode::class,
            'from_belt' => Belt::class,
        ];
    }
}
