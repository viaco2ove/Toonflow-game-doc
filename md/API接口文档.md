# Toonflow API 接口文档

> 最后更新：2026-04-15

## 一、接口概览

- **基础 URL**：`http://localhost:60002`
- **认证方式**：JWT Bearer Token
- **数据格式**：JSON
- **统一响应格式**：`{ code, message, data }`

### 认证

除登录/注册外，所有接口需要在请求头携带 Token：

```
Authorization: Bearer <token>
```

或通过查询参数传递：

```
?token=<token>
```

## 二、接口分类

| 模块 | 路径前缀 | 接口数 | 说明 |
|------|----------|--------|------|
| 游戏 | `/game/` | 33+ | AI 故事游戏核心接口 |
| 素材 | `/assets/` | 10 | 素材管理 |
| 小说 | `/novel/` | 4 | 小说管理 |
| 大纲 | `/outline/` | 11 | 大纲生成 |
| 剧本 | `/script/` | 7 | 剧本生成 |
| 分镜 | `/storyboard/` | 10 | 分镜管理 |
| 视频 | `/video/` | 16 | 视频合成 |
| 设置 | `/setting/` | 19 | 系统设置 |
| 用户 | `/user/` | 3 | 用户管理 |
| 项目 | `/project/` | 6 | 项目管理 |
| 语音 | `/voice/` | 7 | 语音功能 |
| 其他 | `/other/` | 6 | 登录/注册/测试 |
| 提示词 | `/prompt/` | 2 | 提示词管理 |
| 任务 | `/task/` | 2 | 任务管理 |
| 首页 | `/index/` | 1 | 首页 |

**总计**：144+ 个接口

## 三、游戏模块接口 (/game/)

### 3.1 世界管理

#### 保存世界

```
POST /game/saveWorld
```

**请求体**：

```json
{
  "worldId": 1,                    // 可选，编辑时传入
  "name": "修仙世界",
  "intro": "一个修仙的世界...",
  "coverPath": "/uploads/cover.jpg",
  "settings": {                    // 世界设定
    "worldType": "xianxia",
    "powerSystem": "修仙等级制"
  },
  "playerRole": {                  // 玩家角色
    "id": "player",
    "name": "主角",
    "roleType": "player",
    "description": "一名修仙者"
  },
  "narratorRole": {                // 旁白角色
    "id": "narrator",
    "name": "旁白",
    "roleType": "narrator"
  }
}
```

**响应**：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "worldId": 1
  }
}
```

#### 获取世界列表

```
GET /game/listWorlds
```

**响应**：

```json
{
  "code": 200,
  "data": [
    {
      "id": 1,
      "name": "修仙世界",
      "intro": "...",
      "coverPath": "...",
      "publishStatus": "draft",
      "createTime": 1713158400000
    }
  ]
}
```

#### 获取世界详情

```
GET /game/getWorld?worldId=1
```

#### 删除世界

```
POST /game/deleteWorld
```

**请求体**：

```json
{
  "worldId": 1
}
```

#### 复制世界

```
POST /game/copyWorld
```

**请求体**：

```json
{
  "worldId": 1,
  "newName": "修仙世界-副本"
}
```

### 3.2 章节管理

#### 保存章节

```
POST /game/saveChapter
```

**请求体**：

```json
{
  "chapterId": 1,                  // 可选，编辑时传入
  "worldId": 1,
  "chapterKey": "chapter_1",
  "title": "初入修仙",
  "content": "...",                // 章节内容
  "openingText": "欢迎来到修仙世界...",
  "openingRole": "narrator",
  "backgroundPath": "/uploads/bg.jpg",
  "bgmPath": "/uploads/bgm.mp3",
  "bgmAutoPlay": 1,
  "entryCondition": "flags.tutorial_done == true",
  "completionCondition": "player.level >= 10",
  "showCompletionCondition": 1,
  "sort": 1,
  "status": "active"
}
```

#### 获取章节

```
GET /game/getChapter?worldId=1&chapterId=1
```

### 3.3 任务管理

#### 保存任务

```
POST /game/saveTask
```

**请求体**：

```json
{
  "taskId": 1,                     // 可选
  "chapterId": 1,
  "title": "击败山贼",
  "taskType": "combat",
  "successCondition": "flags.bandit_defeated == true",
  "failCondition": "player.hp <= 0",
  "rewardAction": "{\"attrChanges\":[{\"field\":\"exp\",\"value\":100}]}",
  "goalType": "main",
  "parentTaskId": null,
  "sort": 1
}
```

#### 获取任务

```
GET /game/getTask?chapterId=1
```

### 3.4 触发器管理

#### 保存触发器

```
POST /game/saveTrigger
```

**请求体**：

```json
{
  "triggerId": 1,                  // 可选
  "chapterId": 1,
  "name": "击败山贼触发",
  "triggerEvent": "message_sent",
  "conditionExpr": "messageContent.includes('击败山贼')",
  "actionExpr": "{\"attrChanges\":[{\"entityType\":\"flags\",\"field\":\"bandit_defeated\",\"value\":true}]}",
  "enabled": 1,
  "sort": 1
}
```

#### 获取触发器

```
GET /game/getTrigger?chapterId=1
```

### 3.5 会话管理

#### 开始会话

```
POST /game/startSession
```

**请求体**：

```json
{
  "worldId": 1,
  "chapterId": 1,
  "title": "我的修仙之旅"
}
```

**响应**：

```json
{
  "code": 200,
  "data": {
    "sessionId": "abc-123-def",
    "openingMessage": "欢迎来到修仙世界...",
    "state": { /* 初始状态 */ }
  }
}
```

#### 获取会话

```
GET /game/getSession?sessionId=abc-123-def
```

#### 获取会话列表

```
GET /game/listSession?worldId=1
```

#### 删除会话

```
POST /game/deleteSession
```

**请求体**：

```json
{
  "sessionId": "abc-123-def"
}
```

#### 继续会话

```
POST /game/continueSession
```

**请求体**：

```json
{
  "sessionId": "abc-123-def"
}
```

### 3.6 消息与叙事

#### 添加消息

```
POST /game/addMessage
```

**请求体**：

```json
{
  "sessionId": "abc-123-def",
  "role": "user",
  "roleType": "player",
  "content": "我决定前往附近的村庄",
  "eventType": "user_input"
}
```

#### 获取消息

```
GET /game/getMessage?sessionId=abc-123-def&limit=50
```

#### 删除消息

```
POST /game/deleteMessage
```

**请求体**：

```json
{
  "messageId": 123
}
```

#### 回溯消息

```
POST /game/revisitMessage
```

**请求体**：

```json
{
  "messageId": 123,
  "newContent": "修改后的内容",
  "revisitData": { /* 回溯数据 */ }
}
```

#### 叙事编排 (核心接口)

```
POST /game/orchestration
```

这是游戏的核心接口，负责驱动一个完整的叙事回合。

**请求体**：

```json
{
  "sessionId": "abc-123-def",
  "playerMessage": "我决定前往附近的村庄",
  "maxRetries": 3,
  "allowControlHints": true,
  "allowStateDelta": true,
  "planOverride": {              // 可选，覆盖叙事计划
    "role": "narrator",
    "roleType": "narrator",
    "motive": "描述前往村庄的路途"
  }
}
```

**响应** (流式输出)：

```json
// SSE 流式输出
data: {"type": "chunk", "content": "你踏上了前往村庄的道路..."}
data: {"type": "chunk", "content": "沿途风景如画..."}
data: {"type": "complete", "messageId": 456, "state": { /* 更新后的状态 */ }}
```

### 3.7 故事信息

#### 获取故事信息

```
GET /game/storyInfo?worldId=1
```

#### 初始化故事

```
POST /game/initStory
```

**请求体**：

```json
{
  "worldId": 1,
  "novelId": 1                   // 可选，从小说初始化
}
```

#### 预览运行时大纲

```
POST /game/previewRuntimeOutline
```

### 3.8 图片生成

#### 生成图片

```
POST /game/generateImage
```

**请求体**：

```json
{
  "sessionId": "abc-123-def",
  "prompt": "一名修仙者站在山顶...",
  "negativePrompt": "...",
  "model": "nano-banana-pro"
}
```

#### 上传图片

```
POST /game/uploadImage
```

### 3.9 角色相关

#### 导入世界角色

```
POST /game/importWorldRole
```

**请求体**：

```json
{
  "sourceWorldId": 1,
  "targetWorldId": 2,
  "roleIds": [1, 2, 3]
}
```

#### 列出可导入角色

```
GET /game/listImportableRoles?worldId=1
```

#### 分离角色头像

```
POST /game/separateRoleAvatar
```

#### 头像视频转 GIF

```
POST /game/convertAvatarVideoToGif
```

### 3.10 流式输出

#### 文本流式输出

```
GET /game/streamlines?sessionId=abc-123-def
```

返回 SSE 格式的文本流。

#### 语音流式输出

```
POST /game/streamvoice
```

### 3.11 调试接口

#### 调试步骤

```
POST /game/debugStep
```

#### 调试运行时共享

```
POST /game/debugRuntimeShared
```

#### 初始化调试

```
POST /game/initDebug
```

### 3.12 介绍

#### 获取介绍

```
GET /game/introduction?worldId=1
```

## 四、素材模块接口 (/assets/)

### 添加素材

```
POST /assets/addAssets
```

### 获取素材

```
GET /assets/getAssets?projectId=1
```

### 保存素材

```
POST /assets/saveAssets
```

### 更新素材

```
POST /assets/updateAssets
```

### 删除素材

```
POST /assets/delAssets
```

### 生成素材

```
POST /assets/generateAssets
```

### 获取图片

```
GET /assets/getImage?assetsId=1
```

### 获取分镜

```
GET /assets/getStoryboard?scriptId=1
```

### 润色提示词

```
POST /assets/polishPrompt
```

### 删除素材图片

```
POST /assets/delAssetsImage
```

## 五、小说模块接口 (/novel/)

### 添加小说

```
POST /novel/addNovel
```

**请求体**：

```json
{
  "projectId": 1,
  "chapter": "第一章",
  "chapterIndex": 1,
  "content": "从前有一座山...",
  "reel": "第一卷"
}
```

### 获取小说

```
GET /novel/getNovel?projectId=1
```

### 更新小说

```
POST /novel/updateNovel
```

### 删除小说

```
POST /novel/delNovel
```

## 六、大纲模块接口 (/outline/)

### 添加大纲

```
POST /outline/addOutline
```

### 获取大纲

```
GET /outline/getOutline?projectId=1
```

### 更新大纲

```
POST /outline/updateOutline
```

### 删除大纲

```
POST /outline/delOutline
```

### AI 生成大纲

```
POST /outline/agentsOutline
```

**请求体**：

```json
{
  "novelIds": [1, 2, 3],
  "projectId": 1
}
```

### 获取故事线

```
GET /outline/getStoryline?projectId=1
```

### 更新故事线

```
POST /outline/updateStoryline
```

### 获取历史记录

```
GET /outline/getHistory
```

### 设置历史记录

```
POST /outline/setHistory
```

### 获取部分剧本

```
GET /outline/getPartScript?outlineId=1
```

### 更新剧本

```
POST /outline/updateScript
```

## 七、剧本模块接口 (/script/)

### 生成剧本 API

```
POST /script/generateScriptApi
```

### 生成并保存剧本

```
POST /script/generateScriptSave
```

### 生成剧本片段

```
POST /script/generateScriptSegments
```

### 获取剧本片段

```
GET /script/getScriptSegments?scriptId=1
```

### 更新剧本片段

```
POST /script/updateScriptSegment
```

### 删除剧本片段

```
POST /script/deleteScriptSegment
```

### 获取剧本 API

```
GET /script/geScriptApi?scriptId=1
```

## 八、视频模块接口 (/video/)

### 添加视频

```
POST /video/addVideo
```

### 生成视频

```
POST /video/generateVideo
```

**请求体**：

```json
{
  "configId": 1,
  "prompt": "一名剑客挥剑斩断巨石...",
  "model": "doubao",
  "duration": 5
}
```

### 按配置生成视频

```
POST /video/generateByConfig
```

### 生成提示词

```
POST /video/generatePrompt
```

### 获取视频

```
GET /video/getVideo?scriptId=1
```

### 获取视频配置

```
GET /video/getVideoConfigs?scriptId=1
```

### 刷新视频状态

```
POST /video/refreshVideoStatus
```

### 保存视频

```
POST /video/saveVideo
```

### 添加视频配置

```
POST /video/addVideoConfig
```

### 删除视频配置

```
POST /video/deleteVideoConfig
```

### 更新视频配置

```
POST /video/upDateVideoConfig
```

### 获取视频模型

```
GET /video/getVideoModel
```

### 获取厂商

```
GET /video/getManufacturer
```

### 获取视频分镜

```
GET /video/getVideoStoryboards
```

### 修正视频分镜

```
POST /video/reviseVideoStoryboards
```

### 上传音频

```
POST /video/uploadAudio
```

## 九、分镜模块接口 (/storyboard/)

### 聊天生成分镜

```
POST /storyboard/chatStoryboard
```

### 生成分镜 API

```
POST /storyboard/generateStoryboardApi
```

### 生成分镜图片

```
POST /storyboard/generateShotImage
```

### 生成视频提示词

```
POST /storyboard/generateVideoPrompt
```

### 获取分镜

```
GET /storyboard/getStoryboard?scriptId=1
```

### 保存分镜

```
POST /storyboard/saveStoryboard
```

### 保留分镜

```
POST /storyboard/keepStoryboard
```

### 删除分镜

```
POST /storyboard/delStoryboard
```

### 批量超级评分图片

```
POST /storyboard/batchSuperScoreImage
```

### 上传图片

```
POST /storyboard/uploadImage
```

## 十、设置模块接口 (/setting/)

### AI 模型管理

```
POST /setting/addModel
POST /setting/delModel
POST /setting/updateModel
POST /setting/updeteModel           // 注意：拼写错误保留
GET  /setting/getAiModelList
GET  /setting/getAiModelMap
```

### 获取设置

```
GET /setting/getSetting?projectId=1
```

### 保存故事运行时配置

```
POST /setting/saveStoryRuntimeConfig
```

### 本地头像抠图

```
POST /setting/localAvatarMatting
```

### 模型配置

```
POST /setting/configurationModel
```

### 视频模型列表

```
GET /setting/getVideoModelList
GET /setting/getVideoModelDetail
```

### 语音模型列表

```
GET /setting/getVoiceModelList
```

### Token 使用日志

```
GET /setting/getAiTokenUsageLog
GET /setting/getAiTokenUsageStats
```

### 聊天历史

```
POST /setting/deleteChatHistory
GET  /setting/getChatHistoryList
GET  /setting/getChatHistoryDetail
```

### 日志

```
GET /setting/getLog
```

## 十一、语音模块接口 (/voice/)

### 获取语音

```
GET /voice/getVoices
```

### 生成绑定语音

```
POST /voice/generateBindingVoice
```

### 润色提示词

```
POST /voice/polishPrompt
```

### 预览语音

```
POST /voice/preview
```

### 转录

```
POST /voice/transcribe
```

### 上传音频

```
POST /voice/uploadAudio
```

### 音频代理

```
GET /voice/audioProxy
```

## 十二、用户模块接口 (/user/)

### 获取用户

```
GET /user/getUser
```

### 保存用户

```
POST /user/saveUser
```

### 修改密码

```
POST /user/changePassword
```

## 十三、项目模块接口 (/project/)

### 添加项目

```
POST /project/addProject
```

### 获取项目

```
GET /project/getProject
```

### 获取单个项目

```
GET /project/getSingleProject?id=1
```

### 更新项目

```
POST /project/updateProject
```

### 删除项目

```
POST /project/delProject
```

### 获取项目数量

```
GET /project/getProjectCount
```

## 十四、其他接口 (/other/)

### 登录

```
POST /other/login                 // 无需 Token
```

**请求体**：

```json
{
  "username": "admin",
  "password": "admin123"
}
```

**响应**：

```json
{
  "code": 200,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 1,
      "name": "admin"
    }
  }
}
```

### 注册

```
POST /other/register              // 无需 Token
```

### 获取验证码

```
GET /other/getCaptcha
```

### 测试 AI

```
POST /other/testAI
```

### 测试图片

```
POST /other/testImage
```

### 测试视频

```
POST /other/testVideo
```

### 测试语音设计

```
POST /other/testVoiceDesign
```

### 清除数据库

```
POST /other/clearDatabase
```

### 删除所有数据

```
POST /other/deleteAllData
```

## 十五、响应格式

### 成功响应

```json
{
  "code": 200,
  "message": "success",
  "data": { /* 业务数据 */ }
}
```

### 错误响应

```json
{
  "code": 401,
  "message": "未提供token"
}
```

### 常见错误码

| 错误码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 (Token 无效/过期) |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

## 十六、WebSocket 接口

### 流式叙事

通过 WebSocket 连接进行流式叙事输出。

## 十七、文件上传

### 上传方式

使用 multipart/form-data 格式上传文件。

### 支持的文件类型

| 类型 | 扩展名 |
|------|--------|
| 图片 | jpg, jpeg, png, gif, webp |
| 音频 | mp3, wav, ogg |
| 视频 | mp4, webm |

### 文件大小限制

- 请求体限制：100MB
