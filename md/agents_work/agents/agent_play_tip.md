# Agent: play_tip_agent（玩家行动建议器）

> 来源：运行时 Agent。提示词常量 `PROMPT_PLAY_TIP_AGENT`（`fixDB.prompts.ts:2138`，原名 `_PROMPT_STORY_UPDATE_ALIGN` 占 2091 行，play-tip 在 2138），导出行 2352。
> 总览见 `../03_多Agent系统总述.md`。

---

## 1. 角色定位

玩家点"星标"时生成 **3 条第一人称可执行行动提示**。

---

## 2. 出参格式（JSON）

```json
{"tips":["第一条提示","第二条提示","第三条提示"]}
```
**必须正好 3 条**。

---

## 3. 入参

`generatePlayerTips`（`PlayTipAgent.ts:83`）：

| 变量 | 说明 |
|---|---|
| `worldName` | 世界名 |
| `chapterTitle` | 章节标题 |
| `globalBackground` / `dynamicGlobalBackground` | 全局/动态背景 |
| `taskTitle` / `objective` / `process` | 任务信息（若有） |
| `npcCards` | NPC 参数卡 |
| `recentDialogue` | 近期对话 |
| `playerCard` / `playerHandle` | 玩家卡/称呼 |

`userPrompt`（`:86`）拼装。

---

## 4. 调用位置

- `u.ai.text.invoke`（`:146`）。
- **模型键**：`storyOrchestratorModel`（`:127`）。

---

## 5. 出参处理（`:146-183`）

- `rawText.match(/\{[\s\S]*\}/)` → `JSON.parse` → `AI_SCHEMA.safeParse({tips})`。
- 去空去重；**不足 3 条用 `buildFallbackTips` 补齐**。
- 返回 `{tips, source, latencyMs}`（前端展示为 3 条星标建议）。
