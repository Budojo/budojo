<?php

declare(strict_types=1);

/**
 * Demo Academy fixture — fully fictional "Apex Grappling Academy" used for
 * landing-page screenshots and local development. No real-person references.
 *
 * Distribution targets (so every chart on /dashboard/stats renders populated):
 *   - 40 athletes total
 *   - Belts: 12 white, 10 blue, 6 purple, 4 brown, 2 black + 1 grey, 2 yellow,
 *            2 orange, 1 green (kids progression on under-16 athletes)
 *   - Status: 33 active, 4 suspended, 3 inactive
 *   - DOB: 2 athletes with date_of_birth=null (missing-DOB demo)
 *   - All IBJJF age divisions populated (master_6/7 may have 0-1 entries)
 *   - attendance_probability varies 0.30..0.95 so the heatmap shows variation
 *   - joined_at spread across 2-4 years back
 *
 * Today's reference date when this fixture was authored: 2026-05-03.
 */
return [
    'academy' => [
        'name' => 'Apex Grappling Academy',
        // Realistic Italian address (the app's primary market).
        'address' => [
            'line1' => 'Via Roma 42',
            'line2' => null,
            'city' => 'Milano',
            'postal_code' => '20121',
            'province' => 'MI',
            'country' => 'IT',
        ],
        // EUR 80 / month — typical BJJ academy fee.
        'monthly_fee_cents' => 8000,
        // Carbon dayOfWeek ints: 1=Mon, 3=Wed, 5=Fri (3 days/week schedule).
        'training_days_of_week' => [1, 3, 5],
    ],
    'athletes' => [
        // BLACK BELTS (2)
        [
            'first_name' => 'Marco',
            'last_name' => 'Rossi',
            'email' => 'marco.rossi@example.test',
            'date_of_birth' => '1985-03-12',     // master_3
            'belt' => 'black',
            'stripes' => 2,
            'joined_at' => '2022-01-15',
            'attendance_probability' => 0.92,
            'status' => 'active',
        ],
        [
            'first_name' => 'Diego',
            'last_name' => 'Fernandez',
            'email' => null,
            'date_of_birth' => '1979-07-22',     // master_4
            'belt' => 'black',
            'stripes' => 0,
            'joined_at' => '2022-09-01',
            'attendance_probability' => 0.85,
            'status' => 'active',
        ],

        // BROWN BELTS (4)
        [
            'first_name' => 'Andrea',
            'last_name' => 'Marino',
            'email' => null,
            'date_of_birth' => '1988-11-04',     // master_2
            'belt' => 'brown',
            'stripes' => 3,
            'joined_at' => '2022-06-20',
            'attendance_probability' => 0.88,
            'status' => 'active',
        ],
        [
            'first_name' => 'Giulia',
            'last_name' => 'Conti',
            'email' => 'giulia.conti@example.test',
            'date_of_birth' => '1990-02-18',     // master_2
            'belt' => 'brown',
            'stripes' => 1,
            'joined_at' => '2023-02-01',
            'attendance_probability' => 0.78,
            'status' => 'active',
        ],
        [
            'first_name' => 'Luca',
            'last_name' => 'Romano',
            'email' => null,
            'date_of_birth' => '1992-08-09',     // master_1
            'belt' => 'brown',
            'stripes' => 4,
            'joined_at' => '2022-04-12',
            'attendance_probability' => 0.81,
            'status' => 'active',
        ],
        [
            'first_name' => 'Paolo',
            'last_name' => 'Greco',
            'email' => null,
            'date_of_birth' => '1973-05-25',     // master_5
            'belt' => 'brown',
            'stripes' => 2,
            'joined_at' => '2022-03-15',
            'attendance_probability' => 0.65,
            'status' => 'suspended',
        ],

        // PURPLE BELTS (6)
        [
            'first_name' => 'Sofia',
            'last_name' => 'Esposito',
            'email' => 'sofia.esposito@example.test',
            'date_of_birth' => '1995-12-03',     // master_1
            'belt' => 'purple',
            'stripes' => 2,
            'joined_at' => '2023-05-10',
            'attendance_probability' => 0.90,
            'status' => 'active',
        ],
        [
            'first_name' => 'Anna',
            'last_name' => 'Bianchi',
            'email' => null,
            'date_of_birth' => '2000-04-17',     // adult
            'belt' => 'purple',
            'stripes' => 0,
            'joined_at' => '2023-09-04',
            'attendance_probability' => 0.83,
            'status' => 'active',
        ],
        [
            'first_name' => 'Tommaso',
            'last_name' => 'Galli',
            'email' => null,
            'date_of_birth' => '1996-06-30',     // master_1
            'belt' => 'purple',
            'stripes' => 4,
            'joined_at' => '2022-11-01',
            'attendance_probability' => 0.74,
            'status' => 'active',
        ],
        [
            'first_name' => 'Federica',
            'last_name' => 'Lombardi',
            'email' => null,
            'date_of_birth' => '1983-10-14',     // master_3
            'belt' => 'purple',
            'stripes' => 1,
            'joined_at' => '2023-01-20',
            'attendance_probability' => 0.70,
            'status' => 'active',
        ],
        [
            'first_name' => 'Riccardo',
            'last_name' => 'Costa',
            'email' => null,
            'date_of_birth' => '1991-01-08',     // master_1
            'belt' => 'purple',
            'stripes' => 3,
            'joined_at' => '2023-07-15',
            'attendance_probability' => 0.55,
            'status' => 'suspended',
        ],
        [
            'first_name' => 'John',
            'last_name' => 'Carter',
            'email' => null,
            'date_of_birth' => '1977-09-21',     // master_4
            'belt' => 'purple',
            'stripes' => 2,
            'joined_at' => '2022-08-22',
            'attendance_probability' => 0.40,
            'status' => 'inactive',
        ],

        // BLUE BELTS (10)
        [
            'first_name' => 'Alessandro',
            'last_name' => 'Ferrari',
            'email' => 'ales.ferrari@example.test',
            'date_of_birth' => '1998-03-28',     // adult
            'belt' => 'blue',
            'stripes' => 1,
            'joined_at' => '2023-10-08',
            'attendance_probability' => 0.86,
            'status' => 'active',
        ],
        [
            'first_name' => 'Chiara',
            'last_name' => 'Russo',
            'email' => null,
            'date_of_birth' => '2002-07-19',     // adult
            'belt' => 'blue',
            'stripes' => 2,
            'joined_at' => '2024-01-12',
            'attendance_probability' => 0.79,
            'status' => 'active',
        ],
        [
            'first_name' => 'Matteo',
            'last_name' => 'Ricci',
            'email' => null,
            'date_of_birth' => '2009-11-25',     // juvenile
            'belt' => 'blue',
            'stripes' => 0,
            'joined_at' => '2024-04-03',
            'attendance_probability' => 0.92,
            'status' => 'active',
        ],
        [
            'first_name' => 'Valentina',
            'last_name' => 'De Luca',
            'email' => null,
            'date_of_birth' => '1994-05-16',     // master_1
            'belt' => 'blue',
            'stripes' => 3,
            'joined_at' => '2023-08-25',
            'attendance_probability' => 0.81,
            'status' => 'active',
        ],
        [
            'first_name' => 'Stefano',
            'last_name' => 'Moretti',
            'email' => null,
            'date_of_birth' => '1986-02-11',     // master_2
            'belt' => 'blue',
            'stripes' => 4,
            'joined_at' => '2023-04-18',
            'attendance_probability' => 0.68,
            'status' => 'active',
        ],
        [
            'first_name' => 'Sara',
            'last_name' => 'Barbieri',
            'email' => null,
            'date_of_birth' => '2010-08-07',     // juvenile
            'belt' => 'blue',
            'stripes' => 1,
            'joined_at' => '2024-09-10',
            'attendance_probability' => 0.88,
            'status' => 'active',
        ],
        [
            'first_name' => 'Gabriele',
            'last_name' => 'Fontana',
            'email' => null,
            'date_of_birth' => '1972-12-22',     // master_5
            'belt' => 'blue',
            'stripes' => 2,
            'joined_at' => '2023-11-30',
            'attendance_probability' => 0.62,
            'status' => 'active',
        ],
        [
            'first_name' => 'Elena',
            'last_name' => 'Caruso',
            'email' => null,
            'date_of_birth' => '2006-04-04',     // adult
            'belt' => 'blue',
            'stripes' => 0,
            'joined_at' => '2024-02-05',
            'attendance_probability' => 0.50,
            'status' => 'suspended',
        ],
        [
            'first_name' => 'Roberto',
            'last_name' => 'Sanchez',
            'email' => null,
            'date_of_birth' => '1989-09-30',     // master_2
            'belt' => 'blue',
            'stripes' => 1,
            'joined_at' => '2023-06-14',
            'attendance_probability' => 0.45,
            'status' => 'inactive',
        ],
        [
            'first_name' => 'Camilla',
            'last_name' => 'Vitale',
            'email' => null,
            'date_of_birth' => null,             // missing_dob demo (1/2)
            'belt' => 'blue',
            'stripes' => 2,
            'joined_at' => '2024-06-22',
            'attendance_probability' => 0.72,
            'status' => 'active',
        ],

        // WHITE BELTS (12)
        [
            'first_name' => 'Francesco',
            'last_name' => 'Marchetti',
            'email' => 'francesco.m@example.test',
            'date_of_birth' => '1999-06-13',     // adult
            'belt' => 'white',
            'stripes' => 4,
            'joined_at' => '2024-08-15',
            'attendance_probability' => 0.93,
            'status' => 'active',
        ],
        [
            'first_name' => 'Martina',
            'last_name' => 'Pellegrini',
            'email' => null,
            'date_of_birth' => '2003-10-29',     // adult
            'belt' => 'white',
            'stripes' => 3,
            'joined_at' => '2024-11-04',
            'attendance_probability' => 0.85,
            'status' => 'active',
        ],
        [
            'first_name' => 'Davide',
            'last_name' => 'Serra',
            'email' => null,
            'date_of_birth' => '1968-01-07',     // master_6
            'belt' => 'white',
            'stripes' => 1,
            'joined_at' => '2025-01-20',
            'attendance_probability' => 0.78,
            'status' => 'active',
        ],
        [
            'first_name' => 'Beatrice',
            'last_name' => 'Colombo',
            'email' => null,
            'date_of_birth' => '1981-04-18',     // master_3
            'belt' => 'white',
            'stripes' => 2,
            'joined_at' => '2025-03-08',
            'attendance_probability' => 0.71,
            'status' => 'active',
        ],
        [
            'first_name' => 'Lorenzo',
            'last_name' => 'Mancini',
            'email' => null,
            'date_of_birth' => '2008-02-26',     // adult
            'belt' => 'white',
            'stripes' => 0,
            'joined_at' => '2025-09-12',
            'attendance_probability' => 0.95,
            'status' => 'active',
        ],
        [
            'first_name' => 'Aurora',
            'last_name' => 'Gatti',
            'email' => null,
            'date_of_birth' => '1976-11-15',     // master_4
            'belt' => 'white',
            'stripes' => 1,
            'joined_at' => '2025-02-17',
            'attendance_probability' => 0.66,
            'status' => 'active',
        ],
        [
            'first_name' => 'Pietro',
            'last_name' => 'Caputo',
            'email' => null,
            'date_of_birth' => '1997-08-21',     // adult
            'belt' => 'white',
            'stripes' => 2,
            'joined_at' => '2024-12-01',
            'attendance_probability' => 0.58,
            'status' => 'active',
        ],
        [
            'first_name' => 'Ilaria',
            'last_name' => 'Coppola',
            'email' => null,
            'date_of_birth' => '2011-05-09',     // teen (15)
            'belt' => 'white',
            'stripes' => 0,
            'joined_at' => '2025-10-06',
            'attendance_probability' => 0.82,
            'status' => 'active',
        ],
        [
            'first_name' => 'Mario',
            'last_name' => 'Leone',
            'email' => null,
            'date_of_birth' => '1965-03-04',     // master_7
            'belt' => 'white',
            'stripes' => 0,
            'joined_at' => '2025-04-14',
            'attendance_probability' => 0.40,
            'status' => 'active',
        ],
        [
            'first_name' => 'Giorgia',
            'last_name' => 'Bruno',
            'email' => null,
            'date_of_birth' => '2005-09-12',     // adult
            'belt' => 'white',
            'stripes' => 1,
            'joined_at' => '2025-06-25',
            'attendance_probability' => 0.30,
            'status' => 'suspended',
        ],
        [
            'first_name' => 'Nicolas',
            'last_name' => 'Garcia',
            'email' => null,
            'date_of_birth' => '1974-07-08',     // master_5
            'belt' => 'white',
            'stripes' => 0,
            'joined_at' => '2024-10-30',
            'attendance_probability' => 0.35,
            'status' => 'inactive',
        ],
        [
            'first_name' => 'Elisa',
            'last_name' => 'Parisi',
            'email' => null,
            'date_of_birth' => null,             // missing_dob demo (2/2)
            'belt' => 'white',
            'stripes' => 0,
            'joined_at' => '2025-08-17',
            'attendance_probability' => 0.55,
            'status' => 'active',
        ],

        // KIDS BELTS (6)
        // Grey (1): mighty_mite (4-6)
        [
            'first_name' => 'Leonardo',
            'last_name' => 'Riva',
            'email' => null,
            'date_of_birth' => '2021-04-18',     // mighty_mite (5)
            'belt' => 'grey',
            'stripes' => 1,
            'joined_at' => '2025-09-04',
            'attendance_probability' => 0.75,
            'status' => 'active',
        ],
        // Yellow (2): pee_wee (7-9)
        [
            'first_name' => 'Emma',
            'last_name' => 'Villa',
            'email' => null,
            'date_of_birth' => '2018-07-22',     // pee_wee (7)
            'belt' => 'yellow',
            'stripes' => 2,
            'joined_at' => '2024-09-15',
            'attendance_probability' => 0.84,
            'status' => 'active',
        ],
        [
            'first_name' => 'Tommaso',
            'last_name' => 'Bellini',
            'email' => null,
            'date_of_birth' => '2017-12-03',     // pee_wee (8)
            'belt' => 'yellow',
            'stripes' => 0,
            'joined_at' => '2024-04-25',
            'attendance_probability' => 0.69,
            'status' => 'active',
        ],
        // Orange (2): junior (10-12)
        [
            'first_name' => 'Sofia',
            'last_name' => 'Sartori',
            'email' => null,
            'date_of_birth' => '2015-02-14',     // junior (11)
            'belt' => 'orange',
            'stripes' => 3,
            'joined_at' => '2023-09-20',
            'attendance_probability' => 0.91,
            'status' => 'active',
        ],
        [
            'first_name' => 'Alessandro',
            'last_name' => 'Negri',
            'email' => null,
            'date_of_birth' => '2014-08-08',     // junior (11)
            'belt' => 'orange',
            'stripes' => 1,
            'joined_at' => '2024-01-30',
            'attendance_probability' => 0.77,
            'status' => 'active',
        ],
        // Green (1): teen (13-15)
        [
            'first_name' => 'Mattia',
            'last_name' => 'Donati',
            'email' => null,
            'date_of_birth' => '2012-06-11',     // teen (13)
            'belt' => 'green',
            'stripes' => 2,
            'joined_at' => '2023-04-05',
            'attendance_probability' => 0.86,
            'status' => 'active',
        ],
    ],
    'attendance' => [
        // Mirrors academy.training_days_of_week — same 1/3/5 (Mon/Wed/Fri).
        'training_days_of_week' => [1, 3, 5],
        'simulation_window_days' => 365,
        'default_probability' => 0.65,
    ],
];
