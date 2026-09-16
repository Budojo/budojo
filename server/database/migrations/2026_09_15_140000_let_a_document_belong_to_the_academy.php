<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The academy's own papers (#1743).
 *
 * `documents.athlete_id` was NOT NULL, so every document in Budojo belonged to
 * a person. An Italian ASD holds papers that belong to **the academy** and that
 * expire — the DAE / BLSD-D certificate, the civil-liability policy, the
 * federation affiliation, the lease — and there was nowhere to put any of them.
 * The one screen whose job is "what runs out soon" structurally could not
 * include them, and the owner's workaround was a folder on the desktop and a
 * date in his head, which is exactly what the medical-certificate pipeline was
 * built to replace.
 *
 * It is also the document with the worst consequence if it lapses: a missed
 * athlete certificate is one person who should not train; a lapsed liability
 * policy is the academy.
 *
 * **One table, not two.** A parallel `academy_documents` would double every
 * rule this epic just wrote — supersession, the expiry window, the active
 * scope, the encryption flag, the tombstone contract.
 *
 * **Exactly one owner.** Both columns are nullable at the schema level and the
 * invariant — exactly one of `athlete_id` / `academy_id` is set — is enforced
 * in `UploadDocumentAction` and by `Document::owningAcademyId()`, which
 * returns null rather than guessing. A SQLite `CHECK` is not the only guard
 * and is deliberately absent: the app must refuse the row before the database
 * has to, and the same code has to hold on any driver.
 *
 * **SQLite rebuilds the table** to change a column's nullability — Laravel
 * recreates it and copies every row. That includes AES-256-GCM ciphertext
 * paths and their `is_encrypted` flags, so this migration is verified against
 * a real database file with encrypted rows present, not only against
 * `:memory:` under `RefreshDatabase`.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('documents', 'academy_id')) {
            Schema::table('documents', function (Blueprint $table): void {
                // Cascade, like `athlete_id`: deleting an academy takes its
                // papers with it. The physical files go the same way the
                // athlete cascade already sends them — through
                // `DeleteDocumentAction`, which wipes the bytes before
                // soft-deleting the row.
                $table->foreignId('academy_id')
                    ->nullable()
                    ->after('athlete_id')
                    ->constrained()
                    ->cascadeOnDelete();

                // Mirrors `(athlete_id, deleted_at)`: the academy's own list
                // and the expiring query both scope by owner and filter
                // soft-deletes in the same breath.
                $table->index(['academy_id', 'deleted_at']);
            });
        }

        // Second, and separately: the nullability change is the half that
        // rebuilds the table, and keeping it in its own statement means a
        // failure here cannot leave a half-added column behind.
        Schema::table('documents', function (Blueprint $table): void {
            $table->foreignId('athlete_id')->nullable()->change();
        });
    }

    /**
     * Reversible only while no document has taken the new shape: restoring
     * `athlete_id` to NOT NULL fails on any row that belongs to the academy.
     * That is the honest behaviour — a rollback that silently dropped those
     * rows, or left the column nullable while claiming to have reversed, is
     * worse than one that refuses.
     */
    public function down(): void
    {
        Schema::table('documents', function (Blueprint $table): void {
            $table->dropForeign(['academy_id']);
            $table->dropIndex(['academy_id', 'deleted_at']);
            $table->dropColumn('academy_id');
        });

        Schema::table('documents', function (Blueprint $table): void {
            $table->foreignId('athlete_id')->nullable(false)->change();
        });
    }
};
