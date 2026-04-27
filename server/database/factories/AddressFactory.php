<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\Country;
use App\Enums\ItalianProvince;
use App\Models\Address;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Address>
 */
class AddressFactory extends Factory
{
    protected $model = Address::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        // Italy-first defaults — matches the API's MVP scope (#72). The
        // `addressable_*` fields are intentionally omitted here: callers
        // attach the address through `morphTo()->associate()` or via the
        // owner's `morphOne` relation, which sets both columns atomically.
        return [
            'line1' => $this->faker->streetAddress(),
            'line2' => $this->faker->boolean(20) ? $this->faker->secondaryAddress() : null,
            'city' => $this->faker->city(),
            'postal_code' => str_pad((string) $this->faker->numberBetween(10000, 99999), 5, '0', STR_PAD_LEFT),
            'province' => $this->faker->randomElement(ItalianProvince::cases())->value,
            'country' => Country::IT->value,
        ];
    }
}
