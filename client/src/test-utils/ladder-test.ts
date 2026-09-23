import { TestBed } from '@angular/core/testing';
import { Academy, AcademyService, Grade, MartialArt } from '../app/core/services/academy.service';
import LADDERS from './ladders.json';

/**
 * The four ladders exactly as `AcademyResource.grades` sends them (#1801).
 *
 * A copy of the server registry, for tests only — the app itself keeps none.
 * `desktop/src/ladder-fixture-sync.spec.ts` reads this file and
 * `server/database/seed-data/martial-arts/*.json` side by side and fails when
 * they drift: it runs on the host, where both are visible, while the client
 * suite's container mounts `./client` alone.
 */
export const LADDER_FIXTURES = LADDERS as Record<MartialArt, Grade[]>;

/**
 * Loads an academy teaching `art` into `AcademyService`, so every component
 * that reads `BeltLadderService` sees that ladder. Call after
 * `TestBed.configureTestingModule(...)`.
 */
export function useLadder(art: MartialArt, academy: Partial<Academy> = {}): void {
  TestBed.inject(AcademyService).academy.set({
    id: 1,
    name: 'Test Academy',
    slug: 'test-academy',
    address: null,
    logo_url: null,
    ...academy,
    martial_art: art,
    grades: LADDER_FIXTURES[art],
  } as Academy);
}
