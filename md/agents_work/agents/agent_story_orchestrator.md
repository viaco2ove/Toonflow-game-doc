# Agent: story_orchestrator（剧情编排师）

> 来源：运行时核心 Agent。提示词常量 `PROMPT_STORY_ORCHESTRATOR`（标准版 `fixDB.prompts.ts:853`、compact 版 `:856`、advanced 版 `:1034`），导出行 2329–2331。
> 总览见 `../03_多Agent系统总述.md`。

---

## 1. 角色定位

决定本轮 **谁发言、为什么发言、局势如何推进、是否轮到用户**。只输出结构化编排结果，**不直接写最终展示给用户的台词**；如需抽记忆则输出 `memory_hints`。

---

## 2. 提示词原文（关键摘要）

**标准版（`:853`）**
> 你是剧情编排师。你只负责决定本轮由谁发言、为什么发言、局势如何推进，以及这轮后是否轮到用户。你不能直接写最终展示给用户的台词，只输出可落库的结构化编排结果；如果需要抽记忆，输出 memory_hints。

**compact 版（`:856`，约 176 行，最完整）核心规则**
> 你是剧情编排师（极简版）。只做一件事：决定本轮由谁发言，以及剧情推进一小步。

- **NPC 优先原则**：首要任务是安排 NPC 或万能角色发言来推动剧情（`:860`）。
- **用户输入 "." 规则**：`"."` 是明确的**跳过指令**（`:878-882`）——玩家不想说话，直接推进剧情。
- `current_event` 表示本轮要推进的事件；字段释义 `status`/`summary`/`facts`/`memory_summary`/`memory_facts`（`:903-920`）。
- `turn_state` 本轮发言状态：`can_player_speak`/`expected_role_type`/`expected_role`/`last_speaker_role_type`/`last_speaker`（`:931-957`）。
- **自由模式规则**（仅当 `current_event.flow = "free_runtime"`）：含 `world_breathing`/`time_advance` 约定（`:984-1015`）。

**advanced 版（`:1034`，约 249 行）** 额外有 `memory_hints` 与 `time_advance` 详细说明（`:1270-1281`）。

---

## 3. 入参（注入到 prompt 的上下文）

由 `buildOrchestratorPromptPayload`（`NarrativeOrchestrator.ts:4846`）组装：

| 变量 | 说明 | 来源 |
|---|---|---|
| `world` / `chapter` | 章节 directive、opening、标题 | `buildOrchestratorChapterMeta:3843` |
| `currentChapter` | 当前章节元信息 | 同上 |
| `currentPhase` | 当前 phase（含 stages） | runtime state |
| `currentEvent` | 当前事件（eventIndex/Kind/FlowType/Status/Summary/Facts） | `readCurrentRuntimeEventContext` |
| `roles` | 本 phase 可发言角色（含 name/roleType） | `filterRolesForPhase` |
| `recentMessages` | 聊天历史（裁剪后） | runtime |
| `turnState` | 本轮发言状态 | `readRuntimeTurnState` |
| `playerMessage` | 用户本轮输入 | 前端传入 |
| `worldBookEntries` | 世界书条目 | `selectWorldBookForInjection` 按 motive+输入+对话做 keys 匹配注入（阶段2 注入 `:4762-4777` 预加载） |

---

## 4. 入参处理（调用前加工）

1. **规则分支优先**：`resolveRuleNarrativePlan`（`:4866`）拦截无需模型的硬规则（如必须交还用户）。
2. **变体选择**：`compactMode = shouldUseCompactOrchestratorPayload(promptAiConfig)`（`:4828`）；回退链 `resolveOrchestratorPromptVariant:3812`：`compact→compact||orchestrator||advanced`；`非compact→advanced||orchestrator||compact`。
3. **system prompt 清洗**：`buildOrchestratorSystemPrompt` → `stripLegacyStoryMainPrefix`（`:3716`）剥离总调度前缀。
4. **user prompt 拼装**：`buildOrchestratorUserPrompt(payload, compactMode)`（`:2308`）→ 结构化文本。

---

## 5. 调用位置

- 入口：`runNarrativePlan`（`NarrativeOrchestrator.ts:4754`）→ `doRunNarrativePlan`（`:4822`）。
- 模型调用：`u.ai.text.invoke(...)`（`:4924`），`usageType:"编排师"`，`maxRetries: input.maxRetries ?? 0`。
- **模型键**：`storyOrchestratorModel`（`resolveTextStageModel(input.userId, "storyOrchestratorModel")` `:4827`）。

---

## 6. 出参格式（JSON）

```json
{
  "speaker": "旁白",
  "role_type": "narrator",
  "motive": "引导用户完成身份绑定流程",
  "await_user": false,
  "trigger_memory_agent": false,
  "event_adjust_mode": "keep",
  "event_status": "waiting_input",
  "event_summary": "@旁白：请输入你的姓名，性别，年龄进行绑定",
  "event_facts": ["当前处于斗破苍穹乌坦城时间线的空间戒指绑定环节"],
  "time_advance": null
}
```
（advanced 版额外含 `memory_hints` 与 `time_advance` 说明）

---

## 7. 出参处理（解析 `:4959` `buildAiNarrativePlanResult`）

- `rawText = unwrapModelText(result.text)`
- `objectLike = parseJsonSafe(rawText, {})`；`fieldMap = parseFieldMap(rawText)`；`getPlainField(fieldMap, ...)` 从 markdown 包裹/纯文本响应抽字段。
- 映射到 `NarrativePlanResult`：`role`/`roleType`/`motive`/`awaitUser`/`eventAdjustMode`/`eventStatus`/`eventSummary`/`eventFacts`/`triggerMemoryAgent`/`time_advance`/`memoryHints`。
- 由 `runNarrativeOrchestrator`（`:5024`）消费：若 `plan.role` 是 player/空/无 motive → 只返回空 content；否则用 `plan.role+motive` 调 **story_speaker** 生成台词（`runStorySpeakerContent` `:5054`）。
- 注：编排接口只返回 `role`/`roleType`/`motive`，其他（台词/数值）走后续 speaker 与 storyInfo。
