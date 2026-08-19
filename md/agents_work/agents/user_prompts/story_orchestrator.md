# story_orchestrator — User Prompt 完整构造摘录

源文件：`toonflow-game-app/src/modules/game-runtime/engines/NarrativeOrchestrator.ts`

## 1. System Prompt 来源

- 运行时从数据库 `t_prompts`（code = `story-orchestrator`）读取，函数 `loadStoryPrompts()`（`NarrativeOrchestrator.ts:3771`）返回字段 `storyOrchestrator`。
- 该字段的兜底常量来自 `fixDB.prompts.ts` 的 `_PROMPT_STORY_ORCHESTRATOR`（对应导出常量 `PROMPT_STORY_ORCHESTRATOR`，`fixDB.prompts.ts:853` / `:2329`）。
- 另有两个变体常量：`_PROMPT_STORY_ORCHESTRATOR_COMPACT`（`fixDB.prompts.ts:856`）、`_PROMPT_STORY_ORCHESTRATOR_ADVANCED`（`fixDB.prompts.ts:1034`）。
- 完整 system 原文已单独存于 `../system_prompts/PROMPT_STORY_ORCHESTRATOR.md`，此处仅引用路径，不抄原文。
- 组装逻辑见 `buildOrchestratorSystemPrompt()`（`NarrativeOrchestrator.ts:3716`），运行时会先 `stripLegacyStoryMainPrefix()` 去除旧版前缀再使用。

## 2. User Prompt 完整构造（原样摘录）

主构建函数为 `buildOrchestratorUserPrompt()`，它直接把 `buildOrchestratorInputSnapshot()` 的结果 `JSON.stringify(..., null, 2)` 作为 user message。下方逐字摘录所有相关函数。

### buildOrchestratorInputSnapshot（NarrativeOrchestrator.ts:2239 — 2306）

```ts
function buildOrchestratorInputSnapshot(payload: OrchestratorPromptPayload, compactMode = false): JsonRecord {
  const roleList = payload.roles.map((role) => ({
    role_type: sanitizeRoleType(role.roleType),
    name: normalizeScalarText(role.name),
    profile: describeRole(role, compactMode),
  }));
  const eventWindow = payload.currentEventWindow || "";
  const snapshot: JsonRecord = {
    world: {
      name: payload.worldName || "未命名世界",
      worldGlobalBackground: payload.worldGlobalBackground || "",
      dynamicWorldGlobalBackground: payload.dynamicWorldGlobalBackground || "",
    },
    chapter: {
      title: payload.chapterTitle || "未命名章节",
      directive: payload.chapterDirective || "",
      user_turns: payload.chapterUserTurns || "",
      opening: payload.chapterOpening || "",
    },
    roles: roleList,
    wildcard_roles: payload.wildcardRoles.map((item) => ({
      name: item.name,
      role_type: sanitizeRoleType(item.roleType),
    })),
    narrator_wildcard_fallback: payload.narratorActsAsWildcardFallback,
    story_state: payload.storyState || "",
    current_phase: {
      label: payload.currentPhaseLabel || "未命名阶段",
      goal: payload.currentPhaseGoal || "",
      allowed_speakers: payload.phaseAllowedSpeakers,
    },
    current_event: {
      index: payload.currentEventIndex ?? 1,
      kind: payload.currentEventKind || "scene",
      flow: payload.currentEventFlowType || "chapter_content",
      status: payload.currentEventStatus || "active",
      summary: payload.currentEventSummary || "当前事件未命名",
      facts: payload.currentEventFacts,
      memory_summary: payload.currentEventMemorySummary || "",
      memory_facts: payload.currentEventMemoryFacts,
      window: eventWindow,
      curr_stage: payload.currentStage,
      // ★ 自由模式世界呼吸：仅 free_runtime 且提取到内容时才写入，章节模式无此键。
      ...(payload.worldBreathing ? { world_breathing: payload.worldBreathing } : {}),
    },    turn_state: {
      can_player_speak: payload.turnState.canPlayerSpeak,
      expected_role_type: sanitizeRoleType(payload.turnState.expectedRoleType),
      expected_role: payload.turnState.expectedRole || "",
      last_speaker_role_type: sanitizeRoleType(payload.turnState.lastSpeakerRoleType),
      last_speaker: payload.turnState.lastSpeaker || "",
    },
    // ★ P4: 任务模式上下文（从 state 提取）—— 任务激活时序列化到 prompt
    active_task: payload.state ? (extractTaskContext(payload.state) || null) : null,
    recent_dialogue: payload.recentDialogue,
    latest_player_message: payload.latestPlayerMessage || "",
    // ★ P2-b 叙事钩子标志：仅自由模式且到触发间隔时为 true，引导 AI 植入可探索线索。
    ...(payload.shouldEmitHook ? { should_emit_hook: true } : {}),
  };
  if (compactMode) {
    //如果 compactMode 为真，就把 snapshot.current_event.window 这个字段删掉。
    delete (snapshot.current_event as JsonRecord).window;
    delete (snapshot as JsonRecord).world;
    if (shouldAttachOrchestratorEventSeed(payload)) {
      (snapshot as JsonRecord).event_seed = buildOrchestratorEventSeed(payload);
    }
  }
  return snapshot;
}
```

### buildOrchestratorUserPrompt（NarrativeOrchestrator.ts:2308 — 2310）

```ts
function buildOrchestratorUserPrompt(payload: OrchestratorPromptPayload, compactMode = false): string {
  return JSON.stringify(buildOrchestratorInputSnapshot(payload, compactMode), null, 2);
}
```

### buildOrchestratorSystemPrompt（NarrativeOrchestrator.ts:3716 — 3721）

```ts
// 组装编排师的系统提示词。
function buildOrchestratorSystemPrompt(
  orchestratorPrompt: string,
  _compactMode = false,
): string {
  return stripLegacyStoryMainPrefix(orchestratorPrompt);
}
```

> 注：同文件内 `stripLegacyStoryMainPrefix()`（`:3701`）为辅助清洗函数，负责去掉旧版 `你是 AI 故事总调度` / `决定把任务交给哪个子 agent` 等前缀行。

### invoke 调用处（NarrativeOrchestrator.ts:4907 — 4949，u.ai.text.invoke）

system / user 在调用前组装：

```ts
4907→  const systemPrompt = buildOrchestratorSystemPrompt(orchestratorPrompt, compactMode);
4908→  const userPrompt = buildOrchestratorUserPrompt(payload, compactMode);
```

messages 数组结构（orchestrator 编排师，usageType = "编排师"）：

```ts
4924→    const result = await u.ai.text.invoke(
4925→      {
4926→        plainTextOutput: false,
4927→        usageType: "编排师",
4928→        usageRemark: `${currentChapter.title || "未知章节"} / ${normalizeScalarText(input.world?.name)}`,
4929→        usageMeta: {
4930→          stage: "storyOrchestratorModel",
4931→          worldId: Number(input.world?.id || 0),
4932→          chapterId: currentChapter.id || 0,
4933→          eventIndex: currentEvent.eventIndex,
4934→          eventKind: currentEvent.eventKind,
4935→        },
4936→        messages: [
4937→          {
4938→            role: "system",
4939→            content: systemPrompt,
4940→          },
4941→          {
4942→            role: "user",
4943→            content: userPrompt,
4944→          },
4945→        ],
4946→        maxRetries: input.maxRetries ?? 0,
4947→      },
4948→      promptAiConfig as any,
4949→    );
```

## 3. 注入的上下文变量（payload 字段清单）

`buildOrchestratorUserPrompt(payload, compactMode)` 实际注入 `OrchestratorPromptPayload` 的关键变量：

- `worldName` / `worldGlobalBackground` / `dynamicWorldGlobalBackground` → snapshot.world（compact 模式下整体删除）
- `chapterTitle` / `chapterDirective` / `chapterUserTurns` / `chapterOpening` → snapshot.chapter
- `roles`（含 `roleType`/`name`/`profile`）、`wildcardRoles`、`narratorActsAsWildcardFallback`
- `storyState` → snapshot.story_state
- `currentPhaseLabel` / `currentPhaseGoal` / `phaseAllowedSpeakers` → snapshot.current_phase
- `currentEventIndex` / `currentEventKind` / `currentEventFlowType` / `currentEventStatus` / `currentEventSummary` / `currentEventFacts` / `currentEventMemorySummary` / `currentEventMemoryFacts` / `currentEventWindow` / `currentStage` / `worldBreathing` → snapshot.current_event
- `turnState`（canPlayerSpeak / expectedRoleType / expectedRole / lastSpeakerRoleType / lastSpeaker）→ snapshot.turn_state
- `active_task`：由 `extractTaskContext(state)` 提取（任务模式）
- `recentDialogue`、`latestPlayerMessage`
- `shouldEmitHook`：仅自由模式且到触发间隔时为 true
- compact 模式额外：`event_seed`（由 `buildOrchestratorEventSeed()` 生成）
