<?php

declare(strict_types=1);

namespace App\Support\Backup;

use App\Actions\Sync\StageRefused;
use App\Support\Sync\IncomingDatabase;
use App\Support\Sync\IncomingFile;

/**
 * A backup the PC took (`desktop/src/backup.ts`, #1301), as another device
 * receives it (#2079): a zip of `budojo.sqlite` (a `VACUUM INTO` copy), the
 * `storage/` tree and a `manifest.json`.
 *
 * Opened only once it reads as one: a zip with a manifest of a format this
 * code knows. Everything it extracts goes to temporary files, deleted with it.
 */
final class BackupArchive
{
    /** The manifest's format, as `buildManifest` writes it. */
    private const int FORMAT = 1;

    /** Only the academy's files: never the PC's logs, cache or sessions. */
    private const string FILES = 'storage/app/';

    /** @var list<string> */
    private array $temporary = [];

    /** @param array{createdAt: string, appVersion: string, schemaVersion: string} $manifest */
    private function __construct(
        private readonly \ZipArchive $zip,
        public readonly array $manifest,
        string $path,
    ) {
        $this->temporary[] = $path;
    }

    public function __destruct()
    {
        $this->zip->close();
        foreach ($this->temporary as $path) {
            @unlink($path);
        }
    }

    /** @param resource $body the archive's bytes, as they arrive */
    public static function receive($body): self
    {
        $path = self::temporaryFile();
        IncomingFile::receive($body, $path);
        $zip = new \ZipArchive();
        if ($zip->open($path, \ZipArchive::RDONLY) !== true) {
            @unlink($path);

            throw StageRefused::unreadable('This file is not a Budojo backup.');
        }
        $manifest = self::manifestOf($zip);
        if ($manifest === null) {
            $zip->close();
            @unlink($path);

            throw StageRefused::unreadable('This file is not a Budojo backup.');
        }

        return new self($zip, $manifest, $path);
    }

    /** The database, extracted to a temporary file and checked as any incoming one is. */
    public function database(): string
    {
        $stream = $this->zip->getStream('budojo.sqlite');
        if ($stream === false) {
            throw StageRefused::unreadable('The backup holds no database.');
        }
        $path = self::temporaryFile();
        $this->temporary[] = $path;

        try {
            IncomingFile::receive($stream, $path);
        } finally {
            fclose($stream);
        }
        IncomingDatabase::check($path);

        return $path;
    }

    /**
     * Writes the academy's files, `storage/app/…`, under `$dir`, as they sit
     * under `storage/app` on the PC. A name that would climb out of `$dir` is
     * refused, never written.
     */
    public function extractFiles(string $dir): int
    {
        $written = 0;
        for ($i = 0; $i < $this->zip->numFiles; $i++) {
            $name = (string) $this->zip->getNameIndex($i);
            if (! str_starts_with($name, self::FILES) || str_ends_with($name, '/')) {
                continue;
            }
            $relative = substr($name, \strlen(self::FILES));
            if (! self::isSafe($relative)) {
                throw StageRefused::unreadable('The backup names a file outside the academy\'s folder.');
            }
            $this->extractOne($i, "{$dir}/{$relative}");
            $written++;
        }

        return $written;
    }

    private function extractOne(int $index, string $target): void
    {
        $folder = \dirname($target);
        if (! is_dir($folder) && ! mkdir($folder, 0o775, true) && ! is_dir($folder)) {
            throw new \RuntimeException("could not make {$folder}");
        }
        $stream = $this->zip->getStreamIndex($index);
        if ($stream === false) {
            throw StageRefused::unreadable('The backup is damaged.');
        }

        try {
            IncomingFile::receive($stream, $target);
        } finally {
            fclose($stream);
        }
    }

    /** A relative path with no `..`, no empty or absolute segment, and forward slashes only. */
    private static function isSafe(string $relative): bool
    {
        if ($relative === '' || str_contains($relative, '\\') || str_contains($relative, "\0")) {
            return false;
        }
        foreach (explode('/', $relative) as $segment) {
            if ($segment === '' || $segment === '.' || $segment === '..') {
                return false;
            }
        }

        return true;
    }

    /** @return array{createdAt: string, appVersion: string, schemaVersion: string}|null */
    private static function manifestOf(\ZipArchive $zip): ?array
    {
        $json = $zip->getFromName('manifest.json');
        $manifest = \is_string($json) ? json_decode($json, true) : null;
        if (! \is_array($manifest) || ($manifest['format'] ?? null) !== self::FORMAT) {
            return null;
        }
        foreach (['createdAt', 'appVersion', 'schemaVersion'] as $field) {
            if (! \is_string($manifest[$field] ?? null)) {
                return null;
            }
        }

        /** @var array{createdAt: string, appVersion: string, schemaVersion: string} $manifest */
        return [
            'createdAt' => $manifest['createdAt'],
            'appVersion' => $manifest['appVersion'],
            'schemaVersion' => $manifest['schemaVersion'],
        ];
    }

    private static function temporaryFile(): string
    {
        $path = tempnam(sys_get_temp_dir(), 'budojo-backup-');
        if ($path === false) {
            throw new \RuntimeException('no temporary file for the incoming backup');
        }

        return $path;
    }
}
