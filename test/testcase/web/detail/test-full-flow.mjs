/**
 * 完整游戏流程测试
 * 验证事件索引、回溯功能、编排日志
 */

const BASE_URL = 'http://127.0.0.1:60002';
let TOKEN = '';
let WORLD_ID = 1;  // 使用实际存在的世界ID
let CHAPTER_ID = 1;  // 使用实际存在的章节ID

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

async function main() {
  console.log('========================================');
  console.log('完整游戏流程测试');
  console.log('========================================\n');

  // ========== 1. 登录 ==========
  console.log('--- 1. 登录 ---');
  try {
    const loginRes = await request('POST', '/other/login', { username: 'admin', password: 'admin123' });
    if (loginRes.data?.data?.token) {
      TOKEN = loginRes.data.data.token;
      log('登录', true, `获取到 token: ${TOKEN.substring(0, 20)}...`);
    } else {
      log('登录', false, JSON.stringify(loginRes.data));
      return;
    }
  } catch (e) {
    log('登录', false, e.message);
    return;
  }

  // ========== 2. 初始化调试模式 ==========
  console.log('\n--- 2. 初始化调试模式 ---');
  let initState = null;
  let initMessages = [];
  
  try {
    const initRes = await request('POST', '/game/initDebug', { worldId: WORLD_ID, chapterId: CHAPTER_ID });
    if (initRes.data?.data) {
      const d = initRes.data.data;
      initState = d.state;
      initMessages = d.messages || [];
      log('initDebug', true, `返回 ${initMessages.length} 条消息, state 有 debugRuntimeKey: ${!!initState?.debugRuntimeKey}`);
      
      // 检查消息索引
      if (initMessages.length > 0) {
        const indices = initMessages.map(m => m.eventIndex);
        console.log('  初始消息索引:', indices);
        log('初始消息数量', initMessages.length > 0, `${initMessages.length} 条`);
      }
    } else {
      log('initDebug', false, JSON.stringify(initRes.data));
      return;
    }
  } catch (e) {
    log('initDebug', false, e.message);
    return;
  }

  // ========== 3. 获取开场白（不传 playerContent） ==========
  console.log('\n--- 3. 获取开场白 ---');
  let step0State = null;
  let step0Messages = [];
  
  try {
    // 不传 playerContent，先获取开场白
    const stepRes = await request('POST', '/game/debugStep', {
      worldId: WORLD_ID,
      chapterId: CHAPTER_ID,
      state: initState,
      messages: initMessages
      // 不传 playerContent
    });
    
    if (stepRes.data?.data) {
      const d = stepRes.data.data;
      step0State = d.state;
      step0Messages = d.messages || [];
      log('debugStep #0 (开场白)', true, `返回 ${step0Messages.length} 条消息`);
      
      // 检查消息
      if (step0Messages.length > 0) {
        step0Messages.forEach((m, i) => {
          console.log(`  [${i}] role=${m.role}, eventType=${m.eventType}, id=${m.id}`);
        });
        
        // 检查开场白标记
        const opening = step0Messages.find(m => m.eventType === 'on_opening');
        log('开场白标记', !!opening, opening ? `找到 eventType=on_opening` : '未找到开场白标记');
      }
      
      // 检查状态中的 chapterProgress
      const chapterProgress = step0State?.chapterProgress;
      console.log('  chapterProgress:', {
        eventIndex: chapterProgress?.eventIndex,
        eventKind: chapterProgress?.eventKind,
        eventSummary: chapterProgress?.eventSummary?.substring(0, 50)
      });
      
      // 打印状态中的轮次信息
      const turnState = step0State?.turnState;
      console.log('  turnState:', {
        canPlayerSpeak: turnState?.canPlayerSpeak,
        expectedRoleType: turnState?.expectedRoleType,
        expectedRole: turnState?.expectedRole
      });
      
      log('开场白后状态检查', !!chapterProgress, `eventIndex=${chapterProgress?.eventIndex}, eventKind=${chapterProgress?.eventKind}`);
    } else {
      log('debugStep #0', false, JSON.stringify(stepRes.data));
    }
  } catch (e) {
    log('debugStep #0', false, e.message);
  }

  // ========== 4. 继续推进（让旁白发言，不带 playerContent） ==========
  console.log('\n--- 4. 继续推进（旁白发言）---');
  let step1State = step0State;
  let step1Messages = step0Messages;
  
  // 使用 step0 的状态和消息
  const currentState = step0State || initState;
  const currentMessages = step0Messages.length > 0 ? step0Messages : initMessages;
  
  try {
    // 不传 playerContent，让旁白继续发言
    const stepRes = await request('POST', '/game/debugStep', {
      worldId: WORLD_ID,
      chapterId: CHAPTER_ID,
      state: currentState,
      messages: currentMessages
    });
    
    if (stepRes.data?.data) {
      const d = stepRes.data.data;
      step1State = d.state;
      step1Messages = d.messages || [];
      log('debugStep #1 (旁白)', true, `返回 ${step1Messages.length} 条消息`);
      
      // 检查状态
      const cp1 = step1State?.chapterProgress;
      const ts1 = step1State?.turnState;
      console.log('  chapterProgress:', {
        eventIndex: cp1?.eventIndex,
        eventKind: cp1?.eventKind
      });
      console.log('  turnState:', {
        canPlayerSpeak: ts1?.canPlayerSpeak,
        expectedRoleType: ts1?.expectedRoleType
      });
      
      if (step1Messages.length > 0) {
        step1Messages.forEach((m, i) => {
          console.log(`  [${i}] role=${m.role}, eventType=${m.eventType}`);
        });
      }
    } else {
      log('debugStep #1 (旁白)', false, JSON.stringify(stepRes.data));
    }
  } catch (e) {
    log('debugStep #1 (旁白)', false, e.message);
  }

  // ========== 5. 用户输入，推进剧情 ==========
  console.log('\n--- 5. 用户输入推进剧情 ---');
  let step2State = step1State;
  let step2Messages = step1Messages;
  
  // 检查是否可以用户发言
  const canSpeak = step1State?.turnState?.canPlayerSpeak;
  console.log('  canPlayerSpeak:', canSpeak);
  
  if (canSpeak) {
    try {
      const stepRes = await request('POST', '/game/debugStep', {
        worldId: WORLD_ID,
        chapterId: CHAPTER_ID,
        state: step1State,
        messages: step1Messages,
        playerContent: '你好，我想探索这个地方'
      });
      
      if (stepRes.data?.data) {
        const d = stepRes.data.data;
        step2State = d.state;
        step2Messages = d.messages || [];
        log('debugStep #2 (用户)', true, `返回 ${step2Messages.length} 条消息`);
        
        // 检查消息索引
        if (step2Messages.length > 0) {
          step2Messages.forEach((m, i) => {
            console.log(`  [${i}] role=${m.role}, eventType=${m.eventType}`);
          });
        }
      } else {
        log('debugStep #2 (用户)', false, JSON.stringify(stepRes.data));
      }
    } catch (e) {
      log('debugStep #2 (用户)', false, e.message);
    }
  } else {
    log('debugStep #2 (用户)', false, 'canPlayerSpeak=false，无法发言');
  }

  // ========== 6. 再次推进（让旁白响应） ==========
  console.log('\n--- 6. 再次推进（旁白响应）---');
  let step3State = step2State;
  let step3Messages = step2Messages;
  
  // 检查是否可以用户发言，如果不能则需要旁白继续
  const canSpeak2 = step2State?.turnState?.canPlayerSpeak;
  console.log('  canPlayerSpeak:', canSpeak2);
  
  try {
    const stepRes = await request('POST', '/game/debugStep', {
      worldId: WORLD_ID,
      chapterId: CHAPTER_ID,
      state: step2State,
      messages: step2Messages
    });
    
    if (stepRes.data?.data) {
      const d = stepRes.data.data;
      step3State = d.state;
      step3Messages = d.messages || [];
      log('debugStep #3 (旁白响应)', true, `返回 ${step3Messages.length} 条消息`);
      
      // 检查状态
      const cp3 = step3State?.chapterProgress;
      const ts3 = step3State?.turnState;
      console.log('  chapterProgress:', {
        eventIndex: cp3?.eventIndex,
        eventKind: cp3?.eventKind,
        eventSummary: cp3?.eventSummary?.substring(0, 50)
      });
      console.log('  turnState:', {
        canPlayerSpeak: ts3?.canPlayerSpeak,
        expectedRoleType: ts3?.expectedRoleType
      });
      
      if (step3Messages.length > 0) {
        step3Messages.forEach((m, i) => {
          console.log(`  [${i}] role=${m.role}, eventType=${m.eventType}`);
        });
      }
    } else {
      log('debugStep #3 (旁白响应)', false, JSON.stringify(stepRes.data));
    }
  } catch (e) {
    log('debugStep #3 (旁白响应)', false, e.message);
  }

  // ========== 7. 测试回溯功能 ==========
  console.log('\n--- 7. 测试回溯功能 ---');
  
  // 使用累积的消息列表
  const allMessages = [...step0Messages, ...step1Messages, ...step2Messages, ...step3Messages].filter(Boolean);
  console.log('  总消息数:', allMessages.length);
  
  if (allMessages.length >= 2) {
    // 找一个可以回溯的消息
    const revisitIndex = Math.floor(allMessages.length / 2);
    const revisitMsg = allMessages[revisitIndex];
    
    console.log('  尝试回溯到消息:', revisitIndex, 'canRevisit:', revisitMsg?.canRevisit);
    
    if (revisitMsg?.canRevisit) {
      try {
        const revisitRes = await request('POST', '/game/revisitMessage', {
          sessionId: step3State?.debugRuntimeKey,  // 调试模式用 debugRuntimeKey
          messageIndex: revisitIndex
        });
        
        if (revisitRes.data?.code === 0 || revisitRes.data?.data) {
          log('回溯请求', true, `回溯到消息索引: ${revisitIndex}`);
          
          // 验证回溯后的消息
          const afterRes = await request('POST', '/game/getMessage', {
            sessionId: step3State?.debugRuntimeKey
          });
          const afterMessages = afterRes.data?.data || [];
          log('回溯验证', afterMessages.length === revisitIndex + 1, 
            `回溯后消息数: ${afterMessages.length}, 预期: ${revisitIndex + 1}`);
        } else {
          log('回溯请求', false, JSON.stringify(revisitRes.data));
        }
      } catch (e) {
        log('回溯功能', false, e.message);
      }
    } else {
      log('回溯功能', false, `消息 index=${revisitIndex} 不支持回溯`);
    }
  } else {
    log('回溯功能', false, `消息数量不足: ${allMessages.length}`);
  }

  // ========== 8. 检查编排日志 ==========
  console.log('\n--- 8. 检查编排日志 ---');
  
  try {
    const logRes = await request('POST', '/game/getAiTokenUsageLog', { limit: 10 });
    const logs = logRes.data?.data || [];
    log('编排日志', logs.length > 0, `找到 ${logs.length} 条日志记录`);
    
    if (logs.length > 0) {
      const latestLog = logs[0];
      console.log('  最新日志:', {
        inputTokens: latestLog.inputTokens,
        outputTokens: latestLog.outputTokens,
        createTime: latestLog.createTime
      });
    }
  } catch (e) {
    log('编排日志', false, e.message);
  }

  // ========== 9. 检查结束条件 ==========
  console.log('\n--- 9. 检查结束条件 ---');
  
  if (step3State) {
    const hasEndDialog = step3State?.endDialog || step3State?.endDialogDetail;
    log('结束判定', true, hasEndDialog ? `有结束对话` : '暂无结束对话');
    
    if (step3State?.endDialogDetail) {
      console.log('  结束详情:', step3State.endDialogDetail);
    }
    
    // 检查 chapterProgress
    const cp = step3State?.chapterProgress;
    log('章节进度', !!cp, `eventIndex=${cp?.eventIndex}, eventKind=${cp?.eventKind}`);
  }

  // ========== 结果汇总 ==========
  console.log('\n========================================');
  console.log('测试结果汇总');
  console.log('========================================');
  console.log(`通过: ${results.passed}, 失败: ${results.failed}`);
  
  results.tests.forEach(t => {
    console.log(`  ${t.success ? '✅' : '❌'} ${t.name}: ${t.detail}`);
  });
}

main().catch(console.error);
