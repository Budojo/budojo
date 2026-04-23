<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\DocumentType;
use App\Models\Athlete;
use App\Models\Document;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Document>
 */
class DocumentFactory extends Factory
{
    protected $model = Document::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'athlete_id' => Athlete::factory(),
            'type' => $this->faker->randomElement(DocumentType::cases()),
            'file_path' => 'documents/'.Str::random(40).'.pdf',
            'original_name' => 'certificate.pdf',
            'mime_type' => 'application/pdf',
            'size_bytes' => $this->faker->numberBetween(1000, 5_000_000),
            'issued_at' => $this->faker->optional()->date(),
            'expires_at' => $this->faker->optional()->date(),
            'notes' => $this->faker->optional()->sentence(),
        ];
    }

    /** Factory state: an expired document (expires_at in the past). */
    public function expired(): static
    {
        return $this->state([
            'expires_at' => now()->subDays($this->faker->numberBetween(1, 365))->toDateString(),
        ]);
    }

    /** Factory state: a document expiring within the next N days. */
    public function expiringIn(int $days): static
    {
        return $this->state(fn () => [
            'expires_at' => now()->addDays($days)->toDateString(),
        ]);
    }

    /** Factory state: valid (expires more than 60 days out). */
    public function valid(): static
    {
        return $this->state([
            'expires_at' => now()->addDays($this->faker->numberBetween(61, 365))->toDateString(),
        ]);
    }
}
