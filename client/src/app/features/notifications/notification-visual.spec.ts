import { notificationVisual } from './notification-visual';

describe('notificationVisual', () => {
  it('maps a known kind to its icon + tone', () => {
    expect(notificationVisual('community_reaction_on_your_post')).toEqual({
      icon: 'pi pi-heart-fill',
      tone: 'reaction',
    });
    expect(notificationVisual('athlete_payment_marked_paid').tone).toBe('payment');
    expect(notificationVisual('community_comment_on_your_post').tone).toBe('comment');
  });

  it('falls back to a neutral bell for unknown or null kinds', () => {
    const fallback = { icon: 'pi pi-bell', tone: 'system' as const };
    expect(notificationVisual(null)).toEqual(fallback);
    expect(notificationVisual('totally_unknown_kind')).toEqual(fallback);
  });
});
