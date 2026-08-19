# PlayTipAgent — User Prompt 完整构造

## 1. System Prompt 来源

- 引用：`../system_prompts/play-tip-agent.md`（运行期 DB `code = "play-tip-agent"`，对应常量 `PROMPT_PLAY_TIP_AGENT`）
- 加载方式：`loadTaskPrompt("play-tip-agent", FALLBACK_SYSTEM)`（PlayTipAgent.ts:84），fallback 为该文件内 `FALLBACK_SYSTEM` 常量（不在此抄原文）。

## 2. User Prompt 完整构造

### 2.1 system / user 拼装入口 `generatePlayerTips()`

`D:\Users\viaco\tools\Toonflow-game\toonflow-game-app\src\modules\game-runtime\agents\playTip\PlayTipAgent.ts:83-136`

```ts
export async function generatePlayerTips(ctx: PlayTipContext): Promise<PlayTipResult> {
  const systemPrompt = await loadTaskPrompt("play-tip-agent", FALLBACK_SYSTEM);

  const userPrompt = `世界名：${ctx.worldName || "未命名世界"}
章节标题：${ctx.chapterTitle || "未命名章节"}
故事简介：
${ctx.intro || "（无）"}
故事全局背景：
${ctx.globalBackground || "（无）"}

故事当前动态背景（记忆管理器维护）：
${ctx.dynamicGlobalBackground || "（无）"}

当前任务：
${ctx.taskTitle ? `- 标题：${ctx.taskTitle}` : "- （当前没有进行中的任务）"}
${ctx.taskObjective ? `- 目标：${ctx.taskObjective}` : ""}
${ctx.taskProcess ? `- 推进过程：${ctx.taskProcess}` : ""}

玩家参数卡：
${ctx.playerCard || "（无）"}

可用角色（NPC）：
${ctx.npcCards || "（无可用 NPC）"}

最近对话：
${ctx.recentDialogue || "（暂无对话）"}

请根据以上上下文，为玩家生成 3 条不同方向的、可直接发送到输入框的第一人称行动提示。

请严格输出 JSON：
{"tips":["...","...","..."]}`;

  console.log("[story:play_tip:runtime] request", JSON.stringify({
    userId: ctx.userId,
    worldName: ctx.worldName,
    chapterTitle: ctx.chapterTitle,
    taskTitle: ctx.taskTitle || null,
    systemPromptChars: systemPrompt.length,
    userPromptChars: userPrompt.length,
  }));
  console.log("[story:play_tip:runtime] full_user_prompt:", userPrompt.replace(/\n/g, "↩"));

  const startedAt = Date.now();
  try {
    const modelConfig = await u.getPromptAi("storyOrchestratorModel", ctx.userId);
    const result = await u.ai.text.invoke({
      plainTextOutput: true,
      usageType: "玩家提示器",
      usageRemark: "PlayTipAgent",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }, modelConfig as any) as any;

    const rawText = String(result?.text || "").trim();
    const latencyMs = Date.now() - startedAt;

    console.log("[story:play_tip:runtime] response", JSON.stringify({
      rawTextPreview: rawText.slice(0, 200),
      latencyMs,
    }));

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[PlayTipAgent] AI 未返回 JSON：", rawText.slice(0, 200));
      console.log(`[story:play_tip:stats] status=json_not_found latency_ms=${latencyMs}`);
      return { tips: buildFallbackTips(ctx), source: "fallback", latencyMs };
    }
    let obj: any;
    try {
      obj = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn("[PlayTipAgent] JSON 解析失败：", e);
      console.log(`[story:play_tip:stats] status=parse_error latency_ms=${latencyMs}`);
      return { tips: buildFallbackTips(ctx), source: "fallback", latencyMs };
    }
    const parsed = AI_SCHEMA.safeParse(obj);
    if (!parsed.success) {
      console.warn("[PlayTipAgent] schema 校验失败：", parsed.error);
      console.log(`[story:play_tip:stats] status=schema_error latency_ms=${latencyMs}`);
      return { tips: buildFallbackTips(ctx), source: "fallback", latencyMs };
    }

    // 规整：去空、去重、限制长度，不足/超过 3 条都对齐
    const cleaned = parsed.data.tips
      .map(t => String(t || "").trim())
      .filter(Boolean)
      .filter((t, i, arr) => arr.indexOf(t) === i);

    let finalTips = cleaned.slice(0, 3);
    if (finalTips.length < 3) {
      const fallback = buildFallbackTips(ctx);
      for (const f of fallback) {
        if (finalTips.length >= 3) break;
        if (!finalTips.includes(f)) finalTips.push(f);
      }
    }

    console.log(`[story:play_tip:stats] tip_count=${finalTips.length} latency_ms=${latencyMs}`);
    return { tips: finalTips, source: "ai", latencyMs };
  } catch (e) {
    const latencyMs = Date.now() - startedAt;
    console.error("[PlayTipAgent] AI调用失败", e);
    console.log(`[story:play_tip:stats] status=exception latency_ms=${latencyMs} error=${(e as Error)?.message}`);
    return { tips: buildFallbackTips(ctx), source: "fallback", latencyMs };
  }
}```

## 3. 注入变量清单

| 变量 | 来源（PlayTipContext 字段） | 在 user prompt 中的位置 |
|------|----------------------------|------------------------|
| `ctx.worldName` | 世界名 | `世界名：${...}` |
| `ctx.chapterTitle` | 章节标题 | `章节标题：${...}` |
| `ctx.intro` | 故事简介 | `故事简介：` 段（注：`intro` 未在 `PlayTipContext` 接口中声明，运行时若传入可取用，否则「（无）」） |
| `ctx.globalBackground` | 世界初始全局背景 | `故事全局背景：` 段 |
| `ctx.dynamicGlobalBackground` | 记忆管理器维护的动态背景 | `故事当前动态背景（记忆管理器维护）：` 段 |
| `ctx.taskTitle` | 当前任务标题 | `当前任务：- 标题：...` |
| `ctx.taskObjective` | 当前任务目标 | `当前任务：- 目标：...` |
| `ctx.taskProcess` | 当前任务推进过程 | `当前任务：- 推进过程：...` |
| `ctx.playerCard` | 玩家参数卡 | `玩家参数卡：` 段 |
| `ctx.npcCards` | 可用 NPC 参数卡 | `可用角色（NPC）：` 段 |
| `ctx.recentDialogue` | 最近对话 | `最近对话：` 段 |
| `ctx.userId` | 用户 ID | 仅用于模型选择 / 日志，不进 prompt |
