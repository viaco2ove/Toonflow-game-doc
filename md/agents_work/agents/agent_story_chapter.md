# Agent: story_chapter（章节判定器）

> 来源：运行时状态机 Agent。提示词常量 `PROMPT_STORY_CHAPTER`（`fixDB.prompts.ts:1466`，约 47 行），导出行 2334。
> 总览见 `../03_多Agent系统总述.md`。

---

## 1. 角色定位

只判断当前章节 **成功 / 失败 / 继续 / 需引导**，**不导演讲剧情**，禁止猜测用户意图。

---

## 2. 提示词原文（`:1466-1467`）

> 你是章节判定器。你只判断当前章节是否成功、失败或继续，以及是否进入下一章。你只是状态机，不是剧情导演！禁止猜测用户的意图，禁止认为用户输入 "." 或无效字符是因为"迷茫"或"需要引导"。

---

## 3. 出参格式（JSON）

```
字段固定为：
- result: string - 只能是 "continue" / "guide" / "success" / "failed"
- matched_rule: string | null
- reason: string
- next_chapter_id: number | null
- guide_summary: string
- guide_facts: string[]
```

---

## 4. 入参

来自 `evaluateChapterOutcomeByAi`（`ChapterRuntimeService.ts:469`）→ `buildChapterJudgePrompt`(`:372`) → `buildChapterJudgeInputSnapshot`(`:244`)：

快照含：章节信息、`state`、当前事件/阶段、已完成事件列表 `completed_events`、`message_content`、事件类型、`recentDialogue`、下一事件 `next_event`（用于判断是否需 guide）。

---

## 5. 入参处理

- `userPrompt = JSON.stringify(snapshot, null, 2)`（`:503`）。
- **先走规则**：`evaluateChapterOutcome`（`:471`），`!fallback.hasRule` 才调 AI。

---

## 6. 调用位置

- `u.ai.text.invoke`（`:518`），`usageType:"章节判定"`，`output: chapterJudgeOutputSchema`（zod 结构化输出）。
- **模型键**：`resolveChapterJudgeModel`（`:389`）：`storyChapterJudgeModel` → 回退 `storyOrchestratorModel`。

---

## 7. 出参处理（`:541-614`）

- `responseObject = normalizeResultObject(result.object ?? result)`；`fallbackText = unwrapModelText(result.text)`。
- 字段抽取：`result`/`outcome`、`matched_rule`/`matchedRule`、`reason`、`guide_summary`/`guideSummary`、`guide_facts`/`guideFacts`、`next_chapter_id`/`nextChapterId`。
- `guideSummary` 经 `normalizeGuideSummary`、`guideFacts` 经 `normalizeGuideFacts`（保证 1–3 条）。
- 返回 `ChapterOutcomeResult`：`result`/`nextChapterId`/`matchedRule`/`reason`/`guideSummary`/`guideFacts`，写入章节运行状态（驱动切章或引导）。
