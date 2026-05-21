<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\AuditEntry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin AuditEntry
 */
class AuditEntryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'action' => $this->action,
            'actor_user_id' => $this->actor_user_id,
            'actor_label' => $this->actor_label,
            'subject_type' => $this->subject_type,
            'subject_id' => $this->subject_id,
            'subject_label' => $this->subject_label,
            'before' => $this->before,
            'after' => $this->after,
            'ip' => $this->ip,
            'user_agent' => $this->user_agent,
            'created_at' => $this->created_at->toIso8601String(),
        ];
    }
}
