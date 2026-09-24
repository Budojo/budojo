<?php

declare(strict_types=1);

namespace App\Http\Requests\Stats;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\SyllabusTopic;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Who has seen one technique (#1745).
 *
 * Behind `stats_view`, beside the academy-wide coverage report it drills into:
 * the reader is the owner planning the season. Route binding does not scope
 * the topic to an academy, so a topic from another one is refused here — with
 * the same 403 every other foreign programme row gets (`SyllabusTopicTest`),
 * rather than a 404 that would make this the one endpoint answering
 * differently.
 */
class TopicExposureRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
        if (! $this->authorizeActiveAcademy(Capability::StatsView)) {
            return false;
        }

        $topic = $this->route('syllabusTopic');
        if (! $topic instanceof SyllabusTopic) {
            // Unbound: model binding answers 404 downstream, and a 403 here
            // would hide a wrong id behind a permissions answer.
            return true;
        }

        /** @var User|null $user */
        $user = $this->user();

        return $topic->academy_id === $user?->activeAcademyId();
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // Mirrors the coverage report it drills into.
            'seasons_back' => ['sometimes', 'integer', 'min:0', 'max:10'],
        ];
    }

    public function seasonsBack(): int
    {
        return $this->has('seasons_back') ? $this->integer('seasons_back') : 0;
    }

    /**
     * The structured envelope every `/api/v1/stats/*` failure uses.
     */
    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
