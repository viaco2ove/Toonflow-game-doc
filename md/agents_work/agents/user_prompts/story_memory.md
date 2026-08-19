# story_memory — User Prompt 完整构造摘录

源文件：`toonflow-game-app/src/modules/game-runtime/engines/NarrativeOrchestrator.ts`

## 1. System Prompt 来源

- 运行时从数据库 `t_prompts`（code = `story-memory`）读取，函数 `loadStoryPrompts()`（`NarrativeOrchestrator.ts:3771`）返回字段 `storyMemory`。
- 该字段的兜底常量来自 `fixDB.prompts.ts` 的 `_PROMPT_STORY_MEMORY`（对应导出常量 `PROMPT_STORY_MEMORY`，`fixDB.prompts.ts:1347` / `:2333`）。
- 完整 system 原文已单独存于 `../system_prompts/PROMPT_STORY_MEMORY.md`，此处仅引用路径，不抄原文。
- 组装逻辑见 `buildMemorySystemPrompt()`（`NarrativeOrchestrator.ts:2571`），优先复用 DB prompt，无则用文件内保底版本。

## 2. User Prompt 完整构造（原样摘录）

主构建函数为 `buildMemoryUserPrompt()`（区分 compact / full 两种模式），依赖下列全部 `buildMemory*` 系列及记忆参数卡辅助函数。

### buildLimitedMemoryText（NarrativeOrchestrator.ts:731 — 734）

```ts
function buildLimitedMemoryText(value: unknown, compactLimit: number, fullLimit: number, compactMode: boolean): string {
  const maxItems = compactMode ? compactLimit : fullLimit;
  return uniqueTextList(Array.isArray(value) ? value : [], maxItems).join("；");
}
```

### buildMemoryRoleCardSummary（NarrativeOrchestrator.ts:737 — 784）

```ts
// 记忆管理器不需要完整参数卡原文，只需要足以推断成长变化的关键信息。
function buildMemoryRoleCardSummary(input: {
  roleId: string;
  roleName: string;
  roleType: string;
  card: JsonRecord;
}, compactMode: boolean): JsonRecord {
  // 首轮开场或旧存档恢复时，运行态里可能暂时还没有完整参数卡；
  // 这里统一补一张保底卡，避免 compact prompt 把 `card` 压成空串，导致记忆管理像在“盲开局”。
  const rawCard = asRecord(input.card);
  const card = hasRecordKeys(rawCard)
    ? rawCard
    : buildDefaultRoleParameterCardForMemory({
      role: {
        name: input.roleName,
        roleType: input.roleType,
        parameterCardJson: rawCard,
      },
      fallbackName: input.roleName,
    });
  const detailedCard = {
    name: normalizeScalarText(card.name),
    raw_setting: normalizeScalarText(card.raw_setting || card.rawSetting),
    gender: normalizeScalarText(card.gender),
    age: normalizeOptionalCardNumber(card.age),
    level: normalizeOptionalCardNumber(card.level),
    level_desc: normalizeScalarText(card.level_desc || card.levelDesc),
    role_key_information: normalizeScalarText(card.role_key_information || card.information),
    personality: normalizeScalarText(card.personality),
    appearance: normalizeScalarText(card.appearance),
    voice: normalizeScalarText(card.voice),
    skills: normalizeCardTextList(card.skills),
    items: normalizeCardTextList(card.items),
    equipment: normalizeCardTextList(card.equipment),
    exp: normalizeOptionalCardNumber(card.exp),
    next_level_exp: normalizeOptionalCardNumber(card.next_level_exp ?? card.nextLevelExp),
    hp: normalizeOptionalCardNumber(card.hp),
    mp: normalizeOptionalCardNumber(card.mp),
    money: normalizeOptionalCardNumber(card.money),
    other: normalizeCardTextList(card.other),
    information: normalizeScalarText(card.information),
  };
  return {
    role_id: input.roleId,
    role_name: input.roleName,
    role_type: sanitizeRoleType(input.roleType),
    card: compactMode ? summarizeParameterCardText(card) : detailedCard,
  };
}
```

### collectMemoryRoleCardSnapshots（NarrativeOrchestrator.ts:787 — 858）

```ts
// 为记忆管理器选出本轮最相关的角色参数卡，避免把整个世界的所有角色都塞进 prompt。
function collectMemoryRoleCardSnapshots(input: {
  world: any;
  state: JsonRecord;
  recentMessages: RuntimeMessageInput[];
}): {
  playerCard: MemoryRoleCardSnapshot | null;
  npcCards: MemoryRoleCardSnapshot[];
  narratorCard: MemoryRoleCardSnapshot | null;
} {
  const allRoles = runtimeStoryRoles(input.world, input.state);
  const messageRoleNames = new Set<string>();
  const messageRoleIds = new Set<string>();
  (Array.isArray(input.recentMessages) ? input.recentMessages : []).forEach((message) => {
    const roleName = normalizeScalarText(message.role);
    const roleType = sanitizeRoleType(message.roleType);
    if (roleName && roleType !== "narrator") {
      messageRoleNames.add(roleName);
    }
  });
  allRoles.forEach((role) => {
    if (messageRoleNames.has(normalizeScalarText(role.name))) {
      messageRoleIds.add(normalizeScalarText(role.id));
    }
  });

  const playerRole = allRoles.find((role) => sanitizeRoleType(role.roleType) === "player") || null;
  const playerCard = playerRole
    ? {
      roleId: normalizeScalarText(playerRole.id) || "player",
      roleName: normalizeScalarText(playerRole.name) || "用户",
      roleType: sanitizeRoleType(playerRole.roleType),
      card: asRecord(playerRole.parameterCardJson),
    }
    : null;

  const narratorRole = allRoles.find((role) => sanitizeRoleType(role.roleType) === "narrator") || null;
  const narratorCard = narratorRole
    ? {
      roleId: normalizeScalarText(narratorRole.id) || "narrator",
      roleName: normalizeScalarText(narratorRole.name) || "旁白",
      roleType: sanitizeRoleType(narratorRole.roleType),
      card: asRecord(narratorRole.parameterCardJson),
    }
    : null;

  const otherCards = allRoles
    .filter((role) => {
      const rt = sanitizeRoleType(role.roleType);
      // player 和 narrator 已单独处理，其余全部归入 otherCards（含 npc/system/general）
      return rt !== "player" && rt !== "narrator";
    })
    .sort((left, right) => {
      // general/system 角色优先（不会被 npc 挤掉）
      const leftIsSpecial = ["general", "system"].includes(sanitizeRoleType(left.roleType));
      const rightIsSpecial = ["general", "system"].includes(sanitizeRoleType(right.roleType));
      if (leftIsSpecial && !rightIsSpecial) return -1;
      if (!leftIsSpecial && rightIsSpecial) return 1;
      const leftMatched = messageRoleIds.has(normalizeScalarText(left.id)) || messageRoleNames.has(normalizeScalarText(left.name));
      const rightMatched = messageRoleIds.has(normalizeScalarText(right.id)) || messageRoleNames.has(normalizeScalarText(right.name));
      if (leftMatched === rightMatched) return 0;
      return leftMatched ? -1 : 1;
    })
    .slice(0, 40)
    .map((role) => ({
      roleId: normalizeScalarText(role.id),
      roleName: normalizeScalarText(role.name),
      roleType: sanitizeRoleType(role.roleType),
      card: asRecord(role.parameterCardJson),
    }));

  return { playerCard, narratorCard, npcCards: otherCards };
}
```

### buildMemoryCurrentEventContent（NarrativeOrchestrator.ts:1817 — 1833）

```ts
function buildMemoryCurrentEventContent(payload: {
  currentEventIndex: number;
  currentEventKind: string;
  currentEventSummary: string;
  currentEventFacts: string;
  currentEventMemorySummary: string;
  currentEventMemoryFacts: string;
}): string {
  return [
    `index:${payload.currentEventIndex || 1}`,
    `kind:${payload.currentEventKind || "scene"}`,
    `summary:${payload.currentEventSummary || "当前事件未命名"}`,
    payload.currentEventFacts ? `facts:${payload.currentEventFacts}` : "",
    payload.currentEventMemorySummary ? `memory_summary:${payload.currentEventMemorySummary}` : "",
    payload.currentEventMemoryFacts ? `memory_facts:${payload.currentEventMemoryFacts}` : "",
  ].filter(Boolean).join("\n") || "无";
}
```

### buildCompactMemoryPromptSections（NarrativeOrchestrator.ts:1836 — 1858）

```ts
// 把紧凑模式的记忆调试块拆开，避免 buildMemoryPromptStats 里堆太多条件拼接。
function buildCompactMemoryPromptSections(payload: {
  currentMemory: string;
  currentFacts: string;
  currentEventContent: string;
  eventDeltaText: string;
  currentTags: string;
  playerCardText: string;
  narratorCardText: string;
  npcCardsText: string;
  recentDialogueText: string;
}): Array<{ title: string; content: string }> {
  return [
    { title: "当前记忆", content: payload.currentMemory || "无" },
    { title: "当前事实", content: payload.currentFacts || "无" },
    { title: "当前事件", content: payload.currentEventContent },
    { title: "事件增量", content: payload.eventDeltaText || "无" },
    { title: "当前标签", content: payload.currentTags || "无" },
    { title: "用户参数卡", content: payload.playerCardText },
    { title: "旁白参数卡", content: payload.narratorCardText },
    { title: "角色动态参数卡列表", content: payload.npcCardsText },
    { title: "新增对话", content: payload.recentDialogueText },
  ];
}
```

### buildFullMemoryPromptSections（NarrativeOrchestrator.ts:1861 — 1887）

```ts
// 把完整模式的记忆调试块拆开，后面如果继续加统计项，不会把主函数再次堆高。
function buildFullMemoryPromptSections(payload: {
  worldName: string;
  chapterTitle: string;
  currentMemory: string;
  currentFacts: string;
  currentEventContent: string;
  eventDeltaText: string;
  currentTags: string;
  playerCardText: string;
  narratorCardText: string;
  npcCardsText: string;
  recentDialogueText: string;
}): Array<{ title: string; content: string }> {
  return [
    { title: "世界", content: payload.worldName ? `名称:${payload.worldName}` : "无" },
    { title: "章节", content: payload.chapterTitle ? `标题:${payload.chapterTitle}` : "无" },
    { title: "当前事件", content: payload.currentEventContent },
    { title: "事件增量", content: payload.eventDeltaText || "无" },
    { title: "现有记忆摘要", content: payload.currentMemory || "无" },
    { title: "当前事实", content: payload.currentFacts || "无" },
    { title: "当前标签", content: payload.currentTags || "无" },
    { title: "用户参数卡", content: payload.playerCardText },
    { title: "旁白参数卡", content: payload.narratorCardText },
    { title: "角色动态参数卡列表", content: payload.npcCardsText },
    { title: "新增对话", content: payload.recentDialogueText },
  ];
}
```

### buildMemoryPromptStats（NarrativeOrchestrator.ts:1890 — 1947）

```ts
// 把记忆管理链路里的上下文拆成可读统计块，便于直接判断“旧记忆为什么被覆盖了”。
function buildMemoryPromptStats(payload: {
  worldName: string;
  chapterTitle: string;
  currentEventIndex: number;
  currentEventKind: string;
  currentEventSummary: string;
  currentEventFacts: string;
  currentEventMemorySummary: string;
  currentEventMemoryFacts: string;
  eventDeltaText: string;
  currentFacts: string;
  currentTags: string;
  recentDialogue: RecentDialogueTurn[];
  currentMemory: string;
  playerCard: JsonRecord | null;
  narratorCard: JsonRecord | null;
  npcCards: JsonRecord[];
}, compactMode: boolean): PromptStatRow[] {
  const currentEventContent = buildMemoryCurrentEventContent(payload);
  const playerCardText = payload.playerCard ? JSON.stringify(payload.playerCard, null, 2) : "无";
  const narratorCardText = payload.narratorCard ? JSON.stringify(payload.narratorCard, null, 2) : "无";
  const npcCardsText = payload.npcCards.length ? JSON.stringify(payload.npcCards, null, 2) : "[]";
  const recentDialogueText = payload.recentDialogue.length ? stringifyRecentDialogue(payload.recentDialogue) : "[]";
  const sections = compactMode
    ? buildCompactMemoryPromptSections({
      currentMemory: payload.currentMemory,
      currentFacts: payload.currentFacts,
      currentEventContent,
      eventDeltaText: payload.eventDeltaText,
      currentTags: payload.currentTags,
      playerCardText,
      narratorCardText,
      npcCardsText,
      recentDialogueText,
    })
    : buildFullMemoryPromptSections({
      worldName: payload.worldName,
      chapterTitle: payload.chapterTitle,
      currentMemory: payload.currentMemory,
      currentFacts: payload.currentFacts,
      currentEventContent,
      eventDeltaText: payload.eventDeltaText,
      currentTags: payload.currentTags,
      playerCardText,
      narratorCardText,
      npcCardsText,
      recentDialogueText,
    });
  return sections.map((section) => {
    const content = section.content || "无";
    return {
      block: section.title,
      content,
      chars: content.length,
      estimatedTokens: estimatePromptTokens(content),
    };
  });
}
```

### buildMemoryCurrentEventLines（NarrativeOrchestrator.ts:2414 — 2432）

```ts
function buildMemoryCurrentEventLines(payload: {
  currentEventIndex: number;
  currentEventKind: string;
  currentEventSummary: string;
  currentEventFacts: string;
  currentEventMemorySummary: string;
  currentEventMemoryFacts: string;
}, spaced = false): string[] {
  const separator = spaced ? ": " : ":";
  return [
    `[当前事件]`,
    `index${separator}${payload.currentEventIndex || 1}`,
    `kind${separator}${payload.currentEventKind || "scene"}`,
    `summary${separator}${payload.currentEventSummary || "当前事件未命名"}`,
    payload.currentEventFacts ? `facts${separator}${payload.currentEventFacts}` : "",
    payload.currentEventMemorySummary ? `memory_summary${separator}${payload.currentEventMemorySummary}` : "",
    payload.currentEventMemoryFacts ? `memory_facts${separator}${payload.currentEventMemoryFacts}` : "",
  ];
}
```

### buildMemoryCardLines（NarrativeOrchestrator.ts:2435 — 2453）

```ts
// 构造记忆管理提示词里的参数卡区块，避免主函数里重复处理 JSON 序列化和空值回退。
function buildMemoryCardLines(payload: {
  playerCard: JsonRecord | null;
  narratorCard: JsonRecord | null;
  npcCards: JsonRecord[];
}): string[] {
  // 角色动态参数卡列表：5种类型全部发送（player/narrator/npc/system/general）
  const allCards = [
    ...(payload.playerCard ? [payload.playerCard] : []),
    ...(payload.narratorCard ? [payload.narratorCard] : []),
    ...payload.npcCards,
  ];
  return [
    "[用户当前参数卡(JSON)]",
    payload.playerCard ? JSON.stringify(payload.playerCard, null, 2) : "无",
    "",
    "[角色动态参数卡列表(JSON数组)]",
    allCards.length ? JSON.stringify(allCards, null, 2) : "[]",
  ];
}
```

### buildCompactMemoryTaskLines（NarrativeOrchestrator.ts:2456 — 2463）

```ts
// 构造 compact 记忆管理任务说明，单独抽出后更容易调整提示词而不影响主结构。
function buildCompactMemoryTaskLines(): string[] {
  return [
    "[任务]",
    "请对比当前记忆、当前参数卡与新增对话，只保留对后续剧情有用的新事实、修正和标签。",
    "如果对话里出现角色状态变化、获得/失去物品、技能成长、身份变化，请同时输出参数卡 patch。",
    "如果有重复，直接合并；如果有冲突，按最新对话修正。",
  ];
}
```

### buildCompactMemoryOutputExampleLines（NarrativeOrchestrator.ts:2466 — 2498）

```ts
// 构造 compact 记忆管理输出样例，避免主函数里直接嵌长 JSON 示例。
function buildCompactMemoryOutputExampleLines(): string[] {
  return [
    "[输出格式(JSON)]",
    JSON.stringify({
      summary: "新的故事摘要",
      facts: ["新事实1"],
      tags: ["标签1"],
      player_card_patch: {
        level: 2,
        exp: 30,
        next_level_exp: 200,
        items: ["新获得物品"],
        other: ["新的长期状态"],
        player_card_patch: "角色的关键信息，如身份备注、编排限制等",
      },
      npc_card_patches: [
        {
          role_id: "npc_xxx",
          role_name: "某角色",
          patch: {
            items: ["新获得物品"],
            other: ["新状态"],
            role_key_information: "身份备注等关键信息\n【当前行为】在铁匠铺打铁，赶制神秘订单（黄昏·阴）",
          },
        },
      ],
      dynamic_world_global_background:"新的动态全局背景"
    }, null, 2),
    "注意：patch 只允许这些字段：raw_setting, personality, appearance, voice, skills, items, equipment, other, gender, age, level, level_desc, exp, next_level_exp, hp, mp, money, role_key_information。",
    "role_key_information 必须包含原身份备注 + 末尾【当前行为】段（仅自由模式），不可只返回行为段而丢失身份备注。",
    "没有变化就返回空对象 {} 或空数组 []。",
  ];
}
```

### buildMemoryWorldChapterLines（NarrativeOrchestrator.ts:2501 — 2515）

```ts
// 构造 full 记忆管理提示词的世界与章节区块，减少主函数里的基础上下文拼接。
function buildMemoryWorldChapterLines(payload: {
  worldName: string;
  worldGlobalBackground: string;
  chapterTitle: string;
}): string[] {
  // 全局背景在外层用 [原始全局背景] / [动态全局背景] 两个标签独立输出，
  // 这里只保留世界名称，避免和外层重复。
  return [
    "[世界]",
    `名称: ${payload.worldName || "未命名世界"}`,
    "",
    "[章节]",
    `标题: ${payload.chapterTitle || "未命名章节"}`,
  ].filter(Boolean);
}
```

### buildFullMemoryTaskLines（NarrativeOrchestrator.ts:2518 — 2525）

```ts
// 构造 full 记忆管理任务说明，便于后续单独调 prompt 而不影响主结构。
function buildFullMemoryTaskLines(): string[] {
  return [
    "[任务]",
    "根据现有记忆、当前事件、最近对话和角色参数卡，更新整个故事所需的长期记忆。",
    "如果对话里出现用户或 NPC 的长期状态变化，必须同时输出参数卡 patch。",
    "只保留对后续剧情真的有用的变化，重复项请合并，冲突项按最新剧情修正。",
  ];
}
```

### buildFullMemoryOutputExampleLines（NarrativeOrchestrator.ts:2528 — 2562）

```ts
// 构造 full 记忆管理输出样例，避免主函数里直接内嵌大段 JSON 示例。
function buildFullMemoryOutputExampleLines(): string[] {
  return [
    "[输出格式(JSON)]",
    JSON.stringify({
      summary: "新的故事摘要",
      facts: ["新事实1", "新事实2"],
      tags: ["标签1", "标签2"],
      player_card_patch: {
        level: 2,
        exp: 40,
        next_level_exp: 200,
        level_desc: "斗之气2星",
        skills: ["新技能"],
        items: ["新物品"],
        other: ["新的长期状态"],
        player_card_patch: "角色的关键信息，如身份备注、编排限制等",
      },
      npc_card_patches: [
        {
          role_id: "npc_xxx",
          role_name: "某角色",
          patch: {
            items: ["新物品"],
            other: ["新状态"],
            role_key_information: "身份备注等关键信息\n【当前行为】在铁匠铺打铁，赶制神秘订单（黄昏·阴）",
          },
        },
      ],
      dynamic_world_global_background: "新的动态全局背景"
    }, null, 2),
    "只允许使用这些 patch 字段：raw_setting, personality, appearance, voice, skills, items, equipment, other, gender, age, level, level_desc, exp, next_level_exp, hp, mp, money, role_key_information。",
    "role_key_information 必须包含原身份备注 + 末尾【当前行为】段（仅自由模式），不可只返回行为段而丢失身份备注。",
    "如果没有参数卡变化，player_card_patch 返回 {}，npc_card_patches 返回 []。",
  ];
}
```

### buildMemorySystemPrompt（NarrativeOrchestrator.ts:2571 — 2600）

```ts
/**
 * 构造记忆管理 system prompt。
 *
 * 用途：
 * - 运行时必须优先复用数据库里的 `story-memory` 提示词，避免和 initDB/fixDB 种子文案分裂；
 * - 当数据库里没有可用提示词时，才回退到这里的保底版本。
 */
function buildMemorySystemPrompt(promptFromDb: unknown): string {
  const promptText = normalizeScalarText(promptFromDb);
  if (promptText) {
    return promptText;
  }
  return [
    "你是记忆管理器。",
    "你负责管理整个故事的长期记忆，不只更新剧情摘要，还要维护角色动态参数卡。",
    "你要根据当前记忆、事件状态、最近对话和角色参数卡，提炼对后续剧情真正有用的新信息，合并重复、修正冲突，并识别用户与 NPC 的长期状态变化。",
    "角色动态参数卡也是记忆的一部分；当对话中出现等级变化、物品获得/失去、技能成长、装备变化、身份变化或长期状态变化时，必须输出参数卡 patch。",
    "不要生成剧情正文，不要输出代码块。",
    "### 血量和蓝的恢复（hp 和 mp）",
    "用户住宿、睡觉和吃下恢复药物等可以恢复血量和蓝到充盈满血满蓝，hp 和 mp 必须直接输出数字，不能写“已恢复”“满了”“充盈”等中文状态。",
    "### 满血",
    "基础血量100 + 等级*10 + 特殊物品或者技能加成。",
    "### 满蓝",
    "基础蓝量100 + 等级*10 + 特殊物品或者技能加成。",
    "### 经验值和升级",
    "角色卡可包含 exp、next_level_exp，二者必须是数字。",
    "默认 next_level_exp = level * 100。",
    "当明确获得经验时，累加 exp；若 exp >= next_level_exp，则升级：level + 1，exp 扣除旧 next_level_exp，next_level_exp = 新 level * 100，hp/mp 按满血满蓝公式恢复。",
    "大量经验可连续升级。模糊成长不改 exp，只写入 other。",
    "### @记忆管理 规则",
    "当用户最新输入以 `@记忆管理` 开头时，该输入视为对长期记忆和角色参数卡的直接管理指令，不需要等待旁白确认。",
    "如果 `@记忆管理` 后面包含明确状态变化、物品变化、技能变化、身份变化、数值变化，则必须直接更新 summary、facts、tags 和对应参数卡 patch。",
    "输出必须是一个 JSON 对象，字段固定为：summary, facts, tags, player_card_patch, npc_card_patches。",
    "player_card_patch 和 npc_card_patches.patch 只允许这些字段：raw_setting, personality, appearance, voice, skills, items, equipment, other, gender, age, level, level_desc, exp, next_level_exp, hp, mp, money,role_key_information。",
    "其中 age、level、exp、next_level_exp、hp、mp、money 必须是数字；如果只是想表达“已恢复”“斗气更凝实”“状态转好”“经验提升”，请写到 other，不要写进 hp/mp/exp。",
  ].join("\n");
}
```

### buildMemoryUserPrompt（NarrativeOrchestrator.ts:2937 — 3069）

```ts
// 把最近对话和现有记忆拼成记忆管理提示词。
// [原始全局背景] 和 [动态全局背景] 用于让记忆管理模型区分世界观设定的初始状态和当前演变状态。
function buildMemoryUserPrompt(payload: {
  worldName: string;
  worldGlobalBackground: string;
  /** 记忆管理器维护的动态全局背景 */
  dynamicWorldGlobalBackground?: string;
  chapterTitle: string;
  currentEventIndex: number;
  currentEventKind: string;
  currentEventSummary: string;
  currentEventFacts: string;
  currentEventMemorySummary: string;
  currentEventMemoryFacts: string;
  eventDeltaText: string;
  currentFacts: string;
  currentTags: string;
  recentDialogue: RecentDialogueTurn[];
  currentMemory: string;
  playerCard: JsonRecord | null;
  narratorCard: JsonRecord | null;
  npcCards: JsonRecord[];
  /** 世界时钟（仅自由模式传入；章节模式为 null/undefined，不渲染） */
  worldClock?: { tick: number; timeOfDay: string; weather: string } | null;
  /** ★ 阶段2:本轮匹配的世界书条目 content 列表，供记忆管理器参考（不照抄进 summary/facts） */
  worldContext?: {
    worldKnowledge: string[];
  } | null;
}, compactMode = false): string {
  if (compactMode) {
    const currentEventLines = buildMemoryCurrentEventLines(payload);
    const cardLines = buildMemoryCardLines(payload);
    const taskLines = buildCompactMemoryTaskLines();
    const outputExampleLines = buildCompactMemoryOutputExampleLines();
    DebugLogUtil.log("story:memory:runtime", "buildSpeakerUserPrompt", JSON.stringify({
      worldGlobalBackground: payload.worldGlobalBackground || "无",
      dynamicWorldGlobalBackground: payload.dynamicWorldGlobalBackground || "无",
    }));
    return [
      "[世界]",
      `名称: ${payload.worldName || "未命名世界"}`,
      "",
      "[原始全局背景]",
      payload.worldGlobalBackground || "无",
      "",
      "[动态全局背景]",
      payload.dynamicWorldGlobalBackground || "无",
      "",
      ...(payload.worldClock ? [
        "[世界时钟]",
        `tick: ${payload.worldClock.tick}｜时段: ${payload.worldClock.timeOfDay}｜天气: ${payload.worldClock.weather}`,
        "",
      ] : []),
      ...(payload.worldContext && payload.worldContext.worldKnowledge.length
        ? [`[世界知识] ${payload.worldContext.worldKnowledge.join("｜")}`, ""]
        : []),
      "[章节]",
      `标题: ${payload.chapterTitle || "未命名章节"}`,
      "",
      "[当前记忆]",
      payload.currentMemory || "无",
      "",
      "[当前事实]",
      payload.currentFacts || "无",
      "",
      ...currentEventLines,
      "",
      "[事件增量]",
      payload.eventDeltaText || "无",
      "",
      "[当前标签]",
      payload.currentTags || "无",
      "",
      ...cardLines,
      "",
      "[新增对话(JSON数组)]",
      stringifyRecentDialogue(payload.recentDialogue),
      "",
      ...taskLines,
      "",
      ...outputExampleLines,
    ].filter(Boolean).join("\n");
  }
  const worldChapterLines = buildMemoryWorldChapterLines(payload);
  const currentEventLines = buildMemoryCurrentEventLines(payload, true);
  const cardLines = buildMemoryCardLines(payload);
  const taskLines = buildFullMemoryTaskLines();
  const outputExampleLines = buildFullMemoryOutputExampleLines();

  DebugLogUtil.log("story:memory:runtime", "buildSpeakerUserPrompt", JSON.stringify({
    worldGlobalBackground: payload.worldGlobalBackground || "无",
    dynamicWorldGlobalBackground: payload.dynamicWorldGlobalBackground || "无",
  }));
  return [
    ...worldChapterLines,
    "",
    "[原始全局背景]",
    payload.worldGlobalBackground || "无",
    "",
    "[动态全局背景]",
    payload.dynamicWorldGlobalBackground || "无",
    "",
    ...(payload.worldClock ? [
      "[世界时钟]",
      `tick: ${payload.worldClock.tick}｜时段: ${payload.worldClock.timeOfDay}｜天气: ${payload.worldClock.weather}`,
      "",
    ] : []),
    // ★ 阶段2:世界知识（仅参考，不照抄进 summary/facts）
    ...(payload.worldContext && payload.worldContext.worldKnowledge.length
      ? ["[世界知识]", payload.worldContext.worldKnowledge.join("\n\n"), ""]
      : []),
    ...currentEventLines,
    "",
    "[事件增量]",
    payload.eventDeltaText || "无",
    "",
    "[最近对话(JSON数组)]",
    stringifyRecentDialogue(payload.recentDialogue),
    "",
    "[现有记忆摘要]",
    payload.currentMemory || "无",
    "",
    "[当前事实]",
    payload.currentFacts || "无",
    "",
    "[当前标签]",
    payload.currentTags || "无",
    "",
    ...cardLines,
    "",
    ...taskLines,
    "",
    ...outputExampleLines,
  ].filter(Boolean).join("\n");
}
```

### buildMemoryEventDeltaText（NarrativeOrchestrator.ts:3681 — 3699）

```ts
function buildMemoryEventDeltaText(messages: RuntimeMessageInput[], compactMode = false): string {
  const chunks = uniqueTextList(
    messages.map((item) => {
      const delta = readMemoryDeltaInput(item);
      if (delta) {
        return [
          `#${delta.eventIndex} ${delta.eventKind}`,
          delta.eventSummary ? `事件摘要：${delta.eventSummary}` : "",
          delta.eventFacts.length ? `事件事实：${delta.eventFacts.join("；")}` : "",
          delta.memorySummary ? `已有事件记忆：${delta.memorySummary}` : "",
          delta.memoryFacts.length ? `已有事件记忆事实：${delta.memoryFacts.join("；")}` : "",
        ].filter(Boolean).join("\n");
      }
      return normalizeScalarText(item.content);
    }),
    compactMode ? 2 : 3,
  );
  return chunks.join(compactMode ? "\n" : "\n\n");
}
```

### invoke 调用处（NarrativeOrchestrator.ts:5157 — 5188，u.ai.text.invoke）

system / user 在调用前组装：

```ts
5157→  const systemPrompt = buildMemorySystemPrompt(prompts.storyMemory);
5158→  const userPrompt = buildMemoryUserPrompt(payload, compactMode);
```

messages 数组结构（memory 记忆管理器，usageType = "记忆管理"）：

```ts
5165→    const result = await u.ai.text.invoke(
5166→      {
5167→        plainTextOutput: true,
5168→        usageType: "记忆管理",
5169→        usageRemark: `${normalizeScalarText(input.world?.name)} / ${normalizeScalarText(input.chapter?.title)}`,
5170→        usageMeta: {
5171→          stage: "storyMemoryModel",
5172→          worldId: Number(input.world?.id || 0),
5173→          chapterId: Number(input.chapter?.id || 0),
5174→        },
5175→        messages: [
5176→          {
5177→            role: "system",
5178→            content: systemPrompt,
5179→          },
5180→          {
5181→            role: "user",
5182→            content: userPrompt,
5183→          },
5184→        ],
5185→        maxRetries: 0,
5186→      },
5187→      promptAiConfig as any,
5188→    );
```

## 3. 注入的上下文变量（payload 字段清单）

`buildMemoryUserPrompt(payload, compactMode)` 实际注入的关键变量：

- `worldName` → `[世界]` / `[章节]` 的世界名称
- `worldGlobalBackground` → `[原始全局背景]`
- `dynamicWorldGlobalBackground` → `[动态全局背景]`（记忆管理器维护、区分初始设定与当前状态）
- `worldClock`（仅自由模式）→ `[世界时钟]`（tick / timeOfDay / weather）
- `worldContext.worldKnowledge` → `[世界知识]`（阶段2匹配的世界书条目，仅参考）
- `chapterTitle` → `[章节]` 标题
- `currentEventIndex` / `currentEventKind` / `currentEventSummary` / `currentEventFacts` / `currentEventMemorySummary` / `currentEventMemoryFacts` → `[当前事件]`
- `eventDeltaText` → `[事件增量]`（由 `buildMemoryEventDeltaText(messages)` 生成）
- `currentMemory` → `[当前记忆]` / `[现有记忆摘要]`
- `currentFacts` → `[当前事实]`
- `currentTags` → `[当前标签]`
- `recentDialogue` → `[新增对话(JSON数组)]` / `[最近对话(JSON数组)]`
- `playerCard` / `narratorCard` / `npcCards` → `[用户当前参数卡(JSON)]` 与 `[角色动态参数卡列表(JSON数组)]`（由 `collectMemoryRoleCardSnapshots` 选出，覆盖了 player/narrator/npc/system/general 五种类型）
