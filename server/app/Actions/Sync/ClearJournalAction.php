<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Support\Sync\Journal\JournalBody;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Clears this device's kept entries up to one every other device holds
 * (#2031, `docs/sync/protocol.md` § devices): the only ground on which a
 * write leaves the journal. The record of what this database dealt with
 * stays: that is what keeps a later replay from applying them twice. The
 * uploads no kept entry names any more go with them.
 */
final class ClearJournalAction
{
    public function execute(string $device, string $through): void
    {
        DB::transaction(static function () use ($device, $through): void {
            DB::table('sync_journal')->where('device', $device)->where('id', '<=', $through)->delete();
        });

        $named = [];
        foreach (DB::table('sync_journal')->pluck('body') as $body) {
            foreach (JournalBody::files(\is_string($body) ? json_decode($body, true) : null) as $sha256) {
                $named[$sha256] = true;
            }
        }
        $disk = Storage::disk('local');
        foreach ($disk->files(JournalBody::FOLDER) as $path) {
            if (! isset($named[basename($path)])) {
                $disk->delete($path);
            }
        }
    }
}
