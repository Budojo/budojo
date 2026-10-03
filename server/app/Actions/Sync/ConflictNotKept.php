<?php

declare(strict_types=1);

namespace App\Actions\Sync;

/** «Tieni la mia» did not go through: nothing of it was kept (`KeepMineAction`). */
final class ConflictNotKept extends \RuntimeException
{
}
