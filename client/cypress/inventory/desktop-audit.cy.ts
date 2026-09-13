/*
 * Desktop audit — every screen the shipped app can show (#1614).
 *
 * This is NOT a test. It is the sibling of `design-inventory.cy.ts` for the
 * product Budojo actually is now: a 1280×860 Electron window that can be
 * shrunk to 960×600, used in Italian, with none of the web-only
 * capabilities. Where the inventory answers "what does a list page look like
 * in Budojo?", this answers "what does the owner see tonight?" — populated
 * states, the dialogs opened, the empty and error states beside them.
 *
 * Run with:  npm run design:audit
 *
 * Output lands in `cypress/screenshots/desktop-audit.cy.ts/` (gitignored),
 * named `{slug}__{width}.png`. The slugs are numbered by area so the folder
 * reads in the order the audit document does.
 *
 * Deterministic on purpose: every endpoint is stubbed, the clock is frozen
 * at Monday 14 September 2026, 18:30 — in season, half an hour before an
 * evening class — and the Electron bridge is faked so the title bar, the
 * backup page and the update banner render as they do in the real shell.
 * Re-running after a fix produces the same picture, minus the fix.
 */
export {};

// ── The clock ────────────────────────────────────────────────────────────
//
// Monday 14 September 2026, 18:30 local. The season started on the 1st, two
// classes are on tonight's timetable, and half an hour before the first one
// is exactly when the check-in gets opened.
const NOW = new Date(2026, 8, 14, 18, 30).getTime();
const TODAY = '2026-09-14';

// ── The academy ──────────────────────────────────────────────────────────

const ADDRESS = {
  line1: 'Via Garibaldi 12',
  line2: null,
  city: 'Torino',
  postal_code: '10122',
  province: 'TO',
  country: 'IT',
};

const ACADEMY = {
  id: 1,
  name: 'Budojo BJJ Torino',
  slug: 'budojo-bjj-torino-1a2b3c4d',
  phone_country_code: '+39',
  phone_national_number: '0111234567',
  website: 'https://budojo-torino.example',
  facebook: null,
  instagram: 'budojo_torino',
  address: ADDRESS,
  logo_url: null,
  monthly_fee_cents: 7000,
  fee_tier_count: 2,
  carnet_price_cents: 12_000,
  carnet_entries: 10,
  carnet_entry_unit: 'lesson',
  syllabus_topics_count: 31,
  training_days: [1, 3, 5, 6],
  current_schedule: { id: 1, training_days: [1, 3, 5, 6], effective_from: '2026-09-01' },
  next_schedule: null,
  schedules: [{ id: 1, training_days: [1, 3, 5, 6], effective_from: '2026-09-01' }],
  season_start_month: 9,
  season_start: '2026-09-01',
  season_label: '2026/27',
  classes_count: 6,
};

const ME = {
  id: 1,
  first_name: 'Matteo',
  last_name: 'Bonanno',
  full_name: 'Matteo Bonanno',
  handle: 'matteo',
  email: 'matteo@example.com',
  email_verified_at: '2026-01-01T00:00:00+00:00',
  avatar_url: null,
  two_factor_enabled: false,
  role: 'owner',
  pending_email_change: null,
  deletion_pending: null,
};

const FEE_TIERS = [
  {
    id: 1,
    label: '2 lezioni a settimana',
    amount_cents: 6000,
    lessons_per_week: 2,
    athletes_count: 3,
  },
  { id: 2, label: 'Illimitato', amount_cents: 7000, lessons_per_week: 7, athletes_count: 4 },
];

// Carbon's dayOfWeek: 0 = Sunday … 6 = Saturday. Two on Monday evening so
// the check-in has a choice to make, and a Saturday open mat with no time.
const CLASSES = [
  { id: 1, name: 'Fondamentali', weekday: 1, starts_at: '19:00', duration_minutes: 60, kind: 'gi' },
  { id: 2, name: 'Avanzati', weekday: 1, starts_at: '20:00', duration_minutes: 75, kind: 'gi' },
  { id: 3, name: 'No-gi', weekday: 3, starts_at: '19:00', duration_minutes: 60, kind: 'nogi' },
  { id: 4, name: 'Avanzati', weekday: 3, starts_at: '20:00', duration_minutes: 75, kind: 'gi' },
  { id: 5, name: 'Fondamentali', weekday: 5, starts_at: '19:00', duration_minutes: 60, kind: 'gi' },
  { id: 6, name: 'Open mat', weekday: 6, starts_at: '10:00', duration_minutes: null, kind: 'both' },
];

// ── The programme ────────────────────────────────────────────────────────

function topic(id: number, parent_id: number | null, name: string, over: object = {}) {
  return { id, parent_id, name, kind: 'both', in_season: true, sort_order: id, ...over };
}

const SYLLABUS = [
  {
    ...topic(1, null, 'Closed guard', { sort_order: 0 }),
    children: [
      topic(11, 1, 'Armbar'),
      topic(12, 1, 'Triangle'),
      topic(13, 1, 'Kimura'),
      topic(14, 1, 'Hip bump sweep'),
      topic(15, 1, 'Cross collar choke', { kind: 'gi' }),
      topic(16, 1, 'Omoplata'),
    ],
  },
  {
    ...topic(2, null, 'Half guard', { sort_order: 1 }),
    children: [
      topic(21, 2, 'Knee shield'),
      topic(22, 2, 'Old school sweep'),
      topic(23, 2, 'Lockdown', { kind: 'nogi' }),
      topic(24, 2, 'Kimura trap', { in_season: false }),
    ],
  },
  {
    ...topic(3, null, 'Mount', { sort_order: 2 }),
    children: [
      topic(31, 3, 'Americana'),
      topic(32, 3, 'Cross collar choke', { kind: 'gi' }),
      topic(33, 3, 'Arm triangle'),
      topic(34, 3, 'Upa escape'),
      topic(35, 3, 'Elbow-knee escape'),
    ],
  },
  {
    ...topic(4, null, 'Side control', { sort_order: 3 }),
    children: [
      topic(41, 4, 'Escape to guard'),
      topic(42, 4, 'Kimura'),
      topic(43, 4, 'Paper cutter choke', { kind: 'gi' }),
      topic(44, 4, 'North-south choke'),
    ],
  },
  {
    ...topic(5, null, 'Back', { sort_order: 4 }),
    children: [
      topic(51, 5, 'Rear naked choke'),
      topic(52, 5, 'Bow and arrow choke', { kind: 'gi' }),
      topic(53, 5, 'Back escape'),
    ],
  },
  {
    ...topic(6, null, 'Standing', { sort_order: 5 }),
    children: [
      topic(61, 6, 'Double leg'),
      topic(62, 6, 'Osoto gari', { kind: 'gi' }),
      topic(63, 6, 'Guard pull', { kind: 'gi' }),
      topic(64, 6, 'Snap down', { kind: 'nogi' }),
    ],
  },
  {
    ...topic(7, null, 'Leg entanglements', { kind: 'nogi', sort_order: 6 }),
    children: [
      topic(71, 7, 'Straight ankle lock'),
      topic(72, 7, 'Heel hook', { kind: 'nogi' }),
      topic(73, 7, 'Saddle entry', { kind: 'nogi', in_season: false }),
    ],
  },
];

function lessonTopic(id: number, name: string, parent: string, kind = 'both') {
  return { id, name, kind, parent_id: Math.floor(id / 10), parent_name: parent, deleted: false };
}

/** Tonight's fundamentals, already tagged with one topic, not yet held. */
const LESSON_TONIGHT = {
  id: 7,
  academy_class_id: 1,
  held_on: TODAY,
  name: 'Fondamentali',
  starts_at: '19:00',
  kind: 'gi',
  notes: null,
  held: false,
  topics: [lessonTopic(11, 'Armbar', 'Closed guard')],
};

const RECENT_TOPICS = [
  lessonTopic(14, 'Hip bump sweep', 'Closed guard'),
  lessonTopic(11, 'Armbar', 'Closed guard'),
  lessonTopic(21, 'Knee shield', 'Half guard'),
  lessonTopic(31, 'Americana', 'Mount'),
];

const SUGGESTIONS = [
  {
    id: 12,
    name: 'Triangle',
    parent_name: 'Closed guard',
    kind: 'both',
    reason: 'never',
    last_taught_on: null,
  },
  {
    id: 13,
    name: 'Kimura',
    parent_name: 'Closed guard',
    kind: 'both',
    reason: 'never',
    last_taught_on: null,
  },
  {
    id: 21,
    name: 'Knee shield',
    parent_name: 'Half guard',
    kind: 'both',
    reason: 'thin',
    last_taught_on: '2026-09-07',
  },
];

// ── The roster ───────────────────────────────────────────────────────────

function athlete(over: Record<string, unknown>) {
  return {
    email: null,
    phone_country_code: null,
    phone_national_number: null,
    website: null,
    facebook: null,
    instagram: null,
    address: null,
    photo_url: null,
    user_handle: null,
    user_avatar_url: null,
    status: 'active',
    created_at: '2024-09-01T10:00:00+00:00',
    is_self: false,
    invitation: null,
    fee_tier: null,
    monthly_fee_cents: 7000,
    billing_period_months: 1,
    payment_coverage: 'monthly',
    paid_current_month: true,
    active_carnet: null,
    attendance_month_count: 0,
    attendance_total_count: 0,
    ...over,
  };
}

const ATHLETES = [
  athlete({
    id: 1,
    first_name: 'Giulia',
    last_name: 'Ferraro',
    email: 'giulia.ferraro@example.com',
    phone_country_code: '+39',
    phone_national_number: '3331234567',
    instagram: 'giulia.bjj',
    date_of_birth: '1994-03-12',
    belt: 'blue',
    stripes: 2,
    joined_at: '2024-09-02',
    fee_tier: FEE_TIERS[1],
    billing_period_months: 3,
    payment_coverage: 'quarterly',
    attendance_month_count: 5,
    attendance_total_count: 143,
    active_carnet: { id: 7, code: 'A7K2', remaining_entries: 3, expires_at: '2027-01-10' },
  }),
  athlete({
    id: 2,
    first_name: 'Luca',
    last_name: 'Moretti',
    date_of_birth: '1999-11-02',
    belt: 'white',
    stripes: 3,
    joined_at: '2025-10-06',
    fee_tier: FEE_TIERS[0],
    attendance_month_count: 4,
    attendance_total_count: 61,
  }),
  athlete({
    id: 3,
    first_name: 'Matteo',
    last_name: 'Bonanno',
    email: 'matteo@example.com',
    date_of_birth: '1990-05-15',
    belt: 'black',
    stripes: 2,
    joined_at: '2010-01-10',
    is_self: true,
    payment_coverage: 'none',
    paid_current_month: false,
    monthly_fee_cents: null,
    attendance_month_count: 6,
    attendance_total_count: 812,
  }),
  athlete({
    id: 4,
    first_name: 'Sara',
    last_name: 'Colombo',
    date_of_birth: '1988-07-23',
    belt: 'purple',
    stripes: 1,
    joined_at: '2021-02-01',
    payment_coverage: 'annual',
    billing_period_months: 12,
    attendance_month_count: 3,
    attendance_total_count: 402,
  }),
  athlete({
    id: 5,
    first_name: 'Davide',
    last_name: 'Ricci',
    date_of_birth: null,
    belt: 'white',
    stripes: 0,
    joined_at: '2026-02-16',
    status: 'inactive',
    payment_coverage: 'none',
    paid_current_month: false,
    attendance_month_count: 0,
    attendance_total_count: 9,
  }),
  athlete({
    id: 6,
    first_name: 'Elena',
    last_name: 'Russo',
    date_of_birth: '1996-01-30',
    belt: 'blue',
    stripes: 4,
    joined_at: '2023-09-11',
    payment_coverage: 'carnet',
    paid_current_month: false,
    active_carnet: { id: 9, code: 'Q3M8', remaining_entries: 6, expires_at: '2027-03-01' },
    attendance_month_count: 2,
    attendance_total_count: 188,
  }),
  athlete({
    id: 7,
    first_name: 'Andrea',
    last_name: 'Gallo',
    date_of_birth: '1985-12-05',
    belt: 'brown',
    stripes: 0,
    joined_at: '2019-05-20',
    payment_coverage: 'none',
    paid_current_month: false,
    attendance_month_count: 1,
    attendance_total_count: 530,
  }),
  athlete({
    id: 8,
    first_name: 'Francesca',
    last_name: 'Marino',
    date_of_birth: '2001-04-18',
    belt: 'white',
    stripes: 0,
    joined_at: '2026-09-07',
    created_at: '2026-09-07T18:00:00+00:00',
    attendance_month_count: 2,
    attendance_total_count: 2,
  }),
];

function page(rows: unknown[], perPage = 20) {
  return {
    data: rows,
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: 1,
      from: rows.length === 0 ? null : 1,
      last_page: 1,
      path: '',
      per_page: perPage,
      to: rows.length === 0 ? null : rows.length,
      total: rows.length,
    },
  };
}

const ATHLETE_ONE = ATHLETES[0];

// ── Documents ────────────────────────────────────────────────────────────

function document(over: Record<string, unknown>) {
  return {
    athlete_id: 1,
    mime_type: 'application/pdf',
    size_bytes: 180_000,
    notes: null,
    created_at: '2025-09-20T10:00:00+00:00',
    deleted_at: null,
    ...over,
  };
}

const DOCUMENTS_ONE = [
  document({
    id: 42,
    type: 'medical_certificate',
    original_name: 'certificato-medico-2025.pdf',
    issued_at: '2025-09-20',
    expires_at: '2026-09-30',
  }),
  document({
    id: 43,
    type: 'id_card',
    original_name: 'carta-identita.jpg',
    mime_type: 'image/jpeg',
    size_bytes: 480_000,
    issued_at: '2022-01-10',
    expires_at: '2032-01-10',
    created_at: '2024-09-02T10:00:00+00:00',
  }),
  document({
    id: 44,
    type: 'medical_certificate',
    original_name: 'certificato-medico-2024.pdf',
    issued_at: '2024-09-15',
    expires_at: '2025-09-15',
    created_at: '2024-09-15T10:00:00+00:00',
    deleted_at: '2025-09-20T10:00:00+00:00',
  }),
];

const EXPIRING = {
  data: [
    {
      ...DOCUMENTS_ONE[0],
      athlete: { id: 1, first_name: 'Giulia', last_name: 'Ferraro' },
    },
    {
      ...document({
        id: 45,
        athlete_id: 4,
        type: 'medical_certificate',
        original_name: 'certificato.pdf',
        issued_at: '2025-09-01',
        expires_at: '2026-09-10',
      }),
      athlete: { id: 4, first_name: 'Sara', last_name: 'Colombo' },
    },
    {
      ...document({
        id: 46,
        athlete_id: 7,
        type: 'insurance',
        original_name: 'assicurazione-2026.pdf',
        issued_at: '2025-10-01',
        expires_at: '2026-10-01',
      }),
      athlete: { id: 7, first_name: 'Andrea', last_name: 'Gallo' },
    },
  ],
  missing_medical_certificate: [
    { id: 2, first_name: 'Luca', last_name: 'Moretti' },
    { id: 8, first_name: 'Francesca', last_name: 'Marino' },
  ],
};

// ── Attendance, payments, promotions, carnets ────────────────────────────

function record(id: number, athlete_id: number, attended_on: string, lesson_id: number | null) {
  return {
    id,
    athlete_id,
    lesson_id,
    attended_on,
    notes: null,
    source: 'instructor',
    created_at: `${attended_on}T18:05:00+00:00`,
    deleted_at: null,
  };
}

const ATTENDANCE_TONIGHT = [record(1, 1, TODAY, 7), record(2, 2, TODAY, 7), record(3, 4, TODAY, 7)];

const ATTENDANCE_ONE = [
  record(10, 1, '2026-09-11', 5),
  record(11, 1, '2026-09-09', 3),
  record(12, 1, '2026-09-07', 1),
  record(13, 1, '2026-09-04', 5),
  record(14, 1, '2026-09-02', 3),
  record(15, 1, '2026-08-28', null),
];

/** Giulia's last 90 days: Monday and Wednesday, nothing in August. */
const ATHLETE_SUMMARY = (() => {
  const series = Array.from({ length: 90 }, (_, i) => {
    const d = new Date(NOW - (89 - i) * 86_400_000);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const trains = d.getMonth() !== 7 && (d.getDay() === 1 || d.getDay() === 3);
    return { date: iso, attended: trains };
  });
  const attended = series.filter((p) => p.attended).length;
  return {
    range_days: 90,
    range_start: series[0].date,
    range_end: series[series.length - 1].date,
    attended_count: attended,
    expected_count: 30,
    rate: Math.round((attended / 30) * 100) / 100,
    series,
  };
})();

const ATTENDANCE_SUMMARY = [
  { athlete_id: 3, first_name: 'Matteo', last_name: 'Bonanno', count: 6 },
  { athlete_id: 1, first_name: 'Giulia', last_name: 'Ferraro', count: 5 },
  { athlete_id: 2, first_name: 'Luca', last_name: 'Moretti', count: 4 },
  { athlete_id: 4, first_name: 'Sara', last_name: 'Colombo', count: 3 },
  { athlete_id: 6, first_name: 'Elena', last_name: 'Russo', count: 2 },
  { athlete_id: 8, first_name: 'Francesca', last_name: 'Marino', count: 2 },
  { athlete_id: 7, first_name: 'Andrea', last_name: 'Gallo', count: 1 },
];

const LEADERBOARD = {
  data: [
    {
      rank: 1,
      athlete_id: 3,
      first_name: 'Matteo',
      last_name_initial: 'B',
      sessions: 6,
      hours: 6.5,
      anonymous: false,
      is_self: true,
    },
    {
      rank: 2,
      athlete_id: 1,
      first_name: 'Giulia',
      last_name_initial: 'F',
      sessions: 5,
      hours: 5.25,
      anonymous: false,
      is_self: false,
    },
    {
      rank: 3,
      athlete_id: 2,
      first_name: 'Luca',
      last_name_initial: 'M',
      sessions: 4,
      hours: 4,
      anonymous: false,
      is_self: false,
    },
    {
      rank: 4,
      athlete_id: 4,
      first_name: 'Sara',
      last_name_initial: 'C',
      sessions: 3,
      hours: 3.5,
      anonymous: false,
      is_self: false,
    },
    {
      rank: 5,
      athlete_id: 6,
      first_name: 'Elena',
      last_name_initial: 'R',
      sessions: 2,
      hours: 2,
      anonymous: false,
      is_self: false,
    },
  ],
  meta: { month: '2026-09' },
};

// A payment covers a PERIOD (#1382): Giulia pays quarterly.
const PAYMENTS_ONE = [
  {
    id: 1,
    athlete_id: 1,
    year: 2026,
    month: 7,
    period_months: 3,
    amount_cents: 21_000,
    paid_at: '2026-07-02',
  },
  {
    id: 2,
    athlete_id: 1,
    year: 2026,
    month: 4,
    period_months: 3,
    amount_cents: 21_000,
    paid_at: '2026-04-02',
  },
  {
    id: 3,
    athlete_id: 1,
    year: 2026,
    month: 1,
    period_months: 3,
    amount_cents: 21_000,
    paid_at: '2026-01-02',
  },
];

const CARNETS_ONE = [
  {
    id: 7,
    code: 'A7K2',
    athlete_id: 1,
    total_entries: 10,
    remaining_entries: 3,
    price_cents: 12_000,
    purchased_at: '2026-01-10',
    valid_from: '2026-01-10',
    expires_at: '2027-01-10',
    is_active: true,
  },
];

const PROMOTIONS_ONE = [
  {
    id: 9,
    kind: 'stripe',
    from_belt: null,
    to_belt: null,
    from_stripes: 1,
    to_stripes: 2,
    belt_at_event: 'blue',
    recorded_at: '2026-06-15T10:00:00+00:00',
    recorded_by: { id: 1, full_name: 'Matteo Bonanno' },
  },
  {
    id: 8,
    kind: 'belt',
    from_belt: 'white',
    to_belt: 'blue',
    from_stripes: 4,
    to_stripes: 0,
    belt_at_event: 'blue',
    recorded_at: '2025-12-20T10:00:00+00:00',
    recorded_by: { id: 1, full_name: 'Matteo Bonanno' },
  },
  {
    id: 7,
    kind: 'stripe',
    from_belt: null,
    to_belt: null,
    from_stripes: 3,
    to_stripes: 4,
    belt_at_event: 'white',
    recorded_at: '2025-09-10T10:00:00+00:00',
    recorded_by: { id: 1, full_name: 'Matteo Bonanno' },
  },
];

// ── Coverage ─────────────────────────────────────────────────────────────

const ATHLETE_COVERAGE = {
  season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
  joined_on: '2024-09-02',
  totals: { taught_by_academy: 6, seen: 3, thin: 2, missed: 1, percentage: 50, not_taught_yet: 23 },
  missed: [
    { id: 21, name: 'Knee shield', parent_name: 'Half guard', kind: 'both', taught_times: 1 },
  ],
  seen_lately: [
    { id: 11, name: 'Armbar', parent_name: 'Closed guard', lessons: 2, last_seen_on: '2026-09-11' },
    {
      id: 14,
      name: 'Hip bump sweep',
      parent_name: 'Closed guard',
      lessons: 2,
      last_seen_on: '2026-09-09',
    },
    { id: 31, name: 'Americana', parent_name: 'Mount', lessons: 2, last_seen_on: '2026-09-07' },
    { id: 34, name: 'Upa escape', parent_name: 'Mount', lessons: 1, last_seen_on: '2026-09-04' },
    { id: 61, name: 'Double leg', parent_name: 'Standing', lessons: 1, last_seen_on: '2026-09-02' },
  ],
  unattributed_presences: 1,
};

function coveragePosition(
  id: number,
  name: string,
  in_scope: number,
  covered: number,
  thin: number,
  worked: number,
  kind = 'both',
) {
  return { id, name, kind, in_scope, covered, thin, missing: in_scope - covered - thin, worked };
}

const SYLLABUS_COVERAGE = {
  season: { start: '2026-09-01', end: '2027-08-31', label: '2026/27' },
  kind: null,
  totals: { in_scope: 29, covered: 3, thin: 4, missing: 22, percentage: 10 },
  positions: [
    coveragePosition(1, 'Closed guard', 6, 2, 1, 4),
    coveragePosition(2, 'Half guard', 3, 0, 1, 1),
    coveragePosition(3, 'Mount', 5, 1, 1, 3),
    coveragePosition(4, 'Side control', 4, 0, 0, 0),
    coveragePosition(5, 'Back', 3, 0, 0, 0),
    coveragePosition(6, 'Standing', 4, 0, 1, 1),
    coveragePosition(7, 'Leg entanglements', 2, 0, 0, 0, 'nogi'),
  ],
  missing: [
    { id: 12, name: 'Triangle', parent_name: 'Closed guard', kind: 'both' },
    { id: 13, name: 'Kimura', parent_name: 'Closed guard', kind: 'both' },
    { id: 15, name: 'Cross collar choke', parent_name: 'Closed guard', kind: 'gi' },
    { id: 22, name: 'Old school sweep', parent_name: 'Half guard', kind: 'both' },
    { id: 23, name: 'Lockdown', parent_name: 'Half guard', kind: 'nogi' },
    { id: 32, name: 'Cross collar choke', parent_name: 'Mount', kind: 'gi' },
    { id: 33, name: 'Arm triangle', parent_name: 'Mount', kind: 'both' },
    { id: 35, name: 'Elbow-knee escape', parent_name: 'Mount', kind: 'both' },
    { id: 41, name: 'Escape to guard', parent_name: 'Side control', kind: 'both' },
    { id: 42, name: 'Kimura', parent_name: 'Side control', kind: 'both' },
    { id: 43, name: 'Paper cutter choke', parent_name: 'Side control', kind: 'gi' },
    { id: 44, name: 'North-south choke', parent_name: 'Side control', kind: 'both' },
    { id: 51, name: 'Rear naked choke', parent_name: 'Back', kind: 'both' },
    { id: 52, name: 'Bow and arrow choke', parent_name: 'Back', kind: 'gi' },
    { id: 53, name: 'Back escape', parent_name: 'Back', kind: 'both' },
    { id: 62, name: 'Osoto gari', parent_name: 'Standing', kind: 'gi' },
    { id: 63, name: 'Guard pull', parent_name: 'Standing', kind: 'gi' },
    { id: 64, name: 'Snap down', parent_name: 'Standing', kind: 'nogi' },
    { id: 71, name: 'Straight ankle lock', parent_name: 'Leg entanglements', kind: 'both' },
    { id: 72, name: 'Heel hook', parent_name: 'Leg entanglements', kind: 'nogi' },
  ],
  taught: [
    {
      id: 11,
      name: 'Armbar',
      parent_name: 'Closed guard',
      kind: 'both',
      lessons: 3,
      last_taught_on: '2026-09-11',
      state: 'covered',
    },
    {
      id: 14,
      name: 'Hip bump sweep',
      parent_name: 'Closed guard',
      kind: 'both',
      lessons: 2,
      last_taught_on: '2026-09-09',
      state: 'covered',
    },
    {
      id: 31,
      name: 'Americana',
      parent_name: 'Mount',
      kind: 'both',
      lessons: 2,
      last_taught_on: '2026-09-07',
      state: 'covered',
    },
    {
      id: 16,
      name: 'Omoplata',
      parent_name: 'Closed guard',
      kind: 'both',
      lessons: 1,
      last_taught_on: '2026-09-09',
      state: 'thin',
    },
    {
      id: 21,
      name: 'Knee shield',
      parent_name: 'Half guard',
      kind: 'both',
      lessons: 1,
      last_taught_on: '2026-09-07',
      state: 'thin',
    },
    {
      id: 34,
      name: 'Upa escape',
      parent_name: 'Mount',
      kind: 'both',
      lessons: 1,
      last_taught_on: '2026-09-04',
      state: 'thin',
    },
    {
      id: 61,
      name: 'Double leg',
      parent_name: 'Standing',
      kind: 'both',
      lessons: 1,
      last_taught_on: '2026-09-02',
      state: 'thin',
    },
  ],
  timeline: [
    { on: '2026-09-06', covered: 1 },
    { on: '2026-09-13', covered: 3 },
  ],
};

// ── Stats ────────────────────────────────────────────────────────────────

const DAILY = Array.from({ length: 90 }, (_, i) => {
  const d = new Date(NOW - (89 - i) * 86_400_000);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // August is closed; the season picks up in September.
  const august = d.getMonth() === 7;
  return { date: iso, count: august ? 0 : [0, 6, 0, 7, 0, 5, 3][d.getDay()] };
});

const MONTHLY_PAYMENTS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(2026, 8 - 11 + i, 1);
  return {
    month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    currency: 'EUR',
    amount_cents: d.getMonth() === 7 ? 0 : 42_000 + (i % 4) * 7000,
  };
});

// Adults only — this academy has no kids programme.
const AGE_BANDS = {
  bands: [
    { code: 'adult', category: 'adults', min: 18, max: 29, count: 3 },
    { code: 'master_1', category: 'adults', min: 30, max: 35, count: 2 },
    { code: 'master_2', category: 'adults', min: 36, max: 40, count: 1 },
    { code: 'master_3', category: 'adults', min: 41, max: 45, count: 1 },
  ],
  total: 8,
  missing_dob: 1,
};

// ── Account, notifications, activity ─────────────────────────────────────

const NOTIFICATIONS = {
  data: [
    {
      id: 'n1',
      type: 'document_expiring',
      kind: 'document_expiring',
      title: 'Certificato medico in scadenza',
      body: 'Il certificato di Giulia Ferraro scade tra 16 giorni.',
      link: '/dashboard/athletes/1/documents',
      actor: null,
      read_at: null,
      created_at: '2026-09-14T07:00:00+00:00',
    },
    {
      id: 'n2',
      type: 'payment_overdue',
      kind: 'payment_overdue',
      title: 'Quota non pagata',
      body: 'Andrea Gallo non ha ancora pagato settembre.',
      link: '/dashboard/athletes/7/payments',
      actor: null,
      read_at: null,
      created_at: '2026-09-12T07:00:00+00:00',
    },
    {
      id: 'n3',
      type: 'athlete_promoted',
      kind: 'athlete_promoted',
      title: 'Promozione registrata',
      body: 'Giulia Ferraro: cintura blu, 2 gradi.',
      link: '/dashboard/athletes/1/promotions',
      actor: null,
      read_at: '2026-06-16T09:00:00+00:00',
      created_at: '2026-06-15T10:00:00+00:00',
    },
  ],
  meta: { unread_count: 2 },
};

const AUDIT = {
  data: [
    {
      id: 5,
      action: 'attendance.marked',
      actor_user_id: 1,
      actor_label: 'Matteo Bonanno',
      subject_type: 'athlete',
      subject_id: 4,
      subject_label: 'Sara Colombo',
      before: null,
      after: { attended_on: TODAY, academy_class_id: 1 },
      ip: '127.0.0.1',
      user_agent: 'Budojo Desktop',
      created_at: '2026-09-14T18:12:00+00:00',
    },
    {
      id: 4,
      action: 'lesson.topics_updated',
      actor_user_id: 1,
      actor_label: 'Matteo Bonanno',
      subject_type: 'lesson',
      subject_id: 7,
      subject_label: 'Fondamentali · 14 set',
      before: { topics: [] },
      after: { topics: ['Armbar'] },
      ip: '127.0.0.1',
      user_agent: 'Budojo Desktop',
      created_at: '2026-09-14T18:02:00+00:00',
    },
    {
      id: 3,
      action: 'athlete.created',
      actor_user_id: 1,
      actor_label: 'Matteo Bonanno',
      subject_type: 'athlete',
      subject_id: 8,
      subject_label: 'Francesca Marino',
      before: null,
      after: { belt: 'white', stripes: 0 },
      ip: '127.0.0.1',
      user_agent: 'Budojo Desktop',
      created_at: '2026-09-07T18:00:00+00:00',
    },
    {
      id: 2,
      action: 'payment.created',
      actor_user_id: 1,
      actor_label: 'Matteo Bonanno',
      subject_type: 'athlete',
      subject_id: 1,
      subject_label: 'Giulia Ferraro',
      before: null,
      after: {
        year: 2026,
        month: 7,
        period_months: 3,
        amount_cents: 21_000,
        paid_at: '2026-07-02',
      },
      ip: '127.0.0.1',
      user_agent: 'Budojo Desktop',
      created_at: '2026-07-01T17:40:00+00:00',
    },
    {
      id: 1,
      action: 'academy_class.created',
      actor_user_id: 1,
      actor_label: 'Matteo Bonanno',
      subject_type: 'academy_class',
      subject_id: 6,
      subject_label: 'Open mat',
      before: null,
      after: { weekday: 6, starts_at: '10:00' },
      ip: '127.0.0.1',
      user_agent: 'Budojo Desktop',
      created_at: '2026-09-01T09:00:00+00:00',
    },
  ],
  meta: { current_page: 1, from: 1, last_page: 3, path: '', per_page: 5, to: 5, total: 14 },
};

const SESSIONS = [
  {
    id: 1,
    name: 'Budojo Desktop su Windows',
    last_used_at: '2026-09-14T18:20:00+00:00',
    created_at: '2026-09-01T08:00:00+00:00',
    is_current: true,
  },
];

const LOGIN_HISTORY = [
  {
    id: 1,
    success: true,
    device: 'Budojo Desktop su Windows',
    ip_address: '127.0.0.1',
    created_at: '2026-09-14T18:20:00+00:00',
  },
  {
    id: 2,
    success: true,
    device: 'Budojo Desktop su Windows',
    ip_address: '127.0.0.1',
    created_at: '2026-09-11T18:40:00+00:00',
  },
  {
    id: 3,
    success: false,
    device: 'Budojo Desktop su Windows',
    ip_address: '127.0.0.1',
    created_at: '2026-09-11T18:39:00+00:00',
  },
];

// ── The Electron bridge ──────────────────────────────────────────────────

const ARCHIVES = [
  {
    name: 'budojo-2026-09-14-0300.zip',
    path: 'C:\\Users\\matteo\\AppData\\Roaming\\Budojo\\backups\\budojo-2026-09-14-0300.zip',
    createdAt: '2026-09-14T01:00:00.000Z',
    sizeBytes: 2_480_000,
  },
  {
    name: 'budojo-2026-09-13-0300.zip',
    path: 'C:\\Users\\matteo\\AppData\\Roaming\\Budojo\\backups\\budojo-2026-09-13-0300.zip',
    createdAt: '2026-09-13T01:00:00.000Z',
    sizeBytes: 2_470_000,
  },
  {
    name: 'budojo-2026-09-12-0300.zip',
    path: 'C:\\Users\\matteo\\AppData\\Roaming\\Budojo\\backups\\budojo-2026-09-12-0300.zip',
    createdAt: '2026-09-12T01:00:00.000Z',
    sizeBytes: 2_460_000,
  },
];

type UpdatePhase =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up-to-date' }
  | { phase: 'downloading'; version: string; percent: number }
  | { phase: 'ready'; version: string };

interface BridgeOptions {
  /** What `token.get()` answers — null for a signed-out visit. */
  token: string | null;
  update?: UpdatePhase;
  /** What `backup.list()` answers; defaults to three nightly archives. */
  archives?: typeof ARCHIVES;
}

/**
 * The renderer-side bridge (`src/budojo-bridge.d.ts`), faked. Its presence is
 * what makes the app draw the desktop title bar, gate the backup page open,
 * and read the token from the "keychain" instead of localStorage — so a
 * signed-in shot needs `token` set, and a signed-out one needs it null.
 */
function installBridge(win: Cypress.AUTWindow, opts: BridgeOptions): void {
  const status: UpdatePhase = opts.update ?? { phase: 'idle' };
  const ok =
    <T extends object>(value: T) =>
    () =>
      Promise.resolve(value);
  const bridge = {
    apiBase: '',
    platform: 'win32',
    version: () => Promise.resolve('2.61.1'),
    onNavigate: () => () => undefined,
    token: {
      get: () => opts.token,
      set: () => undefined,
      clear: () => undefined,
    },
    backup: {
      list: () => Promise.resolve(opts.archives ?? ARCHIVES),
      run: ok({ ok: true, path: ARCHIVES[0].path }),
      restore: ok({ ok: true }),
    },
    folder: {
      state: ok({
        folder: 'D:\\OneDrive\\Budojo backup',
        lastCopyAt: '2026-09-14T01:00:20.000Z',
        lastError: null,
        lastErrorAt: null,
      }),
      choose: ok({ ok: false }),
      clear: ok({ ok: true }),
      copy: ok({ ran: true, copied: 1 }),
      open: ok({ ok: true }),
    },
    drive: {
      state: ok({ configured: false, linked: false }),
      archives: () => Promise.resolve([]),
      link: ok({ ok: false }),
      unlink: ok({ ok: true }),
      sync: ok({ ran: false, reason: 'unavailable' }),
    },
    keys: {
      export: ok({ ok: true, code: 'BJJ7-K2M9-Q4TX-8HW3-ZP6N-R1VD' }),
      import: ok({ ok: true }),
    },
    update: {
      status: () => Promise.resolve(status),
      check: ok({ ok: true }),
      onStatus: () => () => undefined,
      installNow: ok({ ok: true }),
    },
  };
  Object.defineProperty(win, '__BUDOJO__', { value: bridge, configurable: true });
}

// ── Intercepts ───────────────────────────────────────────────────────────

/**
 * Everything the owner's screens ask for, in the populated state. Order
 * matters: Cypress gives the LAST matching intercept precedence, so the
 * catch-all goes first and every narrower pattern after it.
 */
function seed(): void {
  cy.intercept('GET', '/api/v1/**', { statusCode: 200, body: { data: [] } });

  // The shell.
  cy.intercept('GET', '/api/v1/runtime', {
    statusCode: 200,
    body: { data: { profile: 'desktop', capabilities: [] } },
  });
  cy.intercept('GET', '/api/v1/auth/me*', { statusCode: 200, body: { data: ME } });
  cy.intercept('GET', '/api/v1/me', { statusCode: 200, body: { data: ME } });
  cy.intercept('GET', '/api/v1/me/**', { statusCode: 200, body: { data: [] } });
  cy.intercept('GET', '/api/v1/me/onboarding', {
    statusCode: 200,
    body: {
      data: { dismissed_at: '2026-09-01T00:00:00Z', completed_steps: [], available_steps: [] },
    },
  });
  cy.intercept('GET', '/api/v1/me/notifications*', { statusCode: 200, body: NOTIFICATIONS });
  cy.intercept('GET', '/api/v1/me/sessions*', { statusCode: 200, body: { data: SESSIONS } });
  cy.intercept('GET', '/api/v1/me/login-history*', {
    statusCode: 200,
    body: { data: LOGIN_HISTORY },
  });
  cy.intercept('GET', '/api/v1/me/api-tokens*', { statusCode: 200, body: { data: [] } });
  cy.intercept('GET', '/api/v1/me/two-factor', {
    statusCode: 200,
    body: { data: { enabled: false, pending: false, recovery_codes_remaining: 0 } },
  });
  cy.intercept('GET', '/api/v1/me/notification-preferences', {
    statusCode: 200,
    body: { data: { medical_cert_expiry_reminders: true, unpaid_athletes_digest: true } },
  });
  cy.intercept('GET', '/api/v1/me/athlete', { statusCode: 200, body: { data: ATHLETES[2] } });

  // The academy.
  cy.intercept('GET', '/api/v1/academy', { statusCode: 200, body: { data: ACADEMY } });
  cy.intercept('GET', '/api/v1/academy/schedules', {
    statusCode: 200,
    body: { data: ACADEMY.schedules },
  });
  cy.intercept('GET', '/api/v1/academy/fee-tiers*', { statusCode: 200, body: { data: FEE_TIERS } });
  cy.intercept('GET', '/api/v1/academy/classes', { statusCode: 200, body: { data: CLASSES } });
  cy.intercept('GET', '/api/v1/academy/syllabus', { statusCode: 200, body: { data: SYLLABUS } });
  cy.intercept('GET', '/api/v1/audit-entries*', { statusCode: 200, body: AUDIT });

  // The roster and one athlete.
  cy.intercept('GET', '/api/v1/athletes*', { statusCode: 200, body: page(ATHLETES) });
  cy.intercept('GET', '/api/v1/athletes/1', { statusCode: 200, body: { data: ATHLETE_ONE } });
  cy.intercept('GET', '/api/v1/athletes/*/documents*', {
    statusCode: 200,
    body: { data: DOCUMENTS_ONE },
  });
  cy.intercept('GET', '/api/v1/athletes/*/attendance*', {
    statusCode: 200,
    body: { data: ATTENDANCE_ONE },
  });
  cy.intercept('GET', '/api/v1/athletes/*/attendance/summary*', {
    statusCode: 200,
    body: { data: ATHLETE_SUMMARY },
  });
  cy.intercept('GET', '/api/v1/athletes/*/payments*', {
    statusCode: 200,
    body: { data: PAYMENTS_ONE },
  });
  cy.intercept('GET', '/api/v1/athletes/*/carnets*', {
    statusCode: 200,
    body: { data: CARNETS_ONE },
  });
  cy.intercept('GET', '/api/v1/athletes/*/promotions*', {
    statusCode: 200,
    body: page(PROMOTIONS_ONE),
  });
  cy.intercept('GET', '/api/v1/athletes/*/syllabus-coverage*', {
    statusCode: 200,
    body: { data: ATHLETE_COVERAGE },
  });
  cy.intercept('GET', '/api/v1/documents/expiring*', { statusCode: 200, body: EXPIRING });
  cy.intercept('GET', '/api/v1/search*', { statusCode: 200, body: { data: [ATHLETES[0]] } });

  // Tonight.
  cy.intercept('GET', '/api/v1/attendance*', {
    statusCode: 200,
    body: { data: ATTENDANCE_TONIGHT },
  });
  cy.intercept('GET', '/api/v1/attendance/summary*', {
    statusCode: 200,
    body: { data: ATTENDANCE_SUMMARY },
  });
  cy.intercept('GET', '/api/v1/attendance/leaderboard*', { statusCode: 200, body: LEADERBOARD });
  cy.intercept('GET', '/api/v1/lessons?*', { statusCode: 200, body: { data: LESSON_TONIGHT } });
  cy.intercept('GET', '/api/v1/lessons/recent-topics', {
    statusCode: 200,
    body: { data: RECENT_TOPICS },
  });
  cy.intercept('GET', '/api/v1/lessons/suggestions*', {
    statusCode: 200,
    body: { data: SUGGESTIONS },
  });
  cy.intercept('GET', '/api/v1/payments/summary*', {
    statusCode: 200,
    body: { data: { paid: 4, unpaid: 3 } },
  });

  // Stats.
  cy.intercept('GET', '/api/v1/stats/attendance/daily*', {
    statusCode: 200,
    body: { data: DAILY },
  });
  cy.intercept('GET', '/api/v1/stats/payments/monthly*', {
    statusCode: 200,
    body: { data: MONTHLY_PAYMENTS },
  });
  cy.intercept('GET', '/api/v1/stats/athletes/age-bands', {
    statusCode: 200,
    body: { data: AGE_BANDS },
  });
  cy.intercept('GET', '/api/v1/stats/syllabus/coverage*', {
    statusCode: 200,
    body: { data: SYLLABUS_COVERAGE },
  });
}

// ── Capture ──────────────────────────────────────────────────────────────

const VIEWPORTS = [
  { name: '1280', width: 1280, height: 860 },
  { name: '960', width: 960, height: 600 },
] as const;

interface ScreenOptions {
  /** Signed out: the landing, the auth forms, the legal pages. */
  public?: boolean;
  /** Registered AFTER `seed()`, so they win: the screen's own overrides. */
  stubs?: () => void;
  /** Runs once the page is ready and settled, before the shutter. */
  act?: () => void;
  update?: UpdatePhase;
  /** Leave the clock real. Only for diagnosing a screen that will not settle. */
  clock?: false;
  /** The backup archives the bridge reports. */
  archives?: typeof ARCHIVES;
}

// Scroll a target to the middle before acting on it. The default scrolls it
// to the top edge, which on the desktop is under the fixed title bar — and
// Cypress then refuses the click as "covered by another element".
Cypress.config('scrollBehavior', 'center');

/** Click through actionability: PrimeNG hosts and controls under fixed chrome. */
function press(selector: string): void {
  cy.get(selector, { timeout: 10_000 }).then(($all) => {
    // A forced click dispatches on the element itself. On a `<p-button>`
    // host that is the wrapper PrimeNG does not listen to; the handler is on
    // the `<button>` inside it. A selector that matches a hidden twin (the
    // mobile variant of a control) takes the visible one.
    const $visible = $all.filter(':visible');
    const $el = $visible.length > 0 ? $visible.first() : $all.first();
    const target = $el.is('p-button') ? $el.find('button').first() : $el;
    cy.wrap(target).scrollIntoView().click({ force: true });
  });
}

/**
 * A `<p-dialog>` host is `display: contents`, so it is never "visible" to
 * Cypress even with the dialog wide open; the panel it renders is.
 */
function dialogOpen(hostSelector: string): void {
  cy.get(hostSelector, { timeout: 4000 }).should('exist');
  cy.get('.p-dialog', { timeout: 4000 }).should('be.visible');
}

/**
 * Two frames per screen. The first is the viewport — what the owner sees
 * before scrolling, which is where the fold and the hierarchy get judged.
 * The dashboard shell scrolls inside `.main`, not the document, so a
 * full-page capture of a dashboard route would be the viewport again: when
 * the page has more to show, the shell is unrolled for one more frame.
 */
function shoot(name: string, clockInstalled: boolean): void {
  if (clockInstalled) {
    // Anything paced on `Date.now()` — Chart.js's entry animation, an RxJS
    // `debounceTime` behind a search box — is still waiting on a clock that
    // never moves. Two seconds is past all of it.
    cy.tick(2000);
    cy.wait(150);
  }
  cy.screenshot(name, { capture: 'viewport', overwrite: true });
  cy.document().then((doc) => {
    const main = doc.querySelector('.main');
    const overflows =
      main !== null
        ? main.scrollHeight > main.clientHeight + 8
        : doc.documentElement.scrollHeight > doc.documentElement.clientHeight + 8;
    if (!overflows) {
      return;
    }
    const style = doc.createElement('style');
    style.textContent =
      '.layout{height:auto!important;overflow:visible!important}' +
      '.main{overflow:visible!important;height:auto!important;max-height:none!important}';
    doc.head.appendChild(style);
    cy.screenshot(`${name}__full`, { capture: 'fullPage', overwrite: true }).then(() => {
      style.remove();
    });
  });
}

/**
 * A screenshot shows what rendered; it cannot show a computed that threw
 * half-way through change detection and left the last frame on screen. Every
 * `console.error`, uncaught error and unhandled rejection raised while a
 * screen was up is written beside its picture, under `_console/`. Every file
 * reading `[]` is the pass condition.
 */
interface AuditWindow extends Cypress.AUTWindow {
  __auditErrors?: string[];
}

function recordConsoleErrors(win: AuditWindow): void {
  const errors: string[] = [];
  win.__auditErrors = errors;
  const original = win.console.error.bind(win.console);
  win.console.error = (...args: unknown[]) => {
    // `instanceof Error` is false across realms — the app's Error is not the
    // spec's — so an error is anything that carries a stack.
    const describe = (a: unknown): string =>
      typeof a === 'object' && a !== null && 'stack' in a
        ? String((a as { stack?: unknown }).stack ?? a)
        : String(a);
    errors.push(args.map(describe).join(' '));
    original(...args);
  };
  win.addEventListener('error', (e) => errors.push(`uncaught: ${e.message}`));
  win.addEventListener('unhandledrejection', (e) => errors.push(`rejection: ${String(e.reason)}`));
}

function dumpConsoleErrors(name: string): void {
  cy.window().then((win: AuditWindow) => {
    // Written for every screen, `[]` when clean: the runner keeps prior
    // assets, so a file that only existed for a failing screen would outlive
    // its fix and keep reporting it.
    cy.writeFile(
      `cypress/screenshots/desktop-audit.cy.ts/_console/${name}.json`,
      win.__auditErrors ?? [],
    );
  });
}

// The title bar's spinner is a state worth photographing (an update
// downloading), not a page still loading.
const PENDING =
  '[data-cy$="-skeleton"], [data-cy$="-loading"], .p-skeleton, .pi-spin:not(.titlebar__icon), .p-progressspinner, .p-datatable-mask, .p-datatable-loading-icon';

/**
 * Wait for the page to stop loading — up to eight seconds, and then shoot it
 * anyway. A skeleton that never resolves with every endpoint answering is a
 * finding, not a harness failure: it gets photographed, and the selector
 * that stayed is written to the screen's console dump.
 */
function settle(remaining = 16): void {
  cy.wait(remaining === 16 ? 250 : 500);
  cy.get('body').then(($body) => {
    const stuck = $body.find(PENDING);
    if (stuck.length === 0) {
      return;
    }
    if (remaining === 0) {
      cy.window().then((win: AuditWindow) => {
        const names = stuck
          .toArray()
          .map(
            (el) =>
              `${el.tagName.toLowerCase()}${el.dataset['cy'] ? `[data-cy=${el.dataset['cy']}]` : ''}`,
          )
          .join(', ');
        win.__auditErrors?.push(`still loading after 8s: ${names}`);
      });
      return;
    }
    settle(remaining - 1);
  });
}

/**
 * One screen, at both widths. `ready` is a selector that depends on DATA,
 * not chrome — a header button exists before the list does, and a shot
 * taken then is a picture of a loading state filed as a design fault.
 */
function screen(slug: string, route: string, ready: string, opts: ScreenOptions = {}): void {
  // `npm run design:audit -- 22-athlete` re-shoots one screen or one area,
  // and `22-athlete,40-stats` several (the npm script already names the spec;
  // a second spec token here would be read as the prefix list),
  // instead of all of them — a fix is checked in seconds, not minutes.
  const only = Cypress.env('ONLY');
  if (
    typeof only === 'string' &&
    only !== '' &&
    !only.split(/[,+]/).some((prefix) => slug.startsWith(prefix.trim()))
  ) {
    return;
  }

  VIEWPORTS.forEach((vp) => {
    it(`${slug} @ ${vp.name}`, () => {
      cy.viewport(vp.width, vp.height);
      if (opts.clock !== false) {
        cy.clock(NOW, ['Date']);
      }
      seed();
      opts.stubs?.();

      const token = opts.public === true ? null : 'fake-token';
      const visit: Partial<Cypress.VisitOptions> = {
        failOnStatusCode: false,
        onBeforeLoad(win: Cypress.AUTWindow) {
          win.localStorage.setItem('budojoLang', 'it');
          installBridge(win, { token, update: opts.update, archives: opts.archives });
          recordConsoleErrors(win);
        },
      };
      if (opts.public === true) {
        cy.visit(route, visit);
      } else {
        cy.visitAuthenticated(route, 'fake-token', visit);
      }

      // `exist`, not `visible`: Cypress counts anything outside a scrolling
      // ancestor's box as hidden, and the shell scrolls inside `.main`.
      cy.get(ready, { timeout: 10_000 }).should('exist');
      if (opts.clock !== false) {
        // Chart.js paces its entry animation on `Date.now()`, which the
        // frozen clock never advances: every canvas stayed on its first,
        // empty frame. Three seconds is past any animation the app runs.
        cy.tick(3000);
      }
      settle();
      opts.act?.();
      shoot(`${slug}__${vp.name}`, opts.clock !== false);
      dumpConsoleErrors(`${slug}__${vp.name}`);
    });
  });
}

const EMPTY_PAGE = { statusCode: 200, body: page([]) };
const NO_DATA = { statusCode: 200, body: { data: [] } };

// ── The screens ──────────────────────────────────────────────────────────

describe('Desktop audit — every screen at 1280×860 and 960×600, in Italian', () => {
  // What this run was asked to shoot, beside the pictures: `_env.json` says
  // which prefixes were in force when the folder was last written.
  it('records the run environment', () => {
    cy.writeFile('cypress/screenshots/desktop-audit.cy.ts/_env.json', {
      only: Cypress.env('ONLY') ?? null,
      env: Cypress.env(),
    });
  });

  // ── 0. Signed out ──────────────────────────────────────────────────────
  screen('00-landing', '/', '[data-cy="landing-lang-toggle"]', { public: true });
  screen('00-auth-login', '/auth/login', 'form', { public: true });
  screen('00-auth-register', '/auth/register', 'form', { public: true });
  // Both password-reset pages are gated on the `email` capability since
  // #1620, and this harness reports a desktop runtime with none — so what
  // they shoot now is the login page they redirect to. Kept as screens on
  // purpose: the frame is the evidence that the dead end is closed.
  screen('00-auth-forgot-password', '/auth/forgot-password', 'form', { public: true });
  screen('00-auth-reset-password', '/auth/reset-password?token=x&email=a@b.c', 'form', {
    public: true,
  });
  // First run: signed in, no academy yet.
  screen('00-setup', '/setup', '[data-cy="setup-train-here-question"]', {
    stubs: () => {
      cy.intercept('GET', '/api/v1/academy', { statusCode: 404, body: { message: 'Not found' } });
    },
  });

  // ── 1. Public help, legal, errors ──────────────────────────────────────
  screen('01-help', '/help', '[data-cy="help-search-input"]', { public: true });
  screen('01-legal-privacy', '/privacy/it', 'main, article, h1', { public: true });
  screen('01-legal-terms', '/terms/it', 'main, article, h1', { public: true });
  screen('01-legal-cookie-policy', '/cookie-policy/it', 'main, article, h1', { public: true });
  screen('01-legal-sub-processors', '/sub-processors/it', 'main, article, h1', { public: true });
  screen('01-legal-account-deletion', '/account-deletion/it', 'main, article, h1', {
    public: true,
  });
  screen('01-error-offline', '/offline', '[data-cy="offline-retry"]', { public: true });
  screen('01-error-server', '/error', '[data-cy="server-error-retry"]', { public: true });
  screen('01-error-not-found', '/no-such-page', '[data-cy="not-found-cta"]', { public: true });

  // ── 10. Academy ────────────────────────────────────────────────────────
  screen('10-academy-home', '/dashboard/academy', '[data-cy="academy-detail"]');
  screen('10-academy-edit', '/dashboard/academy/edit', '[data-cy="academy-form"]');
  screen(
    '10-academy-edit-fee-tier-form',
    '/dashboard/academy/edit',
    '[data-cy="fee-tier-add"] button',
    {
      act: () => {
        press('[data-cy="fee-tier-add"]');
        cy.get('[data-cy="fee-tier-form"]').should('be.visible');
      },
    },
  );

  // ── 11. Timetable ──────────────────────────────────────────────────────
  screen('11-timetable', '/dashboard/academy/timetable', '[data-cy="timetable-week"]');
  screen('11-timetable-empty', '/dashboard/academy/timetable', '[data-cy="timetable-page"]', {
    stubs: () => {
      cy.intercept('GET', '/api/v1/academy', {
        statusCode: 200,
        body: { data: { ...ACADEMY, classes_count: 0 } },
      });
      cy.intercept('GET', '/api/v1/academy/classes', NO_DATA);
    },
  });
  screen('11-timetable-dialog', '/dashboard/academy/timetable', '[data-cy="timetable-week"]', {
    act: () => {
      press('[data-cy="timetable-add"]');
      cy.get('[data-cy="timetable-form"]').should('be.visible');
    },
  });

  // ── 12. Programme ──────────────────────────────────────────────────────
  screen('12-syllabus', '/dashboard/academy/syllabus', '[data-cy="syllabus-tree"]', {
    act: () => {
      press('[data-cy="syllabus-toggle-1"]');
      cy.get('[data-cy="syllabus-topic-11"]').should('be.visible');
    },
  });
  screen('12-syllabus-empty', '/dashboard/academy/syllabus', '[data-cy="syllabus-page"]', {
    stubs: () => {
      cy.intercept('GET', '/api/v1/academy', {
        statusCode: 200,
        body: { data: { ...ACADEMY, syllabus_topics_count: 0 } },
      });
      cy.intercept('GET', '/api/v1/academy/syllabus', NO_DATA);
    },
  });
  screen('12-syllabus-dialog', '/dashboard/academy/syllabus', '[data-cy="syllabus-tree"]', {
    act: () => {
      press('[data-cy="syllabus-add"]');
      cy.get('[data-cy="syllabus-form"]').should('be.visible');
    },
  });

  // ── 13. Activity ───────────────────────────────────────────────────────
  screen('13-activity', '/dashboard/academy/activity', '[data-cy="audit-filters"]');

  // ── 20. Athletes ───────────────────────────────────────────────────────
  const ROSTER_READY = '[data-cy="athlete-status-1"], .athletes-table__row--muted, td';
  screen('20-athletes', '/dashboard/athletes', ROSTER_READY);
  screen('20-athletes-alerts-open', '/dashboard/athletes', ROSTER_READY, {
    act: () => {
      press('[data-cy="athletes-alerts"]');
      cy.get('[data-cy="athletes-alerts-panel"]').should('be.visible');
    },
  });
  screen('20-athletes-first-run', '/dashboard/athletes', '[data-cy="onboarding-checklist"]', {
    stubs: () => {
      cy.intercept('GET', '/api/v1/athletes*', EMPTY_PAGE);
      cy.intercept('GET', '/api/v1/documents/expiring*', {
        statusCode: 200,
        body: { data: [], missing_medical_certificate: [] },
      });
      cy.intercept('GET', '/api/v1/academy', {
        statusCode: 200,
        body: {
          data: { ...ACADEMY, classes_count: 0, syllabus_topics_count: 0, fee_tier_count: 0 },
        },
      });
      cy.intercept('GET', '/api/v1/me/onboarding', {
        statusCode: 200,
        body: {
          data: {
            dismissed_at: null,
            completed_steps: [],
            available_steps: [
              'add_athlete',
              'log_attendance',
              'mark_payment',
              'upload_document',
              'view_stats',
            ],
          },
        },
      });
    },
  });
  // The other empty state: a roster that exists, narrowed to nobody. The
  // search goes to the API as `?q=`, so an intercept keyed on it is enough
  // (#1618 — the two states used to be told apart by the wrong condition).
  screen('20-athletes-filtered-empty', '/dashboard/athletes', ROSTER_READY, {
    stubs: () => {
      cy.intercept(
        { method: 'GET', pathname: '/api/v1/athletes', query: { q: 'zzz' } },
        EMPTY_PAGE,
      );
    },
    act: () => {
      cy.get('[data-cy="athletes-search-input"]').type('zzz');
      // The search is debounced, and RxJS measures the debounce on the
      // frozen `Date`: the timer fires, sees no time has passed, and waits
      // again forever. Move the clock past it.
      cy.tick(300);
      cy.get('[data-cy="athletes-empty"]').should('exist');
    },
  });
  // And the third: the bin, with nothing in it.
  screen('20-athletes-trash-empty', '/dashboard/athletes', ROSTER_READY, {
    stubs: () => {
      cy.intercept(
        { method: 'GET', pathname: '/api/v1/athletes', query: { status: 'trashed' } },
        EMPTY_PAGE,
      );
    },
    act: () => {
      press('[data-cy="athletes-reveal-trashed"]');
      cy.get('[data-cy="athletes-empty"]').should('exist');
    },
  });
  screen('20-athletes-error', '/dashboard/athletes', '[data-cy="add-athlete-btn"]', {
    stubs: () => {
      cy.intercept('GET', '/api/v1/athletes*', {
        statusCode: 500,
        body: { message: 'Server error' },
      });
    },
  });
  screen('21-athlete-new', '/dashboard/athletes/new', '[data-cy="athlete-form"]');
  screen('21-athlete-import', '/dashboard/athletes/import', '[data-cy="import-back"]');

  // ── 22. One athlete ────────────────────────────────────────────────────
  const DETAIL_READY = '[data-cy="athlete-detail-back"]';
  screen('22-athlete-documents', '/dashboard/athletes/1/documents', DETAIL_READY);
  screen('22-athlete-documents-upload', '/dashboard/athletes/1/documents', DETAIL_READY, {
    act: () => {
      press('[data-cy="add-document-btn"]');
      dialogOpen('[data-cy="upload-document-dialog"]');
    },
  });
  screen('22-athlete-attendance', '/dashboard/athletes/1/attendance', DETAIL_READY);
  screen('22-athlete-payments', '/dashboard/athletes/1/payments', DETAIL_READY);
  screen('22-athlete-payments-carnet-sell', '/dashboard/athletes/1/payments', DETAIL_READY, {
    act: () => {
      press('[data-cy="carnet-sell-button"]');
      dialogOpen('[data-cy="carnet-sell-dialog"]');
    },
  });
  screen('22-athlete-promotions', '/dashboard/athletes/1/promotions', DETAIL_READY);
  screen('22-athlete-promotions-dialog', '/dashboard/athletes/1/promotions', DETAIL_READY, {
    act: () => {
      press('[data-cy="promotions-add"]');
      dialogOpen('[data-cy="promotion-create-dialog"]');
    },
  });
  screen('22-athlete-coverage', '/dashboard/athletes/1/coverage', '[data-cy="athlete-coverage"]');
  screen(
    '22-athlete-coverage-nothing-yet',
    '/dashboard/athletes/1/coverage',
    '[data-cy="athlete-coverage"]',
    {
      stubs: () => {
        cy.intercept('GET', '/api/v1/athletes/*/syllabus-coverage*', {
          statusCode: 200,
          body: {
            data: {
              ...ATHLETE_COVERAGE,
              joined_on: '2026-09-12',
              totals: {
                taught_by_academy: 0,
                seen: 0,
                thin: 0,
                missed: 0,
                percentage: 0,
                not_taught_yet: 29,
              },
              missed: [],
              seen_lately: [],
              unattributed_presences: 0,
            },
          },
        });
      },
    },
  );
  screen(
    '22-athlete-coverage-no-programme',
    '/dashboard/athletes/1/coverage',
    '[data-cy="athlete-coverage"]',
    {
      stubs: () => {
        cy.intercept('GET', '/api/v1/athletes/*/syllabus-coverage*', {
          statusCode: 200,
          body: {
            data: {
              ...ATHLETE_COVERAGE,
              totals: {
                taught_by_academy: 0,
                seen: 0,
                thin: 0,
                missed: 0,
                percentage: 0,
                not_taught_yet: 0,
              },
              missed: [],
              seen_lately: [],
              unattributed_presences: 0,
            },
          },
        });
      },
    },
  );
  screen('22-athlete-edit', '/dashboard/athletes/1/edit', DETAIL_READY);

  // ── 23. Expiring documents ─────────────────────────────────────────────
  screen('23-documents-expiring', '/dashboard/documents/expiring', '[data-cy="back-to-athletes"]');
  screen(
    '23-documents-expiring-empty',
    '/dashboard/documents/expiring',
    '[data-cy="back-to-athletes"]',
    {
      stubs: () => {
        cy.intercept('GET', '/api/v1/documents/expiring*', {
          statusCode: 200,
          body: { data: [], missing_medical_certificate: [] },
        });
      },
    },
  );

  // ── 30. Tonight's check-in ─────────────────────────────────────────────
  screen('30-attendance', '/dashboard/attendance', '[data-cy="attendance-class-picker"]');
  screen(
    '30-attendance-lesson-sheet',
    '/dashboard/attendance',
    '[data-cy="attendance-class-picker"]',
    {
      act: () => {
        press('[data-cy="attendance-topics"]');
        dialogOpen('[data-cy="lesson-sheet"]');
        cy.get('[data-cy="lesson-sheet-suggestions"]').should('be.visible');
      },
    },
  );
  screen(
    '30-attendance-lesson-sheet-search',
    '/dashboard/attendance',
    '[data-cy="attendance-class-picker"]',
    {
      act: () => {
        press('[data-cy="attendance-topics"]');
        dialogOpen('[data-cy="lesson-sheet"]');
        cy.get('[data-cy="lesson-sheet-search"]').type('kim');
        cy.get('[data-cy="lesson-sheet-results"]').should('be.visible');
      },
    },
  );
  // Monday is not a training day at this academy: the banner says so, and
  // the check-in has no class to propose.
  screen(
    '30-attendance-not-a-training-day',
    '/dashboard/attendance',
    '[data-cy="attendance-no-class-banner"]',
    {
      stubs: () => {
        cy.intercept('GET', '/api/v1/academy', {
          statusCode: 200,
          body: { data: { ...ACADEMY, training_days: [3, 5, 6], classes_count: 4 } },
        });
        cy.intercept('GET', '/api/v1/academy/classes', {
          statusCode: 200,
          body: { data: CLASSES.filter((c) => c.weekday !== 1) },
        });
        cy.intercept('GET', '/api/v1/attendance*', NO_DATA);
        cy.intercept('GET', '/api/v1/lessons?*', { statusCode: 200, body: { data: null } });
      },
    },
  );
  screen('30-attendance-empty-roster', '/dashboard/attendance', '[data-cy="attendance-page"]', {
    stubs: () => {
      cy.intercept('GET', '/api/v1/athletes*', EMPTY_PAGE);
      cy.intercept('GET', '/api/v1/attendance*', NO_DATA);
      cy.intercept('GET', '/api/v1/attendance/summary*', NO_DATA);
      cy.intercept('GET', '/api/v1/attendance/leaderboard*', {
        statusCode: 200,
        body: { data: [], meta: { month: '2026-09' } },
      });
    },
  });
  screen(
    '31-attendance-summary',
    '/dashboard/attendance/summary',
    '[data-cy="monthly-summary-page"]',
  );

  // ── 40. Stats ──────────────────────────────────────────────────────────
  screen('40-stats-overview', '/dashboard/stats/overview', '[data-cy="stats-tabs"]', {
    clock: false,
    // Chart.js animates in over a second; a shot before that is an empty canvas.
    act: () => cy.wait(1500),
  });
  screen('40-stats-attendance', '/dashboard/stats/attendance', '[data-cy="stats-tabs"]', {
    clock: false,
    // Chart.js animates in over a second; a shot before that is an empty canvas.
    act: () => cy.wait(1500),
  });
  screen('40-stats-payments', '/dashboard/stats/payments', '[data-cy="stats-tabs"]', {
    clock: false,
    // Chart.js animates in over a second; a shot before that is an empty canvas.
    act: () => cy.wait(1500),
  });
  screen('40-stats-athletes', '/dashboard/stats/athletes', '[data-cy="stats-tabs"]', {
    clock: false,
    // Chart.js animates in over a second; a shot before that is an empty canvas.
    act: () => cy.wait(1500),
  });
  screen('40-stats-syllabus', '/dashboard/stats/syllabus', '[data-cy="syllabus-coverage"]', {
    clock: false,
    // Chart.js animates in over a second; a shot before that is an empty canvas.
    act: () => cy.wait(1500),
  });
  screen('40-stats-syllabus-no-programme', '/dashboard/stats/syllabus', '[data-cy="stats-tabs"]', {
    clock: false,
    stubs: () => {
      cy.intercept('GET', '/api/v1/academy', {
        statusCode: 200,
        body: { data: { ...ACADEMY, syllabus_topics_count: 0 } },
      });
      cy.intercept('GET', '/api/v1/stats/syllabus/coverage*', {
        statusCode: 200,
        body: {
          data: {
            ...SYLLABUS_COVERAGE,
            totals: { in_scope: 0, covered: 0, thin: 0, missing: 0, percentage: 0 },
            positions: [],
            missing: [],
            taught: [],
            timeline: [],
          },
        },
      });
    },
  });

  // ── 50. Account ────────────────────────────────────────────────────────
  screen('50-profile-identity', '/dashboard/profile', '[data-cy="profile-tabs"]');
  screen('50-profile-security', '/dashboard/profile', '[data-cy="profile-tabs"]', {
    act: () => {
      press('[data-cy="profile-tab-security"]');
      cy.get('[data-cy="profile-two-factor"]').should('exist');
      settle();
    },
  });
  screen('50-profile-notifications', '/dashboard/profile', '[data-cy="profile-tabs"]', {
    act: () => {
      press('[data-cy="profile-tab-notifications"]');
      cy.get('[data-cy="profile-notifications"]').should('exist');
      settle();
    },
  });
  screen('50-profile-account', '/dashboard/profile', '[data-cy="profile-tabs"]', {
    act: () => {
      press('[data-cy="profile-tab-account"]');
      cy.get('[data-cy="profile-train-here"]').should('exist');
      settle();
    },
  });

  // ── 51. Notifications, what's new, backup, more ────────────────────────
  screen('51-notifications', '/dashboard/notifications', '[data-cy="notifications-filter-all"]');
  screen('51-notifications-empty', '/dashboard/notifications', '[data-cy="notifications-empty"]', {
    stubs: () => {
      cy.intercept('GET', '/api/v1/me/notifications*', {
        statusCode: 200,
        body: { data: [], meta: { unread_count: 0 } },
      });
    },
  });
  screen('52-whats-new', '/dashboard/whats-new', 'h1');
  screen('53-backup', '/dashboard/backup', '[data-cy="backup-list"]');
  screen('54-more', '/dashboard/more', '[data-cy="owner-more"]');

  // ── 55. Global chrome ──────────────────────────────────────────────────
  screen('55-search-palette', '/dashboard/athletes', ROSTER_READY, {
    act: () => {
      cy.get('body').type('{ctrl}k');
      cy.get('[data-cy="search-palette-input"]').should('be.visible').type('giu');
      cy.get('[data-cy="search-palette-body"]').should('be.visible');
      cy.wait(400);
    },
  });
  screen('56-update-ready', '/dashboard/athletes', ROSTER_READY, {
    update: { phase: 'ready', version: '2.62.0' },
  });
  screen('56-update-downloading', '/dashboard/athletes', ROSTER_READY, {
    update: { phase: 'downloading', version: '2.62.0', percent: 43 },
  });

  // ── Second wave: the states inside the screens ─────────────────────────
  //
  // Everything above is a screen as it opens. These are the same screens a
  // moment later: a row acted on, a dialog for an existing thing, a filter
  // opened, a confirm popup, a toast. Numbered to sort beside their parent.

  // ── 10–13. Academy, inside ─────────────────────────────────────────────
  screen('11-timetable-edit-class', '/dashboard/academy/timetable', '[data-cy="timetable-week"]', {
    act: () => {
      press('[data-cy="timetable-class-1"]');
      cy.get('[data-cy="timetable-form"]', { timeout: 4000 }).should('be.visible');
    },
  });
  screen(
    '11-timetable-remove-confirm',
    '/dashboard/academy/timetable',
    '[data-cy="timetable-week"]',
    {
      act: () => {
        press('[data-cy="timetable-class-1"]');
        cy.get('[data-cy="timetable-form"]', { timeout: 4000 }).should('be.visible');
        press('[data-cy="timetable-form-remove"]');
        cy.get('.p-confirmpopup', { timeout: 4000 }).should('be.visible');
      },
    },
  );
  // Planning the next occurrence from the timetable: the lesson sheet opens
  // on a future date, with the suggestions.
  screen('11-timetable-plan', '/dashboard/academy/timetable', '[data-cy="timetable-week"]', {
    stubs: () => {
      cy.intercept('GET', '/api/v1/lessons?*', {
        statusCode: 200,
        body: { data: { ...LESSON_TONIGHT, id: 8, held_on: '2026-09-21', topics: [] } },
      });
    },
    act: () => {
      press('[data-cy="timetable-plan-1"]');
      dialogOpen('[data-cy="lesson-sheet"]');
    },
  });
  screen('12-syllabus-edit-position', '/dashboard/academy/syllabus', '[data-cy="syllabus-tree"]', {
    act: () => {
      press('[data-cy="syllabus-edit-1"]');
      cy.get('[data-cy="syllabus-form"]', { timeout: 4000 }).should('be.visible');
    },
  });
  screen('12-syllabus-edit-technique', '/dashboard/academy/syllabus', '[data-cy="syllabus-tree"]', {
    act: () => {
      press('[data-cy="syllabus-toggle-1"]');
      press('[data-cy="syllabus-topic-11"] button');
      cy.get('[data-cy="syllabus-form"]', { timeout: 4000 }).should('be.visible');
    },
  });

  // ── 20–21. Roster, inside ──────────────────────────────────────────────
  // The payment control in the filter row is a sort toggle, not a select.
  screen('20-athletes-paid-sort', '/dashboard/athletes', ROSTER_READY, {
    act: () => {
      press('[data-cy="athletes-paid-filter"]');
      cy.wait(400);
    },
  });
  screen('20-athletes-inactive-revealed', '/dashboard/athletes', ROSTER_READY, {
    act: () => {
      press('[data-cy="athletes-reveal-inactive"]');
      cy.wait(400);
    },
  });
  // The form, submitted empty: every required-field message at once.
  screen('21-athlete-new-errors', '/dashboard/athletes/new', '[data-cy="athlete-form"]', {
    act: () => {
      cy.get('[data-cy="athlete-form"] button[type="submit"]').first().click({ force: true });
      cy.wait(300);
    },
  });
  // The import, with a file chosen: the mapping and the dry-run preview.
  const IMPORT_CSV =
    'Nome,Cognome,Cintura,Gradi,Email,Iscritto il\n' +
    'Paolo,Bianchi,blu,2,paolo@example.com,2025-10-01\n' +
    'Chiara,Esposito,bianca,0,,2026-09-01\n' +
    'Giulia,Ferraro,blu,2,giulia.ferraro@example.com,2024-09-02\n' +
    ',Senzanome,viola,1,,2024-01-01\n';
  const IMPORT_REPORT = (dryRun: boolean) => ({
    dry_run: dryRun,
    delimiter: ',',
    columns: ['Nome', 'Cognome', 'Cintura', 'Gradi', 'Email', 'Iscritto il'],
    mapping: {
      first_name: 'Nome',
      last_name: 'Cognome',
      belt: 'Cintura',
      stripes: 'Gradi',
      email: 'Email',
      joined_at: 'Iscritto il',
    },
    fields: ['first_name', 'last_name', 'belt', 'stripes', 'email', 'joined_at'],
    imported: 2,
    skipped: 2,
    rows: [
      {
        row: 2,
        status: 'ok',
        values: {
          first_name: 'Paolo',
          last_name: 'Bianchi',
          belt: 'blue',
          stripes: 2,
          email: 'paolo@example.com',
          joined_at: '2025-10-01',
        },
        errors: {},
      },
      {
        row: 3,
        status: 'ok',
        values: {
          first_name: 'Chiara',
          last_name: 'Esposito',
          belt: 'white',
          stripes: 0,
          email: null,
          joined_at: '2026-09-01',
        },
        errors: {},
      },
      {
        row: 4,
        status: 'duplicate',
        values: {
          first_name: 'Giulia',
          last_name: 'Ferraro',
          belt: 'blue',
          stripes: 2,
          email: 'giulia.ferraro@example.com',
          joined_at: '2024-09-02',
        },
        errors: { email: ['Esiste già un atleta con questa email.'] },
      },
      {
        row: 5,
        status: 'invalid',
        values: {
          first_name: '',
          last_name: 'Senzanome',
          belt: 'purple',
          stripes: 1,
          email: null,
          joined_at: '2024-01-01',
        },
        errors: { first_name: ['Il nome è obbligatorio.'] },
      },
    ],
  });
  function chooseImportFile(): void {
    cy.get('[data-cy="import-file"]').selectFile(
      { contents: Cypress.Buffer.from(IMPORT_CSV), fileName: 'atleti.csv', mimeType: 'text/csv' },
      { force: true },
    );
  }
  screen('21-athlete-import-preview', '/dashboard/athletes/import', '[data-cy="import-back"]', {
    stubs: () => {
      cy.intercept('POST', '/api/v1/athletes/import', {
        statusCode: 200,
        body: { data: IMPORT_REPORT(true) },
      });
    },
    act: () => {
      chooseImportFile();
      cy.get('[data-cy="import-preview"]', { timeout: 6000 }).should('be.visible');
      settle();
    },
  });
  screen('21-athlete-import-done', '/dashboard/athletes/import', '[data-cy="import-back"]', {
    stubs: () => {
      let calls = 0;
      cy.intercept('POST', '/api/v1/athletes/import', (req) => {
        calls += 1;
        req.reply({ statusCode: 200, body: { data: IMPORT_REPORT(calls === 1) } });
      });
    },
    act: () => {
      chooseImportFile();
      cy.get('[data-cy="import-preview"]', { timeout: 6000 }).should('be.visible');
      press('[data-cy="import-confirm"]');
      cy.get('[data-cy="import-summary"]', { timeout: 6000 }).should('be.visible');
      settle();
    },
  });

  // ── 22. One athlete, inside every tab ──────────────────────────────────
  screen('22-athlete-inactive', '/dashboard/athletes/5/documents', DETAIL_READY, {
    stubs: () => {
      cy.intercept('GET', '/api/v1/athletes/5', { statusCode: 200, body: { data: ATHLETES[4] } });
    },
  });
  screen('22-athlete-documents-cancelled', '/dashboard/athletes/1/documents', DETAIL_READY, {
    act: () => {
      press('[data-cy="show-cancelled-toggle"]');
      cy.wait(300);
    },
  });
  screen('22-athlete-documents-delete-confirm', '/dashboard/athletes/1/documents', DETAIL_READY, {
    act: () => {
      press('[data-cy="delete-btn"]');
      cy.get('.p-confirmpopup', { timeout: 4000 }).should('be.visible');
    },
  });
  screen('22-athlete-documents-empty', '/dashboard/athletes/1/documents', DETAIL_READY, {
    stubs: () => {
      cy.intercept('GET', '/api/v1/athletes/*/documents*', NO_DATA);
    },
  });
  screen('22-athlete-attendance-year', '/dashboard/athletes/1/attendance', DETAIL_READY, {
    act: () => {
      cy.get('[data-cy="attendance-summary-range"] .p-togglebutton').last().click({ force: true });
      settle();
    },
  });
  screen('22-athlete-attendance-prev-month', '/dashboard/athletes/1/attendance', DETAIL_READY, {
    act: () => {
      press('[data-cy="attendance-prev"]');
      settle();
    },
  });
  // Giulia's July quarter unpaid, so September has a "mark paid" control.
  const PAYMENTS_TO_JUNE = { statusCode: 200, body: { data: PAYMENTS_ONE.slice(1) } };
  screen('22-athlete-payments-mark-confirm', '/dashboard/athletes/1/payments', DETAIL_READY, {
    stubs: () => {
      cy.intercept('GET', '/api/v1/athletes/*/payments*', PAYMENTS_TO_JUNE);
    },
    act: () => {
      press('[data-cy="payment-mark-9"]');
      cy.get('.p-confirmpopup', { timeout: 4000 }).should('be.visible');
    },
  });
  // The mark, accepted: the toast and the row after it.
  screen('22-athlete-payments-marked', '/dashboard/athletes/1/payments', DETAIL_READY, {
    stubs: () => {
      cy.intercept('GET', '/api/v1/athletes/*/payments*', PAYMENTS_TO_JUNE);
      cy.intercept('POST', '/api/v1/athletes/*/payments', {
        statusCode: 201,
        body: {
          data: {
            id: 9,
            athlete_id: 1,
            year: 2026,
            month: 9,
            period_months: 3,
            amount_cents: 21_000,
            paid_at: TODAY,
          },
        },
      });
    },
    act: () => {
      press('[data-cy="payment-mark-9"]');
      cy.get('.p-confirmpopup-accept-button', { timeout: 4000 }).click({ force: true });
      cy.wait(800);
    },
  });
  screen('22-athlete-payments-unmark-confirm', '/dashboard/athletes/1/payments', DETAIL_READY, {
    act: () => {
      press('[data-cy="payment-unmark-7"]');
      cy.get('.p-confirmpopup', { timeout: 4000 }).should('be.visible');
    },
  });
  screen('22-athlete-payments-no-fee', '/dashboard/athletes/1/payments', DETAIL_READY, {
    stubs: () => {
      cy.intercept('GET', '/api/v1/academy', {
        statusCode: 200,
        body: {
          data: {
            ...ACADEMY,
            monthly_fee_cents: null,
            fee_tier_count: 0,
            carnet_price_cents: null,
            carnet_entries: null,
          },
        },
      });
      cy.intercept('GET', '/api/v1/academy/fee-tiers*', NO_DATA);
      cy.intercept('GET', '/api/v1/athletes/1', {
        statusCode: 200,
        body: {
          data: { ...ATHLETE_ONE, fee_tier: null, monthly_fee_cents: null, active_carnet: null },
        },
      });
      cy.intercept('GET', '/api/v1/athletes/*/carnets*', NO_DATA);
    },
  });
  screen('22-athlete-payments-carnet-validity', '/dashboard/athletes/1/payments', DETAIL_READY, {
    act: () => {
      press('[data-cy="carnet-edit-validity"]');
      dialogOpen('[data-cy="carnet-validity-dialog"]');
    },
  });
  screen('22-athlete-payments-carnet-register', '/dashboard/athletes/1/payments', DETAIL_READY, {
    stubs: () => {
      cy.intercept('GET', '/api/v1/athletes/*/carnets/*/entries*', {
        statusCode: 200,
        body: {
          data: [
            { id: 1, carnet_id: 7, attendance_record_id: 10, used_on: '2026-09-11' },
            { id: 2, carnet_id: 7, attendance_record_id: 11, used_on: '2026-09-09' },
            { id: 3, carnet_id: 7, attendance_record_id: 12, used_on: '2026-09-07' },
          ],
        },
      });
    },
    act: () => {
      press('[data-cy="carnet-register-toggle"]');
      cy.get('[data-cy="carnet-register-list"]', { timeout: 4000 }).should('be.visible');
      settle();
    },
  });
  screen('22-athlete-payments-carnet-empty', '/dashboard/athletes/1/payments', DETAIL_READY, {
    stubs: () => {
      cy.intercept('GET', '/api/v1/athletes/*/carnets*', NO_DATA);
      cy.intercept('GET', '/api/v1/athletes/1', {
        statusCode: 200,
        body: { data: { ...ATHLETE_ONE, active_carnet: null } },
      });
    },
  });
  screen('22-athlete-promotions-edit', '/dashboard/athletes/1/promotions', DETAIL_READY, {
    act: () => {
      press('[data-cy="promotion-edit-9"]');
      dialogOpen('[data-cy="promotion-edit-dialog"]');
    },
  });
  screen('22-athlete-promotions-empty', '/dashboard/athletes/1/promotions', DETAIL_READY, {
    stubs: () => {
      cy.intercept('GET', '/api/v1/athletes/*/promotions*', { statusCode: 200, body: page([]) });
    },
  });
  screen('22-athlete-edit-delete-confirm', '/dashboard/athletes/1/edit', DETAIL_READY, {
    act: () => {
      cy.get('[data-cy="athlete-danger-zone"] button')
        .first()
        .scrollIntoView()
        .click({ force: true });
      cy.get('.p-confirmpopup', { timeout: 4000 }).should('be.visible');
    },
  });
  // The owner's own row: no delete, a note pointing at Profile instead.
  screen('22-athlete-edit-self', '/dashboard/athletes/3/edit', DETAIL_READY, {
    stubs: () => {
      cy.intercept('GET', '/api/v1/athletes/3', { statusCode: 200, body: { data: ATHLETES[2] } });
    },
  });

  // ── 30–31. Check-in, inside ────────────────────────────────────────────
  screen(
    '30-attendance-second-class',
    '/dashboard/attendance',
    '[data-cy="attendance-class-picker"]',
    {
      stubs: () => {
        cy.intercept('GET', '/api/v1/lessons?*', {
          statusCode: 200,
          body: {
            data: {
              ...LESSON_TONIGHT,
              id: 9,
              academy_class_id: 2,
              name: 'Avanzati',
              starts_at: '20:00',
              topics: [],
            },
          },
        });
      },
      act: () => {
        press('[data-cy="attendance-class-2"]');
        settle();
      },
    },
  );
  screen(
    '30-attendance-belt-filter-open',
    '/dashboard/attendance',
    '[data-cy="attendance-class-picker"]',
    {
      act: () => {
        press('[data-cy="attendance-belt-filter"]');
        cy.get('.p-select-overlay, .p-select-list', { timeout: 4000 }).should('be.visible');
      },
    },
  );
  // Marking somebody: the row flips and the undo toast appears.
  screen(
    '30-attendance-marked-undo',
    '/dashboard/attendance',
    '[data-cy="attendance-class-picker"]',
    {
      stubs: () => {
        cy.intercept('POST', '/api/v1/attendance', {
          statusCode: 201,
          body: { data: [record(4, 3, TODAY, 7)] },
        });
      },
      act: () => {
        press('[data-cy="attendance-row-3"]');
        cy.get('[data-cy="attendance-undo"], .p-toast-message', { timeout: 4000 }).should(
          'be.visible',
        );
      },
    },
  );
  // Clearing the date field. Kept on purpose: the first run of this screen
  // found that an empty date makes `dayClasses` read `.getDay()` of null and
  // the check-in stops rendering — the picture and its console dump are the
  // reproduction.
  screen(
    '30-attendance-date-cleared',
    '/dashboard/attendance',
    '[data-cy="attendance-class-picker"]',
    {
      act: () => {
        cy.get('[data-cy="attendance-date"] input, input[data-cy="attendance-date"]')
          .first()
          .clear({ force: true });
        cy.get('body').click(0, 0, { force: true });
        cy.wait(500);
      },
    },
  );
  // A past training day, typed over the current value so the field is never empty.
  screen('30-attendance-past-day', '/dashboard/attendance', '[data-cy="attendance-class-picker"]', {
    act: () => {
      cy.get('[data-cy="attendance-date"] input, input[data-cy="attendance-date"]')
        .first()
        .type('{selectall}11/09/2026{enter}', { force: true });
      cy.get('body').click(0, 0, { force: true });
      settle();
    },
  });
  screen(
    '31-attendance-summary-prev',
    '/dashboard/attendance/summary',
    '[data-cy="monthly-summary-page"]',
    {
      act: () => {
        press('[data-cy="monthly-summary-prev"]');
        settle();
      },
    },
  );

  // ── 40. Stats, inside ──────────────────────────────────────────────────
  screen('40-stats-attendance-year', '/dashboard/stats/attendance', '[data-cy="stats-tabs"]', {
    clock: false,
    act: () => {
      cy.get('[data-cy="stats-attendance-range"] .p-togglebutton').last().click({ force: true });
      settle();
    },
  });
  screen('40-stats-syllabus-kind', '/dashboard/stats/syllabus', '[data-cy="syllabus-coverage"]', {
    clock: false,
    act: () => {
      press('[data-cy="syllabus-coverage-kind"]');
      cy.wait(400);
    },
  });
  screen(
    '40-stats-syllabus-prev-season',
    '/dashboard/stats/syllabus',
    '[data-cy="syllabus-coverage"]',
    {
      clock: false,
      stubs: () => {
        cy.intercept('GET', '/api/v1/stats/syllabus/coverage*', (req) => {
          const back = new URL(req.url, 'http://x').searchParams.get('seasons_back');
          req.reply({
            statusCode: 200,
            body: {
              data:
                back === '1'
                  ? {
                      ...SYLLABUS_COVERAGE,
                      season: { start: '2025-09-01', end: '2026-08-31', label: '2025/26' },
                      totals: { in_scope: 29, covered: 21, thin: 5, missing: 3, percentage: 72 },
                    }
                  : SYLLABUS_COVERAGE,
            },
          });
        });
      },
      act: () => {
        press('[data-cy="syllabus-coverage-prev"]');
        settle();
      },
    },
  );

  // ── 50. Account, inside ────────────────────────────────────────────────
  screen('50-profile-name-edit', '/dashboard/profile', '[data-cy="profile-tabs"]', {
    act: () => {
      press('[data-cy="profile-first-name-edit"]');
      cy.get('[data-cy="profile-name-edit-form"]', { timeout: 4000 }).should('be.visible');
    },
  });
  screen('50-profile-change-password-errors', '/dashboard/profile', '[data-cy="profile-tabs"]', {
    act: () => {
      press('[data-cy="profile-tab-security"]');
      press('[data-cy="change-password-submit"]');
      cy.wait(300);
    },
  });
  screen('50-profile-two-factor-enrol', '/dashboard/profile', '[data-cy="profile-tabs"]', {
    stubs: () => {
      cy.intercept('POST', '/api/v1/me/two-factor/enrol', {
        statusCode: 200,
        body: {
          data: {
            secret: 'JBSWY3DPEHPK3PXP',
            provisioning_uri:
              'otpauth://totp/Budojo:matteo@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Budojo',
          },
        },
      });
    },
    act: () => {
      press('[data-cy="profile-tab-security"]');
      press('[data-cy="profile-two-factor-enable"]');
      cy.get('[data-cy="profile-two-factor-confirm-form"], [data-cy="profile-two-factor-qr"]', {
        timeout: 4000,
      }).should('be.visible');
      settle();
    },
  });
  screen('50-profile-api-token-create', '/dashboard/profile', '[data-cy="profile-tabs"]', {
    act: () => {
      press('[data-cy="profile-tab-account"]');
      press('[data-cy="profile-api-tokens-create"]');
      dialogOpen('[data-cy="profile-api-tokens-create-dialog"]');
    },
  });

  // ── 51–55. Notifications, backup, palette, inside ──────────────────────
  screen(
    '51-notifications-unread',
    '/dashboard/notifications',
    '[data-cy="notifications-filter-unread"]',
    {
      act: () => {
        press('[data-cy="notifications-filter-unread"]');
        cy.wait(300);
      },
    },
  );
  screen('53-backup-recovery-code', '/dashboard/backup', '[data-cy="backup-list"]', {
    act: () => {
      press('[data-cy="recovery-reveal"]');
      cy.get('[data-cy="recovery-code"]', { timeout: 4000 }).should('be.visible');
    },
  });
  screen('53-backup-restore-confirm', '/dashboard/backup', '[data-cy="backup-list"]', {
    act: () => {
      press('[data-cy="backup-restore-budojo-2026-09-14-0300.zip"]');
      // The first run of this screen found that nothing opened: the page had
      // no `<p-confirmpopup>` for the confirm button to render in until #1615
      // (BKP-0 in the audit). The 1.5 s record stays as the regression
      // tripwire — written to the console dump rather than failed, so the
      // picture is still taken either way.
      cy.wait(1500);
      cy.get('body').then(($body) => {
        if ($body.find('.p-confirmpopup, .p-confirmdialog, .p-dialog').length === 0) {
          cy.window().then((win: AuditWindow) => {
            win.__auditErrors?.push('restore: no confirm surface appeared within 1.5s');
          });
        }
      });
    },
  });
  // No archives yet: a fresh install's backup page.
  screen('53-backup-empty', '/dashboard/backup', '[data-cy="backup-empty"]', { archives: [] });
  screen('55-search-palette-no-results', '/dashboard/athletes', ROSTER_READY, {
    stubs: () => {
      cy.intercept('GET', '/api/v1/search*', NO_DATA);
    },
    act: () => {
      cy.get('body').type('{ctrl}k');
      cy.get('[data-cy="search-palette-input"]').should('be.visible').type('zzz');
      cy.get('[data-cy="search-palette-no-results"]', { timeout: 4000 }).should('be.visible');
    },
  });
});
