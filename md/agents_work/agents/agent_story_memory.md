# Agent: story_memory（记忆管理器）

> 来源：运行时核心 Agent。提示词常量 `PROMPT_STORY_MEMORY`（`fixDB.prompts.ts:1347`，约 116 行），导出行 2333。
> 总览见 `../03_多Agent系统总述.md`；由 orchestrator 后台触发（见 `agent_story_orchestrator.md` §7）。

---

## 1. 角色定位

维护**长期剧情摘要 + 角色动态参数卡**（等级/经验/HP/MP/物品/技能/装备/身份/当前行为），提炼有用新信息、合并冲突。

---

## 2. 提示词原文（关键摘要，`:1347-1462`）

> 你是记忆管理器。你负责管理整个故事的长期记忆，不只更新剧情摘要，还要维护角色动态参数卡。

- **数值计算公式强制规则（所有数值必须输出纯数字）**：满血 HP = 100 + 等级*10 + 道具/技能加成；满蓝 MP 同理；攻击 = 10 + 等级*10 + …；防御 = 1 + 等级*10 + …（`:1409-1417`）。
- **HP/MP 恢复判定**：睡觉/休息/服药 → 直接改 hp/mp 为满值，文字入 other（`:1419-1424`）。
- **经验值 & 升级流程**：`next_level_exp = 当前level*100`；升级 5 步含重算 hp/mp（`:1426-1436`）。
- **NPC 当前行为维护**：写入 `role_key_information` 末尾，格式 `【当前行为】在{地点}{动作}`（`:1374-1387`）。
- **输出格式硬性约束**：
  1. 输出仅允许单一标准 JSON 对象。
  2. JSON 顶层固定 6 个字段：`summary`/`facts`/`tags`/`player_card_patch`/`npc_card_patches`/`dynamic_world_global_background`。
  3. 角色补丁仅允许字段：`raw_setting, personality, appearance, voice, skills, items, equipment, other, gender, age, level, level_desc, exp, next_level_exp, hp, mp, money, role_key_information`。
  4. 字段数值强制规范：`age`、`level`、`exp`、`next_level_exp`、`hp`、`mp`、`money` 必须为**纯数字类型**（`:1446-1462`）。

---

## 3. 出参格式（JSON）

```json
{
  "summary": "...",
  "facts": ["..."],
  "tags": ["..."],
  "player_card_patch": {},
  "npc_card_patches": {},
  "dynamic_world_global_background": "..."
}
```

---

## 4. 入参

来自 `runStoryMemoryManager`（`NarrativeOrchestrator.ts:5097`）的 payload（`:5119-5156`）：

| 变量 | 说明 |
|---|---|
| `worldName` | 世界名 |
| `worldGlobalBackground` | 全局背景（截断 2400/4800） |
| `dynamicWorldGlobalBackground` | 动态全局背景 |
| `chapterTitle` | 章节标题 |
| `currentEvent` | 当前事件（`buildPromptEventContextTextPayload`） |
| `eventDeltaText` | 本轮增量 |
| `recentDialogue` | 近期对话（4/10 条截断） |
| `currentMemory`/`currentFacts`/`currentTags` | 当前记忆（截断） |
| `playerCard`/`narratorCard`/`npcCards` | 角色卡（`buildMemoryRoleCardSummary`） |
| `worldClock` | **仅 free_runtime 模式注入**（`:5143`） |
| `worldBookEntries` | 按 eventDelta+dialogue 注入（`:5146`） |

---

## 5. 调用位置

- `u.ai.text.invoke`（`:5165`），`usageType:"记忆管理"`，`plainTextOutput:true`。
- **模型键**：`storyMemoryModel`（`resolveTextStageModel(input.userId, "storyMemoryModel")` `:5109`）。

---

## 6. 出参处理（`:5199-5241`）

- `rawText = unwrapModelText(result.text)`
- `objectLike = parseJsonSafe(rawText, {})`；`fieldMap = parseFieldMap(rawText)`
- `playerCardPatch = sanitizeMemoryParameterCardPatch(...)`；`npcCardPatches` 解析为 `{roleId, roleName, roleType, patch}` 数组并 sanitize（严格只允许白名单字段）。
- `MemoryManagerResult`：`summary`/`facts`/`tags`/`dynamicWorldGlobalBackground`/`playerCardPatch`/`npcCardPatches`/`source:"ai"`。
- 由 `runNarrativeOrchestrator` 消费（`shouldForceMemoryRefresh` `:5046` 决定是否触发），写回 `state.memorySummary`/`memoryFacts`/`memoryTags` 与角色卡（参数卡刷新最终落库经 `SessionService.scheduleSessionRoleParameterCardRefresh`）。
