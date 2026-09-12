<?php

declare(strict_types=1);

namespace App\Http\Controllers\Academy;

use App\Actions\Syllabus\CreateSyllabusTopicAction;
use App\Actions\Syllabus\DeleteSyllabusTopicAction;
use App\Actions\Syllabus\SeedSyllabusAction;
use App\Actions\Syllabus\UpdateSyllabusTopicAction;
use App\Authorization\Capability;
use App\Exceptions\SyllabusNotEmptyException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Syllabus\DestroySyllabusTopicRequest;
use App\Http\Requests\Syllabus\SeedSyllabusRequest;
use App\Http\Requests\Syllabus\StoreSyllabusTopicRequest;
use App\Http\Requests\Syllabus\UpdateSyllabusTopicRequest;
use App\Http\Resources\SyllabusTopicResource;
use App\Models\Academy;
use App\Models\SyllabusTopic;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * The academy's programme (#1563): positions, and the techniques under them.
 */
class SyllabusTopicController extends Controller
{
    public function __construct(
        private readonly CreateSyllabusTopicAction $createTopic,
        private readonly UpdateSyllabusTopicAction $updateTopic,
        private readonly DeleteSyllabusTopicAction $deleteTopic,
        private readonly SeedSyllabusAction $seedSyllabus,
    ) {
    }

    public function index(Request $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academyId = $user->activeAcademyId();
        if ($academyId === null || ! $user->canInAcademy($academyId, Capability::AcademySettingsRead)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return SyllabusTopicResource::collection(
            SyllabusTopic::query()
                ->where('academy_id', $academyId)
                ->positions()
                ->with('children')
                ->orderBy('sort_order')
                ->orderBy('name')
                ->get(),
        );
    }

    public function store(StoreSyllabusTopicRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        /** @var Academy $academy */
        $academy = $user->activeAcademy();

        $topic = $this->createTopic->execute(
            $academy,
            $request->topicName(),
            $request->topicKind(),
            $request->parent(),
            $request->inSeason(),
        );

        return response()->json(['data' => new SyllabusTopicResource($topic)], 201);
    }

    public function update(UpdateSyllabusTopicRequest $request, SyllabusTopic $syllabusTopic): JsonResponse
    {
        $this->updateTopic->execute($syllabusTopic, $request->validated());

        return response()->json(['data' => new SyllabusTopicResource($syllabusTopic)]);
    }

    public function destroy(DestroySyllabusTopicRequest $request, SyllabusTopic $syllabusTopic): JsonResponse
    {
        $this->deleteTopic->execute($syllabusTopic);

        return response()->json(null, 204);
    }

    /**
     * "Start from the BJJ programme." 409 when the academy already has one —
     * even one topic is a programme the academy owns, never overwritten.
     */
    public function seed(SeedSyllabusRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        /** @var Academy $academy */
        $academy = $user->activeAcademy();

        try {
            $written = $this->seedSyllabus->execute($academy);
        } catch (SyllabusNotEmptyException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return response()->json(['data' => ['written' => $written]], 201);
    }
}
