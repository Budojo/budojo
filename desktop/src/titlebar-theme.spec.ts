import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  TITLEBAR_OVERLAY_HEIGHT,
  isResolvedTheme,
  readPersistedTheme,
  resolveBootTheme,
  serialiseTheme,
  titleBarOverlayFor,
  windowBackgroundFor,
} from './titlebar-theme.js';

describe('titlebar theme (#1793)', () => {
  describe('the overlay is the page surface, seen from the native side', () => {
    it('paints light chrome for the light theme', () => {
      expect(titleBarOverlayFor('light')).toEqual({
        color: '#fafafa',
        symbolColor: '#1c1c1e',
        height: TITLEBAR_OVERLAY_HEIGHT,
      });
    });

    it('paints dark chrome for the dark theme', () => {
      // The finding this module exists for: without it the strip stayed
      // #fafafa while the app went near-black, which on Windows — the only
      // platform that ships — is a permanent white bar across the top.
      expect(titleBarOverlayFor('dark')).toEqual({
        color: '#151517',
        symbolColor: '#f2f2f7',
        height: TITLEBAR_OVERLAY_HEIGHT,
      });
    });

    it('never paints the same background for both themes', () => {
      expect(windowBackgroundFor('light')).not.toBe(windowBackgroundFor('dark'));
    });

    it('keeps the overlay one pixel short of the strip', () => {
      // #1424: the strip's hairline is the last row INSIDE its 40px, so a 40px
      // native overlay covers it and the line stops where the buttons begin.
      expect(TITLEBAR_OVERLAY_HEIGHT).toBe(39);
    });

    it('matches the window background to the overlay colour', () => {
      // A mismatch is a flash of the wrong colour at every launch — the exact
      // bug the navy `backgroundColor` caused before #1221.
      for (const theme of ['light', 'dark'] as const) {
        expect(windowBackgroundFor(theme)).toBe(titleBarOverlayFor(theme).color);
      }
    });
  });

  describe('what was painted last run', () => {
    it('round-trips through the file format', () => {
      expect(readPersistedTheme(serialiseTheme('dark'))).toBe('dark');
      expect(readPersistedTheme(serialiseTheme('light'))).toBe('light');
    });

    it('has no answer for an absent file', () => {
      expect(readPersistedTheme(null)).toBeNull();
    });

    it('has no answer for a truncated write', () => {
      // A kill during the write leaves half a file. It is not a crash case.
      expect(readPersistedTheme('{"theme": "da')).toBeNull();
    });

    it('has no answer for a value that is not a theme', () => {
      expect(readPersistedTheme('{"theme":"solarized"}')).toBeNull();
      expect(readPersistedTheme('{"theme":null}')).toBeNull();
      expect(readPersistedTheme('{}')).toBeNull();
      expect(readPersistedTheme('null')).toBeNull();
      // `system` is a *preference*, never a resolved theme — if one ever
      // reaches this file something upstream is writing the wrong value, and
      // falling through to the OS is the right answer anyway.
      expect(readPersistedTheme('{"theme":"system"}')).toBeNull();
    });
  });

  describe('the theme the window opens with', () => {
    it('uses the remembered one when there is one', () => {
      expect(resolveBootTheme(serialiseTheme('dark'), false)).toBe('dark');
      expect(resolveBootTheme(serialiseTheme('light'), true)).toBe('light');
    });

    it('asks the OS on a first launch', () => {
      expect(resolveBootTheme(null, true)).toBe('dark');
      expect(resolveBootTheme(null, false)).toBe('light');
    });

    it('asks the OS when the remembered value is unusable', () => {
      expect(resolveBootTheme('{"theme":"solarized"}', true)).toBe('dark');
    });
  });

  /**
   * The drag strip and the native overlay are the same bar seen from two
   * sides, and there is no import between them: one is CSS the renderer
   * paints, the other is a value Electron hands to Windows. The only thing
   * that can keep them equal is a test that reads both.
   *
   * It lives here rather than beside the client's other stylesheet guards
   * because the client suite runs inside a container that mounts `./client`
   * alone — from there, `desktop/` does not exist. The desktop suite runs on
   * the host with the whole repo, so this is the side that can see both files.
   */
  describe('the CSS half of the bar agrees', () => {
    const theme = path.join(process.cwd(), '..', 'client', 'src', 'styles', 'budojo-theme.scss');
    const source = readFileSync(theme, 'utf8');
    const darkAt = source.search(/^\s*\.dark\s*\{/m);

    /** Last definition wins, per half — which is what the cascade does. */
    const tokenIn = (half: string): string | null => {
      const hits = [...half.matchAll(/--budojo-titlebar-background:\s*([^;]+);/g)];
      return hits.at(-1)?.[1]?.trim() ?? null;
    };

    it('found the stylesheet and both halves of it', () => {
      // The negative control: without it a moved file or a renamed selector
      // reports a clean pass over nothing at all.
      expect(darkAt).toBeGreaterThan(0);
      expect(source).toContain('--budojo-titlebar-background');
    });

    it('paints the strip the same colour the overlay is', () => {
      expect(tokenIn(source.slice(0, darkAt))).toBe(titleBarOverlayFor('light').color);
      expect(tokenIn(source.slice(darkAt))).toBe(titleBarOverlayFor('dark').color);
    });
  });

  describe('isResolvedTheme', () => {
    it('accepts exactly the two painted themes', () => {
      expect(isResolvedTheme('light')).toBe(true);
      expect(isResolvedTheme('dark')).toBe(true);
    });

    it('rejects the preference, and everything else', () => {
      // The renderer sends `resolved`, not `preference`. If `system` ever
      // arrives over the bridge the shell must ignore it rather than guess.
      expect(isResolvedTheme('system')).toBe(false);
      expect(isResolvedTheme('')).toBe(false);
      expect(isResolvedTheme(undefined)).toBe(false);
      expect(isResolvedTheme(0)).toBe(false);
      expect(isResolvedTheme({ theme: 'dark' })).toBe(false);
    });
  });
});
