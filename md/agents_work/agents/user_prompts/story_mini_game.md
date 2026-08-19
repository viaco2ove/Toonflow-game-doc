# story_mini_game — User Prompt 完整构造摘录

> 本文件仅摘录「用户提示词（user prompt）的完整构造」相关代码，全部为源文件逐字摘录。
> 源文件（只读）：
> - `toonflow-game-app/src/modules/game-runtime/services/MiniGameIntentService.ts`
> - `toonflow-game-app/src/modules/game-runtime/engines/MiniGameController.ts`
> - `toonflow-game-app/src/agents/story/mini_game/index.ts`

## 1. System Prompt 来源

主 prompt：`fixDB.prompts.ts` 的 `PROMPT_STORY_MINI_GAME`（完整原文已存 `../system_prompts/PROMPT_STORY_MINI_GAME.md`，此处仅引用，不复制）。

8 个子类型 prompt 常量（各自完整原文已存 `../system_prompts/` 对应文件，仅列出文件引用，不抄）：

- `PROMPT_STORY_MINI_GAME_BATTLE` → `../system_prompts/PROMPT_STORY_MINI_GAME_BATTLE.md`
- `PROMPT_STORY_MINI_GAME_FISHING` → `../system_prompts/PROMPT_STORY_MINI_GAME_FISHING.md`
- `PROMPT_STORY_MINI_GAME_WEREWOLF` → `../system_prompts/PROMPT_STORY_MINI_GAME_WEREWOLF.md`
- `PROMPT_STORY_MINI_GAME_CULTIVATION` → `../system_prompts/PROMPT_STORY_MINI_GAME_CULTIVATION.md`
- `PROMPT_STORY_MINI_GAME_MINING` → `../system_prompts/PROMPT_STORY_MINI_GAME_MINING.md`
- `PROMPT_STORY_MINI_GAME_RESEARCH_SKILL` → `../system_prompts/PROMPT_STORY_MINI_GAME_RESEARCH_SKILL.md`
- `PROMPT_STORY_MINI_GAME_ALCHEMY` → `../system_prompts/PROMPT_STORY_MINI_GAME_ALCHEMY.md`
- `PROMPT_STORY_MINI_GAME_UPGRADE_EQUIPMENT` → `../system_prompts/PROMPT_STORY_MINI_GAME_UPGRADE_EQUIPMENT.md`

> 子类型 prompt 不在 user message 内，而是在 `loadMiniGamePrompt(gameType)` 中作为 **system prompt** 加载（见下方第 2 节代码）。user message 仅由「玩家自然语言输入 + 当前游戏状态 + 合法动作列表」拼装。

## 2. User Prompt 完整构造（原样摘录）

### 2.1 子类型 prompt 代码映射：gameType → prompt code

`toonflow-game-app/src/agents/story/mini_game/index.ts:27-48`

```ts
export function miniGamePromptCodeByType(gameType: string): string {
  switch (String(gameType || "").trim()) {
    case "battle":
      return STORY_MINI_GAME_PROMPT_CODES.battle;
    case "fishing":
      return STORY_MINI_GAME_PROMPT_CODES.fishing;
    case "werewolf":
      return STORY_MINI_GAME_PROMPT_CODES.werewolf;
    case "cultivation":
      return STORY_MINI_GAME_PROMPT_CODES.cultivation;
    case "mining":
      return STORY_MINI_GAME_PROMPT_CODES.mining;
    case "research_skill":
      return STORY_MINI_GAME_PROMPT_CODES.researchSkill;
    case "alchemy":
      return STORY_MINI_GAME_PROMPT_CODES.alchemy;
    case "upgrade_equipment":
      return STORY_MINI_GAME_PROMPT_CODES.upgradeEquipment;
    default:
      return STORY_MINI_GAME_PROMPT_CODES.router;
  }
}
```

### 2.2 loadMiniGamePrompt(gameType)：子类型专属 prompt 加载逻辑（喂给 system prompt）

`toonflow-game-app/src/modules/game-runtime/services/MiniGameIntentService.ts:78-89`

```ts
async function loadMiniGamePrompt(gameType: string): Promise<string> {
  const promptCode = miniGamePromptCodeByType(gameType);
  const dedicatedRow = await u.db("t_prompts")
    .where("code", promptCode)
    .first("defaultValue", "customValue");
  const dedicatedPrompt = String(dedicatedRow?.customValue || dedicatedRow?.defaultValue || "").trim();
  if (dedicatedPrompt) return dedicatedPrompt;
  const fallbackRow = await u.db("t_prompts")
    .where("code", "story-mini-game")
    .first("defaultValue", "customValue");
  return String(fallbackRow?.customValue || fallbackRow?.defaultValue || "").trim();
}
```

### 2.3 引入 miniGamePromptCodeByType

`toonflow-game-app/src/modules/game-runtime/services/MiniGameIntentService.ts:4`

```ts
import { miniGamePromptCodeByType } from "@/agents/story/mini_game/index";
```

### 2.4 buildMiniGameIntentSchemaPrompt：追加到 system prompt 的 JSON Schema 尾巴

`toonflow-game-app/src/modules/game-runtime/services/MiniGameIntentService.ts:63-69`

```ts
function buildMiniGameIntentSchemaPrompt(): string {
  return `\n请按照以下 JSON Schema 格式返回结果:\n${JSON.stringify(
    z.toJSONSchema(z.object(miniGameIntentSchema)),
    null,
    2,
  )}\n只返回结果，不要将Schema返回。`;
}
```

### 2.5 buildMiniGameIntentPrompt：user message 的真正构造器

将「玩家自然语言输入（user_input）+ 当前游戏状态（game_type/phase/status/public_state_summary/latest_narration）+ 合法动作列表（legal_actions）」序列化为 JSON，作为 user message 发出。

`toonflow-game-app/src/modules/game-runtime/services/MiniGameIntentService.ts:124-139`

```ts
function buildMiniGameIntentPrompt(input: ResolveMiniGameIntentInput): string {
  return JSON.stringify({
    game_type: input.gameType,
    phase: input.phase,
    status: input.status,
    public_state_summary: input.publicStateSummary,
    latest_narration: input.latestNarration,
    legal_actions: input.options.map((item) => ({
      action_id: item.actionId,
      label: item.label,
      desc: item.desc,
      aliases: Array.isArray(item.aliases) ? item.aliases : [],
    })),
    user_input: input.userInput,
  }, null, 2);
}
```

### 2.6 resolveMiniGameIntentByAi：invoke 处（组装 system + user 消息并调用模型）

`toonflow-game-app/src/modules/game-runtime/services/MiniGameIntentService.ts:192-284`

```ts
export async function resolveMiniGameIntentByAi(input: ResolveMiniGameIntentInput): Promise<MiniGameIntentResult | null> {
  if (!String(input.userInput || "").trim()) return null;
  if (!Array.isArray(input.options) || !input.options.length) return null;
  const startedAt = Date.now();
  let systemPrompt = "";
  let prompt = "";
  let buildFinishedAt = startedAt;
  try {
    systemPrompt = `${await loadMiniGamePrompt(input.gameType)}${buildMiniGameIntentSchemaPrompt()}`.trim();
    if (!systemPrompt) return null;
    const modelConfig = await resolveMiniGameModel(input.userId);
    prompt = buildMiniGameIntentPrompt(input);
    buildFinishedAt = Date.now();
    const invokeStartedAt = buildFinishedAt;
    const result = await u.ai.text.invoke(
      {
        usageType: "小游戏动作解析",
        usageRemark: input.gameType || "未知小游戏",
        usageMeta: {
          stage: "storyMiniGameModel",
          gameType: input.gameType,
          phase: input.phase,
          status: input.status,
        },
        plainTextOutput: true,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        maxRetries: 0,
      },
      modelConfig as any,
    );
    const invokeFinishedAt = Date.now();
    const rawResponse = String((result as any)?.text || "").trim();
    const parsedObject = rawResponse ? parse(rawResponse) : null;
    const rawObject = parsedObject && typeof parsedObject === "object"
      ? (parsedObject as Record<string, unknown>)
      : null;
    const tokenUsage = readMiniGameIntentTokenUsage(result);
    const logMeta: MiniGameIntentLogMeta = {
      systemPrompt,
      userPrompt: prompt,
      rawResponse,
      tokenUsage,
      timing: {
        buildMs: Math.max(0, buildFinishedAt - startedAt),
        invokeMs: Math.max(0, invokeFinishedAt - invokeStartedAt),
        totalMs: Math.max(0, invokeFinishedAt - startedAt),
      },
    };
    const normalized = normalizeMiniGameIntentResult(rawObject as Record<string, unknown> | null, input.options, logMeta);
    DebugLogUtil.logMiniGamePromptStats("story:mini_game:stats", {
      gameType: input.gameType,
      phase: input.phase,
      status: input.status,
      systemPrompt,
      userPrompt: prompt,
      rawResponse,
      tokenUsage,
      timing: logMeta.timing,
      runtimeError: null,
    });
    DebugLogUtil.log("story:mini_game:agent", JSON.stringify({
      gameType: input.gameType,
      phase: input.phase,
      status: input.status,
      input: input.userInput,
      actionId: normalized?.actionId || "",
      targetName: normalized?.targetName || "",
      reason: normalized?.reason || "",
    }));
    return normalized;
  } catch (error) {
    DebugLogUtil.logMiniGamePromptStats("story:mini_game:stats", {
      gameType: input.gameType,
      phase: input.phase,
      status: input.status,
      systemPrompt,
      userPrompt: prompt,
      rawResponse: "",
      tokenUsage: null,
      timing: {
        buildMs: Math.max(0, buildFinishedAt - startedAt),
        invokeMs: Math.max(0, Date.now() - buildFinishedAt),
        totalMs: Math.max(0, Date.now() - startedAt),
      },
      runtimeError: error,
    });
    DebugLogUtil.log("story:mini_game:agent:error", String((error as Error)?.message || error || ""));
    return null;
  }
}
```

### 2.7 MiniGameController 调用点 A：战斗子类型（resolveBattleActionByAgent）

输入由 `ctx.playerMessage`（玩家自然语言输入）、`session`（当前游戏状态）、`buildMiniGameIntentOptions`（合法动作列表）拼装后传入 `resolveMiniGameIntentByAi`。

`toonflow-game-app/src/modules/game-runtime/engines/MiniGameController.ts:1846-1892`

```ts
async function resolveBattleActionByAgent(
  session: JsonRecord,
  rulebook: MiniGameRulebook,
  ctx: MiniGameControllerInput,
  latestNarration: string,
): Promise<{ actionId: string; targetName: string; resolverSource: string; resolverReason: string; logMeta?: MiniGameIntentLogMeta | null } | null> {
  const options = buildMiniGameIntentOptions(session, rulebook);
  const intent = await resolveMiniGameIntentByAi({
    userId: ctx.userId,
    gameType: rulebook.gameType,
    phase: scalarText(session.phase),
    status: scalarText(session.status),
    publicStateSummary: battleStatusSummary(session),
    latestNarration,
    userInput: ctx.playerMessage,
    options: options.map((item) => ({
      actionId: item.action_id,
      label: item.label,
      desc: item.desc,
      aliases: item.aliases || [],
    })),
  });
  if (!intent) return null;
  const logMeta = intent.logMeta || null;
  if (intent.actionId === "view_status" || intent.actionId === "guard" || intent.actionId === "recover") {
    return {
      actionId: intent.actionId,
      targetName: intent.targetName,
      resolverSource: "ai",
      resolverReason: intent.reason,
      logMeta,
    };
  }
  if (intent.actionId === "attack" || intent.actionId === "skill") {
    const explicitTarget = resolveBattleTargetByName(session, intent.targetName);
    const fallbackTarget = explicitTarget || resolveBattleTextTarget(session, intent.targetName || ctx.playerMessage);
    if (!fallbackTarget) return null;
    return {
      actionId: `${intent.actionId}:${scalarText(fallbackTarget.enemy_id)}`,
      targetName: scalarText(fallbackTarget.name),
      resolverSource: "ai",
      resolverReason: intent.reason,
      logMeta,
    };
  }
  return null;
}
```

### 2.8 MiniGameController 调用点 B：通用子类型（挖矿/修炼/钓鱼/狼人/炼丹/研究技能/强化装备等）

该调用点为所有非战斗显式子类型共用，输入拼装逻辑与战斗子类型一致（`input.playerMessage` + `activeSession` 状态 + `options` 合法动作列表）。

`toonflow-game-app/src/modules/game-runtime/engines/MiniGameController.ts:6359-6373`

```ts
  const aiIntent = isExactRuleMatch ? null : await resolveMiniGameIntentByAi({
    userId: input.userId,
    gameType: rulebook.gameType,
    phase: scalarText(activeSession.phase),
    status: scalarText(activeSession.status),
    publicStateSummary: summarizePublicState(asRecord(activeSession.public_state)),
    latestNarration: scalarText(asRecord(root.ui).narration),
    userInput: input.playerMessage,
    options: options.map((item) => ({
      actionId: item.action_id,
      label: item.label,
      desc: item.desc,
      aliases: item.aliases || [],
    })),
  });
```

> 说明：8 个子类型的 user message 拼装逻辑**完全相同**（统一走 `buildMiniGameIntentPrompt`），差异仅在 `gameType` 字段值不同，进而通过 `loadMiniGamePrompt` 决定注入哪一条「子类型 prompt」到 system prompt。因此不存在"不同子类型不同 user 拼装"的分支。

## 3. 注入变量清单

### 3.1 User message 模板注入变量（`buildMiniGameIntentPrompt` 序列化输出）

| 变量（JSON key） | 来源（ResolveMiniGameIntentInput 字段） | 含义 |
|---|---|---|
| `game_type` | `input.gameType` | 小游戏类型（battle/fishing/werewolf/cultivation/mining/research_skill/alchemy/upgrade_equipment），决定子类型 prompt 选择 |
| `phase` | `input.phase` | 当前阶段 |
| `status` | `input.status` | 当前状态 |
| `public_state_summary` | `input.publicStateSummary` | 当前游戏公开状态摘要（如 `battleStatusSummary(session)` / `summarizePublicState(...)`） |
| `latest_narration` | `input.latestNarration` | 最近一次旁白 |
| `legal_actions` | `input.options` | 合法动作列表，每项含 `action_id` / `label` / `desc` / `aliases` |
| `user_input` | `input.userInput`（即 `ctx.playerMessage` / `input.playerMessage`） | 玩家自然语言输入 |

### 3.2 System prompt 注入变量

| 注入内容 | 来源 | 说明 |
|---|---|---|
| 子类型专属 prompt | `loadMiniGamePrompt(gameType)` → `miniGamePromptCodeByType(gameType)` 映射到 `t_prompts.code` | 按 gameType 取专属 prompt，缺失则回退 `story-mini-game` 通用路由 prompt |
| JSON Schema 尾巴 | `buildMiniGameIntentSchemaPrompt()` | 追加在子类型 prompt 之后，约束输出格式 |
