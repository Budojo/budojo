<?php

declare(strict_types=1);

namespace App\Support;

/**
 * AES-256-GCM encryption for at-rest document bytes (#224, GDPR
 * Art. 9 compliance for medical certificates).
 *
 * Wire format on disk (binary):
 *   [1 byte version=0x01][12 bytes IV][16 bytes auth tag][N bytes ciphertext]
 *
 * The version byte lets a future key-rotation / algorithm-swap land
 * without ambiguity — readers branch on the first byte before
 * trusting any of the rest. Today only v1 exists.
 *
 * **Key handling** — pulled from `config('documents.encryption_key')`
 * which reads `DOCUMENT_ENCRYPTION_KEY` from `.env`. SEPARATE from
 * `APP_KEY` so the document key can be rotated without invalidating
 * every other Laravel-encrypted column. The expected format is a
 * base64-encoded 32-byte value; the constructor decodes + validates.
 *
 * **No plaintext on disk** — encrypt() returns the ciphertext blob
 * for the caller to write atomically. The Upload flow's contract is
 * that the file on disk is ciphertext OR doesn't exist; the
 * intermediate "wrote plaintext then re-wrote ciphertext" race is
 * not allowed.
 */
final class DocumentEncryption
{
    public const string CIPHER = 'aes-256-gcm';
    public const int VERSION = 0x01;
    public const int IV_LEN = 12;
    public const int TAG_LEN = 16;

    private readonly string $key;

    public function __construct(?string $base64Key = null)
    {
        $resolved = $base64Key ?? config('documents.encryption_key');
        if (! \is_string($resolved) || $resolved === '') {
            throw new \RuntimeException(
                'Document encryption key is not configured. Set DOCUMENT_ENCRYPTION_KEY in .env.',
            );
        }
        $raw = base64_decode($resolved, true);
        if ($raw === false || \strlen($raw) !== 32) {
            throw new \RuntimeException(
                'Document encryption key must be base64-encoded 32 raw bytes (256 bits).',
            );
        }
        $this->key = $raw;
    }

    /**
     * Encrypt the supplied plaintext. The returned blob is the full
     * on-disk wire format (version + IV + tag + ciphertext) ready to
     * be written by the caller.
     */
    public function encrypt(string $plaintext): string
    {
        $iv = random_bytes(self::IV_LEN);
        $tag = '';
        $ciphertext = openssl_encrypt(
            $plaintext,
            self::CIPHER,
            $this->key,
            \OPENSSL_RAW_DATA,
            $iv,
            $tag,
            '',
            self::TAG_LEN,
        );
        if ($ciphertext === false) {
            throw new \RuntimeException('openssl_encrypt failed.');
        }

        return \chr(self::VERSION) . $iv . $tag . $ciphertext;
    }

    /**
     * Inverse of encrypt(). Throws on every parse / tag-mismatch
     * failure — the caller (download flow) translates a throw into
     * a 500-level response instead of leaking the partial bytes.
     */
    public function decrypt(string $blob): string
    {
        if (\strlen($blob) < 1 + self::IV_LEN + self::TAG_LEN) {
            throw new \RuntimeException('Encrypted blob is too short.');
        }
        $version = \ord($blob[0]);
        if ($version !== self::VERSION) {
            throw new \RuntimeException('Unknown document-encryption version: 0x' . dechex($version));
        }
        $iv = substr($blob, 1, self::IV_LEN);
        $tag = substr($blob, 1 + self::IV_LEN, self::TAG_LEN);
        $ciphertext = substr($blob, 1 + self::IV_LEN + self::TAG_LEN);

        $plaintext = openssl_decrypt(
            $ciphertext,
            self::CIPHER,
            $this->key,
            \OPENSSL_RAW_DATA,
            $iv,
            $tag,
            '',
        );
        if ($plaintext === false) {
            throw new \RuntimeException('openssl_decrypt failed (tag mismatch or corrupted blob).');
        }

        return $plaintext;
    }
}
