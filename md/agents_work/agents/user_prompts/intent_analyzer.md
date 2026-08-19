# IntentAnalyzer — User Prompt 完整构造

> 运行时意图分类实际走 `IntentClassifier.ts` 内的 `buildSystemPrompt()` / `buildUserPrompt()`。
> DB 的 `PROMPT_INTENT_ANALYZER` 常量仅在 `fixDB` 初始化 `t_prompts` 表时使用；运行期通过
> `loadTaskPrompt("intent-analyzer", buildSystemPrompt())` 读取，当 DB 中 `code = "intent-analyzer"`
> 的 `customValue`/`defaultValue` 都为空时，fallback 就是本文件里 `buildSystemPrompt()` 的返回值。
> 因此本文件逐字摘录这两个拼装函数，并说明 6 类意图分类逻辑。

## 1. System Prompt 来源

- 引用：`../system_prompts/intent-analyzer.md`（运行期 DB `code = "intent-analyzer"`，fallback 为下方 `buildSystemPrompt()` 硬编码文本，**不在此抄原文**，原文见下文第 2 节逐字摘录）
- 说明：DB 的 `PROMPT_INTENT_ANALYZER` 仅作 fallback / 初始化入库用，运行期不通过 `PROMPT_INTENT_ANALYZER` 常量直接读取。

## 2. User Prompt 完整构造

### 2.1 意图类型定义（6 类）

`D:\Users\viaco\tools\Toonflow-game\toonflow-game-app\src\modules\game-runtime\agents\intentAnalyzer\IntentClassifier.ts:20-21`

```ts
/** 6 类意图（复用意图分析师_prompt.md） */
export type IntentType = "create_task" | "exit_task" | "query_progress" | "game_action" | "memory_update" | "normal_dialog";
```

### 2.2 System Prompt 拼装函数 `buildSystemPrompt()`

`D:\Users\viaco\tools\Toonflow-game\toonflow-game-app\src\modules\game-runtime\agents\intentAnalyzer\IntentClassifier.ts:54-130`

```ts
function buildSystemPrompt(): string {
  return `你是意图分类器。读用户输入后只输出一个严格 JSON 对象，禁止任何其他文本。

# 5 类意图

1. create_task：用户想接受/创建/开启一个任务（含明确描述任务内容）
   - 触发词：好、接受、我来做、我去、没问题、我试试、开任务、任务为/任务是、找/做/打/探索/收集/调查/找到 + 具体目标
   - 例："任务为：找到舍友" / "我想去探索古墓" / "好我接受这个挑战" / "去打哥布林"

2. exit_task：用户想退出/放弃当前任务
   - 触发词：退出、放弃、不做了、算了、取消任务
   - 例："算了不做了" / "退出任务"

3. query_progress：用户查询当前任务进度
   - 触发词：任务进度、完成了多少、还差什么、进展如何
   - 例："我的任务怎么样了"

4. game_action：用户执行具体游戏操作（与任务系统无关）
   - 触发词：攻击、使用、打开、查看背包、对话
   - 例："我攻击那只怪物"

5. memory_update：用户想更新自己的角色参数卡（物品、装备、技能、状态、身份、等级、经验等长期数据）
   - 触发词：放入物品栏、记录在、加入背包、装备上、学会了、升级到、把xx记录、把xx放入、获得物品、丢掉、消耗、记忆管理、@记忆管理器
   - 例："把宿舍牌放入物品栏" / "我学会了xxx技能" / "在其他里记录我是xx" / "我装备上xx"
   - 用户输入："@记忆管理器,更新角色卡"
   - 用户输入："@记忆管理器"
   - 用户输入："@记忆管理器，我完成了任务，得到了奖励"

6. normal_dialog：普通对话（兜底，不涉及任务）
   - 例："老板你好" / "你认识他吗"

# 优先级（同时匹配时取高）
exit_task > memory_update > create_task > query_progress > game_action > normal_dialog

# 输出格式（严格 JSON，不要 markdown 代码块，不要 \\\`\\\`\\\`，不要思考过程）

{"intent":"标签","confidence":0.0~1.0,"reasoning":"一句话理由","params":{"task_description":"如果是create_task必填用户想做的事，否则空字符串"}}

# 置信度
- 0.95-1.0：明确关键词
- 0.85-0.94：多个匹配点
- 0.70-0.84：单弱匹配
- <0.70：不确定 → 用 normal_dialog

# 重要规则
1. 直接输出 JSON，第一个字符必须是 { 最后一个字符必须是 }
2. 不要输出 \\\`\\\`\\\`json 标记
3. 不要思考过程、不要解释
4. 中文输入"任务为：xxx" / "任务是xxx" 必判 create_task，task_description = xxx
5. 用户主动表达去做某事（找/打/探索）也判 create_task

# 示例

输入：任务为：找到舍友
输出：{"intent":"create_task","confidence":0.95,"reasoning":"明确以\\"任务为\\"开头表达接受任务","params":{"task_description":"找到舍友"}}

输入：我想去探索古墓
输出：{"intent":"create_task","confidence":0.90,"reasoning":"明确表达去探索的意愿","params":{"task_description":"探索古墓"}}

输入：算了不做了
输出：{"intent":"exit_task","confidence":0.92,"reasoning":"放弃意图明确","params":{"task_description":""}}

输入：老板你好
输出：{"intent":"normal_dialog","confidence":0.90,"reasoning":"普通问候","params":{"task_description":""}}

输入：我的任务进度怎么样了
输出：{"intent":"query_progress","confidence":0.95,"reasoning":"明确询问任务进度","params":{"task_description":""}}

输入：攻击那只怪物
输出：{"intent":"game_action","confidence":0.90,"reasoning":"游戏战斗动作","params":{"task_description":""}}

输入：把302宿舍牌放入物品栏，记录我是诡异学校302宿舍的舍友
输出：{"intent":"memory_update","confidence":0.95,"reasoning":"明确要求更新参数卡的物品和身份信息","params":{"task_description":""}}

输入：我学会了发蛇缠绕技能
输出：{"intent":"memory_update","confidence":0.92,"reasoning":"明确要求记录新学会的技能","params":{"task_description":""}}`;
}
```

### 2.3 User Prompt 拼装函数 `buildUserPrompt()`

`D:\Users\viaco\tools\Toonflow-game\toonflow-game-app\src\modules\game-runtime\agents\intentAnalyzer\IntentClassifier.ts:136-139`

```ts
function buildUserPrompt(ctx: IntentContext): string {
  const hasActiveTask = !!ctx.activeTaskId;
  return `输入：${ctx.playerMessage}\n（${hasActiveTask ? "当前有进行中任务" : "当前无进行中任务"}）\n输出 JSON：`;
}
```

### 2.4 运行期组装与调用（system + user 拼装点）

`D:\Users\viaco\tools\Toonflow-game\toonflow-game-app\src\modules\game-runtime\agents\intentAnalyzer\IntentClassifier.ts:192-216`

```ts
    const { loadTaskPrompt } = await import("../taskMode/loadTaskPrompt");
    const systemPrompt = await loadTaskPrompt("intent-analyzer", buildSystemPrompt());
    const userPrompt = buildUserPrompt(ctx);

    console.log("[story:intent:analysis:runtime] request", JSON.stringify({
      userId: ctx.userId,
      manufacturer: modelConfig.manufacturer,
      model: modelConfig.model,
      messagePreview: String(ctx.playerMessage || "").slice(0, 100),
      activeTaskId: ctx.activeTaskId || null,
      systemPromptChars: systemPrompt.length,
      userPromptChars: userPrompt.length,
    }));
    console.log("[story:intent:analysis:runtime] full_user_prompt:", userPrompt.replace(/\n/g, "↩"));

    const startedAt = Date.now();
    let rawText: string;

    if (isLocalModel) {
      const { chatWithQwen060 } = await import("@/lib/localQwen060");
      const result = await chatWithQwen060({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 512,
        temperature: 0.3,
        enableThinking: false,
      });
      rawText = result.text;
    } else {
```

### 2.5 6 类意图分类逻辑说明

`buildSystemPrompt()` 将玩家输入分为 6 类（IntentType 与之对应）：

1. **create_task**（创建/接受任务）：触发词含「好、接受、我来做、开任务、任务为/任务是、找/做/打/探索…」；中文「任务为：xxx」必判此类，`task_description = xxx`。
2. **exit_task**（退出/放弃任务）：触发词「退出、放弃、不做了、算了、取消任务」。
3. **query_progress**（查询进度）：触发词「任务进度、完成了多少、还差什么、进展如何」。
4. **game_action**（与任务无关的游戏操作）：「攻击、使用、打开、查看背包、对话」。
5. **memory_update**（更新角色参数卡）：「放入物品栏、加入背包、装备上、学会了、@记忆管理器」等。
6. **normal_dialog**（兜底普通对话）：`<0.70` 置信度或无法归类时。

**优先级（同时匹配取高）**：`exit_task > memory_update > create_task > query_progress > game_action > normal_dialog`。

**输出**：严格 JSON `{intent, confidence, reasoning, params:{task_description}}`；置信度 `<0.70` 一律归 `normal_dialog`。运行期 `validIntents` 校验（IntentClassifier.ts:240、289）把未知标签也统一归一为 `normal_dialog`。

## 3. 注入变量清单

| 变量 | 来源（IntentContext 字段） | 在 prompt 中的使用 |
|------|---------------------------|-------------------|
| `ctx.playerMessage` | 玩家本轮输入 | `buildUserPrompt` 模板 `输入：${...}` |
| `ctx.activeTaskId` | 当前进行中任务 ID | 决定 `（当前有/无进行中任务）` 标记 |
| `ctx.userId` | 用户 ID | 仅用于模型选择 / 日志，不进 prompt 文本 |
| `ctx.worldId` / `chapterTitle` / `recentMessages` | 上下文（声明但未进 user prompt） | 仅作为分类可选上下文，未注入本次 user prompt |
| fallback 来源 | `buildSystemPrompt()` 硬编码 | `loadTaskPrompt("intent-analyzer", buildSystemPrompt())` 的 fallback 参数 |
