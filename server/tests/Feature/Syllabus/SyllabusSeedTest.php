<?php

declare(strict_types=1);

use App\Actions\Syllabus\SeedSyllabusAction;
use App\Enums\MartialArt;
use App\Enums\TrainingMode;
use App\Models\Academy;
use App\Models\AcademyMembership;
use App\Models\SyllabusTopic;
use App\Models\User;
use App\Support\MartialArt\MartialArtProfile;

/**
 * The shipped starter programmes (#1563, #1800) — a starting point the academy owns from
 * the first minute, never a taxonomy imposed on it.
 */

// helpers live in tests/Pest.php

beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
});

it('copies the whole programme into an empty academy, positions first, self-defence last', function (): void {
    $written = $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus/seed')
        ->assertCreated()
        ->json('data.written');

    $positions = SyllabusTopic::query()->where('academy_id', $this->academy->id)->positions()
        ->orderBy('sort_order')->get();
    $techniques = SyllabusTopic::query()->where('academy_id', $this->academy->id)->whereNotNull('parent_id')->count();

    expect($written)->toBe($positions->count() + $techniques);
    expect($positions->count())->toBeGreaterThan(50);
    expect($techniques)->toBeGreaterThan(250);
    expect($positions->first()?->name)->toBe('Base movements');
    expect($positions->last()?->name)->toBe('Self-defence');
    expect(SyllabusTopic::query()->where('academy_id', $this->academy->id)->where('in_season', false)->exists())->toBeFalse();
});

it('marks what only makes sense in one of gi or no-gi, and inherits the rest from the position', function (): void {
    $this->actingAs($this->user)->postJson('/api/v1/academy/syllabus/seed')->assertCreated();

    $kGuard = SyllabusTopic::query()->where('academy_id', $this->academy->id)->where('name', 'K guard')->firstOrFail();
    expect($kGuard->kind)->toBe(TrainingMode::NoGi);
    expect($kGuard->children()->pluck('kind')->unique()->all())->toBe([TrainingMode::NoGi]);

    $closed = SyllabusTopic::query()->where('academy_id', $this->academy->id)->where('name', 'Closed guard')->firstOrFail();
    expect($closed->children()->where('name', 'Cross collar choke')->firstOrFail()->kind)->toBe(TrainingMode::Gi);
    expect($closed->children()->where('name', 'Armbar')->firstOrFail()->kind)->toBe(TrainingMode::Both);
});

it('refuses to seed an academy that already has a programme, and writes nothing', function (): void {
    SyllabusTopic::factory()->for($this->academy)->create(['name' => 'My own position']);

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus/seed')
        ->assertStatus(409);

    expect(SyllabusTopic::query()->where('academy_id', $this->academy->id)->count())->toBe(1);
});

it('refuses to seed twice', function (): void {
    $this->actingAs($this->user)->postJson('/api/v1/academy/syllabus/seed')->assertCreated();
    $before = SyllabusTopic::query()->where('academy_id', $this->academy->id)->count();

    $this->actingAs($this->user)->postJson('/api/v1/academy/syllabus/seed')->assertStatus(409);

    expect(SyllabusTopic::query()->where('academy_id', $this->academy->id)->count())->toBe($before);
});

it('seeds each academy its own copy', function (): void {
    $this->actingAs($this->user)->postJson('/api/v1/academy/syllabus/seed')->assertCreated();

    $other = userWithAcademy();
    $this->actingAs($other)->postJson('/api/v1/academy/syllabus/seed')->assertCreated();

    $mine = SyllabusTopic::query()->where('academy_id', $this->academy->id)->count();
    expect(SyllabusTopic::query()->where('academy_id', $other->academy->id)->count())->toBe($mine);
    expect(SyllabusTopic::query()->count())->toBe(2 * $mine);
});

it('needs the settings capability', function (): void {
    $academy = Academy::factory()->create();
    $instructor = User::factory()->create(['active_academy_id' => $academy->id]);
    AcademyMembership::factory()->for($instructor)->for($academy)->create(['role' => 'instructor']);

    $this->actingAs($instructor)->postJson('/api/v1/academy/syllabus/seed')->assertForbidden();

    expect(SyllabusTopic::query()->where('academy_id', $academy->id)->exists())->toBeFalse();
});

it('names the BJJ programme by its key, or not at all, since BJJ offers one', function (): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus/seed', ['programme' => 'bjj'])
        ->assertCreated();
});

it('refuses a programme the martial art does not offer', function (): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus/seed', ['programme' => 'karate-goju-ryu'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('programme');

    expect(SyllabusTopic::query()->where('academy_id', $this->academy->id)->exists())->toBeFalse();
});

/**
 * Runs `$run` as if `$art` offered no starter programme. Every art has one
 * since #1806, but the next art added to the registry will not on its first
 * day, and the endpoint must answer that with a 404 rather than a 500. The
 * registry is read-only data, so the test swaps the art's cached profile for
 * a copy with no programmes, and puts the real one back.
 */
function withoutProgrammes(MartialArt $art, callable $run): void
{
    $cache = new ReflectionProperty(MartialArtProfile::class, 'loaded');
    $loaded = $cache->getValue();
    $real = MartialArtProfile::for($art);

    $bare = new ReflectionClass(MartialArtProfile::class)->newInstanceWithoutConstructor();
    foreach (['art', 'ladder', 'trainingModes'] as $name) {
        $property = new ReflectionProperty(MartialArtProfile::class, $name);
        $property->setValue($bare, $property->getValue($real));
    }
    new ReflectionProperty(MartialArtProfile::class, 'programmes')->setValue($bare, []);

    $cache->setValue(null, [...(array) $loaded, $art->value => $bare]);

    try {
        $run();
    } finally {
        $cache->setValue(null, $loaded);
    }
}

it('answers 404, not 500, for a martial art whose programme has not shipped', function (): void {
    $this->academy->update(['martial_art' => MartialArt::Taekwondo]);

    withoutProgrammes(MartialArt::Taekwondo, function (): void {
        $this->actingAs($this->user)
            ->postJson('/api/v1/academy/syllabus/seed')
            ->assertNotFound()
            ->assertJsonPath('message', 'No starter programme has shipped for this martial art yet.');

        $this->actingAs($this->user)
            ->getJson('/api/v1/academy')
            ->assertJsonPath('data.syllabus_programmes', []);
    });

    expect(SyllabusTopic::query()->where('academy_id', $this->academy->id)->exists())->toBeFalse();
});

it('copies the judo programme into a judo academy: the Kodokan gokyo, then katame-waza, then practice (#1804)', function (): void {
    $this->academy->update(['martial_art' => MartialArt::Judo]);

    $this->actingAs($this->user)->postJson('/api/v1/academy/syllabus/seed')->assertCreated();

    $groups = SyllabusTopic::query()->where('academy_id', $this->academy->id)->positions()
        ->orderBy('sort_order')->withCount('children')->get()->keyBy('name');

    expect($groups->keys()->first())->toBe('Ukemi')
        ->and($groups->keys()->last())->toBe('Kata');

    // The Kodokan classification since 1 April 2017: 68 nage-waza and 32
    // katame-waza, and every one of them where the Kodokan files it. A throw
    // in the wrong group, or one left out, fails here rather than on a mat.
    expect([
        'Te-waza' => $groups['Te-waza']->children_count,
        'Koshi-waza' => $groups['Koshi-waza']->children_count,
        'Ashi-waza' => $groups['Ashi-waza']->children_count,
        'Ma-sutemi-waza' => $groups['Ma-sutemi-waza']->children_count,
        'Yoko-sutemi-waza' => $groups['Yoko-sutemi-waza']->children_count,
        'Osaekomi-waza' => $groups['Osaekomi-waza']->children_count,
        'Shime-waza' => $groups['Shime-waza']->children_count,
        'Kansetsu-waza' => $groups['Kansetsu-waza']->children_count,
    ])->toBe([
        'Te-waza' => 16,
        'Koshi-waza' => 10,
        'Ashi-waza' => 21,
        'Ma-sutemi-waza' => 5,
        'Yoko-sutemi-waza' => 16,
        'Osaekomi-waza' => 10,
        'Shime-waza' => 12,
        'Kansetsu-waza' => 10,
    ]);
});

it('files the throws under tachi-waza and the holds, chokes and locks under ne-waza', function (): void {
    $this->academy->update(['martial_art' => MartialArt::Judo]);
    $this->actingAs($this->user)->postJson('/api/v1/academy/syllabus/seed')->assertCreated();

    $mode = fn (string $name): TrainingMode => SyllabusTopic::query()
        ->where('academy_id', $this->academy->id)->where('name', $name)->firstOrFail()->kind;

    expect($mode('O-soto-gari'))->toBe(TrainingMode::TachiWaza)
        ->and($mode('Tomoe-nage'))->toBe(TrainingMode::TachiWaza)
        ->and($mode('Kesa-gatame'))->toBe(TrainingMode::NeWaza)
        ->and($mode('Juji-gatame'))->toBe(TrainingMode::NeWaza)
        ->and($mode('Mae-ukemi'))->toBe(TrainingMode::Both)
        // A practice group is either-way; its kata say which half they drill.
        ->and($mode('Nage-no-kata'))->toBe(TrainingMode::TachiWaza)
        ->and($mode('Katame-no-kata'))->toBe(TrainingMode::NeWaza);
});

it('keeps the techniques shiai forbids, and says so in their name', function (): void {
    $this->academy->update(['martial_art' => MartialArt::Judo]);
    $this->actingAs($this->user)->postJson('/api/v1/academy/syllabus/seed')->assertCreated();

    $forbidden = SyllabusTopic::query()->where('academy_id', $this->academy->id)
        ->where('name', 'like', '%(prohibited in shiai)')->orderBy('name')->pluck('name')->all();

    expect($forbidden)->toBe([
        'Ashi-garami (prohibited in shiai)',
        'Do-jime (prohibited in shiai)',
        'Kani-basami (prohibited in shiai)',
        'Kawazu-gake (prohibited in shiai)',
    ]);
});

it('copies the Goju-ryu programme into a karate academy: kihon, then kata, then kumite (#1805)', function (): void {
    $this->academy->update(['martial_art' => MartialArt::Karate]);

    // The only karate programme so far, so no key is needed.
    $this->actingAs($this->user)->postJson('/api/v1/academy/syllabus/seed')->assertCreated();

    $groups = SyllabusTopic::query()->where('academy_id', $this->academy->id)->positions()
        ->orderBy('sort_order')->with('children')->get()->keyBy('name');

    expect($groups->keys()->first())->toBe('Junbi undo and hojo undo')
        ->and($groups->keys()->last())->toBe('Jiyu kumite');

    // Every Goju kata, in the Okinawan order — Seiyunchin, Shisochin, then
    // Sanseru, the order of the FIJLKAM Goju dan programme too.
    $kata = collect(['Heishu kata', 'Fukyu kata — Taikyoku', 'Fukyu kata — Gekisai', 'Kaishu kata — kyu', 'Kaishu kata — dan'])
        ->flatMap(fn (string $group) => $groups[$group]->children->sortBy('sort_order')->pluck('name'))
        ->all();
    expect($kata)->toBe([
        'Sanchin', 'Tensho',
        'Taikyoku jodan', 'Taikyoku chudan', 'Taikyoku gedan', 'Taikyoku kake uke', 'Taikyoku mawashi uke',
        'Gekisai dai ichi', 'Gekisai dai ni',
        'Saifa', 'Seiyunchin', 'Shisochin',
        'Sanseru', 'Sepai', 'Kururunfa', 'Seisan', 'Suparinpei',
    ]);
});

it('files kata as kata, kakie and every kumite as kumite, and kihon either way', function (): void {
    $this->academy->update(['martial_art' => MartialArt::Karate]);
    $this->actingAs($this->user)->postJson('/api/v1/academy/syllabus/seed')->assertCreated();

    $mode = fn (string $name): TrainingMode => SyllabusTopic::query()
        ->where('academy_id', $this->academy->id)->where('name', $name)->firstOrFail()->kind;

    expect($mode('Suparinpei'))->toBe(TrainingMode::Kata)
        ->and($mode('Basic kakie'))->toBe(TrainingMode::Kumite)
        ->and($mode('Sandan gi'))->toBe(TrainingMode::Kumite)
        ->and($mode('Sanchin dachi'))->toBe(TrainingMode::Both)
        ->and($mode('Renzoku bunkai'))->toBe(TrainingMode::Both);
});

it('lets a school that opens with Gekisai take the five Taikyoku out in one tap', function (): void {
    // Goju-Kai opens with the Taikyoku, Okinawan Goju with Gekisai. One file
    // serves both because the Taikyoku are their own group.
    $this->academy->update(['martial_art' => MartialArt::Karate]);
    $this->actingAs($this->user)->postJson('/api/v1/academy/syllabus/seed')->assertCreated();
    $taikyoku = SyllabusTopic::query()->where('academy_id', $this->academy->id)->where('name', 'Fukyu kata — Taikyoku')->firstOrFail();

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$taikyoku->id}", ['in_season' => false])
        ->assertOk();

    // The one tap takes all five out, and leaves Gekisai where it was.
    expect($taikyoku->children()->where('in_season', true)->count())->toBe(0)
        ->and($taikyoku->children()->count())->toBe(5)
        ->and(SyllabusTopic::query()->where('academy_id', $this->academy->id)
            ->where('name', 'like', 'Gekisai%')->where('in_season', true)->count())->toBe(2);
});

it('copies the WT taekwondo programme into a taekwondo academy: basics, poomsae, kyorugi (#1806)', function (): void {
    $this->academy->update(['martial_art' => MartialArt::Taekwondo]);

    $this->actingAs($this->user)->postJson('/api/v1/academy/syllabus/seed')->assertCreated();

    $groups = SyllabusTopic::query()->where('academy_id', $this->academy->id)->positions()
        ->orderBy('sort_order')->with('children')->get()->keyBy('name');

    expect($groups->keys()->first())->toBe('Seogi (stances)')
        ->and($groups->keys()->last())->toBe('Competition preparation')
        // The Kukkiwon set: eight Taegeuk for the kup grades, nine for dan.
        ->and($groups['Poomsae — Taegeuk']->children->sortBy('sort_order')->pluck('name')->all())->toBe([
            'Taegeuk Il Jang', 'Taegeuk I Jang', 'Taegeuk Sam Jang', 'Taegeuk Sa Jang',
            'Taegeuk O Jang', 'Taegeuk Yuk Jang', 'Taegeuk Chil Jang', 'Taegeuk Pal Jang',
        ])
        ->and($groups['Poomsae — yudanja']->children->sortBy('sort_order')->pluck('name')->all())->toBe([
            'Koryo', 'Keumgang', 'Taebaek', 'Pyongwon', 'Sipjin', 'Jitae', 'Cheonkwon', 'Hansu', 'Ilyeo',
        ]);
});

it('files poomsae as poomsae, sparring as kyorugi, and kicks either way', function (): void {
    $this->academy->update(['martial_art' => MartialArt::Taekwondo]);
    $this->actingAs($this->user)->postJson('/api/v1/academy/syllabus/seed')->assertCreated();

    $mode = fn (string $name): TrainingMode => SyllabusTopic::query()
        ->where('academy_id', $this->academy->id)->where('name', $name)->firstOrFail()->kind;

    expect($mode('Koryo'))->toBe(TrainingMode::Poomsae)
        ->and($mode('Bada-chagi (counter-kick)'))->toBe(TrainingMode::Kyorugi)
        // A dollyeo-chagi is in Taegeuk and in every sparring round.
        ->and($mode('Dollyeo-chagi'))->toBe(TrainingMode::Both)
        ->and($mode('Kyorugi rules'))->toBe(TrainingMode::Kyorugi)
        // Body-protector scoring and weight classes exist only in sparring:
        // a poomsae coverage count must not ask for them.
        ->and($mode('Electronic scoring (PSS)'))->toBe(TrainingMode::Kyorugi)
        ->and($mode('Weight and gear'))->toBe(TrainingMode::Kyorugi)
        ->and($mode('Poomsae rules'))->toBe(TrainingMode::Poomsae);
});

it('ships programme files that parse, name every position once, and repeat no technique within a position', function (): void {
    foreach (MartialArt::cases() as $art) {
        $profile = MartialArtProfile::for($art);
        foreach ($profile->programmes() as $key) {
            $positions = SeedSyllabusAction::positions((string) $profile->programmeFile($key), $art);

            $positionNames = array_column($positions, 'name');
            expect($positionNames)->toBe(array_values(array_unique($positionNames)), $key);

            foreach ($positions as $position) {
                expect($position['name'])->not->toBe('');
                expect(mb_strlen($position['name']))->toBeLessThanOrEqual(80);
                expect($position['kind'])->toBeInstanceOf(TrainingMode::class);
                expect($position['techniques'])->not->toBe([]);

                $names = array_column($position['techniques'], 'name');
                expect($names)->toBe(array_values(array_unique($names)), "{$key}: {$position['name']} repeats a technique");
                foreach ($position['techniques'] as $technique) {
                    expect(mb_strlen($technique['name']))->toBeLessThanOrEqual(80);
                    expect($technique['kind'])->toBeInstanceOf(TrainingMode::class);
                }
            }
        }
    }
});
