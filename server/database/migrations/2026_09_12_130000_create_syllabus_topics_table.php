<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('syllabus_topics', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('academy_id')->constrained()->cascadeOnDelete();
            // Null = a position ("Closed guard"), set = a technique under it
            // ("Armbar"). Exactly two levels — the request layer refuses a
            // parent that has a parent of its own (#1563).
            $table->foreignId('parent_id')->nullable()->constrained('syllabus_topics')->cascadeOnDelete();
            $table->string('name', 80);
            // `gi` | `nogi` | `both` (App\Enums\TopicKind).
            $table->string('kind', 8);
            // In scope for the current season — the coverage denominator.
            $table->boolean('in_season')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            // A deleted topic must not erase the lessons that will reference
            // it (#1564): the row stays, out of the tree and out of the count.
            $table->softDeletes();

            // The hot read is one academy's tree, siblings in order.
            $table->index(['academy_id', 'parent_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('syllabus_topics');
    }
};
