# story_chapter Agent — User Prompt 完整构造摘录

## 1. System Prompt 来源

该 agent 的 system prompt 来自 `fixDB.prompts.ts` 的常量 **`PROMPT_STORY_CHAPTER`**（运行时对应的 `t_prompts.code` 为 `"story-chapter"`）。

完整 system 原文已存于 `../system_prompts/PROMPT_STORY_CHAPTER.md`，此处仅引用路径，不重复粘贴。

实际加载方式见下方 ## 2 中的 `loadChapterJudgePrompt()` 函数（对应 `story-chapter` 码）。

## 2. User Prompt 完整构造（原样摘录）

该 agent 的 user prompt 由 `buildChapterJudgePrompt()` 构造，其内部调用 `buildChapterJudgeInputSnapshot()` 拼装上下文变量，最终以 `JSON.stringify(snapshot, null, 2)` 序列化为字符串。以下为构建 user message 的全部相关代码，逐字摘录。

### 2.1 加载 system prompt —— `loadChapterJudgePrompt()`

来源：`ChapterRuntimeService.ts:382-387`

```ts
async function loadChapterJudgePrompt(): Promise<string> {
  const row = await u.db("t_prompts")
    .where("code", "story-chapter")
    .first("defaultValue", "customValue");
  return getPromptValue(row);
}
```

### 2.2 拼装上下文快照 —— `buildChapterJudgeInputSnapshot()`

来源：`ChapterRuntimeService.ts:244-370`

```ts
function buildChapterJudgeInputSnapshot({
  chapter,
  state,
  world,
  messageContent,
  eventType,
  recentMessages,
  runtimeStateSend = false,
}: BuildChapterJudgeInput): JsonRecord {
  const chapterProgress =
    typeof state.chapterProgress === "object" && state.chapterProgress !== null
      ? (state.chapterProgress as Record<string, unknown>)
      : {};

  const completedEvents = Array.isArray(chapterProgress.completedEvents)
    ? chapterProgress.completedEvents
        .map((item) => normalizeScalarText(item))
        .filter(Boolean)
    : [];

  const runtimeOutline = (chapter as any)?.runtimeOutline;
  const endingRules =
    runtimeOutline && typeof runtimeOutline === "object"
      ? (runtimeOutline as any).endingRules ?? null
      : null;

  // 判章时必须读取"按 phaseId 校正后的当前事件"。
  // 否则 chapterProgress 已经切到事件2，但旧 digest 还停在事件1时，
  // 判章 prompt 会错误读到 eventIndex=0/1，和真实运行态脱节。
  const currentEvent = readPhaseAwareRuntimeCurrentEventDigestState(chapter, state);
  const shouldSuppressGuideEvent = shouldSuppressCompletedFreeChapterGuideEvent({
    chapter,
    state,
    eventFlowType: normalizeScalarText(currentEvent.eventFlowType),
    eventStatus: normalizeScalarText(currentEvent.eventStatus) || "idle",
  });

  const recentDialogue = Array.isArray(recentMessages)
    ? recentMessages
        .slice(-10)
        .map((item) => ({
          role: normalizeScalarText(item?.role) || "未知角色",
          role_type: normalizeScalarText(item?.roleType) || "",
          event_type: normalizeScalarText(item?.eventType) || "",
          content: shortText(item?.content, 160) || "",
          // 补充事件进度标记，帮助AI判断台词归属
          event_index: item?.eventIndex ?? null,
          stage_index: item?.stageIndex ?? null,
          role_num_speech_curr_event: Number(item?.roleNumSpeechCurrEvent || 0),
          role_num_speech_curr_stage: Number(item?.roleNumSpeechCurrStage || 0),
        }))
        .filter((item) => item.content)
    : [];

  // 获取故事全局背景：优先 world.settings.globalBackground（前端"全局背景"长描述），
  // world 可能是原始数据库行（settings 是字符串）或已解析对象，intro 是兜底
  const w = (world || {}) as Record<string, any>;
  const wSettings = typeof w.settings === "string" ? parseJsonSafe(w.settings, {}) : (w.settings || {});
  const worldGlobalBackground = normalizeScalarText(
    wSettings.globalBackground
    || w.globalBackground
    || state?.worldGlobalBackground
    || state?.globalBackground
    || ""
  );
  // 获取章节内容
  const chapterContent = normalizeScalarText(chapter?.content || "");

  // 读取下一个事件信息
  const nextEventHint = readNextEventProgressHint(chapter, state);
  const nextEventInfo = nextEventHint
    ? {
        index: Number(nextEventHint.index || 0),
        kind: normalizeScalarText(nextEventHint.kind) || "scene",
        label: normalizeScalarText(nextEventHint.label) || "",
        summary: normalizeScalarText(nextEventHint.summary) || "",
        transition_hint: normalizeScalarText(nextEventHint.transitionHint) || "",
      }
    : null;

  DebugLogUtil.log("story:memory:runtime", `buildChapterJudgeInputSnapshot worldGlobalBackground=${worldGlobalBackground} nextEvent=${nextEventInfo ? JSON.stringify({ index: nextEventInfo.index, label: nextEventInfo.label }) : "null"}`);
  DebugLogUtil.log("story:chapter_ending_check:debug", `recentDialogue (${recentDialogue.length}条): ${JSON.stringify(recentDialogue)}`);
  return {
    chapter: {
      title: normalizeScalarText(chapter?.title) || "未命名章节",
      completion_condition: (chapter as any)?.completionCondition ?? null,
      ending_rules: endingRules,
      content: chapterContent,
    },
    world_intro: w.intro,
    world_global_background: worldGlobalBackground,
    current_event: {
      index: Number(normalizeScalarText(currentEvent.eventIndex) || "0"),
      kind: normalizeScalarText(currentEvent.eventKind) || "scene",
      flow: shouldSuppressGuideEvent
        ? "free_runtime"
        : normalizeScalarText(currentEvent.eventFlowType) || "chapter_content",
      status: shouldSuppressGuideEvent
        ? "waiting_input"
        : normalizeScalarText(currentEvent.eventStatus) || "idle",
      summary: shouldSuppressGuideEvent
        ? "自由行动中，等待承接用户的新动作。"
        : shortText(currentEvent.eventSummary, 120) || "",
      facts: shouldSuppressGuideEvent
        ? [
          "当前无进行中的任务",
          "应根据用户最新输入继续自由剧情",
        ]
        : Array.isArray(currentEvent.eventFacts)
        ? currentEvent.eventFacts
            .map((item: unknown) => normalizeScalarText(item))
            .filter(Boolean)
        : [],
    },
    next_event: nextEventInfo,
    ...(runtimeStateSend
      ? {
          runtime_state: {
            completed_events: completedEvents,
            message_content: normalizeScalarText(messageContent) || "",
            event_type: normalizeScalarText(eventType) || "on_message",
          },
        }
      : {}),
    recent_dialogue: recentDialogue,
  };
}
```

### 2.3 序列化为 user prompt 字符串 —— `buildChapterJudgePrompt()`

来源：`ChapterRuntimeService.ts:372-380`

```ts
function buildChapterJudgePrompt(input: {
  chapter: any;
  state: JsonRecord;
  messageContent?: string;
  eventType?: string;
  recentMessages?: any[];
}): string {
  return JSON.stringify(buildChapterJudgeInputSnapshot(input), null, 2);
}
```

### 2.4 调用处 —— `u.ai.text.invoke` 的 messages 数组结构

来源：`ChapterRuntimeService.ts:503-535`（位于 `evaluateChapterOutcomeByAi()` 内）

```ts
  const buildStartedAt = Date.now();
  const userPrompt = buildChapterJudgePrompt(input);
  const buildMs = Date.now() - buildStartedAt;
  let rawText = "";
  let tokenUsage: ChapterJudgeTokenUsage | null = null;
  let requestStage = "resolve_model";
  let invokeMs = 0;
  try {
    const modelConfig = await resolveChapterJudgeModel(input.userId);
    requestStage = "invoke_model";
    const invokeStartedAt = Date.now();
    logChapterEndingKeyNode("storyChapterJudgeModel:invoke:start", input.traceMeta, {
      chapterId: Number(input.chapter?.id || 0),
      eventType: normalizeScalarText(input.eventType),
      messageLength: normalizeScalarText(input.messageContent).length,
    });
    const result = await u.ai.text.invoke(
      {
        usageType: "章节判定",
        usageRemark: normalizeScalarText(input.chapter?.title) || "未知章节",
        usageMeta: {
          stage: "storyChapterJudgeModel",
          chapterId: Number(input.chapter?.id || 0),
          chapterTitle: normalizeScalarText(input.chapter?.title),
        },
        output: chapterJudgeOutputSchema,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: userPrompt },
        ],
        maxRetries: 0,
      },
      modelConfig as any,
    );
```

> 注：上面 `prompt` 变量即为 `loadChapterJudgePrompt()` 返回的 system prompt（等价于 `PROMPT_STORY_CHAPTER` 内容），`userPrompt` 为 `buildChapterJudgePrompt(input)` 返回的 user message 字符串。

## 3. 注入的上下文变量清单

`buildChapterJudgeInputSnapshot()` 序列化后注入 user prompt 的关键 JSON 字段及含义：

| 变量名 | 来源 / 含义 |
|---|---|
| `chapter.title` | 当前章节标题（`chapter.title` 归一化，缺失则 `"未命名章节"`） |
| `chapter.completion_condition` | 章节结束条件（`chapter.completionCondition`，可能为自然语言文本或规则对象） |
| `chapter.ending_rules` | 章节运行时大纲中的结束规则（`chapter.runtimeOutline.endingRules`） |
| `chapter.content` | 章节正文内容（`chapter.content` 归一化） |
| `world_intro` | 故事世界简介（`world.intro`） |
| `world_global_background` | 故事全局背景长描述；优先取 `world.settings.globalBackground`，回退 `world.globalBackground` / `state.worldGlobalBackground` / `state.globalBackground` |
| `current_event.index` | 当前事件序号（`currentEvent.eventIndex`） |
| `current_event.kind` | 当前事件类型（`currentEvent.eventKind`，默认 `"scene"`） |
| `current_event.flow` | 当前事件流类型；自由章节已完成引导事件时被改写为 `"free_runtime"`，否则取 `currentEvent.eventFlowType`（默认 `"chapter_content"`） |
| `current_event.status` | 当前事件状态；抑制引导事件时为 `"waiting_input"`，否则取 `currentEvent.eventStatus`（默认 `"idle"`） |
| `current_event.summary` | 当前事件摘要（抑制时固定文案，否则取 `currentEvent.eventSummary` 截断 120 字） |
| `current_event.facts` | 当前事件事实清单（抑制时固定两条，否则取 `currentEvent.eventFacts`） |
| `next_event` | 下一事件提示（`readNextEventProgressHint` 结果：`index`/`kind`/`label`/`summary`/`transition_hint`），无则 `null` |
| `runtime_state` | 仅当 `runtimeStateSend=true` 时注入：含 `completed_events`（已完成事件列表）、`message_content`（玩家输入原文）、`event_type`（事件类型，默认 `"on_message"`） |
| `recent_dialogue` | 最近 10 条对话，含 `role`/`role_type`/`event_type`/`content`/`event_index`/`stage_index`/`role_num_speech_curr_event`/`role_num_speech_curr_stage` 字段，content 截断 160 字 |
