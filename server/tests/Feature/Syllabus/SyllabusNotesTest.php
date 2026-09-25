<?php

declare(strict_types=1);

use App\Models\SyllabusTopic;

/**
 * Notes and a reference video on a topic (#1862).
 *
 * The programme lists names; how a technique is taught here lives in the
 * owner's head, and with a second instructor in two heads. Two optional
 * fields turn the item into a line of a teaching notebook. The link is the
 * one field that ends up in an `href`, so it is held to `https://`.
 */
beforeEach(function (): void {
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
});

it('starts every topic with no notes and no video', function (): void {
    SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Mount']);

    $data = $this->actingAs($this->user)
        ->getJson('/api/v1/academy/syllabus')
        ->assertOk()
        ->json('data.0');

    expect($data)->toMatchArray(['notes' => null, 'video_url' => null]);
});

it('stores notes and a video with a new technique', function (): void {
    $mount = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Mount']);

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus', [
            'name' => 'Arm triangle',
            'kind' => 'both',
            'parent_id' => $mount->id,
            'notes' => "Start from the S-mount.\nGrip on the far elbow.",
            'video_url' => 'https://www.youtube.com/watch?v=abc123',
        ])
        ->assertCreated()
        ->assertJsonPath('data.notes', "Start from the S-mount.\nGrip on the far elbow.")
        ->assertJsonPath('data.video_url', 'https://www.youtube.com/watch?v=abc123');
});

it('sets, changes and clears them on an existing topic', function (): void {
    $topic = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Back']);

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$topic->id}", [
            'notes' => 'Seatbelt first, hooks second.',
            'video_url' => 'https://vimeo.com/123',
        ])
        ->assertOk()
        ->assertJsonPath('data.notes', 'Seatbelt first, hooks second.')
        ->assertJsonPath('data.video_url', 'https://vimeo.com/123');

    // An emptied field is no field: the request middleware turns '' into null.
    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$topic->id}", ['notes' => '', 'video_url' => null])
        ->assertOk()
        ->assertJsonPath('data.notes', null)
        ->assertJsonPath('data.video_url', null);
});

it('leaves notes and video alone on a patch that does not send them', function (): void {
    $topic = SyllabusTopic::factory()->for($this->academy)->create([
        'name' => 'Back', 'notes' => 'Seatbelt first.', 'video_url' => 'https://vimeo.com/1',
    ]);

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$topic->id}", ['in_season' => false])
        ->assertOk()
        ->assertJsonPath('data.notes', 'Seatbelt first.')
        ->assertJsonPath('data.video_url', 'https://vimeo.com/1');
});

it('refuses a link that is not https', function (string $url): void {
    $topic = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Back']);

    // The link lands in an href. A javascript: or file: URL there is code
    // or a local path, and plain http is a page the owner's browser will
    // warn about — none of them belong in a programme.
    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$topic->id}", ['video_url' => $url])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['video_url']);

    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/syllabus', ['name' => 'Mount', 'kind' => 'both', 'video_url' => $url])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['video_url']);
})->with([
    'javascript' => ['javascript:alert(1)'],
    'a local file' => ['file:///etc/passwd'],
    'plain http' => ['http://www.youtube.com/watch?v=abc123'],
    'not a link' => ['the one on youtube'],
]);

it('caps notes at 2000 characters and a link at 500', function (): void {
    $topic = SyllabusTopic::factory()->for($this->academy)->create(['name' => 'Back']);

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$topic->id}", [
            'notes' => str_repeat('a', 2001),
            'video_url' => 'https://example.com/' . str_repeat('a', 490),
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['notes', 'video_url']);

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/syllabus/{$topic->id}", ['notes' => str_repeat('a', 2000)])
        ->assertOk();
});
