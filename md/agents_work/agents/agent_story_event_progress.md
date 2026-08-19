# Agent: story_event_progress（事件进度检测器）

> 来源：运行时状态机 Agent。提示词常量 `PROMPT_STORY_EVENT_PROGRESS`（`fixDB.prompts.ts:1516`，约 54 行），导出行 2335。
> 总览见 `../03_多Agent系统总述.md`。与 `agent_story_chapter.md` 区别：本 Agent 只看「当前事件」进度，不判章节成败。

---

## 1. 角色定位

只判断"**当前事件是否结束、现在进行到哪一步**"，不判断章节是否成功或失败。宽松判定，用户 "." 视为跳过完成。

---

## 2. 提示词原文（`:1516-1517`）

> 你是事件进度检测器。你只判断"当前事件是否结束、现在进行到哪一步"，不判断章节是否成功或失败。你只是状态机，不是剧情导演！

---

## 3. 出参格式（JSON）

```
- ended: boolean
- event_status: "active" | "waiting_input" | "completed"
- progress_summary: string
- progress_facts: string[]
- reason: string
```

---

## 4. 入参

来自 `buildEventProgressInputSnapshot`（`EventProgressRuntimeService.ts:234`）：

| 变量 | 说明 |
|---|---|
| `chapter` | 章节(id/title) |
| `current_event` | 当前事件(index/kind/flow/status/summary/facts) |
| `current_stage`/`next_stage` | 当前/下一 stage |
| `recent_dialogue` | **最近 10 条，裁剪 160 字，附 event_index/stage_index/发言计数**（`:254-283`） |
| `next_event` | 下一事件 |

---

## 5. 入参处理

- `userPrompt = JSON.stringify(inputSnapshot, null, 2)`（`:538`）。

---

## 6. 调用位置

- `u.ai.text.invoke`（`:575`），`usageType:"事件进度检测"`，`output: eventProgressOutputSchema`（zod）。
- **模型键**：`resolveEventProgressModel`（`:215`）：`storyEventProgressModel` → 回退 `storyChapterJudgeModel` → `storyOrchestratorModel`。

---

## 7. 出参处理（`:595-629`）

- `responseObject = normalizeResultObject(result.object ?? result)`
- `ended = normalizeBoolean(...)`；`eventStatus = normalizeEventStatus(...)`（只落库 `active`/`waiting_input`/`completed`，`:190`）；`progressSummary`/`progress_facts`/`reason` 抽取。
- 返回 `AiEventProgressResolution` 写回事件状态（驱动事件 completed → 触发章节判定）。
