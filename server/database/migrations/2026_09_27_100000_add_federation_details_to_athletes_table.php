<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The details a federation card asks for (#1934): the codice fiscale, the
 * sex as the document records it, and the place of birth (a comune, or a
 * country for an athlete born abroad).
 *
 * All nullable: a BJJ academy abroad has no use for any of them. One code per
 * live athlete per academy is enforced when a row is written, not by an
 * index, for the reason `attendance_records` gives: a full unique index would
 * block reusing the code of an athlete who was deleted.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('athletes', function (Blueprint $table): void {
            $table->string('fiscal_code', 16)->nullable()->after('date_of_birth');
            $table->string('sex', 1)->nullable()->after('fiscal_code');
            $table->string('birth_place', 100)->nullable()->after('sex');
        });
    }

    public function down(): void
    {
        Schema::table('athletes', function (Blueprint $table): void {
            $table->dropColumn(['fiscal_code', 'sex', 'birth_place']);
        });
    }
};
