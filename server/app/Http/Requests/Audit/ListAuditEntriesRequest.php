<?php

declare(strict_types=1);

namespace App\Http\Requests\Audit;

use App\Models\User;
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
        ];
    }
}
