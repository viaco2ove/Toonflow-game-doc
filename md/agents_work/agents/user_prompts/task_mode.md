# Task Mode — User Prompt 完整构造（4 个 Task Agent + task_director_agent_options）

> 覆盖：`TaskProgressAgent`(task-progress-agent)、`TaskDirectorAgent`(task-director-agent)、
> `TaskSpeakerAgent`(task-speaker-agent)、`TaskCompletionAgent`(task-completion-agent)，
> 以及 `OrchestrateOptionsAgent` 在任务模式下的 `task-director-agent-options`。
> 所有 agent 的 system prompt 均通过 `loadTaskPrompt(code, FALLBACK_SYSTEM)` 读取，
> fallback 为各文件内 `FALLBACK_SYSTEM` 常量（不在此抄原文）。

---

## 0. loadTaskPrompt 读取逻辑（customValue > defaultValue > fallback）

`D:\Users\viaco\tools\Toonflow-game\toonflow-game-app\src\modules\game-runtime\agents\taskMode\loadTaskPrompt.ts:1-39`

```ts
/**
 * 任务模式 Agent 共享工具：从 t_prompts 读取 prompt
 *
 * 优先级：customValue > defaultValue > fallback (硬编码)
 */

import u from "@/utils";

const promptCache = new Map<string, string>();

/**
 * 从数据库读取指定 code 的 prompt，未命中则使用 fallback
 */
export async function loadTaskPrompt(code: string, fallback: string): Promise<string> {
  if (promptCache.has(code)) {
    return promptCache.get(code) || fallback;
  }
  try {
    const row = await u.db("t_prompts")
      .where("code", code)
      .select("defaultValue", "customValue")
      .first();
    const custom = String(row?.customValue || "").trim();
    const def = String(row?.defaultValue || "").trim();
    const value = custom || def || fallback;
    promptCache.set(code, value);
    return value;
  } catch (e) {
    console.warn(`[loadTaskPrompt] 读取失败 code=${code}：`, e);
    return fallback;
  }
}

/**
 * 清空 prompt 缓存（设置页保存后调用，避免缓存失效）
 */
export function clearTaskPromptCache(): void {
  promptCache.clear();
}
```

**读取优先级说明（逐字逻辑来自 `loadTaskPrompt.ts:23-27`）**：
1. 命中内存缓存 `promptCache` 直接返回（`loadTaskPrompt.ts:15-17`）。
2. 查 `t_prompts` 表 `where code = <code>`，取 `customValue`、`defaultValue`（`loadTaskPrompt.ts:19-22`）。
3. 取 `custom = String(row?.customValue || "").trim()`、`def = String(row?.defaultValue || "").trim()`（`loadTaskPrompt.ts:23-24`）。
4. **最终取值 `value = custom || def || fallback`**（`loadTaskPrompt.ts:25`）→ 即 **customValue 优先，其次 defaultValue，最后 fallback 硬编码**。
5. DB 读取异常时直接返回 `fallback`（`loadTaskPrompt.ts:28-31`）。

---

## 1. task_progress_agent（PROMPT_TASK_PROGRESS_AGENT → code `task-progress-agent`）

### 1.1 System Prompt 来源
- 引用：`../system_prompts/task-progress-agent.md`（DB `code = "task-progress-agent"`）
- 加载：`loadTaskPrompt("task-progress-agent", FALLBACK_SYSTEM)`（TaskProgressAgent.ts:206）

### 1.2 User Prompt 完整构造

`D:\Users\viaco\tools\Toonflow-game\toonflow-game-app\src\modules\game-runtime\agents\taskMode\TaskProgressAgent.ts:193-240`

```ts
async function evalAi(
  intent: IntentType,
  confidence: number,
  reasoning: string,
  objective: string,
  progress: string,
  dialogue: string,
  message: string,
  userId: number,
  npcCards: string,
  originalGlobalBackground: string,
  dynamicGlobalBackground: string,
): Promise<ProgressResult> {
  const systemPrompt = await loadTaskPrompt("task-progress-agent", FALLBACK_SYSTEM);

  const userPrompt = `【重要】请根据玩家的实际行动判断是否推进任务！

当前任务目标：${objective}

推进过程阶段（[]=未开始, [i]=进行中, [s]=已完成, [f]=已失败）：
${progress}

玩家本轮输入：${message}
历史对话：${dialogue || "无"}

角色动态参数卡列表：
${npcCards || "（无可用角色参数卡）"}

故事初始全局背景描述：
${originalGlobalBackground || "（无）"}

故事动态全局背景描述：
${dynamicGlobalBackground || "（无）"}

【判断规则】
1. 如果玩家正在执行与任务目标相关的动作（探索、移动、询问、打探、寻找、排查、开始行动等），标记当前进行中的阶段为完成
2. 如果玩家描述了新的行动步骤，插入新阶段
3. 如果玩家说"好"、"开始"、"那开始吧"等接受指令，标记当前阶段完成并激活下一阶段
4. 只有当玩家明确在闲聊、问无关问题、放弃时才返回 none

【返回要求】
- 必须返回一个有效的 processUpdate！
- phaseIndex：第一个状态为[i]或[]的阶段下标（从0开始）
- 如果当前没有未完成阶段，action 填 none
- 大部分情况下应该返回 mark_complete 或 insert！

请输出严格JSON：
{"level":"等级","tier":"判定层级","reason":"理由","needClarify":true/false,"clarifyContent":"追问","processUpdate":{"action":"none|mark_complete|mark_failed|insert","phaseIndex":数字|null,"newPhase":"新阶段文本(仅insert时)"},"processItem":"推进过程文字"}`;

  console.log("[story:mini_game:task:progress:runtime] request", JSON.stringify({
    userId,
    intent,
    objective,
    progressPreview: progress.slice(0, 200),
    messagePreview: message.slice(0, 100),
    systemPromptChars: systemPrompt.length,
    userPromptChars: userPrompt.length,
  }));
  // 单独打印完整 user prompt（用 ↩ 替换换行避免日志框架按行截断）
  console.log("[story:mini_game:task:progress:runtime] full_user_prompt:", userPrompt.replace(/\n/g, "↩"));

  try {
    const startedAt = Date.now();
    const modelConfig = await u.getPromptAi("storyEventProgressModel", userId);
    const result = await u.ai.text.invoke({
      plainTextOutput: true,
      usageType: "任务推进判定",
      usageRemark: "TaskProgressAgent",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }, modelConfig as any) as any;

    const rawText = String(result?.text || "").trim();
    const latencyMs = Date.now() - startedAt;

    console.log("[story:mini_game:task:progress:runtime] response", JSON.stringify({
      rawTextPreview: rawText.slice(0, 200),
      latencyMs,
    }));

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[TaskProgressAgent] AI 未返回 JSON：", rawText.slice(0, 200));
      console.log(`[story:mini_game:task:progress:stats] status=json_not_found latency_ms=${latencyMs} response_chars=${rawText.length} response_preview=${rawText.slice(0, 150)}`);
      console.log(`[story:mini_game:task:progress:stats] | System Prompt | ${systemPrompt.replace(/\n/g, "↩").slice(0, 120)} | ${systemPrompt.length} |`);
      console.log(`[story:mini_game:task:progress:stats] | User Prompt | ${userPrompt.replace(/\n/g, "↩").slice(0, 120)} | ${userPrompt.length} |`);
      return { level: "maintain", tier: "ai", reason: "AI 未返回 JSON", needClarify: false, processUpdate: { action: "none", phaseIndex: null, newPhase: null } };
    }
    let obj: any;
    try {
      obj = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn("[TaskProgressAgent] JSON 解析失败：", e);
      console.log(`[story:mini_game:task:progress:stats] status=parse_error latency_ms=${latencyMs} response_chars=${rawText.length} response_preview=${rawText.slice(0, 150)}`);
      console.log(`[story:mini_game:task:progress:stats] | System Prompt | ${systemPrompt.replace(/\n/g, "↩").slice(0, 120)} | ${systemPrompt.length} |`);
      console.log(`[story:mini_game:task:progress:stats] | User Prompt | ${userPrompt.replace(/\n/g, "↩").slice(0, 120)} | ${userPrompt.length} |`);
      return { level: "maintain", tier: "ai", reason: "AI JSON 解析失败", needClarify: false, processUpdate: { action: "none", phaseIndex: null, newPhase: null } };
    }
    const parsed = AI_SCHEMA.safeParse(obj);
    if (!parsed.success) {
      console.warn("[TaskProgressAgent] schema 校验失败：", parsed.error);
      console.log(`[story:mini_game:task:progress:stats] status=schema_error latency_ms=${latencyMs} response_chars=${rawText.length} response_preview=${rawText.slice(0, 150)}`);
      console.log(`[story:mini_game:task:progress:stats] | System Prompt | ${systemPrompt.replace(/\n/g, "↩").slice(0, 120)} | ${systemPrompt.length} |`);
      console.log(`[story:mini_game:task:progress:stats] | User Prompt | ${userPrompt.replace(/\n/g, "↩").slice(0, 120)} | ${userPrompt.length} |`);
      return { level: "maintain", tier: "ai", reason: "AI schema 校验失败", needClarify: false, processUpdate: { action: "none", phaseIndex: null, newPhase: null } };
    }
    const d = parsed.data;
    const update = d.processUpdate;
    const processItem = d.processItem;

    console.log(`[story:mini_game:task:progress:stats] level=${LEVEL_MAP[d.level] || "maintain"} tier=${TIER_MAP[d.tier] || "ai"} action=${update?.action || "none"} phaseIndex=${update?.phaseIndex ?? null} processItem=${processItem ? "有" : "无"} latency_ms=${latencyMs}`);
    if (result?.usage) {
      console.log(`[story:mini_game:task:progress:stats] actual_input_tokens=${result.usage.inputTokens || 0} actual_output_tokens=${result.usage.outputTokens || 0} actual_reasoning_tokens=${result.usage.reasoningTokens || 0} cache_read_tokens=${result.usage.cacheReadTokens || 0}`);
    }
    console.log(`[story:mini_game:task:progress:stats] response_chars=${rawText.length} response_preview=${rawText.slice(0, 150)}`);
    console.log(`[story:mini_game:task:progress:stats] 以下为 prompt 体积估算，不等于模型真实 usage。`);
    console.log(`[story:mini_game:task:progress:stats] | 区块 | 实际内容 | 字符数 |`);
    console.log(`[story:mini_game:task:progress:stats] |---|---|---:|`);
    console.log(`[story:mini_game:task:progress:stats] | System Prompt | ${systemPrompt.replace(/\n/g, "↩")} | ${systemPrompt.length} |`);
    console.log(`[story:mini_game:task:progress:stats] | User Prompt | ${userPrompt.replace(/\n/g, "↩")} | ${userPrompt.length} |`);

    return {
      level: LEVEL_MAP[d.level] || "maintain",
      tier: TIER_MAP[d.tier] || "ai",
      reason: d.reason,
      needClarify: d.needClarify || false,
      clarifyContent: d.clarifyContent,
      processUpdate: {
        action: update?.action || "none",
        phaseIndex: update?.phaseIndex ?? null,
        newPhase: update?.newPhase ?? null,
      },
      processItem: d.processItem,
    };
  } catch (e) {
    console.error("[TaskProgressAgent] AI调用失败", e);
    console.log(`[story:mini_game:task:progress:stats] status=exception error=${(e as Error)?.message}`);
    return { level: "maintain", tier: "ai", reason: "AI异常", needClarify: false, processUpdate: { action: "none", phaseIndex: null, newPhase: null } };
  }
}```

### 1.3 注入变量清单

| 变量 | 来源 | 在 user prompt 中的位置 |
|------|------|------------------------|
| `objective` | 任务目标 | `当前任务目标：${...}` |
| `progress` | 推进过程阶段（→ 拼接） | `推进过程阶段（...）：` 段 |
| `message` | 玩家本轮输入 | `玩家本轮输入：${...}` |
| `dialogue` | 历史对话（最近 10 条） | `历史对话：${...}` |
| `npcCards` | 角色参数卡 | `角色动态参数卡列表：` 段 |
| `originalGlobalBackground` | 故事初始全局背景 | `故事初始全局背景描述：` 段 |
| `dynamicGlobalBackground` | 记忆管理器动态背景 | `故事动态全局背景描述：` 段 |
| `intent` / `confidence` / `reasoning` / `userId` | 意图结果 / 用户 ID | 仅参与判定逻辑与日志，不进 user prompt 文本 |

---

## 2. task_director_agent（PROMPT_TASK_DIRECTOR_AGENT → code `task-director-agent`）

### 2.1 System Prompt 来源
- 引用：`../system_prompts/task-director-agent.md`（DB `code = "task-director-agent"`）
- 加载：`loadTaskPrompt("task-director-agent", FALLBACK_SYSTEM)`（TaskDirectorAgent.ts:83）

### 2.2 User Prompt 完整构造

`D:\Users\viaco\tools\Toonflow-game\toonflow-game-app\src\modules\game-runtime\agents\taskMode\TaskDirectorAgent.ts:70-112`

```ts
async function directorAi(
  progressLevel: ProgressLevel,
  taskObjective: string,
  taskProcess: string[],
  npcList: Array<{ name: string; roleType?: string }>,
  dialogue: string,
  message: string,
  userId: number,
  npcCards: string,
  originalGlobalBackground: string,
  dynamicGlobalBackground: string,
  worldKnowledge: string,
): Promise<DirectorResult> {
  const systemPrompt = await loadTaskPrompt("task-director-agent", FALLBACK_SYSTEM);

  const npcText = npcList.length
    ? npcList.map(n => `- ${n.name}（${n.roleType || "npc"}）`).join("\n")
    : "（无可用 NPC，可让旁白或任务系统说话）";

  const processText = taskProcess.length
    ? `【推进过程】${taskProcess.join(" → ")}`
    : "";

  const userPrompt = `【推进等级】${progressLevel}
${processText}
【任务目标】${taskObjective}
【可用 NPC 列表】
${npcText}
【最近对话】${dialogue || "无"}
【玩家本轮输入】${message}

角色动态参数卡列表：
${npcCards || "（无可用角色参数卡）"}

故事初始全局背景描述：
${originalGlobalBackground || "（无）"}

故事动态全局背景描述：
${dynamicGlobalBackground || "（无）"}
${worldKnowledge ? `\n【世界知识】（本轮匹配的静态世界设定，供选角/写动机参考）\n${worldKnowledge}` : ""}

请输出 JSON：
{"speaker":"...","motive":"...","taskType":"...","direction":"...","expectedResult":"..."}`;

  try {
    console.log("[story:mini_game:task:orchestrator:runtime] request", JSON.stringify({
      userId,
      progressLevel,
      objective: taskObjective,
      processPreview: taskProcess.join("→").slice(0, 200),
      npcCount: npcList.length,
      messagePreview: message.slice(0, 100),
    }));
    console.log("[story:mini_game:task:orchestrator:runtime] full_user_prompt:", userPrompt.replace(/\n/g, "↩"));

    const startedAt = Date.now();
    const modelConfig = await u.getPromptAi("storyOrchestratorModel", userId);
    const result = await u.ai.text.invoke({
      plainTextOutput: true,
      usageType: "任务编排",
      usageRemark: "TaskDirectorAgent",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }, modelConfig as any) as any;

    const rawText = String(result?.text || "").trim();
    const latencyMs = Date.now() - startedAt;

    console.log("[story:mini_game:task:orchestrator:runtime] response", JSON.stringify({
      rawTextPreview: rawText.slice(0, 200),
      latencyMs,
    }));

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[TaskDirectorAgent] AI 未返回 JSON：", rawText.slice(0, 200));
      console.log(`[story:mini_game:task:orchestrator:stats] status=json_not_found latency_ms=${latencyMs}`);
      return fallbackDirector(progressLevel, npcList);
    }
    let obj: any;
    try {
      obj = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn("[TaskDirectorAgent] JSON 解析失败：", e);
      console.log(`[story:mini_game:task:orchestrator:stats] status=parse_error latency_ms=${latencyMs}`);
      return fallbackDirector(progressLevel, npcList);
    }
    const parsed = AI_SCHEMA.safeParse(obj);
    if (!parsed.success) {
      console.warn("[TaskDirectorAgent] schema 校验失败：", parsed.error);
      console.log(`[story:mini_game:task:orchestrator:stats] status=schema_error latency_ms=${latencyMs}`);
      return fallbackDirector(progressLevel, npcList);
    }

    console.log(`[story:mini_game:task:orchestrator:stats] speaker=${obj.speaker} taskType=${obj.taskType} latency_ms=${latencyMs}`);
    const d = parsed.data;
    return {
      speaker: d.speaker,
      speakerRole: resolveSpeakerRole(d.speaker, npcList),
      motive: d.motive,
      taskType: d.taskType as TaskType,
      direction: d.direction,
      expectedResult: d.expectedResult,
    };
  } catch (e) {
    console.error("[TaskDirectorAgent] AI调用失败", e);
    return fallbackDirector(progressLevel, npcList);
  }
}```

### 2.3 注入变量清单

| 变量 | 来源 | 在 user prompt 中的位置 |
|------|------|------------------------|
| `progressLevel` | 推进等级 | `【推进等级】${...}` |
| `taskProcess` | 推进过程（→ 拼接） | `【推进过程】${...}`（无则空） |
| `taskObjective` | 任务目标 | `【任务目标】${...}` |
| `npcList` | NPC 列表 | `【可用 NPC 列表】` 段（`- 名（roleType）`） |
| `dialogue` | 最近对话（最近 6 条） | `【最近对话】${...}` |
| `message` | 玩家本轮输入 | `【玩家本轮输入】${...}` |
| `npcCards` | 角色参数卡 | `角色动态参数卡列表：` 段 |
| `originalGlobalBackground` | 故事初始全局背景 | `故事初始全局背景描述：` 段 |
| `dynamicGlobalBackground` | 记忆管理器动态背景 | `故事动态全局背景描述：` 段 |
| `worldKnowledge` | 本轮匹配世界书知识 | 条件注入 `【世界知识】` 段（为空则不注入） |
| `userId` | 用户 ID | 仅用于模型选择 / 日志 |

---

## 3. task_speaker_agent（PROMPT_TASK_SPEAKER_AGENT → code `task-speaker-agent`）

### 3.1 System Prompt 来源
- 引用：`../system_prompts/task-speaker-agent.md`（DB `code = "task-speaker-agent"`）
- 加载：`loadTaskPrompt("task-speaker-agent", FALLBACK_SYSTEM)`（TaskSpeakerAgent.ts:49）

### 3.2 User Prompt 完整构造

`D:\Users\viaco\tools\Toonflow-game\toonflow-game-app\src\modules\game-runtime\agents\taskMode\TaskSpeakerAgent.ts:37-81`

```ts
async function generateAi(
  director: DirectorResult,
  npcCard: string,
  taskObjective: string,
  dialogue: string,
  message: string,
  userId: number,
  npcCards: string,
  originalGlobalBackground: string,
  dynamicGlobalBackground: string,
  worldKnowledge: string,
): Promise<SpeakerResult> {
  const systemPrompt = await loadTaskPrompt("task-speaker-agent", FALLBACK_SYSTEM);

  const roleHint = director.speakerRole === "system"
    ? "你是任务系统（中性叙述者，告知玩家任务规则/状态/进度）"
    : director.speakerRole === "narrator"
      ? "你是旁白（描述场景氛围与剧情切换，不直接对话）"
      : `你是 NPC「${director.speaker}」`;

  const userPrompt = `【角色】${roleHint}
【发言动机】${director.motive}
【剧情类型】${director.taskType}（${director.direction}）
【期望效果】${director.expectedResult}
${npcCard ? `【NPC 人设】\n${npcCard}` : ""}
【任务目标】${taskObjective}
【最近对话】${dialogue || "无"}
【玩家本轮输入】${message}

角色动态参数卡列表：
${npcCards || "（无可用角色参数卡）"}

故事初始全局背景描述：
${originalGlobalBackground || "（无）"}

故事动态全局背景描述：
${dynamicGlobalBackground || "（无）"}
${worldKnowledge ? `\n【世界知识】（本轮匹配的静态世界设定，供参考）\n${worldKnowledge}` : ""}

请生成本轮台词，要求：
- 直接、自然，不要废话和元说明（不要写"作为旁白"、"任务系统说明"等）
- 紧扣玩家本轮输入与任务目标
- 1-3 句话即可

只输出台词内容本身，不要 JSON 包装、不要标签。`;

  try {
    console.log("[story:mini_game:task:streamlines:runtime] request", JSON.stringify({
      userId,
      speaker: director.speaker,
      taskType: director.taskType,
      motive: director.motive,
    }));
    console.log("[story:mini_game:task:streamlines:runtime] full_user_prompt:", userPrompt.replace(/\n/g, "↩"));

    const startedAt = Date.now();
    const modelConfig = await u.getPromptAi("storyOrchestratorModel", userId);
    const result = await u.ai.text.invoke({
      plainTextOutput: true,
      usageType: "角色发言",
      usageRemark: "TaskSpeakerAgent",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }, modelConfig as any) as any;

    const rawText = String(result?.text || "").trim();
    const latencyMs = Date.now() - startedAt;

    console.log("[story:mini_game:task:streamlines:runtime] response", JSON.stringify({
      rawTextPreview: rawText.slice(0, 200),
      latencyMs,
    }));

    if (!rawText) {
      console.warn("[TaskSpeakerAgent] AI 返回空文本");
      console.log(`[story:mini_game:task:streamlines:stats] status=empty latency_ms=${latencyMs}`);
      return fallbackTemplate(director);
    }
    // 去掉可能的 markdown 代码围栏 / JSON 包装
    let content = rawText;
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const obj = JSON.parse(jsonMatch[0]);
        if (obj && typeof obj.content === "string" && obj.content.trim()) {
          content = obj.content.trim();
        }
      } catch {
        // 忽略，使用原文
      }
    }
    // 去掉常见前缀
    content = content
      .replace(/^```[\w]*\s*|```\s*$/g, "")
      .replace(/^"|"$/g, "")
      .trim();

    console.log(`[story:mini_game:task:streamlines:stats] speaker=${director.speaker} content_chars=${content.length} latency_ms=${latencyMs}`);

    return {
      speaker: director.speaker,
      speakerRole: director.speakerRole,
      content,
    };
  } catch (e) {
    console.error("[TaskSpeakerAgent] AI调用失败", e);
    console.log(`[story:mini_game:task:streamlines:stats] status=exception error=${(e as Error)?.message}`);
    return fallbackTemplate(director);
  }
}```[\w]*\s*|```\s*$/g, "")
      .replace(/^"|"$/g, "")
      .trim();

    console.log(`[story:mini_game:task:streamlines:stats] speaker=${director.speaker} content_chars=${content.length} latency_ms=${latencyMs}`);

    return {
      speaker: director.speaker,
      speakerRole: director.speakerRole,
      content,
    };
  } catch (e) {
    console.error("[TaskSpeakerAgent] AI调用失败", e);
    console.log(`[story:mini_game:task:streamlines:stats] status=exception error=${(e as Error)?.message}`);
    return fallbackTemplate(director);
  }
}```

### 3.3 注入变量清单

| 变量 | 来源 | 在 user prompt 中的位置 |
|------|------|------------------------|
| `director.speakerRole` / `director.speaker` | Director 结果 | 决定 `【角色】`（`roleHint`：系统/旁白/`你是 NPC「名」`） |
| `director.motive` | 发言动机 | `【发言动机】${...}` |
| `director.taskType` / `director.direction` | 剧情类型 / 方向 | `【剧情类型】${...}（${...}）` |
| `director.expectedResult` | 期望效果 | `【期望效果】${...}` |
| `npcCard` | 当前发言 NPC 人设卡 | 条件注入 `【NPC 人设】` 段 |
| `taskObjective` | 任务目标 | `【任务目标】${...}` |
| `dialogue` | 最近对话（最近 8 条） | `【最近对话】${...}` |
| `message` | 玩家本轮输入 | `【玩家本轮输入】${...}` |
| `npcCards` | 角色参数卡 | `角色动态参数卡列表：` 段 |
| `originalGlobalBackground` | 故事初始全局背景 | `故事初始全局背景描述：` 段 |
| `dynamicGlobalBackground` | 记忆管理器动态背景 | `故事动态全局背景描述：` 段 |
| `worldKnowledge` | 本轮匹配世界书知识 | 条件注入 `【世界知识】` 段（为空则不注入） |
| `userId` | 用户 ID | 仅用于模型选择 / 日志 |

---

## 4. task_completion_agent（PROMPT_TASK_COMPLETION_AGENT → code `task-completion-agent`）

### 4.1 System Prompt 来源
- 引用：`../system_prompts/task-completion-agent.md`（DB `code = "task-completion-agent"`）
- 加载：`loadTaskPrompt("task-completion-agent", FALLBACK_SYSTEM)`（TaskCompletionAgent.ts:90）

### 4.2 User Prompt 完整构造

`D:\Users\viaco\tools\Toonflow-game\toonflow-game-app\src\modules\game-runtime\agents\taskMode\TaskCompletionAgent.ts:79-119`

```ts
async function evalAi(
  triggerHint: string,
  objective: string,
  processText: string,
  dialogue: string,
  message: string,
  npcCards: string,
  originalGlobalBackground: string,
  dynamicGlobalBackground: string,
  userId: number,
): Promise<CompletionResult> {
  const systemPrompt = await loadTaskPrompt("task-completion-agent", FALLBACK_SYSTEM);

  const userPrompt = `任务目标：${objective}

当前推进过程：
${processText || "（无）"}

历史对话：${dialogue || "无"}

玩家本轮输入：${message}

触发提示：${triggerHint || "（常规每轮评估）"}

角色动态参数卡列表：
${npcCards || "（无可用角色参数卡）"}

故事初始全局背景描述：
${originalGlobalBackground || "（无）"}

故事动态全局背景描述：
${dynamicGlobalBackground || "（无）"}

请综合判断 decision：
- 如果"玩家本轮输入"明确表达完成/提交/结算 → 倾向 success
- 如果明确表达放弃/退出 → judge failed
- 否则根据剧情综合判断
- 大多数普通推进 → continue

请输出严格JSON：
{"decision":"success|failed|continue","level":"评级","statement":"结果","analysis":"分析","highlights":["亮点1"],"lessons":["教训1"],"suggestion":"建议","narration":"完整旁白文本（success/failed 时末尾要带 @用户/@NPC 关系陈述）"}`;

  console.log("[story:mini_game:task:completion:runtime] request", JSON.stringify({
    userId,
    triggerHint,
    objective: String(objective || "").slice(0, 200),
    messagePreview: String(message || "").slice(0, 100),
    systemPromptChars: systemPrompt.length,
    userPromptChars: userPrompt.length,
  }));
  console.log("[story:mini_game:task:completion:runtime] full_user_prompt:", userPrompt.replace(/\n/g, "↩"));

  const startedAt = Date.now();
  try {
    const modelConfig = await u.getPromptAi("storyMemoryModel", userId);
    const result = await u.ai.text.invoke({
      plainTextOutput: true,
      usageType: "任务完成评估",
      usageRemark: "TaskCompletionAgent",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }, modelConfig as any) as any;

    const rawText = String(result?.text || "").trim();
    const latencyMs = Date.now() - startedAt;
    console.log("[story:mini_game:task:completion:runtime] response", JSON.stringify({
      rawTextPreview: rawText.slice(0, 200),
      latencyMs,
    }));

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[TaskCompletionAgent] AI 未返回 JSON：", rawText.slice(0, 200));
      console.log(`[story:mini_game:task:completion:stats] status=json_not_found decision=continue latency_ms=${latencyMs}`);
      return buildContinueDefault();
    }
    let obj: any;
    try {
      obj = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn("[TaskCompletionAgent] JSON 解析失败：", e);
      console.log(`[story:mini_game:task:completion:stats] status=parse_error decision=continue latency_ms=${latencyMs}`);
      return buildContinueDefault();
    }
    const parsed = AI_SCHEMA.safeParse(obj);
    if (!parsed.success) {
      console.warn("[TaskCompletionAgent] schema 校验失败：", parsed.error);
      console.log(`[story:mini_game:task:completion:stats] status=schema_error decision=continue latency_ms=${latencyMs}`);
      return buildContinueDefault();
    }
    const d = parsed.data;
    const decision: CompletionDecision = (d.decision === "success" || d.decision === "failed" || d.decision === "continue")
      ? d.decision
      : "continue";
    const level: CompletionLevel = (d.level && LEVEL_MAP[d.level]) || (decision === "failed" ? "failed" : decision === "success" ? "good" : "incomplete");

    console.log(`[story:mini_game:task:completion:stats] decision=${decision} level=${level} latency_ms=${latencyMs}`);

    return {
      decision,
      level,
      statement: d.statement || "",
      analysis: d.analysis || "",
      highlights: d.highlights || [],
      lessons: d.lessons || [],
      suggestion: d.suggestion || "",
      narration: d.narration || "",
    };
  } catch (e) {
    console.error("[TaskCompletionAgent] AI调用失败", e);
    console.log(`[story:mini_game:task:completion:stats] status=exception decision=continue error=${(e as Error)?.message}`);
    return buildContinueDefault();
  }
}```

> 注：`triggerHint` 由 `evaluateTaskCompletion`（TaskCompletionAgent.ts:228-269）根据 `finalStatus` 生成：
> - `"abandon"` → 直接走 `buildAbandonDefault`，不调用 AI；
> - `"success"` → `"调用方提示：玩家可能已完成任务"`；
> - `"failed"` → `"调用方提示：任务可能已失败"`；
> - `"auto"` → `` `每轮自动评估（推进等级：${progressLevel}）` ``。

### 4.3 注入变量清单

| 变量 | 来源 | 在 user prompt 中的位置 |
|------|------|------------------------|
| `objective` | 任务目标 | `任务目标：${...}` |
| `processText` | 推进过程（；拼接或字符串） | `当前推进过程：` 段 |
| `dialogue` | 历史对话（最近 20 条） | `历史对话：${...}` |
| `message` | 玩家本轮输入 | `玩家本轮输入：${...}` |
| `triggerHint` | 触发提示（见 4.2 注） | `触发提示：${...}` |
| `npcCards` | 角色参数卡 | `角色动态参数卡列表：` 段 |
| `originalGlobalBackground` | 故事初始全局背景 | `故事初始全局背景描述：` 段 |
| `dynamicGlobalBackground` | 记忆管理器动态背景 | `故事动态全局背景描述：` 段 |
| `userId` | 用户 ID | 仅用于模型选择 / 日志 |

---

## 5. task_director_agent_options（PROMPT_TASK_DIRECTOR_AGENT_OPTIONS → code `task-director-agent-options`）

> 该 user prompt 由 `OrchestrateOptionsAgent.generateOrchestrateOptions` 在 **`ctx.taskMode === true`** 分支拼装。
> system 引用：`../system_prompts/task-director-agent-options.md`（DB `code = "task-director-agent-options"`）。

### 5.1 System / User 拼装（任务模式分支）

`D:\Users\viaco\tools\Toonflow-game\toonflow-game-app\src\modules\game-runtime\agents\orchestrateOptions\OrchestrateOptionsAgent.ts:130-174`

```ts
export async function generateOrchestrateOptions(ctx: OrchestrateOptionsContext): Promise<OrchestrateOptionsResult> {
  const promptCode = ctx.taskMode ? "task-director-agent-options" : "story-orchestrator-options";
  const fallbackSystem = ctx.taskMode ? TASK_FALLBACK_SYSTEM : STORY_FALLBACK_SYSTEM;
  const systemPrompt = await loadTaskPrompt(promptCode, fallbackSystem);

  const userPromptParts = [
    `世界名：${ctx.worldName || "未命名世界"}`,
    `章节标题：${ctx.chapterTitle || "未命名章节"}`,
    "",
    "故事初始全局背景描述：",
    ctx.globalBackground || "（无）",
    "",
    "故事动态全局背景描述（记忆管理器维护）：",
    ctx.dynamicGlobalBackground || "（无）",
    "",
  ];

  if (ctx.taskMode) {
    userPromptParts.push(
      `推进等级：${ctx.progressLevel || "正常推进"}`,
      `任务目标：${ctx.taskObjective || "（无）"}`,
      `推进过程：${ctx.taskProcess || "（无）"}`,
      "",
    );
  } else {
    userPromptParts.push(
      "current_event（当前要推进的事件）：",
      ctx.currentEvent || "（无）",
      "",
    );
  }

  userPromptParts.push(
    "角色动态参数卡列表（简略版）：",
    ctx.roles || "（无可用角色）",
    "",
    "已生成台词 recent_dialogue：",
    ctx.recentDialogue || "（暂无对话）",
    "",
    `玩家本轮输入：${ctx.latestPlayerMessage || "（无）"}`,
    "请严格输出 JSON 数组，长度必须正好为 5：",
    `[{"role":"...","motive":"..."},{"role":"...","motive":"..."},{"role":"...","motive":"..."},{"role":"...","motive":"..."},{"role":"...","motive":"..."}]`,
  );

  const userPrompt = userPromptParts.join("\n");

  // ★ 与剧情编排师同款的日志格式，方便排查
  console.log("[story:orchestrate_options:stats] request_chars=", systemPrompt.length + userPrompt.length,
    "system_chars=", systemPrompt.length,
    "user_chars=", userPrompt.length);
  console.log("[story:orchestrate_options:stats] System Prompt");
  console.log(systemPrompt);
  console.log("[story:orchestrate_options:stats] User Prompt");
  console.log(userPrompt);
  console.log("[story:orchestrate_options:stats] 入参:", JSON.stringify({
    userId: ctx.userId,
    taskMode: ctx.taskMode,
    refresh: ctx.refresh,
    promptCode,
  }));

  const startedAt = Date.now();
  let rawText = "";
  let tokenUsage: { inputTokens?: number; outputTokens?: number; reasoningTokens?: number } | null = null;
  let runtimeError: unknown = null;

  try {
    const modelConfig = await u.getPromptAi("storyOrchestratorModel", ctx.userId);
    const result = await u.ai.text.invoke({
      plainTextOutput: true,
      usageType: "编排选项生成器",
      usageRemark: ctx.taskMode ? "task-director-agent-options" : "story-orchestrator-options",
      // "换一换"时温度略高避免重复
      ...(ctx.refresh ? { temperature: 0.9 } : {}),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }, modelConfig as any) as any;

    rawText = String(result?.text || "").trim();
    const latencyMs = Date.now() - startedAt;

    // 提取 token 用量（如果有）
    const usage = (result as any)?.usage || (result as any)?.tokenUsage;
    if (usage && typeof usage === "object") {
      tokenUsage = {
        inputTokens: Number(usage.inputTokens || usage.promptTokens || 0) || undefined,
        outputTokens: Number(usage.outputTokens || usage.completionTokens || 0) || undefined,
        reasoningTokens: Number(usage.reasoningTokens || 0) || undefined,
      };
    }

    // ★ 返回原文完整打印（与剧情编排师一致）
    console.log("[story:orchestrate_options:stats] 返回原文:");
    console.log(rawText || "（空字符串）");
    if (tokenUsage) {
      console.log(`[story:orchestrate_options:stats] actual_input_tokens=${tokenUsage.inputTokens || 0} actual_output_tokens=${tokenUsage.outputTokens || 0} actual_reasoning_tokens=${tokenUsage.reasoningTokens || 0}`);
    }
    console.log(`[story:orchestrate_options:stats] response_chars=${rawText.length} latency_ms=${latencyMs}`);

    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("[OrchestrateOptionsAgent] AI 未返回 JSON 数组");
      return { options: buildFallbackOptions(ctx), source: "fallback", latencyMs };
    }
    let arr: any;
    try {
      arr = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn("[OrchestrateOptionsAgent] JSON 解析失败：", e);
      return { options: buildFallbackOptions(ctx), source: "fallback", latencyMs };
    }
    const parsed = OPTION_SCHEMA.safeParse(arr);
    if (!parsed.success) {
      console.warn("[OrchestrateOptionsAgent] schema 校验失败：", parsed.error);
      return { options: buildFallbackOptions(ctx), source: "fallback", latencyMs };
    }

    const cleaned = parsed.data
      .map((item) => ({
        role: String(item.role || "").trim(),
        motive: String(item.motive || "").trim(),
      }))
      .filter((item) => item.role && item.motive);

    if (!cleaned.length) {
      return { options: buildFallbackOptions(ctx), source: "fallback", latencyMs };
    }

    // ★ 强制保证 5 条：AI 小模型经常只给 3 条，这里用 fallback 补齐剩余
    let finalOptions = cleaned.slice(0, REQUIRED_OPTION_COUNT);
    if (finalOptions.length < REQUIRED_OPTION_COUNT) {
      const fallbackPool = buildFallbackOptions(ctx);
      for (const fb of fallbackPool) {
        if (finalOptions.length >= REQUIRED_OPTION_COUNT) break;
        const dup = finalOptions.some(
          (opt) => opt.role === fb.role && opt.motive === fb.motive,
        );
        if (!dup) {
          finalOptions.push(fb);
        }
      }
      // 仍然不足（fallback 数量不够），用通用兜底
      let genericIdx = 0;
      while (finalOptions.length < REQUIRED_OPTION_COUNT) {
        const genericMotive = fallbackPool[genericIdx % fallbackPool.length]?.motive || "继续推进剧情";
        finalOptions.push({ role: "旁白", motive: `${genericMotive}（${genericIdx + 1}）` });
        genericIdx += 1;
      }
      console.log(
        `[OrchestrateOptionsAgent] AI 只返回 ${cleaned.length} 条，已用 fallback 补齐到 ${REQUIRED_OPTION_COUNT} 条`,
      );
    }

    console.log(`[story:orchestrate_options:stats] final_option_count=${finalOptions.length} ai_returned=${cleaned.length}`);
    console.log("[story:orchestrate_options:stats] 最终返回:", JSON.stringify(finalOptions));
    return { options: finalOptions, source: cleaned.length === REQUIRED_OPTION_COUNT ? "ai" : "ai_padded", latencyMs };
  } catch (e) {
    const latencyMs = Date.now() - startedAt;
    runtimeError = e;
    console.error("[OrchestrateOptionsAgent] AI调用失败", e);
    console.log(`[story:orchestrate_options:stats] request_status=fallback latency_ms=${latencyMs} error=${(e as Error)?.message}`);
    return { options: buildFallbackOptions(ctx), source: "fallback", latencyMs };
  }
}```

### 5.2 注入变量清单（任务模式专属）

| 变量 | 来源（OrchestrateOptionsContext 字段） | 在 user prompt 中的位置 |
|------|-------------------------------------|------------------------|
| `ctx.worldName` | 世界名 | `世界名：${...}` |
| `ctx.chapterTitle` | 章节标题 | `章节标题：${...}` |
| `ctx.globalBackground` | 世界初始全局背景 | `故事初始全局背景描述：` 段 |
| `ctx.dynamicGlobalBackground` | 记忆管理器动态背景 | `故事动态全局背景描述（记忆管理器维护）：` 段 |
| `ctx.progressLevel` | 推进等级 | 任务分支：`推进等级：${...}` |
| `ctx.taskObjective` | 任务目标 | 任务分支：`任务目标：${...}` |
| `ctx.taskProcess` | 任务推进过程 | 任务分支：`推进过程：${...}` |
| `ctx.roles` | 角色参数卡（简略版） | `角色动态参数卡列表（简略版）：` 段 |
| `ctx.recentDialogue` | 已生成台词 | `已生成台词 recent_dialogue：` 段 |
| `ctx.latestPlayerMessage` | 玩家本轮输入 | `玩家本轮输入：${...}` |
| `ctx.taskMode` | 是否任务模式 | 决定走 `task-director-agent-options` 并注入任务分支变量 |
