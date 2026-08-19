# Agent: story_update_align（存档智能对齐）

> 来源：运行时 Agent。提示词常量 `PROMPT_STORY_UPDATE_ALIGN`（`fixDB.prompts.ts:2091`），导出行 2353。
> 总览见 `../03_多Agent系统总述.md`。对应前端 `SceneHistory.vue` 的「智能对齐(AI 语义)」入口 `alignSessionWithAi`。

---

## 1. 角色定位

旧版存档进度**对齐到新版章节**（阶段语义匹配 + 事件摘要重生成）。

---

## 2. 出参格式（JSON）

```json
{"phaseMapping":{"旧phaseId":"新phaseId 或 null"},"newPhaseId":"…","newEventSummary":"…","warnings":["…"],"summary":"…"}
```

---

## 3. 入参

`runStoryUpdateAlignAgent`（`StoryUpdateAlignAgent.ts:94`）：`oldPhases`/`newPhases`/`currentProgress`（JSON 直传 `:97-115`）。

---

## 4. 调用位置

- `u.ai.text.invoke`（`:133`）。
- **模型键**：`storyMemoryModel`（`:119`）。

---

## 5. 出参处理（`:133-186`）

- `rawText.match(/\{[\s\S]*\}/)` → `JSON.parse` → `AI_SCHEMA.safeParse`。
- 失败回退确定性 `fallback`（精确匹配 + 索引就近）。
- `mergeAiAlignIntoReport`（`:186`）把 AI 结果合入对齐报告。
