<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Contact links (#162) — three flat columns repeated on `academies`
 * and `athletes`: `website`, `facebook`, `instagram`. Per the issue's
 * recommendation we deliberately do NOT introduce a polymorphic
 * `links` table here — only two entities currently need socials, and
 * the framework canon (`server/CLAUDE.md` § rejected patterns)
 * argues against speculative abstraction. If a third social-aware
 * entity ever lands, that's the moment to refactor into a polymorphic
 * morph relation.
 *
 * Columns are `varchar(255)` nullable. Validation at the FormRequest
 * layer enforces URL shape; the column itself just stores whatever
 * passes the request gate.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('academies', function (Blueprint $table): void {
            $table->string('website', 255)->nullable()->after('phone_national_number');
            $table->string('facebook', 255)->nullable()->after('website');
            $table->string('instagram', 255)->nullable()->after('facebook');
        });

        Schema::table('athletes', function (Blueprint $table): void {
            $table->string('website', 255)->nullable()->after('phone_national_number');
            $table->string('facebook', 255)->nullable()->after('website');
            $table->string('instagram', 255)->nullable()->after('facebook');
        });
    }

    public function down(): void
    {
        Schema::table('athletes', function (Blueprint $table): void {
            $table->dropColumn(['website', 'facebook', 'instagram']);
        });

        Schema::table('academies', function (Blueprint $table): void {
            $table->dropColumn(['website', 'facebook', 'instagram']);
        });
    }
};
