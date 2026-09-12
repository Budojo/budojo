<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('academies', function (Blueprint $table): void {
            // `lesson` | `day` (App\Enums\CarnetEntryUnit). Not nullable and
            // defaulted rather than "null means lesson": unlike the carnet
            // offering, every academy has an answer to this whether or not
            // it has thought about it, and `lesson` is what every carnet
            // meant before the timetable existed (#1576).
            $table->string('carnet_entry_unit', 8)->default('lesson')->after('carnet_entries');
        });
    }

    public function down(): void
    {
        Schema::table('academies', function (Blueprint $table): void {
            $table->dropColumn('carnet_entry_unit');
        });
    }
};
