import { describe, expect, it } from 'vitest';

import { describeForbidden, findForbiddenInPackage, isForbiddenInPackage } from './package-guard.js';

/**
 * The packaging guard (#1315).
 *
 * Two failures are possible here and only one of them is acceptable. Letting a
 * `config.php` through ships an app whose configuration is frozen at whatever
 * the packaging machine had — silent at package time, and visible to the owner
 * only as broken images. Refusing a file that was fine costs a maintainer two
 * minutes. So the interesting tests are the ones that pin exactly where the
 * line sits, in both directions.
 */

describe('isForbiddenInPackage', () => {
  it.each(['bootstrap/cache/config.php', 'bootstrap/cache/routes-v7.php', 'bootstrap/cache/events.php'])(
    'refuses %s',
    (file) => {
      expect(isForbiddenInPackage(file)).toBe(true);
    },
  );

  // `electron-builder.yml` excludes these too, but they are NORMAL in a
  // development checkout — `.env` is what configures the dev containers at all
  // — so a guard that refused them would fail every local `npm run dist` and
  // teach everyone to skip it. A guard nobody runs protects nothing.
  it.each(['.env', '.env.production', 'database/sqlite/database.sqlite', 'storage/framework/testing/disks/local/x.pdf'])(
    'does not refuse %s, which is normal in development',
    (file) => {
      expect(isForbiddenInPackage(file)).toBe(false);
    },
  );

  // Package discovery. Safe, saves real work at boot, and deliberately shipped
  // — which is why this is not a blanket `bootstrap/cache/**` exclusion.
  it.each(['bootstrap/cache/packages.php', 'bootstrap/cache/services.php', 'bootstrap/cache/.gitignore'])(
    'allows %s',
    (file) => {
      expect(isForbiddenInPackage(file)).toBe(false);
    },
  );

  it.each(['app/Models/Athlete.php', 'config/app.php', 'artisan', 'vendor/autoload.php', 'public/index.php'])(
    'allows %s',
    (file) => {
      expect(isForbiddenInPackage(file)).toBe(false);
    },
  );

  // The packaging machine is Windows and the development machines are Linux, so
  // a guard that only understands one separator is a guard that passes
  // everything on the platform that actually builds the installer.
  it('understands Windows separators', () => {
    expect(isForbiddenInPackage('bootstrap\\cache\\config.php')).toBe(true);
  });

  it('understands a leading ./', () => {
    expect(isForbiddenInPackage('./bootstrap/cache/config.php')).toBe(true);
  });

  // Anchored on purpose: a path that merely CONTAINS the name is a different
  // file, and refusing it would be a false alarm that teaches people to ignore
  // the guard.
  it.each([
    'vendor/some/package/bootstrap/cache/config.php',
    'app/bootstrap/cache/config.php',
    'config.php',
    'bootstrap/cache/config.php.bak',
  ])('does not refuse %s, which is a different file', (file) => {
    expect(isForbiddenInPackage(file)).toBe(false);
  });
});

describe('findForbiddenInPackage', () => {
  it('reports every offender at once, not just the first', () => {
    const found = findForbiddenInPackage([
      'app/Models/Athlete.php',
      'bootstrap/cache/routes-v7.php',
      'bootstrap/cache/config.php',
      'bootstrap/cache/packages.php',
      '.env',
    ]);

    expect(found).toEqual(['bootstrap/cache/config.php', 'bootstrap/cache/routes-v7.php']);
  });

  it('is empty for a clean tree', () => {
    expect(findForbiddenInPackage(['artisan', 'bootstrap/cache/services.php'])).toEqual([]);
  });
});

describe('describeForbidden', () => {
  it('names every file and says how to fix it', () => {
    const message = describeForbidden(['bootstrap/cache/config.php']);

    expect(message).toContain('bootstrap/cache/config.php');
    expect(message).toContain('optimize:clear');
  });

  it('says so when there is nothing wrong', () => {
    expect(describeForbidden([])).toContain('no compiled Laravel cache');
  });
});
