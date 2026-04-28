<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add a structured phone number to `academies` (#161). Same shape as the
     * athlete phone pair (#75): `phone_country_code` carries the E.164 prefix
     * (e.g. `+39`) and `phone_national_number` the unformatted national digits.
     * Both nullable; either both filled or both empty (the FormRequest carries
     * the `required_with` cross-field rule).
     */
    public function up(): void
    {
        Schema::table('academies', function (Blueprint $table): void {
            $table->string('phone_country_code', 5)->nullable()->after('name');
            $table->string('phone_national_number', 20)->nullable()->after('phone_country_code');
        });
    }

    public function down(): void
    {
        Schema::table('academies', function (Blueprint $table): void {
            $table->dropColumn(['phone_country_code', 'phone_national_number']);
        });
    }
};
