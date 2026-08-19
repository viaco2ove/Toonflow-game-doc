# Agent: story_orchestrator_options / task_director_agent_options（编排选项生成器）

> 来源：运行时 Agent。提示词常量 `PROMPT_STORY_ORCHESTRATOR_OPTIONS`（`fixDB.prompts.ts:2173`，约 85 行），导出 2354；`PROMPT_TASK_DIRECTOR_AGENT_OPTIONS`（`:2261`），导出 2355。
> 总览见 `../03_多Agent系统总述.md`。

---

## 1. 角色定位

给玩家提供「一键触发下一步」的编排选项：
- **无任务时**（`story_orchestrator_options`）生成 5 条剧情推进方向。
- **有 `executing_task` 时**（`task_director_agent_options`）生成 5 条任务推进方向。

---

## 2. 出参格式（JSON 数组，严格 5 条）

```json
[{"role":"{角色名}","motive":"{动机}"}, … ]  // 严格 5 条
```

- 硬性规则（`:2178-2218`）：前 3 条 NPC 主导；第 4/5 条必须是场景切换/新事件型。权重：一般角色 1.4 > 万能 0.6 > 系统 0.5 > 旁白 0.1。

---

## 3. 入参

`generateOrchestrateOptions`（`OrchestrateOptionsAgent.ts:130`）：
- **剧情版**（`taskMode=false`）：注入 `current_event`/`roles`/`recentDialogue`/`latestPlayerMessage`/背景（`OrchestrateOptionsContext` `:77`）。
- **任务版**（`taskMode=true`）：取 `taskObjective`/`taskProcess`/`progressLevel`（`:147`）。
- `userPrompt` 拼装上下文。

---

## 4. 调用位置

- `u.ai.text.invoke`（`:231`）。
- **模型键**：两者均 `storyOrchestratorModel`（`:197`）。"换一换"时 `temperature:0.9`。

---

## 5. 出参处理（`:231-287`）

- `rawText.match(/\[[\s\S]*\]/)` → `JSON.parse` → `OPTION_SCHEMA.safeParse`（1–5 条）。
- **强制补齐到 5 条**：AI 少则 `fallback` 补，`REQUIRED_OPTION_COUNT=5`（`:75/261`）。
- 返回 5 条 `{role, motive}` 供前端一键触发编排。
