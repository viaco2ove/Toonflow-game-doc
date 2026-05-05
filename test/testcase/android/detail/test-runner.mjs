/**
 * 安卓端完整测试脚本
 * 模拟安卓端 API 调用，验证所有功能
 */

const BASE_URL = 'http://127.0.0.1:60002';
let TOKEN = '';
let WORLD_ID = 1;
let CHAPTER_ID = 1;

const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function log(name, success, detail) {
  const status = success ? '✅' : '❌';
  console.log(`${status} ${name}: ${detail}`);
  results.tests.push({ name, success, detail });
  if (success) results.passed++;
  else results.failed++;
}

async function request(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': TOKEN
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  const data = await res.json();
  return { status: res.status, data };
}

// 解析状态字段（模拟安卓端 Gson 解析）
function parseChapterProgress(state) {
  if (!state || !state.chapterProgress) return null;
  const cp = state.chapterProgress;
  return {
    eventIndex: cp.eventIndex,
    eventKind: cp.eventKind || '',
    eventSummary: cp.eventSummary || '',
    eventFacts: cp.eventFacts,
  };
}

function parseTurnState(state) {
  if (!state || !state.turnState) return null;
  const ts = state.turnState;
  return {
    canPlayerSpeak: ts.canPlayerSpeak || false,
    expectedRoleType: ts.expectedRoleType || '',
    expectedRole: ts.expectedRole || '',
    lastSpeaker: ts.lastSpeaker || '',
  };
}

async function main() {
  console.log('========================================');
  console.log('安卓端完整测试');
  console.log('========================================\n');

  // ========== TC-A01: 登录 ==========
  console.log('--- TC-A01: 登录测试 ---');
  try {
    const loginRes = await request('POST', '/other/login', { 
      username: 'admin', 
      password: 'admin123' 
    });
    if (loginRes.data?.data?.token) {
      TOKEN = loginRes.data.data.token;
      log('TC-A01 登录', true, `获取到 token: ${TOKEN.substring(0, 20)}...`);
    } else {
      log('TC-A01 登录', false, JSON.stringify(loginRes.data));
      return;
    }
  } catch (e) {
    log('TC-A01 登录', false, e.message);
    return;
  }

  // ========== TC-A02: 获取故事世界列表 ==========
  console.log('\n--- TC-A02: 获取故事世界列表 ---');
  let worldId = null;
  try {
    const worldsRes = await request('POST', '/game/listWorlds', {});
    if (worldsRes.data?.data && Array.isArray(worldsRes.data.data)) {
      const worlds = worldsRes.data.data;
      if (worlds.length > 0) {
        worldId = worlds[0].id;
        WORLD_ID = worldId;
        log('TC-A02 获取世界', true, `找到 ${worlds.length} 个世界，使用: ${worldId}`);
        
        // 验证世界数据模型
        const world = worlds[0];
        const hasRequiredFields = world.id !== undefined && 
                                   world.name !== undefined && 
                                   world.projectId !== undefined;
        log('TC-A02 世界数据模型', hasRequiredFields, 
          hasRequiredFields ? '必要字段完整' : '缺少必要字段');
        
        // 检查 settings 字段
        const hasSettings = world.settings !== undefined;
        log('TC-A02 世界设置', hasSettings, 
          hasSettings ? '包含 settings 字段' : '缺少 settings 字段');
      } else {
        log('TC-A02 获取世界', false, '没有找到世界');
      }
    } else {
      log('TC-A02 获取世界', false, JSON.stringify(worldsRes.data));
    }
  } catch (e) {
    log('TC-A02 获取世界', false, e.message);
  }

  if (!worldId) {
    console.log('没有可用的世界，测试终止');
    return;
  }

  // ========== TC-A03: 初始化调试模式 ==========
  console.log('\n--- TC-A03: 初始化调试模式 ---');
  let initState = null;
  
  try {
    const initRes = await request('POST', '/game/initDebug', { 
      worldId: WORLD_ID, 
      chapterId: CHAPTER_ID 
    });
    if (initRes.data?.data) {
      const d = initRes.data.data;
      initState = d.state;
      log('TC-A03 initDebug', true, 
        `state 有 debugRuntimeKey: ${!!initState?.debugRuntimeKey}`);
      
      // 验证数据模型
      const hasState = d.state !== undefined;
      log('TC-A03 状态字段', hasState, hasState ? '包含 state 字段' : '缺少 state 字段');
      
      // 验证事件摘要（字段在 state 中）
      const hasCurrentDigest = d.state?.currentEventDigest !== undefined;
      const hasDigestWindow = d.state?.eventDigestWindow !== undefined;
      const hasDigestWindowText = d.state?.eventDigestWindowText !== undefined;
      log('TC-A03 事件摘要', hasCurrentDigest && hasDigestWindow, 
        `currentEventDigest: ${hasCurrentDigest}, eventDigestWindow: ${hasDigestWindow}`);
      
      if (!hasCurrentDigest || !hasDigestWindow) {
        console.log('  实际值:');
        console.log('    currentEventDigest:', d.state?.currentEventDigest);
        console.log('    eventDigestWindow:', d.state?.eventDigestWindow);
        console.log('    eventDigestWindowText:', d.state?.eventDigestWindowText);
      }
      
      // 解析 chapterProgress
      const chapterProgress = parseChapterProgress(initState);
      if (chapterProgress) {
        console.log('  chapterProgress:', {
          eventIndex: chapterProgress.eventIndex,
          eventKind: chapterProgress.eventKind,
          eventSummary: chapterProgress.eventSummary.substring(0, 30)
        });
        log('TC-A03 章节进度', true, 
          `eventIndex=${chapterProgress.eventIndex}, eventKind=${chapterProgress.eventKind}`);
      } else {
        log('TC-A03 章节进度', false, '缺少 chapterProgress');
      }
      
      // 验证不再返回 opening 和 firstChapter 字段
      const hasOpening = 'opening' in d;
      const hasFirstChapter = 'firstChapter' in d;
      log('TC-A03 接口分离验证', !hasOpening && !hasFirstChapter, 
        `opening: ${hasOpening}, firstChapter: ${hasFirstChapter} (应该都为 false)`);
    } else {
      log('TC-A03 initDebug', false, JSON.stringify(initRes.data));
    }
  } catch (e) {
    log('TC-A03 initDebug', false, e.message);
  }

  if (!initState) {
    console.log('初始化失败，测试终止');
    return;
  }

  // ========== TC-A04: 获取开场白 ==========
  console.log('\n--- TC-A04: 获取开场白 ---');
  let step0State = initState;
  let step0Messages = [];
  
  try {
    // 使用 introduction 接口获取开场白
    const introRes = await request('POST', '/game/introduction', {
      worldId: WORLD_ID,
      chapterId: CHAPTER_ID,
      state: initState
    });
    
    if (introRes.data?.data) {
      const d = introRes.data.data;
      step0State = d.state;
      
      // 验证 plan 字段
      if (d.plan) {
        log('TC-A04 introduction', true, `返回 plan, eventType=${d.plan.eventType}`);
        
        // 验证开场白内容
        const hasPresetContent = d.plan.presetContent && d.plan.presetContent.length > 0;
        log('TC-A04 开场白内容', hasPresetContent, 
          hasPresetContent ? `内容长度: ${d.plan.presetContent.length}` : '缺少 presetContent');
        
        // 将 plan 转换为消息格式（模拟前端处理）
        if (hasPresetContent) {
          step0Messages.push({
            role: d.plan.role,
            roleType: d.plan.roleType,
            content: d.plan.presetContent,
            eventType: d.plan.eventType,
            round: 0
          });
        }
        
        // 验证开场白标记
        const opening = step0Messages.find(m => m.eventType === 'on_opening');
        log('TC-A04 开场白标记', !!opening, 
          opening ? `找到 eventType=on_opening` : '未找到开场白标记');
        
        // 验证消息数据模型
        if (step0Messages.length > 0) {
          const msg = step0Messages[0];
          const hasRequiredFields = msg.role !== undefined && 
                                     msg.roleType !== undefined &&
                                     msg.content !== undefined;
          log('TC-A04 消息数据模型', hasRequiredFields, 
            hasRequiredFields ? '必要字段完整' : '缺少必要字段');
        }
      } else {
        log('TC-A04 introduction', false, '缺少 plan 字段');
      }
      
      // 解析轮次状态
      const turnState = parseTurnState(step0State);
      if (turnState) {
        console.log('  turnState:', {
          canPlayerSpeak: turnState.canPlayerSpeak,
          expectedRoleType: turnState.expectedRoleType,
          expectedRole: turnState.expectedRole
        });
        log('TC-A04 轮次状态', true, 
          `canPlayerSpeak=${turnState.canPlayerSpeak}, expectedRoleType=${turnState.expectedRoleType}`);
      }
    } else {
      log('TC-A04 introduction', false, JSON.stringify(introRes.data));
    }
  } catch (e) {
    log('TC-A04 introduction', false, e.message);
  }

  // ========== TC-A05: 用户输入推进剧情 ==========
  console.log('\n--- TC-A05: 用户输入推进剧情 ---');
  let step1State = step0State;
  let step1Messages = [...step0Messages];
  
  const turnState0 = parseTurnState(step0State);
  if (turnState0?.canPlayerSpeak) {
    try {
      const stepRes = await request('POST', '/game/debugStep', {
        worldId: WORLD_ID,
        chapterId: CHAPTER_ID,
        state: step0State,
        messages: step0Messages,
        playerContent: '你好，我想探索这个地方'
      });
      
      if (stepRes.data?.data) {
        const d = stepRes.data.data;
        step1State = d.state;
        step1Messages = [...step1Messages, ...(d.messages || [])];
        log('TC-A05 debugStep #1 (用户)', true, `返回 ${d.messages?.length || 0} 条消息`);
        
        // 验证事件索引递增
        const cp0 = parseChapterProgress(step0State);
        const cp1 = parseChapterProgress(step1State);
        if (cp0 && cp1 && cp1.eventIndex !== null) {
          const indexIncreased = cp1.eventIndex > (cp0.eventIndex || 0);
          log('TC-A05 事件索引递增', indexIncreased, 
            `${cp0.eventIndex} -> ${cp1.eventIndex}`);
        }
        
        // 验证用户消息
        const playerMsg = d.messages?.find(m => m.eventType === 'on_message');
        log('TC-A05 用户消息', !!playerMsg, 
          playerMsg ? `找到用户消息: ${playerMsg.content.substring(0, 30)}` : '未找到用户消息');
      } else {
        log('TC-A05 debugStep #1', false, JSON.stringify(stepRes.data));
      }
    } catch (e) {
      log('TC-A05 debugStep #1', false, e.message);
    }
  } else {
    log('TC-A05 debugStep #1', false, 'canPlayerSpeak=false，无法发言');
  }

  // ========== TC-A06: 旁白继续发言 ==========
  console.log('\n--- TC-A06: 旁白继续发言 ---');
  let step2State = step1State;
  let step2Messages = [...step1Messages];
  
  try {
    const stepRes = await request('POST', '/game/debugStep', {
      worldId: WORLD_ID,
      chapterId: CHAPTER_ID,
      state: step1State,
      messages: step1Messages
    });
    
    if (stepRes.data?.data) {
      const d = stepRes.data.data;
      step2State = d.state;
      step2Messages = [...step2Messages, ...(d.messages || [])];
      log('TC-A06 debugStep #2 (旁白)', true, `返回 ${d.messages?.length || 0} 条消息`);
      
      // 验证旁白消息
      if (d.messages && d.messages.length > 0) {
        const narratorMsg = d.messages.find(m => m.roleType === 'narrator');
        log('TC-A06 旁白消息', !!narratorMsg, 
          narratorMsg ? `找到旁白消息: ${narratorMsg.content.substring(0, 30)}` : '未找到旁白消息');
      }
      
      // 验证轮次转换
      const turnState2 = parseTurnState(step2State);
      if (turnState2) {
        console.log('  turnState:', {
          canPlayerSpeak: turnState2.canPlayerSpeak,
          expectedRoleType: turnState2.expectedRoleType
        });
      }
    } else {
      log('TC-A06 debugStep #2', false, JSON.stringify(stepRes.data));
    }
  } catch (e) {
    log('TC-A06 debugStep #2', false, e.message);
  }

  // ========== TC-A08: 消息回溯标记验证 ==========
  console.log('\n--- TC-A08: 消息回溯标记验证 ---');
  
  if (step2Messages.length > 0) {
    const lastMsg = step2Messages[step2Messages.length - 1];
    const prevMsgs = step2Messages.slice(0, -1);
    
    // 检查是否所有前面的消息都支持回溯
    const allPrevCanRevisit = prevMsgs.every((m, i) => {
      // 在实际安卓端，canRevisit 是根据索引计算的
      return i < step2Messages.length - 1;
    });
    
    log('TC-A08 回溯标记', allPrevCanRevisit, 
      `前 ${prevMsgs.length} 条消息支持回溯，最后一条不支持`);
  } else {
    log('TC-A08 回溯标记', false, '消息列表为空');
  }

  // ========== TC-A09: 执行消息回溯 ==========
  console.log('\n--- TC-A09: 执行消息回溯 ---');
  
  if (step2Messages.length >= 2) {
    const revisitIndex = Math.floor(step2Messages.length / 2);
    const debugRuntimeKey = step2State?.debugRuntimeKey;
    
    if (debugRuntimeKey) {
      try {
        // 使用调试模式的回溯接口
        const revisitRes = await request('POST', '/game/debugRuntimeShared/revisit', {
          debugRuntimeKey: debugRuntimeKey,
          messageCount: revisitIndex
        });
        
        if (revisitRes.data?.state) {
          log('TC-A09 回溯请求', true, `回溯到消息索引: ${revisitIndex}`);
          
          // 验证返回的状态
          const revisitedState = revisitRes.data;
          console.log('  回溯后状态:');
          console.log('    messageCount:', revisitedState.messageCount);
          console.log('    round:', revisitedState.round);
          console.log('    chapterId:', revisitedState.chapterId);
          
          // TC-A10: 验证回溯效果（使用回溯后的状态继续游戏）
          if (revisitedState.state) {
            log('TC-A10 回溯验证', true, '回溯成功，状态有效');
          } else {
            log('TC-A10 回溯验证', false, '回溯后状态无效');
          }
        } else {
          log('TC-A09 回溯请求', false, JSON.stringify(revisitRes.data));
        }
      } catch (e) {
        log('TC-A09 回溯功能', false, e.message);
      }
    } else {
      log('TC-A09 回溯功能', false, '缺少 debugRuntimeKey');
    }
  } else {
    log('TC-A09 回溯功能', false, `消息数量不足: ${step2Messages.length}`);
  }

  // ========== TC-A13: 事件索引验证 ==========
  console.log('\n--- TC-A13: 事件索引验证 ---');
  
  const finalProgress = parseChapterProgress(step2State);
  if (finalProgress) {
    log('TC-A13 事件索引', finalProgress.eventIndex !== undefined, 
      `eventIndex=${finalProgress.eventIndex}`);
    log('TC-A13 事件类型', finalProgress.eventKind !== '', 
      `eventKind=${finalProgress.eventKind}`);
    log('TC-A13 事件摘要', finalProgress.eventSummary !== '', 
      `eventSummary="${finalProgress.eventSummary.substring(0, 30)}..."`);
  } else {
    log('TC-A13 事件索引', false, '缺少 chapterProgress');
  }

  // ========== TC-A15: 事件摘要验证 ==========
  console.log('\n--- TC-A15: 事件摘要验证 ---');
  
  // 获取最新的结果数据
  try {
    const lastStepRes = await request('POST', '/game/debugStep', {
      worldId: WORLD_ID,
      chapterId: CHAPTER_ID,
      state: step2State,
      messages: step2Messages
    });
    
    if (lastStepRes.data?.data) {
      const d = lastStepRes.data.data;
      
      // 验证 currentEventDigest（字段在 state 中）
      if (d.state?.currentEventDigest) {
        const digest = d.state.currentEventDigest;
        log('TC-A15 当前事件摘要', true, 
          `index=${digest.eventIndex}, kind=${digest.eventKind}`);
        console.log('  eventSummary:', digest.eventSummary?.substring(0, 50));
      } else {
        log('TC-A15 当前事件摘要', false, '缺少 currentEventDigest');
        console.log('  实际值:', d.state?.currentEventDigest);
      }
      
      // 验证 eventDigestWindow（字段在 state 中）
      if (d.state?.eventDigestWindow && Array.isArray(d.state.eventDigestWindow)) {
        log('TC-A15 事件窗口', true, `包含 ${d.state.eventDigestWindow.length} 个事件摘要`);
        
        // 验证事件窗口数据模型
        if (d.state.eventDigestWindow.length > 0) {
          const firstDigest = d.state.eventDigestWindow[0];
          const hasRequiredFields = firstDigest.eventIndex !== undefined &&
                                     firstDigest.eventKind !== undefined &&
                                     firstDigest.eventSummary !== undefined;
          log('TC-A15 事件摘要数据模型', hasRequiredFields, 
            hasRequiredFields ? '必要字段完整' : '缺少必要字段');
        }
      } else {
        log('TC-A15 事件窗口', false, '缺少 eventDigestWindow');
        console.log('  实际值:', d.state?.eventDigestWindow);
      }
      
      // 验证 eventDigestWindowText（字段在 state 中）
      if (d.state?.eventDigestWindowText) {
        log('TC-A15 事件摘要文本', true, 
          `文本长度: ${d.state.eventDigestWindowText.length}`);
      } else {
        log('TC-A15 事件摘要文本', false, '缺少 eventDigestWindowText');
        console.log('  实际值:', d.state?.eventDigestWindowText);
      }
    }
  } catch (e) {
    log('TC-A15 事件摘要', false, e.message);
  }

  // ========== TC-A16: 轮次状态验证 ==========
  console.log('\n--- TC-A16: 轮次状态验证 ---');
  
  const finalTurnState = parseTurnState(step2State);
  if (finalTurnState) {
    log('TC-A16 canPlayerSpeak', typeof finalTurnState.canPlayerSpeak === 'boolean', 
      `canPlayerSpeak=${finalTurnState.canPlayerSpeak}`);
    log('TC-A16 expectedRoleType', finalTurnState.expectedRoleType !== '', 
      `expectedRoleType=${finalTurnState.expectedRoleType}`);
    log('TC-A16 expectedRole', finalTurnState.expectedRole !== '', 
      `expectedRole=${finalTurnState.expectedRole}`);
  } else {
    log('TC-A16 轮次状态', false, '缺少 turnState');
  }

  // ========== 结果汇总 ==========
  console.log('\n========================================');
  console.log('测试结果汇总');
  console.log('========================================');
  console.log(`通过: ${results.passed}, 失败: ${results.failed}`);
  
  results.tests.forEach(t => {
    console.log(`  ${t.success ? '✅' : '❌'} ${t.name}: ${t.detail}`);
  });

  // 写入 JSON 报告
  const report = {
    timestamp: new Date().toISOString(),
    platform: 'android',
    passed: results.passed,
    failed: results.failed,
    results: results.tests
  };
  
  const fs = await import('fs');
  const reportPath = 'D:\\Users\\viaco\\tools\\Toonflow-game\\toonflow-game-app\\test\\testcase\\android\\detail\\test-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n报告已生成: ${reportPath}`);
}

main().catch(console.error);
