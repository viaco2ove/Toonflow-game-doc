# StoryUpdateAlignAgent — User Prompt 完整构造

## 1. System Prompt 来源

- 引用：`../system_prompts/story-update-align-agent.md`（运行期 DB `code = "story-update-align-agent"`，对应常量 `PROMPT_STORY_UPDATE_ALIGN`）
- 加载方式：`loadTaskPrompt("story-update-align-agent", FALLBACK_SYSTEM)`（StoryUpdateAlignAgent.ts:95），fallback 为该文件内 `FALLBACK_SYSTEM` 常量（不在此抄原文）。

## 2. User Prompt 完整构造

### 2.1 system / user 拼装入口 `runStoryUpdateAlignAgent()`

`D:\Users\viaco\tools\Toonflow-game\toonflow-game-app\src\modules\game-runtime\agents\storyUpdateAlign\StoryUpdateAlignAgent.ts:94-128`

```ts
export async function runStoryUpdateAlignAgent(input: StoryUpdateAlignInput): Promise<StoryUpdateAlignResult> {
  const systemPrompt = await loadTaskPrompt("story-update-align-agent", FALLBACK_SYSTEM);

  const userPrompt = `请对齐以下存档进度到新版章节，严格输出 JSON。

旧版阶段：
${JSON.stringify(input.oldPhases, null, 2)}

新版阶段：
${JSON.stringify(input.newPhases, null, 2)}

当前进度：
${JSON.stringify(input.currentProgress, null, 2)}

请输出：
{
  "phaseMapping": { "...": "..." },
  "newPhaseId": "...",
  "newEventSummary": "...",
  "warnings": [],
  "summary": "..."
}`;

  const startedAt = Date.now();
  try {
    const modelConfig = await u.getPromptAi("storyMemoryModel", input.userId);
    const result = await u.ai.text.invoke({
      plainTextOutput: true,
      usageType: "存档智能对齐",
      usageRemark: "StoryUpdateAlignAgent",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }, modelConfig as any) as any;

    const rawText = String(result?.text || "").trim();
    const latencyMs = Date.now() - startedAt;

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[StoryUpdateAlignAgent] AI 未返回 JSON：", rawText.slice(0, 200));
      return fallback(input, latencyMs);
    }
    let obj: any;
    try {
      obj = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn("[StoryUpdateAlignAgent] JSON 解析失败：", e);
      return fallback(input, latencyMs);
    }
    const parsed = AI_SCHEMA.safeParse(obj);
    if (!parsed.success) {
      console.warn("[StoryUpdateAlignAgent] schema 校验失败：", parsed.error);
      return fallback(input, latencyMs);
    }

    console.log("[StoryUpdateAlignAgent] ok", JSON.stringify({
      newPhaseId: parsed.data.newPhaseId,
      latencyMs,
      warnings: parsed.data.warnings.length,
    }));
    return { ...parsed.data, source: "ai", latencyMs };
  } catch (e) {
    const latencyMs = Date.now() - startedAt;
    console.error("[StoryUpdateAlignAgent] AI调用失败", e);
    return fallback(input, latencyMs);
  }
}```

## 3. 注入变量清单

| 变量 | 来源（StoryUpdateAlignInput 字段） | 在 user prompt 中的位置 |
|------|----------------------------------|------------------------|
| `input.oldPhases` | 旧版阶段列表 `[{phaseId, phaseIndex, kind, label}]` | `旧版阶段：` 段（`JSON.stringify(..., null, 2)`） |
| `input.newPhases` | 新版阶段列表 `[{phaseId, phaseIndex, kind, label}]` | `新版阶段：` 段 |
| `input.currentProgress` | 当前进度 `{phaseId, phaseIndex, eventIndex, eventSummary, eventKind, eventStatus}` | `当前进度：` 段 |
| `input.userId` | 用户 ID | 仅用于模型选择 / 日志，不进 prompt |
