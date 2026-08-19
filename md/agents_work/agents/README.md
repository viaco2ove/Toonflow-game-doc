# Toonflow-game 多 Agent 提示词完整提取（system + user）

> 本目录存放从 `toonflow-game-app` 源码**逐字、未省略**提取的全部剧情 Agent 提示词。
> 上次写的 `agent_*.md`（上层目录）是「摘要版（入参/出参/角色）」；本目录 `system_prompts/` + `user_prompts/` 是**完整原文**，可直接据此二次开发或写 tavo 插件。

## 目录结构

```
agents/
├── README.md                  ← 本索引
├── system_prompts/            ← 完整「系统提示词」原文（33 个，来自 fixDB.prompts.ts）
│   ├── PROMPT_*.md            ← 剧情/任务/游戏运行时 Agent（28 个）
│   └── not aigame/            ← 创作侧/分镜生图提示词（5 个）
│       ├── PROMPT_STORYBOARD_POLISH.md     分镜优化
│       ├── PROMPT_STORYBOARD_SHOT.md       分镜生图
│       ├── PROMPT_GENERATEIMAGEPROMPTS.md  AI绘图提示词
│       ├── PROMPT_SCENE_GENERATEIMAGE.md   场景生图
│       └── PROMPT_VIDEO_TEXT.md             视频文本模式
└── user_prompts/              ← 完整「用户提示词」拼装（12 个，来自各 runner 函数逐字摘录）
    └── *.md
```

- **system_prompts/**：每个文件就是 `fixDB.prompts.ts` 里 `_PROMPT_XXX` 常量的**完整模板字符串原文**，经 `_normalize()` 后由 `export const PROMPT_XXX` 导出、入库 `t_prompts`。
- **user_prompts/**：每个文件逐字摘录「构建该 agent user message 的函数」源码（`build*UserPrompt` / `evalAi` / `buildSystemPrompt` 等），含全部 `${...}` 占位符与注入变量，就是实际发给模型的那段 user 文本（注意：剧情主线 agent 的 user 多为 `JSON.stringify(payload)`，任务/意图 agent 多为带 `[标签]` 的结构化文本）。

## Agent → 文件映射

| # | Agent | system_prompts 文件 | user_prompts 文件 |
|---|---|---|---|
| 1 | story_orchestrator | `PROMPT_STORY_ORCHESTRATOR.md`（+ `_COMPACT` / `_ADVANCED`） | `story_orchestrator.md` |
| 2 | story_speaker | `PROMPT_STORY_SPEAKER.md` | `story_speaker.md` |
| 3 | story_memory | `PROMPT_STORY_MEMORY.md` | `story_memory.md` |
| 4 | story_chapter | `PROMPT_STORY_CHAPTER.md` | `story_chapter.md` |
| 5 | story_event_progress | `PROMPT_STORY_EVENT_PROGRESS.md` | `story_event_progress.md` |
| 6 | story_mini_game (+8 子类型) | `PROMPT_STORY_MINI_GAME*.md`（共 9 个） | `story_mini_game.md` |
| 7 | story_sell_item | `PROMPT_STORY_SELL_ITEM.md` | `story_sell_item.md` |
| 8 | intent_analyzer | `PROMPT_INTENT_ANALYZER.md`（仅 fallback；**运行时实际用** `IntentClassifier.ts` 内 `buildSystemPrompt()` 硬编码，见 user 文件） | `intent_analyzer.md` |
| 9 | task_progress_agent | `PROMPT_TASK_PROGRESS_AGENT.md` | `task_mode.md` §1 |
| 10 | task_director_agent | `PROMPT_TASK_DIRECTOR_AGENT.md` | `task_mode.md` §2 |
| 11 | task_speaker_agent | `PROMPT_TASK_SPEAKER_AGENT.md` | `task_mode.md` §3 |
| 12 | task_completion_agent | `PROMPT_TASK_COMPLETION_AGENT.md` | `task_mode.md` §4 |
| 13 | task_director_agent_options | `PROMPT_TASK_DIRECTOR_AGENT_OPTIONS.md` | `task_mode.md` §5 |
| 14 | play_tip_agent | `PROMPT_PLAY_TIP_AGENT.md` | `play_tip.md` |
| 15 | orchestrate_options | `PROMPT_STORY_ORCHESTRATOR_OPTIONS.md` | `orchestrate_options.md` |
| 16 | story_update_align | `PROMPT_STORY_UPDATE_ALIGN.md` | `story_update_align.md` |
| 17 | story_main（未启用） | `PROMPT_STORY_MAIN.md` | — |
| 18 | story_safety（未启用） | `PROMPT_STORY_SAFETY.md` | — |

## 查看提示词的原则

- **要看某个 agent 的完整 system 原文** → 打开 `system_prompts/PROMPT_<常量名>.md`
- **要看某个 agent 的 user 是怎么拼出来的、注入了哪些变量** → 打开 `user_prompts/<agent>.md`，里面有逐字函数源码 + 注入变量表
- 创作侧 Agent（outlineScript / storyboard 等）提示词移至 `system_prompts/not aigame/`（code: `storyboard-polish` / `storyboard-shot` / `generateImagePrompts` / `scene-generateImage` / `video-text`），与运行时剧情 Agent 分离。
