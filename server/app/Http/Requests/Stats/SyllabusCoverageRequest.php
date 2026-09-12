<?php

declare(strict_types=1);

namespace App\Http\Requests\Stats;

use App\Authorization\Capability;
use App\Enums\TopicKind;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;

/**
 * The syllabus coverage report (#1565).
 *
 * The season is addressed by how many back it is, not by a date: the
 * boundary is `App\Support\Season`'s to resolve, and a client computing it
 * would be a second implementation of the same off-by-one (#1484).
 *
 * `kind` narrows both halves of the fraction. Gi and no-gi never mix — a
 * `gi` topic counted against a no-gi academy produces a number that is
 * quietly wrong, which is worse than no number.
 */
class SyllabusCoverageRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
        return $this->authorizeActiveAcademy(Capability::StatsView);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // Ten years back is further than any academy's data goes and far
            // enough that the cap is never the thing in the way.
            'seasons_back' => ['sometimes', 'integer', 'min:0', 'max:10'],
            // `both` is not a filter value: it is the kind a topic carries
            // when it makes sense either way, and every filter admits it.
            'kind' => ['sometimes', 'nullable', Rule::in([TopicKind::Gi->value, TopicKind::NoGi->value])],
        ];
    }

    public function seasonsBack(): int
    {
        return $this->has('seasons_back') ? $this->integer('seasons_back') : 0;
    }

    public function kind(): ?TopicKind
    {
        $kind = $this->input('kind');

        return \is_string($kind) && $kind !== '' ? TopicKind::from($kind) : null;
    }

    /**
     * The structured envelope every `/api/v1/stats/*` failure uses, rather
     * than Laravel's default AuthorizationException rendering.
     */
    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
