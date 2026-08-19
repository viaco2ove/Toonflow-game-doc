# Agent: story_mini_game（小游戏动作解析）+ story_sell_item（物品出售）

> 来源：运行时 Agent。提示词常量均在 `fixDB.prompts.ts`：
> - `PROMPT_STORY_MINI_GAME`(`:1573` 通用) + 8 子类型 `PROMPT_STORY_MINI_GAME_BATTLE`(1610)/`_FISHING`(1623)/`_WEREWOLF`(1628)/`_CULTIVATION`(1633)/`_MINING`(1638)/`_RESEARCH_SKILL`(1643)/`_ALCHEMY`(1648)/`_UPGRADE_EQUIPMENT`(1653)，导出 2336–2344。
> - `PROMPT_STORY_SELL_ITEM`(`:1658`)，导出 2345。
> 总览见 `../03_多Agent系统总述.md`。

---

## 1. 角色定位

把玩家在小游戏里的**自然语言输入**识别成**程序可执行的局内动作**（不含剧情推进）。`story_sell_item` 是收购商人，把"卖出"自然语言解析成背包内可执行的出售清单。

---

## 2. 提示词原文（关键摘要）

**通用版（`:1573`）**
> 你是"小游戏动作解析 agent"。你的职责不是推进剧情，而是把用户在小游戏里的自然语言输入，识别成程序可执行的局内动作。

- **输出要求**：只能输出一个 JSON 对象，字段固定为 `action_id` / `target_name` / `reason`（`:1588-1594`）。
- **约束**：① `action_id` 必须优先从"当前合法动作列表"里选；② 不编造不存在的动作；③ 闲聊则 `action_id` 输出空串；④ 语义归一到真实动作；⑤ `reason` 要简短（`:1596-1601`）。

**子类型侧重点**
- battle(1610)：攻击、技能攻击、防御、调息回气、查看状态，及敌人目标名称……满血=100+等级*10+…
- fishing(1623)：抛竿、收杆、继续钓鱼、查看状态……"乾坤大挪移钓法"这类口语只要在垂钓就归一。
- werewolf(1628)：发言、进入投票、投票目标、查验、救人、毒人、查看记录。
- cultivation(1633)：吐纳、观想、稳息、服丹、冲关、收功，识别修炼目标/功法/陪练角色。
- mining(1638)：勘探、开采、精挖、支护、清障、休息、撤离，识别协助角色。
- research_skill(1643)：围绕技能名称/原理/测试/改良，保留协助者语义。
- alchemy(1648)：药方/药材/火候/凝丹，保留看火护炉语义。
- upgrade_equipment(1653)：锻打/注灵/材料/稳定度，保留协助强化语义。

**出售（`:1658-1660`）**
> 你是一个物品收购商人，帮助玩家将背包中的物品出售换钱。语言风格：简洁自然，符合修仙/古风世界观。输出要求：只匹配背包中实际存在的物品，数量不能超过持有量。

---

## 3. 入参

**mini_game**（`resolveMiniGameIntentByAi` `MiniGameIntentService.ts:192`，输入 `ResolveMiniGameIntentInput` `:14`）：
- `gameType`/`phase`/`status`/`publicStateSummary`/`latestNarration`/`userInput`/`options[]`（options = "合法动作列表"，含 actionId/label/desc/aliases）。

**sell**（`resolveSellIntent(userInput, inventory, userId)` `:200`）：
- `inventory` 经 `buildSellPrompt`（`:100`）列成 `[idx] 名称|种类|数量|稀有度`；注入 `SELL_PRICING_RULES`（鱼/矿石/宝物/战利品/丹药/其他 单价表 `:91`）。

---

## 4. 入参处理

**mini_game**：
- `systemPrompt = loadMiniGamePrompt(gameType) + buildMiniGameIntentSchemaPrompt()`（`:200`）。
- `loadMiniGamePrompt`(`:78`) 按 `miniGamePromptCodeByType(gameType)`（`agents/story/mini_game/index.ts:27`）映射到专属 code（battle→`story-mini-game-battle` 等），**无专属则回退 `story-mini-game`**。
- `schemaPrompt` 把 `{action_id,target_name,reason}` 的 zod JSON Schema 追加进 system prompt（`:63`）。
- `userPrompt = JSON.stringify({game_type,phase,status,public_state_summary,latest_narration,legal_actions,user_input})`（`:124-138`）。

**sell**：
- `systemPrompt = dbPrompt || DEFAULT_SELL_SYSTEM_PROMPT`（`:213`）；`userPrompt = buildSellPrompt(...)`；`messages = [{system: systemPrompt+schemaPrompt},{user: userPrompt}]`（`:225`）。

---

## 5. 调用位置

- mini_game：`u.ai.text.invoke`（`:206`），`usageType:"小游戏动作解析"`，`plainTextOutput:true`。
- sell：`u.ai.text.invoke`（`:218`），`usageType:"物品出售解析"`。
- **模型键**：两者均用 `resolveSellModel`/`resolveMiniGameModel`（`:54`/`:101`）：`storyMiniGameModel` → 回退 `storyEventProgressModel` → `storyOrchestratorModel`。

---

## 6. 出参格式

- mini_game：`{action_id, target_name, reason}`（JSON）。
- sell：`{sell_items:[{item_name,quantity,unit_price,subtotal}], total_money, narration, reasoning}`（zod schema 由 `buildSellIntentSchemaPrompt` `:43` 追加）。

---

## 7. 出参处理

**mini_game**（`:226-243`）：
- `rawResponse = result.text` → `parse(rawResponse)`（`best-effort-json-parser`）。
- `normalizeMiniGameIntentResult`（`:148`）：**要求 `action_id` 必须命中 `options` 列表，否则返回 null**；返回 `{actionId,targetName,reason}`。
- 回传给 `MiniGameController.ts` 状态机（`buildMiniGameIntentOptions` 提供合法动作 `:1826`）驱动推进。

**sell**（`:236-258`）：
- `parse(rawResponse)` → `normalizeSellIntentResult`（`:134`）：逐条校验 `item_name` 在背包且 `quantity≤持有量`，提取 `totalMoney`/`narration`；返回 `{sellItems,totalMoney,narration}` 驱动金币结算。
