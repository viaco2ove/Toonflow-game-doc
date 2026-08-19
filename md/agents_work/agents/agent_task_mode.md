# Agent: 任务模式 4-Agent 流水线（taskMode）

> 运行时任务模式由 `TaskModeOrchestrator.orchestrateTaskMode`（`agents/taskMode/TaskModeOrchestrator.ts:49`）串联 5 个 Agent：
> `intent_analyzer` → `task_progress_agent` → `task_director_agent` → `task_speaker_agent`，`task_completion_agent` 在 abandon/success/failed 时评估。
> 提示词常量均在 `fixDB.prompts.ts`，导出行 2347–2351。总览见 `../03_多Agent系统总述.md` §5。

---

## 流水线串联

```
orchestrateTaskMode
  ├─ analyzeTaskIntent (复用 IntentClassifier) → exit_task 直接 handleTaskCompletion(abandon)
  ├─ task_progress_agent → needClarify 回系统澄清；abandon 触发完成
  ├─ task_director_agent → DirectorResult
  ├─ task_speaker_agent → 台词
  └─ handleTaskCompletion(success/failed/abandon) → task_completion_agent
```

---

## Agent A: intent_analyzer（意图分析师）

- **常量**：`PROMPT_INTENT_ANALYZER`（`fixDB.prompts.ts:1666`，约 100 行），导出 2347。
- **⚠️ 运行时实际用 `IntentClassifier.ts` 内硬编码 `buildSystemPrompt()`（`:54`）作 fallback**，`loadTaskPrompt("intent-analyzer", buildSystemPrompt())` 优先取 DB 值。
- **提示词原文（`:1666` 起）**：
  > 角色：意图分析师。意图类别：必须将用户输入分类到以下 5 个意图之一："#xxxx: " 更容易被识别为意图。
  > 1. create_task（创建/接受任务） 2. exit_task（退出/放弃任务） 3. query_progress（查询任务进度） 4. game_action（游戏行为） 5. normal_dialog（正常对话） 6. memory_update
  > 优先级：exit_task > memory_update > create_task > query_progress > game_action > normal_dialog
  > 输出格式：{"intent":"意图标签","confidence":0.0-1.0,"reasoning":"…","params":{}}
- **入参**：`classifyIntentWithAi(ctx)`（`IntentClassifier.ts:177`），`IntentContext`（`:24`）：`userId`/`playerMessage`/`recentMessages`/`activeTaskId`/`chapterTitle`。
- **入参处理**：`userPrompt = 输入：${playerMessage}\n（${有/无进行中任务}）\n输出 JSON：`（`136-139`）；system 取 `loadTaskPrompt("intent-analyzer", buildSystemPrompt())`。
- **调用**：`u.ai.text.invoke`（`:223`，线上模型）或本地 `chatWithQwen060`（`:211`，`manufacturer==="qwen060"`），`output` 用 zod `{intent,confidence,reasoning,params}`。
- **模型键**：`intentClassifierModel`（`:146`）。
- **出参处理**（`:237/286`）：`AI_RESPONSE_SCHEMA.safeParse` 校验，`intent` 归一为 6 类之一（否则 normal_dialog），`confidence` 夹到 [0,1]；`analyzeIntentWithAi`（`:321`）在 confidence<0.7 时回退 normal_dialog。

---

## Agent B: task_progress_agent（任务推进判定器）

- **常量**：`PROMPT_TASK_PROGRESS_AGENT`（`fixDB.prompts.ts:1769`），导出 2348。
- **提示词原文（出参格式 `:1819-1844`）**：
  ```json
  {"level":"强力推进|正常推进|微弱推进|维持|放弃","tier":"静态条件|关键词匹配|AI辅助判断","reason":"…","needClarify":true|false,"clarifyContent":"…","processItem":"推进过程文字"}
  ```
  `processItem` 用状态标记 `[i]/[]/[s]/[f]` 分隔。
- **入参**：`evaluateTaskProgress`（`TaskProgressAgent.ts:336`）→ `evalAi`（`:193`）。`TaskProgressInput`：`intent`/`objective`/`process[]`/`dialogue`/`message`/`userId`/`npcCards`/`originalGlobalBackground`/`dynamicGlobalBackground`。
- **入参处理**：先 `evalStatic`（exit_task→abandon `:143`）、`evalKeyword`（query→maintain `:158`）短路；其余走 AI。`userPrompt`（`:208`）拼 objective/process/playerInput/dialogue/npcCards/背景。
- **调用**：`u.ai.text.invoke`（`:257`），`usageType:"任务推进判定"`。
- **模型键**：`storyEventProgressModel`（`:256`）。
- **出参处理**（`:275-328`）：`rawText.match(/\{[\s\S]*\}/)` → `JSON.parse` → `AI_SCHEMA.safeParse`（level/tier/needClarify/processUpdate/processItem）。`processItem` 优先，否则 `processUpdate` 经 `applyProcessUpdateToPhases`（`:109`）改写 process 数组（mark_complete/mark_failed/insert）。返回 `ProgressResult`。

---

## Agent C: task_director_agent（任务剧情编排师）

- **常量**：`PROMPT_TASK_DIRECTOR_AGENT`（`fixDB.prompts.ts:1876`），导出 2349。
- **提示词原文（出参格式 `:1935-1940`）**：
  ```json
  {"speaker":"角色名","motive":"动机","taskType":"类型","direction":"推进方向","expectedResult":"期望结果"}
  ```
  `taskType` 只允许 `opening/rule/status/advance/finished/failed`。
- **入参**：`directTaskNarrative`（`TaskDirectorAgent.ts:218`）→ `directorAi`（`:70`）：`progressLevel`/`objective`/`process[]`/`npcList`/`dialogue`/`message`/`userId`/`npcCards`/双背景/`worldKnowledge`。`userPrompt`（`:93`）拼装。
- **模型键**：`storyOrchestratorModel`（`:126`）。
- **出参处理**（`:145-175`）：`rawText.match(/\{[\s\S]*\}/)` → `JSON.parse` → `AI_SCHEMA.safeParse({speaker,motive,taskType,direction,expectedResult})`；`resolveSpeakerRole` 把 speaker 映射为 npc/narrator/system。失败回退 `fallbackDirector`。返回 `DirectorResult`。

---

## Agent D: task_speaker_agent（任务角色发言器）

- **常量**：`PROMPT_TASK_SPEAKER_AGENT`（`fixDB.prompts.ts:1951`），导出 2350。
- **提示词原文（出参格式 `:2009-2011`）**：
  ```json
  {"speaker":"角色名","content":"台词","tone":"语气","emotion":"情绪标签"}
  ```
- **入参**：`generateTaskSpeech`（`TaskSpeakerAgent.ts:172`）→ `generateAi`（`:37`）：`director`/`npcCard`/`objective`/`dialogue`/`message`/`userId`/`npcCards`/双背景/`worldKnowledge`。`userPrompt`（`:57`）含 roleHint（根据 speakerRole 改写"你是NPC「X」"/"你是旁白"/"你是任务系统"）、动机、剧情类型、NPC人设、任务目标、对话。
- **模型键**：`storyOrchestratorModel`（`:93`）。
- **出参处理**（`:104-142`）：若 `rawText` 含 JSON 则取 `obj.content`，否则原文本；去 markdown 围栏/引号前缀。空/失败回退 `fallbackTemplate`（按 taskType 给模板）。返回 `SpeakerResult{content}`。

---

## Agent E: task_completion_agent（任务完成评估器）

- **常量**：`PROMPT_TASK_COMPLETION_AGENT`（`fixDB.prompts.ts:2023`），导出 2351。
- **提示词原文（出参格式 `:2074-2085`）**：
  ```json
  {"decision":"success|failed|continue","level":"完美完成|良好完成|基本完成|未完成|失败","statement":"…","analysis":"…","highlights":["…"],"lessons":["…"],"suggestion":"…","narration":"完整旁白文本（success/failed 时末尾必须带 @用户/@NPC 关系或状态变化陈述）"}
  ```
- **入参**：`evaluateTaskCompletion`（`TaskCompletionAgent.ts:228`）→ `evalAi`（`:79`）：`finalStatus`/`objective`/`processText`/`dialogue`/`message`/`progressLevel`/`userId`/`npcCards`/双背景。`userPrompt`（`:92`）拼装。
- **模型键**：`storyMemoryModel`（`:133`）。
- **出参处理**（`:151-188`）：`rawText.match(/\{[\s\S]*\}/)` → `JSON.parse` → `AI_SCHEMA.safeParse`；`decision` 归一，空/失败回退 `buildContinueDefault`；`abandon` 走 `buildAbandonDefault`。返回 `CompletionResult`。`narration` 中的 `@X 与 @Y 互为舍友` 等陈述被记忆管理器抽取写回参数卡（`TaskCompletionAgent.ts:2068` 注释明确）。
