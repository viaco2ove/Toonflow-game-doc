# 安卓端测试用例总览

## 测试环境

- 后端地址: http://127.0.0.1:60002 (local 环境)
- 测试账号: admin / admin123
- 测试方式: Node.js 模拟安卓端 API 调用

## 测试用例列表

### 1. 基础功能测试
- [1.登录和初始化.md](./1.登录和初始化.md) - TC-A01 ~ TC-A03

### 2. 游戏流程测试
- [2.游戏流程.md](./2.游戏流程.md) - TC-A04 ~ TC-A07

### 3. 回溯功能测试
- [3.回溯功能.md](./3.回溯功能.md) - TC-A08 ~ TC-A12

### 4. 事件和状态测试
- [4.事件和状态.md](./4.事件和状态.md) - TC-A13 ~ TC-A18

## 测试重点

### 安卓端特有功能
1. **数据模型验证**: 验证 Kotlin 数据类与后端 JSON 的映射
2. **状态管理**: 验证 Session 状态在安卓端的正确处理
3. **消息列表**: 验证消息列表的累积和显示
4. **事件摘要**: 验证 `eventDigestWindow` 的正确性

### 与 Web 端的差异
- 安卓端使用 Retrofit2 + Gson 进行网络请求
- 使用 Kotlin 协程处理异步操作
- 使用 `JsonElement` 处理动态字段
- 事件摘要在 `SessionItem` 和 `SessionDetail` 中都有体现

## 测试数据模型

### DebugStepResult
```kotlin
data class DebugStepResult(
  val chapterId: Long?,
  val chapterTitle: String,
  val state: JsonElement?,
  val endDialog: String?,
  val endDialogDetail: String?,
  val messages: List<MessageItem>,
  val currentEventDigest: RuntimeEventDigestItem?,
  val eventDigestWindow: List<RuntimeEventDigestItem>,
  val eventDigestWindowText: String,
)
```

### RuntimeEventDigestItem
```kotlin
data class RuntimeEventDigestItem(
  val eventIndex: Int,
  val eventKind: String,
  val eventFlowType: String,
  val eventSummary: String,
  val eventFacts: JsonElement?,
  val eventStatus: String,
  val summarySource: String,
  val memorySummary: String,
  val memoryFacts: JsonElement?,
  val updateTime: Long,
  val allowedRoles: List<String>,
  val userNodeId: String,
)
```

## 运行测试

```bash
cd D:\Users\viaco\tools\Toonflow-game\toonflow-game-app
node test/testcase/android/detail/test-runner.mjs
```

## 测试报告

测试完成后，报告将生成在:
- `test/testcase/android/detail/test-report.json`
- `test/testcase/android/detail/test-report.md`
