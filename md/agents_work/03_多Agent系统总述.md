# 多 Agent 系统总述

> 本文档汇总 Toonflow-game 运行时的多 Agent 编排体系。每个 Agent 的「入参 / 入参处理 / 出参 / 出参处理 / 提示词」详见 `agents/` 下对应文件。


| 目录 | 文件数 | 状态 |
|------|--------|------|
| `agents/system_prompts/` | 33 | ✅ 全部完整，v2 状态机已修复截断 |
| `agents/user_prompts/` | 12 | ✅ 全部完整，_fix_v2.py 修复了 6 处 `export async function` 漏网 |
| `agents/*.md`（摘要版） | 11 | ✅ 保留完整 |
| `agents/README.md` | 1 | ✅ 索引+映射表 |



---

## 1. 提示词从哪里来（很重要）

| 来源 | 作用 | 运行时 |
|---|---|---|
| `src/lib/fixDB.prompts.ts`（2356 行） | **当前权威版**剧情 Agent 提示词，常量形如 `_PROMPT_STORY_ORCHESTRATOR`，底部 `_normalize()` 规范化后导出 `PROMPT_STORY_ORCHESTRATOR` | ✅ 真正写入 `t_prompts` 并加载 |
| `src/lib/initDB.prompts.ts`（224KB） | 同样含一份**重复**的剧情 Agent 提示词（行 4615–5349），外加大量「世界书/角色卡/场景/道具/剧本/分镜/视频」**内容生成**提示词 | 仅作 DB 种子；剧情部分与 fixDB 重复 |

- 所有 prompt 由 `fixDB.ts` / `initDB.ts` 写入表 **`t_prompts`**（字段 `code` / `defaultValue` / `customValue`），运行时按 `code` 读取。
- 读取函数：
  - `loadStoryPrompts()`（`NarrativeOrchestrator.ts:3771`）：一次性读 `story-orchestrator / -compact / -advanced / story-speaker / story-memory`。
  - `loadTaskPrompt(code, fallback)`（`agents/taskMode/loadTaskPrompt.ts:14`）：`customValue > defaultValue > 硬编码 fallback`，带内存缓存。
  - 单 code 直读：`loadChapterJudgePrompt()` / `loadEventProgressPrompt()` / `loadMiniGamePrompt(gameType)` / `loadSellPrompt()`。

---

## 2. 统一调用与解析套路

**模型调用统一入口**：`u.ai.text.invoke({ system, messages, usageType, usageRemark, plainTextOutput?, output? }, modelConfig)`。

**模型键（modelKey）与回退链**：各 Agent 有独立 `modelKey`，统一走 `u.getPromptAi(modelKey, userId)` 解析，失败时回退到更通用的模型。

**输出解析三套路**（高度鲁棒，三保险）：
1. `parseJsonSafe` + `parseFieldMap`/`getPlainField`（剧情核心 Agent）。
2. 正则 `rawText.match(/\{[\s\S]*\}/)` + `JSON.parse` + zod `safeParse`（task/intent/minigame/sell 系列）。
3. `best-effort-json-parser` 的 `parse()`（小游戏/出售）。
- 对 markdown 围栏、纯文本包裹、大小写/下划线字段名（`event_summary`/`eventSummary`）都做了兼容。

---

## 3. Agent 总表（18 个，含 2 个未启用）

| # | Agent | code | 模型键 | 角色 | 状态 |
|---|---|---|---|---|---|
| 1 | `story_orchestrator` | `story-orchestrator`(+`-compact`/`-advanced`) | `storyOrchestratorModel` | 决定本轮谁发言/动机/是否轮到用户（只编排不写台词） | ✅ 核心 |
| 2 | `story_speaker` | `story-speaker` | `storySpeakerModel`(fast 回退) | 按 motive 生成展示台词 | ✅ 核心 |
| 3 | `story_memory` | `story-memory` | `storyMemoryModel` | 维护长期摘要 + 角色动态参数卡(HP/MP/等级…) | ✅ 核心 |
| 4 | `story_chapter` | `story-chapter` | `storyChapterJudgeModel` | 章节成败/下一章状态机 | ✅ |
| 5 | `story_event_progress` | `story-event-progress` | `storyEventProgressModel` | 事件进行到哪一步状态机 | ✅ |
| 6 | `story_mini_game`(+8子) | `story-mini-game*` | `storyMiniGameModel` | 小游戏自然语言→可执行动作 | ✅ |
| 7 | `story_sell_item` | `story-sell-item` | `storyMiniGameModel` | 物品出售解析 | ✅ |
| 8 | `intent_analyzer` | `intent-analyzer` | `intentClassifierModel` | 玩家输入 6 类意图分类 | ✅(实际用 IntentClassifier 内硬编码兜底) |
| 9 | `task_progress_agent` | `task-progress-agent` | `storyEventProgressModel` | 任务推进等级判定 | ✅ 任务流水线 |
| 10 | `task_director_agent` | `task-director-agent` | `storyOrchestratorModel` | 任务被推进时编排谁说话/动机 | ✅ 任务流水线 |
| 11 | `task_speaker_agent` | `task-speaker-agent` | `storyOrchestratorModel` | 任务台词生成 | ✅ 任务流水线 |
| 12 | `task_completion_agent` | `task-completion-agent` | `storyMemoryModel` | 任务完成/失败评估+关系变化旁白 | ✅ 任务流水线 |
| 13 | `play_tip_agent` | `play-tip-agent` | `storyOrchestratorModel` | 星标点生成 3 条行动提示 | ✅ |
| 14 | `story_orchestrator_options` | `story-orchestrator-options` | `storyOrchestratorModel` | 无任务时生成 5 条编排选项 | ✅ |
| 15 | `task_director_agent_options` | `task-director-agent-options` | `storyOrchestratorModel` | 有任务时生成 5 条任务选项 | ✅ |
| 16 | `story_update_align` | `story-update-align` | `storyMemoryModel` | 存档进度对齐到新版章节 | ✅ |
| 17 | `story_main` | `story-main` | — | 顶层路由总调度（已被拆平） | ⚠️ **未启用** |
| 18 | `story_safety` | `story-safety` | `storySafetyModel` | 落库前安全审查 | ⚠️ **未启用** |

---

## 4. 运行时编排链路（剧情主线）

```mermaid
graph TD
  A[用户输入 / "."] --> B[orchestrateSessionTurn]
  B --> C{规则分支命中?}
  C -->|是| D[resolveRuleNarrativePlan 直接出结果]
  C -->|否| E[story_orchestrator Agent]
  E --> F{await_user?}
  F -->|是| Z[返回等待玩家]
  F -->|否| G[story_speaker Agent 生成台词]
  G --> H[commitSessionNarrativeTurn 落库]
  H --> I{需刷新记忆?}
  I -->|是| J[story_memory Agent 后台刷新参数卡]
  H --> K[流式台词 + 语音 + 切立绘]
  K --> L{章节/事件判定?}
  L --> M[story_chapter / story_event_progress Agent]
```

## 5. 任务模式 4-Agent 流水线

`TaskModeOrchestrator.orchestrateTaskMode`（`agents/taskMode/TaskModeOrchestrator.ts:49`）串联：

1. `intent_analyzer`（复用 IntentClassifier）→ `exit_task` 直接走完成(abandon)
2. `task_progress_agent` → `needClarify` 回系统澄清；`abandon` 触发完成
3. `task_director_agent` → 编排谁说话/动机/路由
4. `task_speaker_agent` → 生成台词
- `task_completion_agent` 在 abandon/success/failed 时评估并产出关系变化旁白（被记忆管理器抽取写回参数卡）。

---

## 6. 反直觉结论（写文档/二次开发务必注意）

1. **`story_main` 与 `story_safety` 是死 Agent**：前者被 `stripLegacyStoryMainPrefix` 剥离前缀、无调用点；后者入库但无 `u.ai.text.invoke` 引用。标注为「预留/未启用」。
2. **`intent_analyzer` 运行时实际用 `IntentClassifier.ts` 内硬编码 `buildSystemPrompt()`**，DB 的 `PROMPT_INTENT_ANALYZER` 仅作 `loadTaskPrompt` 的 fallback。
3. **模型键复用严重**：`storyOrchestratorModel` 服务 orchestrator/speaker(非fast)/task_director/task_speaker/play_tip/两个 options；`storyMemoryModel` 服务 memory/task_completion/update_align；`storyEventProgressModel` 是 event_progress/task_progress/mini_game/sell 的回退源。
4. **`gameEngine.ts` 不是对话引擎**：它是运行时状态模型/归一化库。真正的对话引擎是 `NarrativeOrchestrator.ts` + `SessionService.ts`。
5. **提示词双副本**：`fixDB.prompts.ts` 与 `initDB.prompts.ts` 都含剧情 Agent 提示词，运行时以 fixDB 版为种子。
6. **创作侧 Agent ≠ 运行时 Agent**：`agents/outlineScript/`(故事线/大纲) 与 `agents/storyboard/`(分镜图像) 属于内容创作，不属于运行时剧情编排多 Agent 体系。
