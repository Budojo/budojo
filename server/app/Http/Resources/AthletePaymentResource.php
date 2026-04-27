<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\AthletePayment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AthletePaymentResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var AthletePayment $payment */
        $payment = $this->resource;

        return [
            'id' => $payment->id,
            'athlete_id' => $payment->athlete_id,
            'year' => $payment->year,
            'month' => $payment->month,
            'amount_cents' => $payment->amount_cents,
            'paid_at' => $payment->paid_at->toIso8601String(),
        ];
    }
}
