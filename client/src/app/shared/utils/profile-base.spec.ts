import { describe, it, expect } from 'vitest';
import type { User } from '../../core/services/auth.service';
import { profileBaseForUser } from './profile-base';

describe('profileBaseForUser', () => {
  it('returns the athlete-shell path for an athlete-role user', () => {
    expect(profileBaseForUser({ role: 'athlete' } as User)).toBe('/dashboard/me/u');
  });

  it('returns the owner-shell path for an owner-role user', () => {
    expect(profileBaseForUser({ role: 'owner' } as User)).toBe('/dashboard/u');
  });

  it('defaults to the owner-shell path when the user is null', () => {
    expect(profileBaseForUser(null)).toBe('/dashboard/u');
  });

  it('defaults to the owner-shell path when the user is undefined', () => {
    expect(profileBaseForUser(undefined)).toBe('/dashboard/u');
  });
});
