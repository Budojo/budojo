<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\Belt;
use App\Enums\AthleteStatus;
use App\Models\Academy;
use App\Models\Athlete;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Athlete>
 */
class AthleteFactory extends Factory
{
    protected $model = Athlete::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        // 50% of athletes have a phone on file. We hand-pick an Italian
        // mobile-prefix combination that libphonenumber considers reachable
        // — `+39` + `333xxxxxxx` — so factory rows pass the same validation
        // as user-submitted data and downstream tests don't need to special-
        // case the phone shape.
        $hasPhone = $this->faker->boolean(50);

        // Contact-link probabilities — picked low so demo data feels
        // realistic (not every athlete shares a website / FB / IG) while
        // populating ENOUGH rows to surface the v2.1.x list-row icons
        // feature visually. The icons render conditionally per athlete
        // when their respective field is non-null.
        //
        // URLs intentionally land on `example.com` (IETF-reserved demo
        // domain) so a tester clicking a seeded link never accidentally
        // navigates to a real Facebook / Instagram profile that happens
        // to share a faker-generated username. The list-row icons
        // (`pi-facebook` / `pi-instagram`) render off the column being
        // populated, NOT off the URL domain — so safe placeholders
        // still demonstrate the feature.
        $slug = $this->faker->unique()->userName();
        $hasWebsite   = $this->faker->boolean(20);
        $hasFacebook  = $this->faker->boolean(40);
        $hasInstagram = $this->faker->boolean(50);

        return [
            'academy_id'            => Academy::factory(),
            'first_name'            => $this->faker->firstName(),
            'last_name'             => $this->faker->lastName(),
            'email'                 => $this->faker->boolean(70) ? $this->faker->unique()->safeEmail() : null,
            'phone_country_code'    => $hasPhone ? '+39' : null,
            'phone_national_number' => $hasPhone ? '333' . $this->faker->numerify('#######') : null,
            'website'               => $hasWebsite ? "https://example.com/web/{$slug}" : null,
            'facebook'              => $hasFacebook ? "https://example.com/fb/{$slug}" : null,
            'instagram'             => $hasInstagram ? "https://example.com/ig/{$slug}" : null,
            'date_of_birth'         => $this->faker->optional(0.6)->dateTimeBetween('-50 years', '-16 years')?->format('Y-m-d'),
            'belt'                  => $this->faker->randomElement(Belt::cases())->value,
            'stripes'               => $this->faker->numberBetween(0, 4),
            'status'                => AthleteStatus::Active->value,
            'is_self'               => false,
            'joined_at'             => $this->faker->dateTimeBetween('-5 years', 'now')->format('Y-m-d'),
        ];
    }

    /**
     * Owner-as-athlete row (#748). Pairs the factory with a User to
     * mirror the real shape — a self-row always carries `user_id`
     * because it represents the staff member's training record.
     *
     * Named `selfFor()` rather than `self()` to keep call sites
     * unambiguous (`self` is a PHP keyword for scope resolution;
     * `Athlete::factory()->self($user)` reads momentarily like a
     * static access on the factory class). Copilot review on #748.
     */
    public function selfFor(\App\Models\User $user): static
    {
        return $this->state([
            'is_self' => true,
            'user_id' => $user->id,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'belt' => \App\Enums\Belt::White->value,
            'stripes' => 0,
            'status' => AthleteStatus::Active->value,
        ]);
    }
}
