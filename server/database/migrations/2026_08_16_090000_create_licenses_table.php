<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('licenses', function (Blueprint $table): void {
            $table->id();
            // The activation key exactly as the customer pasted it. We store
            // the key and nothing derived from it: the claims (licensee,
            // expiry) live INSIDE the signed payload, so re-verifying on read
            // is both cheap and the only way they cannot drift from what was
            // actually signed. A cached `expires_at` column would be a second
            // source of truth that an UPDATE could quietly desynchronise.
            $table->text('key');
            // When this instance accepted it. Not the key's issue date — that
            // is a claim; this is our own record of the activation event.
            $table->timestamp('activated_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('licenses');
    }
};
