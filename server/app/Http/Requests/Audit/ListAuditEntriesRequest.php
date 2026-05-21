<?php

declare(strict_types=1);

namespace App\Http\Requests\Audit;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;

class ListAuditEntriesRequest extends FormRequest
{
    public function authorize(): bool
    {
        /** @var User|null $user */
        $user = $this->user();

        // Owner-only surface; the route ALSO sits inside the
        // `role:owner` middleware group as defense-in-depth.
        return $user !== null
            && $user->isOwner()
            && $user->activeAcademyId() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'action' => ['nullable', 'string', 'max:80'],
            'actor_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
            'subject_type' => ['nullable', 'string', 'max:120'],
            'subject_id' => ['nullable', 'integer'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }

    // Typed accessors: narrows validated() once so the controller stays receive → delegate.

    public function actionFilter(): ?string
    {
        $value = $this->validated('action');

        return \is_string($value) && $value !== '' ? $value : null;
    }

    public function actorUserIdFilter(): ?int
    {
        $value = $this->validated('actor_user_id');

        return is_numeric($value) ? (int) $value : null;
    }

    public function fromFilter(): ?CarbonImmutable
    {
        $value = $this->validated('from');
        if (! \is_string($value) || $value === '') {
            return null;
        }
        // `!Y-m-d` zeroes the time portion so the day boundary doesn't
        // drift with the wall clock on a midday request.
        $parsed = CarbonImmutable::createFromFormat('!Y-m-d', $value);

        return $parsed instanceof CarbonImmutable ? $parsed : null;
    }

    public function toFilter(): ?CarbonImmutable
    {
        $value = $this->validated('to');
        if (! \is_string($value) || $value === '') {
            return null;
        }
        $parsed = CarbonImmutable::createFromFormat('!Y-m-d', $value);

        return $parsed instanceof CarbonImmutable ? $parsed : null;
    }

    public function subjectTypeFilter(): ?string
    {
        $value = $this->validated('subject_type');

        return \is_string($value) && $value !== '' ? $value : null;
    }

    public function subjectIdFilter(): ?int
    {
        $value = $this->validated('subject_id');

        return is_numeric($value) ? (int) $value : null;
    }

    public function perPage(): int
    {
        $value = $this->validated('per_page');

        return is_numeric($value) ? (int) $value : 20;
    }
}
