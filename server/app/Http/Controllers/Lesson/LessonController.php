<?php

declare(strict_types=1);

namespace App\Http\Controllers\Lesson;

use App\Actions\Lesson\RecentLessonTopicsAction;
use App\Actions\Lesson\SetLessonNotesAction;
use App\Actions\Lesson\SetLessonTopicsAction;
use App\Actions\Lesson\SuggestLessonTopicsAction;
use App\Authorization\Capability;
use App\Http\Controllers\Controller;
use App\Http\Requests\Lesson\SetLessonNotesRequest;
use App\Http\Requests\Lesson\SetLessonTopicsRequest;
use App\Http\Requests\Lesson\ShowLessonRequest;
use App\Http\Requests\Lesson\SuggestLessonTopicsRequest;
use App\Http\Resources\LessonResource;
use App\Http\Resources\LessonTopicResource;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * What a lesson covers (#1564).
 *
 * A lesson is addressed by its slot — the class, and the day — rather than by
 * an id, because when the owner is planning it the row does not exist yet.
 * Every write materialises it; the read never does, and answers `null` for a
 * slot nobody has touched.
 */
class LessonController extends Controller
{
    public function __construct(
        private readonly SetLessonTopicsAction $setTopics,
        private readonly SetLessonNotesAction $setNotes,
        private readonly RecentLessonTopicsAction $recentTopics,
        private readonly SuggestLessonTopicsAction $suggestTopics,
    ) {
    }

    public function show(ShowLessonRequest $request): JsonResponse
    {
        $lesson = $this->lessonFor($request);

        return response()->json([
            'data' => $lesson === null ? null : new LessonResource($lesson),
        ]);
    }

    public function setTopics(SetLessonTopicsRequest $request): JsonResponse
    {
        $lesson = $this->setTopics->execute(
            $request->academyClass(),
            $request->heldOn(),
            $request->topicIds(),
        );

        return response()->json(['data' => new LessonResource($this->withTopicParents($lesson))]);
    }

    public function setNotes(SetLessonNotesRequest $request): JsonResponse
    {
        $lesson = $this->setNotes->execute(
            $request->academyClass(),
            $request->heldOn(),
            $request->notes(),
        );

        return response()->json(['data' => new LessonResource($this->withTopicParents($lesson))]);
    }

    /**
     * The picker's "recent" group — what this academy has been teaching
     * lately, because teaching runs in blocks.
     */
    public function recent(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->activeAcademy();

        if ($academy === null || ! $user->canInAcademy($academy->id, Capability::AttendanceRead)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return response()->json([
            'data' => LessonTopicResource::collection($this->recentTopics->execute($academy))
                ->resolve($request),
        ]);
    }

    /**
     * What to teach tonight (#1566) — the coverage data answering the question
     * at the moment it is actually asked, rather than in a report.
     */
    public function suggestions(SuggestLessonTopicsRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->activeAcademy();

        if ($academy === null) {
            return response()->json(['data' => []]);
        }

        return response()->json([
            'data' => $this->suggestTopics->execute($academy, $request->academyClass(), $request->limit()),
        ]);
    }

    /**
     * A GET never creates the lesson: reading a slot must not assert that
     * anything happened in it. Same rule the daily attendance read follows.
     */
    private function lessonFor(ShowLessonRequest $request): ?Lesson
    {
        $class = $request->academyClass();

        /** @var Lesson|null $lesson */
        $lesson = Lesson::query()
            ->where('academy_class_id', $class->id)
            ->whereDate('held_on', $request->heldOn()->toDateString())
            ->with('topics.parent')
            ->first();

        return $lesson;
    }

    /**
     * The topic chips name their position, so the parents come along. Loaded
     * here rather than inside the Action: it is a shape the response wants,
     * not a rule the write depends on.
     */
    private function withTopicParents(Lesson $lesson): Lesson
    {
        $lesson->load('topics.parent');

        return $lesson;
    }
}
