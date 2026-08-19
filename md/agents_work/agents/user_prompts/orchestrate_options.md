# OrchestrateOptionsAgent — User Prompt 完整构造

## 1. System Prompt 来源

- 引用：`../system_prompts/story-orchestrator-options.md`（运行期 DB `code = "story-orchestrator-options"`，对应常量 `PROMPT_STORY_ORCHESTRATOR_OPTIONS`）
- 加载方式：`loadTaskPrompt(promptCode, fallbackSystem)`，其中剧情模式 `promptCode = "story-orchestrator-options"`，fallback 为该文件内 `STORY_FALLBACK_SYSTEM` 常量（OrchestrateOptionsAgent.ts:131-133，不在此抄原文）。

## 2. User Prompt 完整构造

### 2.1 system 选择 + user 拼装 `generateOrchestrateOptions()`

`D:\Users\viaco\tools\Toonflow-game\toonflow-game-app\src\modules\game-runtime\agents\orchestrateOptions\OrchestrateOptionsAgent.ts:130-183`

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

### 2.2 messages 调用（`userPrompt` 注入点）

`D:\Users\viaco\tools\Toonflow-game\toonflow-game-app\src\modules\game-runtime\agents\orchestrateOptions\OrchestrateOptionsAgent.ts:196-208`

```ts
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
```

## 3. 注入变量清单

> 注：本文件仅覆盖**剧情模式**（`ctx.taskMode === false`）的 user 拼装；任务模式的 `task-director-agent-options` 拼装逻辑同文件、同函数（分支 `ctx.taskMode === true`），见下方「任务模式分支专属变量」。

| 变量 | 来源（OrchestrateOptionsContext 字段） | 在 user prompt 中的位置 |
|------|-------------------------------------|------------------------|
| `ctx.worldName` | 世界名 | `世界名：${...}` |
| `ctx.chapterTitle` | 章节标题 | `章节标题：${...}` |
| `ctx.globalBackground` | 世界初始全局背景 | `故事初始全局背景描述：` 段 |
| `ctx.dynamicGlobalBackground` | 记忆管理器动态背景 | `故事动态全局背景描述（记忆管理器维护）：` 段 |
| `ctx.currentEvent` | 当前要推进的事件 | 剧情模式：`current_event（当前要推进的事件）：` 段 |
| `ctx.roles` | 角色动态参数卡（简略版） | `角色动态参数卡列表（简略版）：` 段 |
| `ctx.recentDialogue` | 已生成台词 | `已生成台词 recent_dialogue：` 段 |
| `ctx.latestPlayerMessage` | 玩家本轮输入 | `玩家本轮输入：${...}` |
| `ctx.taskMode` | 是否任务模式 | 决定走 `story-orchestrator-options` 还是 `task-director-agent-options`，并决定注入下面任务分支变量 |
| `ctx.refresh` | 是否"换一换" | 仅影响 `temperature`，不进 prompt 文本 |
| `ctx.userId` | 用户 ID | 仅用于模型选择 / 日志 |

### 任务模式分支专属变量（`ctx.taskMode === true`）

| 变量 | 来源 | 在 user prompt 中的位置 |
|------|------|------------------------|
| `ctx.progressLevel` | 推进等级 | `推进等级：${...}` |
| `ctx.taskObjective` | 任务目标 | `任务目标：${...}` |
| `ctx.taskProcess` | 任务推进过程 | `推进过程：${...}` |
