/**
 * Realistic mock data for the Play Store screenshot capture spec (#690).
 *
 * Distinct from `support/fixtures.ts` (which carries the minimal stubs the
 * E2E test base shares) — these fixtures exist to make screenshots LOOK
 * REAL: an academy with a name, address, and roster; athletes with
 * Italian-and-international names spread across the IBJJF belt scale;
 * recent attendance; a community feed seeded with an auto-generated
 * belt-promotion post; documents in varying expiry states.
 *
 * The frozen "now" clock is the same date the design inventory uses
 * (`2026-04-24`), so the ExpiryStatusBadge stays in the "expiring soon"
 * visual state we want featured in the Play Store screenshots and the
 * relative timestamps under community posts stay deterministic.
 */

export const PS_FROZEN_NOW = new Date('2026-04-24T12:00:00Z').getTime();

export const PS_ACADEMY = {
  id: 1,
  name: 'Academy Gracie Milano',
  slug: 'academy-gracie-milano',
  address: {
    line1: 'Via Tortona 32',
    line2: null,
    city: 'Milano',
    postal_code: '20144',
    province: 'MI',
    country: 'IT',
  },
  phone_country_code: '+39',
  phone_national_number: '0287654321',
  logo_url: null,
  contact_email: 'info@graciemilano.it',
  contact_url: 'https://graciemilano.it',
} as const;

/**
 * Roster of 8 athletes — name diversity (IT + international) and belt
 * distribution chosen so the list screenshot shows the full IBJJF colour
 * spectrum (white → black) without one belt dominating.
 */
export const PS_ATHLETES_LIST = {
  data: [
    {
      id: 1,
      first_name: 'Marco',
      last_name: 'Rossi',
      email: 'marco.rossi@example.com',
      phone_country_code: '+39',
      phone_national_number: '3331234567',
      address: null,
      date_of_birth: '1988-04-22',
      belt: 'purple',
      stripes: 2,
      status: 'active',
      joined_at: '2019-03-15',
      created_at: '2019-03-15T10:00:00+00:00',
    },
    {
      id: 2,
      first_name: 'Giulia',
      last_name: 'Bianchi',
      email: 'giulia.bianchi@example.com',
      phone_country_code: '+39',
      phone_national_number: '3387654321',
      address: null,
      date_of_birth: '1994-11-08',
      belt: 'blue',
      stripes: 4,
      status: 'active',
      joined_at: '2021-09-01',
      created_at: '2021-09-01T10:00:00+00:00',
    },
    {
      id: 3,
      first_name: 'Carlos',
      last_name: 'Silva',
      email: 'carlos.silva@example.com',
      phone_country_code: '+39',
      phone_national_number: '3401122334',
      address: null,
      date_of_birth: '1985-07-19',
      belt: 'brown',
      stripes: 1,
      status: 'active',
      joined_at: '2017-01-20',
      created_at: '2017-01-20T10:00:00+00:00',
    },
    {
      id: 4,
      first_name: 'Aisha',
      last_name: 'Hassan',
      email: 'aisha.hassan@example.com',
      phone_country_code: '+39',
      phone_national_number: '3475556677',
      address: null,
      date_of_birth: '1996-02-14',
      belt: 'blue',
      stripes: 2,
      status: 'active',
      joined_at: '2022-04-10',
      created_at: '2022-04-10T10:00:00+00:00',
    },
    {
      id: 5,
      first_name: 'Luca',
      last_name: 'Ferrari',
      email: null,
      phone_country_code: '+39',
      phone_national_number: '3318899001',
      address: null,
      date_of_birth: '2001-06-30',
      belt: 'white',
      stripes: 3,
      status: 'active',
      joined_at: '2024-09-12',
      created_at: '2024-09-12T10:00:00+00:00',
    },
    {
      id: 6,
      first_name: 'Sofia',
      last_name: 'Conti',
      email: 'sofia.conti@example.com',
      phone_country_code: '+39',
      phone_national_number: '3392233445',
      address: null,
      date_of_birth: '1991-12-03',
      belt: 'brown',
      stripes: 3,
      status: 'active',
      joined_at: '2016-10-05',
      created_at: '2016-10-05T10:00:00+00:00',
    },
    {
      id: 7,
      first_name: 'João',
      last_name: 'Almeida',
      email: 'joao.almeida@example.com',
      phone_country_code: '+39',
      phone_national_number: '3357788991',
      address: null,
      date_of_birth: '1982-09-26',
      belt: 'black',
      stripes: 1,
      status: 'active',
      joined_at: '2010-06-01',
      created_at: '2010-06-01T10:00:00+00:00',
    },
    {
      id: 8,
      first_name: 'Chiara',
      last_name: 'Moretti',
      email: 'chiara.moretti@example.com',
      phone_country_code: '+39',
      phone_national_number: '3361199887',
      address: null,
      date_of_birth: '1999-08-17',
      belt: 'white',
      stripes: 1,
      status: 'active',
      joined_at: '2024-02-20',
      created_at: '2024-02-20T10:00:00+00:00',
    },
  ],
  links: { first: null, last: null, prev: null, next: null },
  meta: {
    current_page: 1,
    from: 1,
    last_page: 1,
    path: '',
    per_page: 20,
    to: 8,
    total: 8,
  },
} as const;

/** Athlete detail for Marco Rossi (id=1) — purple belt with two stripes. */
export const PS_ATHLETE_DETAIL = {
  data: PS_ATHLETES_LIST.data[0],
} as const;

/**
 * Belt promotion history for Marco — six promotions over five years
 * including the recent purple/2-stripes (which generated the community
 * feed post below). Shows the IBJJF progression visually.
 */
export const PS_ATHLETE_PROMOTIONS = {
  data: [
    {
      id: 6,
      athlete_id: 1,
      belt: 'purple',
      stripes: 2,
      promoted_at: '2026-04-20',
      promoted_by: 'João Almeida',
      created_at: '2026-04-20T18:00:00+00:00',
    },
    {
      id: 5,
      athlete_id: 1,
      belt: 'purple',
      stripes: 1,
      promoted_at: '2025-09-12',
      promoted_by: 'João Almeida',
      created_at: '2025-09-12T18:00:00+00:00',
    },
    {
      id: 4,
      athlete_id: 1,
      belt: 'purple',
      stripes: 0,
      promoted_at: '2024-12-15',
      promoted_by: 'João Almeida',
      created_at: '2024-12-15T18:00:00+00:00',
    },
    {
      id: 3,
      athlete_id: 1,
      belt: 'blue',
      stripes: 4,
      promoted_at: '2023-06-30',
      promoted_by: 'João Almeida',
      created_at: '2023-06-30T18:00:00+00:00',
    },
    {
      id: 2,
      athlete_id: 1,
      belt: 'blue',
      stripes: 0,
      promoted_at: '2021-04-10',
      promoted_by: 'João Almeida',
      created_at: '2021-04-10T18:00:00+00:00',
    },
    {
      id: 1,
      athlete_id: 1,
      belt: 'white',
      stripes: 0,
      promoted_at: '2019-03-15',
      promoted_by: 'João Almeida',
      created_at: '2019-03-15T18:00:00+00:00',
    },
  ],
} as const;

/**
 * Expiring documents — three rows in different visual states so the
 * dashboard widget shows the "expiring soon" + "expired" colour mix.
 */
export const PS_DOCUMENTS_EXPIRING = {
  data: [
    {
      id: 101,
      athlete_id: 5,
      athlete_first_name: 'Luca',
      athlete_last_name: 'Ferrari',
      type: 'medical_certificate',
      original_name: 'certificato-medico.pdf',
      mime_type: 'application/pdf',
      size_bytes: 145_000,
      issued_at: '2025-05-15',
      expires_at: '2026-05-10',
      notes: null,
      created_at: '2025-05-15T10:00:00+00:00',
    },
    {
      id: 102,
      athlete_id: 8,
      athlete_first_name: 'Chiara',
      athlete_last_name: 'Moretti',
      type: 'federation_card',
      original_name: 'tesseramento-cbjj.pdf',
      mime_type: 'application/pdf',
      size_bytes: 98_000,
      issued_at: '2025-09-01',
      expires_at: '2026-05-30',
      notes: null,
      created_at: '2025-09-01T10:00:00+00:00',
    },
    {
      id: 103,
      athlete_id: 2,
      athlete_first_name: 'Giulia',
      athlete_last_name: 'Bianchi',
      type: 'medical_certificate',
      original_name: 'certificato-medico-2024.pdf',
      mime_type: 'application/pdf',
      size_bytes: 160_000,
      issued_at: '2024-04-12',
      expires_at: '2026-04-12',
      notes: null,
      created_at: '2024-04-12T10:00:00+00:00',
    },
  ],
} as const;

/**
 * Today's attendance — five athletes already checked in. Mix of belts
 * so the attendance card row shows the belt-badge variety the design
 * system loves.
 */
export const PS_ATTENDANCE_TODAY = {
  data: [
    { id: 1001, athlete_id: 1, checked_in_at: '2026-04-24T18:30:00+00:00' },
    { id: 1002, athlete_id: 2, checked_in_at: '2026-04-24T18:32:00+00:00' },
    { id: 1003, athlete_id: 4, checked_in_at: '2026-04-24T18:35:00+00:00' },
    { id: 1004, athlete_id: 5, checked_in_at: '2026-04-24T18:40:00+00:00' },
    { id: 1005, athlete_id: 6, checked_in_at: '2026-04-24T18:42:00+00:00' },
  ],
} as const;

/**
 * Community feed — five posts shaped EXACTLY to the `CommunityPost`
 * interface in `community.service.ts` (M9 PR-D contract):
 *
 *   - `created_by`: a `CommunityPostAuthor` object, NOT a name string
 *   - `reactions_count`: total across emojis
 *   - `reaction_counts`: per-emoji breakdown limited to `{ clap, pray }`
 *   - `comments_count`: integer
 *   - `rsvps_count`: integer (not the `{ going, maybe, not_going }` object
 *     a Laravel-style sub-resource would suggest)
 *   - `your_reaction`: ReactionEmoji | null
 *
 * Three first-class post types featured: two `belt_promotion` (Marco's
 * recent purple/2-stripes, Sofia's brown/3-stripes), two `event`
 * (open-mat saturday, Roger Gracie seminar), and a `stripe_promotion`
 * for visual variety. The newest post is Marco's promotion — the
 * post the observer fired two days before the frozen now.
 */
const PS_AUTHOR_JOAO = {
  id: 1,
  first_name: 'João',
  last_name: 'Almeida',
  full_name: 'João Almeida',
  handle: 'joao',
  avatar_url: null,
  belt: 'black' as const,
};

export const PS_COMMUNITY_FEED = {
  data: [
    {
      id: 501,
      type: 'belt_promotion' as const,
      visibility: 'academy' as const,
      payload: {
        athlete_id: 1,
        athlete_first_name: 'Marco',
        athlete_last_name: 'Rossi',
        new_belt: 'purple',
        new_stripes: 2,
        previous_belt: 'purple',
        previous_stripes: 1,
      },
      created_at: '2026-04-22T18:05:00+00:00',
      created_by: PS_AUTHOR_JOAO,
      reactions_count: 19,
      reaction_counts: { clap: 14, pray: 5 },
      comments_count: 5,
      rsvps_count: 0,
      your_reaction: 'clap' as const,
    },
    {
      id: 502,
      type: 'event' as const,
      visibility: 'academy' as const,
      payload: {
        title: 'Open mat sabato pomeriggio',
        description: 'Tatami libero per drilling e rolling. Aperto a tutte le cinture.',
        starts_at: '2026-04-27T15:00:00+00:00',
        ends_at: '2026-04-27T17:00:00+00:00',
        location: 'Tatami principale',
      },
      created_at: '2026-04-21T10:30:00+00:00',
      created_by: PS_AUTHOR_JOAO,
      reactions_count: 9,
      reaction_counts: { clap: 6, pray: 3 },
      comments_count: 3,
      rsvps_count: 19,
      your_reaction: null,
    },
    {
      id: 503,
      type: 'belt_promotion' as const,
      visibility: 'academy' as const,
      payload: {
        athlete_id: 2,
        athlete_first_name: 'Giulia',
        athlete_last_name: 'Bianchi',
        new_belt: 'blue',
        new_stripes: 4,
        previous_belt: 'blue',
        previous_stripes: 3,
      },
      created_at: '2026-04-18T19:00:00+00:00',
      created_by: PS_AUTHOR_JOAO,
      reactions_count: 15,
      reaction_counts: { clap: 10, pray: 5 },
      comments_count: 2,
      rsvps_count: 0,
      your_reaction: null,
    },
    {
      id: 504,
      type: 'event' as const,
      visibility: 'academy' as const,
      payload: {
        title: 'Seminario internazionale — Roger Gracie',
        description:
          'Una giornata di pressure passing e back control con Roger Gracie ospite presso la academy. Posti limitati.',
        starts_at: '2026-05-18T10:00:00+00:00',
        ends_at: '2026-05-18T16:00:00+00:00',
        location: 'Tatami principale',
      },
      created_at: '2026-04-15T09:00:00+00:00',
      created_by: PS_AUTHOR_JOAO,
      reactions_count: 32,
      reaction_counts: { clap: 24, pray: 8 },
      comments_count: 9,
      rsvps_count: 40,
      your_reaction: 'clap' as const,
    },
    {
      id: 505,
      type: 'belt_promotion' as const,
      visibility: 'academy' as const,
      payload: {
        athlete_id: 6,
        athlete_first_name: 'Sofia',
        athlete_last_name: 'Conti',
        new_belt: 'brown',
        new_stripes: 3,
        previous_belt: 'brown',
        previous_stripes: 2,
      },
      created_at: '2026-04-10T18:30:00+00:00',
      created_by: PS_AUTHOR_JOAO,
      reactions_count: 22,
      reaction_counts: { clap: 15, pray: 7 },
      comments_count: 4,
      rsvps_count: 0,
      your_reaction: 'pray' as const,
    },
  ],
  meta: {
    current_page: 1,
    per_page: 20,
    total: 5,
    last_page: 1,
  },
} as const;

/** Stats overview — totals + belt distribution. */
export const PS_STATS_OVERVIEW = {
  data: {
    total_athletes: 8,
    active_athletes: 8,
    inactive_athletes: 0,
    belts: {
      white: 2,
      blue: 2,
      purple: 1,
      brown: 2,
      black: 1,
    },
  },
} as const;

/** Stats — daily attendance heatmap (last 3 months). Synthesised pattern
 *  so the heatmap looks alive without being uniform. */
export const PS_STATS_ATTENDANCE_DAILY = {
  data: [
    { date: '2026-02-03', count: 6 },
    { date: '2026-02-05', count: 8 },
    { date: '2026-02-10', count: 5 },
    { date: '2026-02-12', count: 7 },
    { date: '2026-02-17', count: 9 },
    { date: '2026-02-19', count: 6 },
    { date: '2026-02-24', count: 8 },
    { date: '2026-02-26', count: 7 },
    { date: '2026-03-03', count: 5 },
    { date: '2026-03-05', count: 9 },
    { date: '2026-03-10', count: 8 },
    { date: '2026-03-12', count: 6 },
    { date: '2026-03-17', count: 7 },
    { date: '2026-03-19', count: 9 },
    { date: '2026-03-24', count: 8 },
    { date: '2026-03-26', count: 7 },
    { date: '2026-03-31', count: 6 },
    { date: '2026-04-02', count: 8 },
    { date: '2026-04-07', count: 9 },
    { date: '2026-04-09', count: 7 },
    { date: '2026-04-14', count: 8 },
    { date: '2026-04-16', count: 6 },
    { date: '2026-04-21', count: 5 },
    { date: '2026-04-22', count: 7 },
    { date: '2026-04-23', count: 8 },
    { date: '2026-04-24', count: 5 },
  ],
} as const;

/** Stats — monthly payments (last 12 months). */
export const PS_STATS_PAYMENTS_MONTHLY = {
  data: [
    { month: '2025-05', total_eur: 720 },
    { month: '2025-06', total_eur: 800 },
    { month: '2025-07', total_eur: 640 },
    { month: '2025-08', total_eur: 480 },
    { month: '2025-09', total_eur: 880 },
    { month: '2025-10', total_eur: 920 },
    { month: '2025-11', total_eur: 880 },
    { month: '2025-12', total_eur: 720 },
    { month: '2026-01', total_eur: 960 },
    { month: '2026-02', total_eur: 880 },
    { month: '2026-03', total_eur: 920 },
    { month: '2026-04', total_eur: 760 },
  ],
} as const;
