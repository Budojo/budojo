<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * At-rest encryption flag for documents (#224 — GDPR Art. 9 special-
 * category compliance for medical certificates).
 *
 * Boolean discriminator: `true` ⇒ the bytes on disk are AES-256-GCM
 * ciphertext via `App\Support\DocumentEncryption`, `false` ⇒ plaintext
 * (pre-#224 uploads). The download flow branches on this column;
 * existing plaintext rows continue to work after the migration ships.
 *
 * **Scope.** Today only `type = medical_certificate` uploads get
 * encrypted (special-category data under Art. 9). Other document
 * types stay plaintext until / unless their classification changes.
 * The column is generic (not `is_medical_encrypted`) so a future
 * decision to extend encryption to all docs lands without a rename.
 *
 * **Backfill story** — pre-#224 rows stay `false` indefinitely
 * unless a future re-encryption batch flips them. That's tracked
 * separately in `docs/infra/production-deployment.md` § Key rotation;
 * not in this migration's blast radius.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('documents', function (Blueprint $table): void {
            $table->boolean('is_encrypted')->default(false)->after('size_bytes');
        });
    }

    public function down(): void
    {
        Schema::table('documents', function (Blueprint $table): void {
            $table->dropColumn('is_encrypted');
        });
    }
};
