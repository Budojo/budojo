<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Encryption (#224)
    |--------------------------------------------------------------------------
    |
    | Key used by `App\Support\DocumentEncryption` to encrypt medical
    | certificates at rest. AES-256-GCM. SEPARATE from APP_KEY so the
    | document-encryption key can be rotated independently of every
    | other Laravel-encrypted column.
    |
    | The value MUST be 32 raw bytes encoded as base64. Generate one with:
    |   php -r "echo base64_encode(random_bytes(32)), \"\\n\";"
    |
    | An empty / missing value disables encryption — the upload path
    | falls back to writing plaintext + setting `is_encrypted = false`.
    | The dev / test environments use a deterministic key when
    | DOCUMENT_ENCRYPTION_KEY is unset so PEST + Cypress runs don't
    | need to provision their own secret.
    */
    'encryption_key' => env('DOCUMENT_ENCRYPTION_KEY'),
];
