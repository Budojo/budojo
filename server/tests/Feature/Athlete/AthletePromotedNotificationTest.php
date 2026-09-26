<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\User;
use App\Notifications\AthletePromotedNotification;
use Illuminate\Support\Facades\Notification;

/**
 * The personal "congratulations" ping goes to the athlete's linked account
 * (#729 B2). The owner's own row is linked to the owner, so setting your own
 * belt congratulated you on it: "You've been promoted from white to black
 * belt", in your own inbox, for an edit you just made (#1913).
 */
beforeEach(function (): void {
    Notification::fake();
    $this->owner = userWithAcademy();
});

it('does not congratulate the owner for setting their own belt', function (): void {
    $self = Athlete::factory()->for($this->owner->academy)->selfFor($this->owner)->create(['belt' => 'white']);

    $this->actingAs($this->owner)->putJson("/api/v1/athletes/{$self->id}", ['belt' => 'blue'])->assertOk();

    Notification::assertNotSentTo($this->owner, AthletePromotedNotification::class);
});

it('still congratulates an athlete with an account of their own', function (): void {
    $athleteUser = User::factory()->create();
    $athlete = Athlete::factory()->for($this->owner->academy)->create(['belt' => 'white', 'user_id' => $athleteUser->id]);

    $this->actingAs($this->owner)->putJson("/api/v1/athletes/{$athlete->id}", ['belt' => 'blue'])->assertOk();

    Notification::assertSentTo($athleteUser, AthletePromotedNotification::class);
});
