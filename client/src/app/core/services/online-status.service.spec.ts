import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { OnlineStatusService } from './online-status.service';

/**
 * Helper — a minimal fake window that records `online` / `offline` listeners
 * so the spec can dispatch them deterministically. We don't use the real
 * `window` because the test runner host doesn't toggle `navigator.onLine`
 * and we'd have nothing reliable to assert on.
 */
function makeFakeDocument(initialOnline: boolean): {
  doc: Document;
  fire: (type: 'online' | 'offline') => void;
} {
  const listeners = new Map<string, Set<EventListener>>();
  const fakeWindow = {
    navigator: { onLine: initialOnline },
    addEventListener: (type: string, fn: EventListener): void => {
      const set = listeners.get(type) ?? new Set<EventListener>();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, fn: EventListener): void => {
      listeners.get(type)?.delete(fn);
    },
  } as unknown as Window;

  const fakeDocument = {
    defaultView: fakeWindow,
  } as unknown as Document;

  return {
    doc: fakeDocument,
    fire: (type) => {
      const evt = new Event(type);
      listeners.get(type)?.forEach((fn) => fn(evt));
    },
  };
}

describe('OnlineStatusService', () => {
  it('initialises from navigator.onLine — true', () => {
    const { doc } = makeFakeDocument(true);
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: doc }],
    });
    const svc = TestBed.inject(OnlineStatusService);

    expect(svc.isOnline()).toBe(true);
    expect(svc.isOffline()).toBe(false);
  });

  it('initialises from navigator.onLine — false', () => {
    const { doc } = makeFakeDocument(false);
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: doc }],
    });
    const svc = TestBed.inject(OnlineStatusService);

    expect(svc.isOnline()).toBe(false);
    expect(svc.isOffline()).toBe(true);
  });

  it('flips to offline on a window `offline` event', () => {
    const { doc, fire } = makeFakeDocument(true);
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: doc }],
    });
    const svc = TestBed.inject(OnlineStatusService);

    expect(svc.isOnline()).toBe(true);
    fire('offline');
    expect(svc.isOnline()).toBe(false);
    expect(svc.isOffline()).toBe(true);
  });

  it('flips back to online on a window `online` event', () => {
    const { doc, fire } = makeFakeDocument(false);
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: doc }],
    });
    const svc = TestBed.inject(OnlineStatusService);

    expect(svc.isOnline()).toBe(false);
    fire('online');
    expect(svc.isOnline()).toBe(true);
    expect(svc.isOffline()).toBe(false);
  });

  it('defaults to online when defaultView is unavailable (SSR-safe)', () => {
    const fakeDoc = { defaultView: null } as unknown as Document;
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: fakeDoc }],
    });
    const svc = TestBed.inject(OnlineStatusService);

    // No crash, defaults to true (optimistic — same convention as
    // AppUpdateService for hosts where we can't measure).
    expect(svc.isOnline()).toBe(true);
  });
});
