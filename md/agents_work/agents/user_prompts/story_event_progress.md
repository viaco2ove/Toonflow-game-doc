# story_event_progress Agent — User Prompt 完整构造摘录

## 1. System Prompt 来源

该 agent 的 system prompt 来自 `fixDB.prompts.ts` 的常量 **`PROMPT_STORY_EVENT_PROGRESS`**（运行时对应的 `t_prompts.code` 为 `"story-event-progress"`）。

完整 system 原文已存于 `../system_prompts/PROMPT_STORY_EVENT_PROGRESS.md`，此处仅引用路径，不重复粘贴。

实际加载方式见下方 ## 2 中的 `loadEventProgressPrompt()` 函数（对应 `story-event-progress` 码）。

## 2. User Prompt 完整构造（原样摘录）

该 agent 的 user prompt 由 `buildEventProgressPrompt()` 构造，其内部调用 `buildEventProgressInputSnapshot()` 拼装上下文变量，最终以 `JSON.stringify(snapshot, null, 2)` 序列化为字符串。以下为构建 user message 的全部相关代码，逐字摘录。

### 2.1 加载 system prompt —— `loadEventProgressPrompt()`

来源：`EventProgressRuntimeService.ts:200-205`

```ts
async function loadEventProgressPrompt(): Promise<string> {
  const row = await u.db("t_prompts")
    .where("code", "story-event-progress")
    .first("defaultValue", "customValue");
  return getPromptValue(row);
}
```

### 2.2 拼装上下文快照 —— `buildEventProgressInputSnapshot()`

来源：`EventProgressRuntimeService.ts:234-360`

```ts
function buildEventProgressInputSnapshot(input: EvaluateEventProgressInput): JsonRecord {
  // 事件进度检测和编排、判章必须使用同一套"phase 感知事件读取逻辑"，
  // 否则 phaseId 已经进到事件2，但这里仍按旧 digest 读到事件1，就会出现 1/2/0 混乱。
  const chapterProgress = readChapterProgressState(input.state) as unknown as Record<string, unknown>;
  const currentEvent = readPhaseAwareRuntimeCurrentEventDigestState(input.chapter, input.state);
  const shouldSuppressGuideEvent = shouldSuppressCompletedFreeChapterGuideEvent({
    chapter: input.chapter,
    state: input.state,
    eventFlowType: normalizeScalarText(currentEvent.eventFlowType),
    eventStatus: normalizeEventStatus(currentEvent.eventStatus || chapterProgress.eventStatus),
  });

  // 读取当前 phase 的 stages 信息
  const outline = normalizeChapterRuntimeOutline(input.chapter?.runtimeOutline);
  const currentPhaseId = normalizeScalarText(chapterProgress.phaseId);
  const currentPhase = outline.phases.find((p) => p.id === currentPhaseId);
  const stageIndex = Number(chapterProgress.stageIndex || 0);
  const currentStage = currentPhase?.stages?.[stageIndex] || null;
  const nextStage = currentPhase?.stages?.[stageIndex + 1] || null;

  const recentDialogue = Array.isArray(input.recentMessages)
    ? input.recentMessages
        .slice(-10)
        .map((item) => {
          // 打印 map 处理中的每一个 item
             DebugLogUtil.log("story:event_progress:runtime", "[stage][buildEventProgressInputSnapshot]", JSON.stringify({
                  role: normalizeScalarText(item?.role) || "未知角色",
                  // 事件/阶段标记，帮助AI判断台词归属
                  event_index: item?.eventIndex ?? null,
                  stage_index: item?.stageIndex ?? null,
                  // 角色当前事件/阶段的发言计数
                  role_num_speech_curr_event: item?.roleNumSpeechCurrEvent ?? 0,
                  role_num_speech_curr_stage: item?.roleNumSpeechCurrStage ?? 0,
                }
            ));
          return ({
          role: normalizeScalarText(item?.role) || "未知角色",
          role_type: normalizeScalarText(item?.roleType) || "",
          event_type: normalizeScalarText(item?.eventType) || "",
          content: shortText(item?.content, 160),
          // 事件/阶段标记，帮助AI判断台词归属
          event_index: item?.eventIndex ?? null,
          stage_index: item?.stageIndex ?? null,
          // 角色当前事件/阶段的发言计数
          role_num_speech_curr_event: item?.roleNumSpeechCurrEvent ?? 0,
          role_num_speech_curr_stage: item?.roleNumSpeechCurrStage ?? 0,
        })
        })
        .filter((item) => item.content)
    : [];
  const nextEvent = readNextEventProgressHint(input.chapter, input.state);
  return {
    chapter: {
      id: Number(input.chapter?.id || 0),
      title: normalizeScalarText(input.chapter?.title) || "未命名章节",
    },
    current_event: {
      index: Number(currentEvent.eventIndex || chapterProgress.eventIndex || 0),
      kind: normalizeScalarText(currentEvent.eventKind || chapterProgress.eventKind) || "scene",
      flow: shouldSuppressGuideEvent
        ? "free_runtime"
        : normalizeScalarText(currentEvent.eventFlowType) || "chapter_content",
      status: shouldSuppressGuideEvent
        ? "waiting_input"
        : normalizeEventStatus(currentEvent.eventStatus || chapterProgress.eventStatus),
      summary: shouldSuppressGuideEvent
        ? "自由行动中，等待承接用户的新动作。"
        : normalizeScalarText(currentEvent.eventSummary || chapterProgress.eventSummary),
      facts: shouldSuppressGuideEvent
        ? [
          "当前无进行中的任务",
          "应根据用户最新输入继续自由剧情",
        ]
        : Array.isArray(currentEvent.eventFacts)
        ? currentEvent.eventFacts.map((item) => normalizeScalarText(item)).filter(Boolean)
        : [],
    },
    current_progress: {
      phase_id: normalizeScalarText(chapterProgress.phaseId),
      phase_index: Number(chapterProgress.phaseIndex || 0),
      stage_index: stageIndex,
      total_stages: currentPhase?.stages?.length || 0,
      user_node_status: normalizeScalarText(chapterProgress.userNodeStatus) || "idle",
      pending_goal: normalizeScalarText(chapterProgress.pendingGoal),
      completed_events: Array.isArray(chapterProgress.completedEvents)
        ? chapterProgress.completedEvents.map((item) => normalizeScalarText(item)).filter(Boolean)
        : [],
      // 用户发言计数
      user_speak_count: Number(chapterProgress.userSpeakCount || 0),
      user_speak_required: currentStage?.userSpeakRequired || null,
    },
    current_stage: currentStage
      ? {
        index: stageIndex,
        label: normalizeScalarText(currentStage.label),
        kind: normalizeScalarText(currentStage.kind),
        summary: normalizeScalarText(currentStage.targetSummary),
        user_speak_required: currentStage.userSpeakRequired || null,
      }
      : null,
    next_stage: nextStage
      ? {
        index: stageIndex + 1,
        label: normalizeScalarText(nextStage.label),
        kind: normalizeScalarText(nextStage.kind),
        summary: normalizeScalarText(nextStage.targetSummary),
      }
      : null,
    next_event: nextEvent
      ? {
        index: Number(nextEvent.index || 0),
        kind: normalizeScalarText(nextEvent.kind) || "scene",
        phase_id: normalizeScalarText(nextEvent.phaseId),
        label: normalizeScalarText(nextEvent.label),
        summary: normalizeScalarText(nextEvent.summary),
      }
      : null,
    phase_transition_hint: nextEvent?.transitionHint || "",
    latest_message: {
      role: normalizeScalarText(input.messageRole) || "",
      role_type: normalizeScalarText(input.messageRoleType) || "",
      event_type: normalizeScalarText(input.eventType) || "",
      content: normalizeScalarText(input.messageContent) || "",
    },
    recent_dialogue: recentDialogue,
  };
}
```

### 2.3 序列化为 user prompt 字符串 —— `buildEventProgressPrompt()`

来源：`EventProgressRuntimeService.ts:463-465`

```ts
function buildEventProgressPrompt(input: EvaluateEventProgressInput): string {
  return JSON.stringify(buildEventProgressInputSnapshot(input), null, 2);
}
```

### 2.4 调用处 —— `u.ai.text.invoke` 的 messages 数组结构

来源：`EventProgressRuntimeService.ts:536-592`（位于 `evaluateEventProgressByAi()` 内）。注意此处 user prompt 实际由 `JSON.stringify(inputSnapshot, null, 2)` 内联拼装（与 `buildEventProgressPrompt` 等价），逐字摘录如下：

```ts
  // story-event-progress
  const systemPrompt = await loadEventProgressPrompt();
  const inputSnapshot = buildEventProgressInputSnapshot(input);
  const userPrompt = JSON.stringify(inputSnapshot, null, 2);
  if (!systemPrompt) {
    buildEventProgressStats({
      systemPrompt: "",
      prompt: userPrompt,
      inputSnapshot,
      responseText: "未加载到 AI故事-事件进度检测 Prompt，已回退到规则推进。",
      parsedResolution: null,
      tokenUsage: null,
      requestStatus: "skip_no_prompt",
      manufacturer: "",
      model: "",
      reasoningEffort: "",
      buildMs: 0,
      invokeMs: 0,
      totalMs: Date.now() - totalStartedAt,
      traceMeta: input.traceMeta,
      start,
    });
    return null;
  }
  const buildStartedAt = Date.now();
  const prompt = JSON.stringify(inputSnapshot, null, 2);
  const buildMs = Date.now() - buildStartedAt;
  let rawText = "";
  let tokenUsage: EventProgressTokenUsage | null = null;
  let requestStage = "resolve_model";
  let invokeMs = 0;
  try {
    const modelConfig = await resolveEventProgressModel(input.userId);
    requestStage = "invoke_model";
    logEventProgressKeyNode("storyEventProgressModel:invoke:start", input.traceMeta, {
      chapterId: Number(input.chapter?.id || 0),
      eventType: normalizeScalarText(input.eventType),
      messageLength: normalizeScalarText(input.messageContent).length,
    });
    const invokeStartedAt = Date.now();
    const result = await u.ai.text.invoke(
      {
        usageType: "事件进度检测",
        usageRemark: normalizeScalarText(input.chapter?.title) || "未知章节",
        usageMeta: {
          stage: "storyEventProgressModel",
          chapterId: Number(input.chapter?.id || 0),
          chapterTitle: normalizeScalarText(input.chapter?.title),
        },
        output: eventProgressOutputSchema,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        maxRetries: 0,
      },
      modelConfig as any,
    );
```

> 注：上面 `systemPrompt` 变量即为 `loadEventProgressPrompt()` 返回的 system prompt（等价于 `PROMPT_STORY_EVENT_PROGRESS` 内容），`prompt`/`userPrompt` 为 `JSON.stringify(inputSnapshot, null, 2)` 返回的 user message 字符串（与 `buildEventProgressPrompt(input)` 结果一致）。

## 3. 注入的上下文变量清单

`buildEventProgressInputSnapshot()` 序列化后注入 user prompt 的关键 JSON 字段及含义：

| 变量名 | 来源 / 含义 |
|---|---|
| `chapter.id` | 当前章节 id（`chapter.id`） |
| `chapter.title` | 当前章节标题（`chapter.title` 归一化，缺失则 `"未命名章节"`） |
| `current_event.index` | 当前事件序号（优先 `currentEvent.eventIndex`，回退 `chapterProgress.eventIndex`） |
| `current_event.kind` | 当前事件类型（优先 `currentEvent.eventKind`，回退 `chapterProgress.eventKind`，默认 `"scene"`） |
| `current_event.flow` | 当前事件流类型；自由章节已完成引导事件时改写为 `"free_runtime"`，否则取 `currentEvent.eventFlowType`（默认 `"chapter_content"`） |
| `current_event.status` | 当前事件状态；抑制引导事件时为 `"waiting_input"`，否则 `normalizeEventStatus(currentEvent.eventStatus || chapterProgress.eventStatus)` |
| `current_event.summary` | 当前事件摘要（抑制时固定文案，否则取 `currentEvent.eventSummary || chapterProgress.eventSummary`） |
| `current_event.facts` | 当前事件事实清单（抑制时固定两条，否则取 `currentEvent.eventFacts`） |
| `current_progress.phase_id` | 当前 phase id（`chapterProgress.phaseId`） |
| `current_progress.phase_index` | 当前 phase 索引（`chapterProgress.phaseIndex`） |
| `current_progress.stage_index` | 当前阶段索引（`chapterProgress.stageIndex`） |
| `current_progress.total_stages` | 当前 phase 的阶段总数（`currentPhase.stages.length`） |
| `current_progress.user_node_status` | 用户节点状态（`chapterProgress.userNodeStatus`，默认 `"idle"`） |
| `current_progress.pending_goal` | 待完成目标（`chapterProgress.pendingGoal`） |
| `current_progress.completed_events` | 已完成事件列表（`chapterProgress.completedEvents`） |
| `current_progress.user_speak_count` | 用户发言计数（`chapterProgress.userSpeakCount`） |
| `current_progress.user_speak_required` | 当前阶段要求用户发言数（`currentStage.userSpeakRequired`） |
| `current_stage` | 当前阶段信息（`index`/`label`/`kind`/`summary`/`user_speak_required`），无则 `null` |
| `next_stage` | 下一阶段信息（`index`/`label`/`kind`/`summary`），无则 `null` |
| `next_event` | 下一事件提示（`readNextEventProgressHint` 结果：`index`/`kind`/`phase_id`/`label`/`summary`），无则 `null` |
| `phase_transition_hint` | phase 切换提示（`nextEvent.transitionHint`） |
| `latest_message` | 最新一条消息：`role`/`role_type`/`event_type`/`content`（对应输入 `messageRole`/`messageRoleType`/`eventType`/`messageContent`） |
| `recent_dialogue` | 最近 10 条对话，含 `role`/`role_type`/`event_type`/`content`/`event_index`/`stage_index`/`role_num_speech_curr_event`/`role_num_speech_curr_stage`，content 截断 160 字 |
