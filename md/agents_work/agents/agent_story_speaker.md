# Agent: story_speaker（角色发言器）

> 来源：运行时核心 Agent。提示词常量 `PROMPT_STORY_SPEAKER`（`fixDB.prompts.ts:1285`，约 55 行），导出行 2332。
> 总览见 `../03_多Agent系统总述.md`；编排上游见 `agent_story_orchestrator.md`。

---

## 1. 角色定位

根据当前事件 + 本轮 motive 生成**真正展示给用户的台词/旁白**，**不写剧情正文**（剧情推进由 orchestrator 决定）。

---

## 2. 提示词原文（关键摘要，`:1285-1339`）

> 你是角色发言器。根据当前说话人、本轮动机，生成符合角色的台词或旁白。

- **🚨 绝对禁止"条件反射式"推进**：你的唯一任务是完成【本轮动机(motive)】（`:1299`）。
- **角色类型规则**：一般角色(npc)/旁白(narrator)/万能角色(general)/系统角色(system)（`:1312-1331`）。
- **输出规则**：
  1. 直接说台词，不要前缀 `"@角色名："`。
  2. 只能推进当前这一小步，默认 40~80 字，最多 2 句。
  4. 小括号内只能放动作、神态、镜头、气氛描写；括号外才是可朗读台词。
  6. 禁止输出 JSON、禁止代码块、禁止字段名。
  7. 只返回最终展示给用户的一段正文（`:1332-1339`）。

---

## 3. 入参

来自 `runStorySpeakerContent` 的 payload（`NarrativeOrchestrator.ts` 约 4500–4574 组装）：

| 变量 | 说明 |
|---|---|
| `currentRole` | 说话人(name/roleType) |
| `motive` | 本轮动机（来自 orchestrator） |
| `recentMessages` | 聊天历史 |
| `chapter` / `world` | 章节/世界 |
| `currentStageSummary` | 当前 stage 摘要 |
| `worldBookEntries` | 再次按 `motive+playerMessage+recentMessages` 注入世界书（`:4557-4567`） |
| `taskContext` | 任务模式上下文 `extractTaskContext(state)`（P4 注入 `:4543`） |

---

## 4. 入参处理

- **system prompt**：`buildSpeakerSystemPrompt(speakerPrompt, compactMode, taskContext)`（`:3724`）。
  - compact 模式追加"禁止 JSON、只写一小步 40~80 字、括号描写"等硬约束。
  - 任务模式追加"只能服务任务推进、不能推进主线"等约束。
- `speakerPrompt` 取值：`prompts.storySpeaker || prompts.storyOrchestrator`（`:4576`）。

---

## 5. 调用位置

- `runStorySpeakerContent` 内 `u.ai.text.invoke`（`:4588`），`usageType:"角色发言"`，`plainTextOutput:true`。
- **模型键**：`speakerModelKey = useFastSpeakerPrompt ? "storyFastSpeakerModel" : "storySpeakerModel"`（`:4411`），经 `resolveTextStageModel`（`:4412`）（fast 回退到 storySpeakerModel）。

---

## 6. 出参格式

**自由文本**（非 JSON），但允许被偶发 JSON 包裹。

---

## 7. 出参处理（`:4616-4640`）

- `rawResponse = unwrapModelText(result.text)`
- 先试 `parseJsonSafe` 取 `content`；再 `parseFieldMap`/`getPlainField(fieldMap,"content")`；都没有则直接用 `rawText`。
- `outputLimit = resolveSpeakerOutputLimit(...)`（按 roleType/compact/eventSummary 限长），`normalizeGeneratedLine` 裁剪，`formatDialogueWithStageDirection` 把括号描写规范化为舞台提示。
- 空内容或"泄漏内部编排内容"(`looksLikeDirectiveLeak`) → 抛错。
- 最终台词作为 `content` 经 `commitNarrativeTurn` 落库并由前端流式播放。
