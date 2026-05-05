<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `users.terms_accepted_at` (#420). Records the moment the user
 * checked the "I accept the Terms of Service" box on the registration
 * form. Nullable because:
 *
 *   - Pre-#420 accounts pre-date the gate; they will be back-filled
 *     (or grandfathered in via a follow-up migration once a versioned
 *     ToS lands — out of scope here).
 *   - The column is enforced at the FormRequest layer (`RegisterRequest`
 *     uses Laravel's `accepted` rule), not as a NOT-NULL DB constraint.
 *     Keeping the column nullable avoids breaking the seeded admin user
 *     and any future system-only account creation path.
 *
 * No index — the column is read on the user's own row only, never
 * filtered or joined on.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->timestamp('terms_accepted_at')->nullable()->after('email_verified_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('terms_accepted_at');
        });
    }
};
