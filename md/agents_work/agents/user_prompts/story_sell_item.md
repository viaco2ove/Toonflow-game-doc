# story_sell_item — User Prompt 完整构造摘录

> 本文件仅摘录「用户提示词（user prompt）的完整构造」相关代码，全部为源文件逐字摘录。
> 源文件（只读）：
> - `toonflow-game-app/src/modules/game-runtime/services/MiniGameSellService.ts`

## 1. System Prompt 来源

主 prompt：`fixDB.prompts.ts` 的 `PROMPT_STORY_SELL_ITEM`（完整原文已存 `../system_prompts/PROMPT_STORY_SELL_ITEM.md`，此处仅引用，不复制）。

此外，当数据库（`t_prompts` 表 `code = "story-sell-item"`）无配置时，使用代码内置的默认 system prompt 常量 `DEFAULT_SELL_SYSTEM_PROMPT`（见 2.2）。

## 2. User Prompt 完整构造（原样摘录）

### 2.1 loadSellPrompt：从数据库加载 system prompt

`toonflow-game-app/src/modules/game-runtime/services/MiniGameSellService.ts:73-78`

```ts
async function loadSellPrompt(): Promise<string> {
  const row = await u.db("t_prompts")
    .where("code", "story-sell-item")
    .first("defaultValue", "customValue");
  return String(row?.customValue || row?.defaultValue || "").trim();
}
```

### 2.2 DEFAULT_SELL_SYSTEM_PROMPT：数据库无配置时的默认 system prompt

`toonflow-game-app/src/modules/game-runtime/services/MiniGameSellService.ts:83-85`

```ts
const DEFAULT_SELL_SYSTEM_PROMPT = `你是一个物品收购商人，帮助玩家将背包中的物品出售换钱。
语言风格：简洁自然，符合修仙/古风世界观。
输出要求：只匹配背包中实际存在的物品，数量不能超过持有量。`;
```

### 2.3 SELL_PRICING_RULES：定价规则表（喂给 user message 的「定价规则」段）

`toonflow-game-app/src/modules/game-runtime/services/MiniGameSellService.ts:91-98`

```ts
export const SELL_PRICING_RULES = {
  fish: { normal: 2, rare: 5, desc: "鱼：普通=2金，稀有=5金" },
  ore: { unit: 1, desc: "矿石：每个1金" },
  treasure: { price: 10, desc: "宝物：10金" },
  loot: { price: 3, desc: "战利品：3金" },
  pill: { price: 5, desc: "丹药：5金" },
  other: { price: 1, desc: "其他物品：1金" },
};
```

### 2.4 buildSellIntentSchemaPrompt：追加到 system prompt 的 JSON Schema 尾巴

`toonflow-game-app/src/modules/game-runtime/services/MiniGameSellService.ts:43-49`

```ts
function buildSellIntentSchemaPrompt(): string {
  return `\n请按照以下 JSON Schema 格式返回结果:\n${JSON.stringify(
    z.toJSONSchema(z.object(sellIntentSchema)),
    null,
    2,
  )}\n只返回结果，不要将Schema返回。`;
}
```

### 2.5 buildSellPrompt：user message 的真正构造器

将「玩家背包（inventory）+ 玩家输入（userInput）+ 定价规则（SELL_PRICING_RULES）+ 任务/匹配规则」拼装为 user message。

`toonflow-game-app/src/modules/game-runtime/services/MiniGameSellService.ts:100-129`

```ts
function buildSellPrompt(userInput: string, inventory: InventoryItem[]): string {
  const inventoryList = inventory.map((item, idx) => {
    const amount = item.amount || 1;
    const rarity = item.rarity || "normal";
    return `[${idx + 1}] ${item.name} | 种类: ${item.kind || "other"} | 数量: ${amount} | 稀有度: ${rarity}`;
  }).join("\n");

  const pricingDesc = Object.values(SELL_PRICING_RULES).map((r: any) => r.desc).join("\n");

  return `## 玩家背包（inventory）
${inventoryList || "(空)"}

## 玩家输入
"${userInput}"

## 定价规则
${pricingDesc}

## 任务
1. 根据玩家输入，从背包中匹配要出售的物品
2. 确定出售数量（不能超过背包中的实际数量）
3. 按定价规则计算总价
4. 生成简洁自然的交易旁白（50字以内）

## 匹配规则
- 如果玩家说"全部"，则出售背包中所有物品
- 如果玩家说"全部鱼"，则匹配所有种类为fish或名称含"鱼"的物品
- 如果玩家指定数量（如"3条"），但背包不足，只卖背包中有的数量
- 如果背包为空，返回空的 sell_items 和 0 总价`;
}
```

### 2.6 resolveSellIntent：invoke 处（组装 system + user 消息并调用模型）

`toonflow-game-app/src/modules/game-runtime/services/MiniGameSellService.ts:200-231`

```ts
export async function resolveSellIntent(
  userInput: string,
  inventory: InventoryItem[],
  userId: number,
): Promise<SellIntentResult | null> {
  if (!String(userInput || "").trim()) return null;
  if (!Array.isArray(inventory)) return null;

  const startedAt = Date.now();
  try {
    const modelConfig = await resolveSellModel(userId);
    // 从数据库加载提示词，无配置时使用默认提示词
    const dbPrompt = await loadSellPrompt();
    const systemPrompt = dbPrompt || DEFAULT_SELL_SYSTEM_PROMPT;

    const userPrompt = buildSellPrompt(userInput, inventory);
    const schemaPrompt = buildSellIntentSchemaPrompt();

    const result = await u.ai.text.invoke(
      {
        usageType: "物品出售解析",
        usageRemark: "sell-command",
        usageMeta: { stage: "storyMiniGameModel" },
        plainTextOutput: true,
        messages: [
          { role: "system", content: systemPrompt + schemaPrompt },
          { role: "user", content: userPrompt },
        ],
        maxRetries: 0,
      },
      modelConfig as any,
    );

    const rawResponse = String((result as any)?.text || "").trim();
    if (!rawResponse) return null;

    const parsedObject = rawResponse ? parse(rawResponse) : null;
    const rawObject = parsedObject && typeof parsedObject === "object"
      ? (parsedObject as Record<string, unknown>)
      : null;

    // 提取 token usage
    const usage = (result as any)?.usage;
    let tokenUsage: { inputTokens: number; outputTokens: number; reasoningTokens: number } | null = null;
    if (usage && typeof usage === "object") {
      tokenUsage = {
        inputTokens: Number(usage.inputTokens || 0) || 0,
        outputTokens: Number(usage.outputTokens || 0) || 0,
        reasoningTokens: Number(usage.outputTokenDetails?.reasoningTokens || usage.reasoningTokens || 0) || 0,
      };
    }

    const invokeMs = Date.now() - startedAt;

    if (DebugLogUtil.isDebugLogEnabled()) {
      console.log("[SellService] 原始响应:", rawResponse);
    }

    const normalized = normalizeSellIntentResult(rawObject, inventory);
    if (DebugLogUtil.isDebugLogEnabled()) {
      console.log("[SellService] 解析结果:", normalized);
      console.log("[SellService] 耗时:", invokeMs, "ms");
    }

    if (normalized) {
      normalized.tokenUsage = tokenUsage;
      normalized.timing = { buildMs: 0, invokeMs, totalMs: invokeMs };
      normalized.requestPreview = userPrompt;
      normalized.responsePreview = rawResponse;
      normalized._systemPrompt = systemPrompt + schemaPrompt;
    }

    return normalized;
  } catch (err) {
    console.error("[SellService] 解析失败:", err);
    return null;
  }
}```

## 3. 注入变量清单

### 3.1 User message 模板注入变量（`buildSellPrompt` 输出）

| 变量 | 来源 | 含义 |
|---|---|---|
| `## 玩家背包（inventory）` 列表 | `inventory`（`InventoryItem[]`） | 背包物品，逐条渲染为 `[序号] name \| 种类: kind \| 数量: amount \| 稀有度: rarity`；空则显示 `(空)` |
| `## 玩家输入` | `userInput` | 玩家自然语言输入（如 `#卖出 青鱼`） |
| `## 定价规则` | `SELL_PRICING_RULES` 的 `desc` 字段拼接 | 各物品类型定价说明 |
| `## 任务` / `## 匹配规则` | 模板固定文案 | 任务步骤与匹配规则，无外部变量注入 |

`InventoryItem` 字段（`MiniGameSellService.ts:6-11`）：

```ts
export interface InventoryItem {
  name: string;
  kind?: string;
  amount?: number;
  rarity?: string;
}
```

### 3.2 System prompt 注入变量

| 注入内容 | 来源 | 说明 |
|---|---|---|
| system prompt 正文 | `loadSellPrompt()`（数据库 `t_prompts.code = "story-sell-item"`） | 有配置用数据库值，无配置回退 `DEFAULT_SELL_SYSTEM_PROMPT` |
| JSON Schema 尾巴 | `buildSellIntentSchemaPrompt()` | 追加在 system prompt 之后，约束输出格式 |
