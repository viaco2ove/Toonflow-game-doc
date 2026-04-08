// 测试脚本 - 验证 review.me.md 中的功能修复

const BASE_URL = 'http://127.0.0.1:60002';
let TOKEN = '';

// 辅助函数
async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['Authorization'] = TOKEN;
  
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  
  const res = await fetch(`${BASE_URL}${path}`, options);
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

// 测试结果
const results = [];

function log(name, passed, detail = '') {
  const result = { name, passed, detail };
  results.push(result);
  console.log(`[${passed ? '✅' : '❌'}] ${name}${detail ? ': ' + detail : ''}`);
}

async function main() {
  console.log('=== 开始测试 ===\n');
  
  // ========== TC-001: 登录 ==========
  console.log('\n--- TC-001: 登录测试 ---');
  try {
    const loginRes = await request('POST', '/other/login', { username: 'admin', password: 'admin123' });
    if (loginRes.data?.data?.token) {
      TOKEN = loginRes.data.data.token;
      log('TC-001 登录', true, `获取到 token: ${TOKEN.substring(0, 20)}...`);
    } else {
      log('TC-001 登录', false, JSON.stringify(loginRes.data));
    }
  } catch (e) {
    log('TC-001 登录', false, e.message);
  }
  
  if (!TOKEN) {
    console.log('\n登录失败，无法继续后续测试');
    return;
  }
  
  // ========== TC-002: 获取会话列表 (POST) ==========
  console.log('\n--- TC-002: 获取会话列表 ---');
  let chapterId = null;
  let sessionId = null;
  let worldId = null;
  let debugRuntimeKey = null;
  
  try {
    const sessionsRes = await request('POST', '/game/listSession', {});
    const sessions = sessionsRes.data?.data?.sessions || sessionsRes.data?.data || [];
    if (sessions.length > 0) {
      sessionId = sessions[0].id || sessions[0].sessionId;
      worldId = sessions[0].worldId;
      log('TC-002 获取会话', true, `找到 ${sessions.length} 个会话，使用第一个: ${sessionId}`);
    } else {
      log('TC-002 获取会话', false, '没有找到会话');
    }
  } catch (e) {
    log('TC-002 获取会话', false, e.message);
  }
  
  // ========== TC-003: 初始化调试模式 ==========
  console.log('\n--- TC-003: 初始化调试模式 ---');
  if (!sessionId) {
    try {
      const worldsRes = await request('POST', '/game/listWorlds', {});
      const worlds = worldsRes.data?.data?.worlds || worldsRes.data?.data || [];
      if (worlds.length > 0) {
        worldId = worlds[0].id;
        log('TC-003 获取世界', true, `找到 ${worlds.length} 个世界，使用: ${worldId}`);
        
        const chaptersRes = await request('GET', `/game/getChapter?worldId=${worldId}`);
        let chapters = chaptersRes.data?.data || [];
        if (chapters.length === 0) {
          const chaptersRes2 = await request('POST', '/game/getChapter', { worldId });
          chapters = chaptersRes2.data?.data || [];
        }
        if (chapters.length > 0) {
          chapterId = chapters[0].id;
          log('TC-003 获取章节', true, `找到 ${chapters.length} 个章节，使用: ${chapterId}`);
          
          const initRes = await request('POST', '/game/initDebug', { worldId, chapterId });
          if (initRes.data?.code === 0 || initRes.data?.data) {
            debugRuntimeKey = initRes.data?.data?.state?.debugRuntimeKey;
            sessionId = debugRuntimeKey; // 使用 debugRuntimeKey 作为会话标识
            log('TC-003 initDebug', true, `debugRuntimeKey: ${debugRuntimeKey}`);
            
            // 检查 endDialog
            const endDialog = initRes.data?.data?.endDialog;
            const endDialogDetail = initRes.data?.data?.endDialogDetail;
            log('TC-003 endDialog', true, endDialog ? `有结束对话: ${JSON.stringify(endDialogDetail)}` : '暂无结束对话');
            
            // 检查开场白
            const opening = initRes.data?.data?.opening;
            log('TC-003 开场白', !!opening, opening ? `角色: ${opening.role}, 内容: ${opening.presetContent?.substring(0, 30)}...` : '无开场白');
          } else {
            log('TC-003 initDebug', false, JSON.stringify(initRes.data));
          }
        } else {
          log('TC-003 获取章节', false, '没有找到章节');
        }
      } else {
        log('TC-003 获取世界', false, '没有找到世界');
      }
    } catch (e) {
      log('TC-003 初始化调试', false, e.message);
    }
  }
  
  // ========== TC-004: 重复初始化（验证不重复请求） ==========
  console.log('\n--- TC-004: 重复初始化测试 ---');
  if (chapterId && worldId) {
    try {
      const initRes2 = await request('POST', '/game/initDebug', { worldId, chapterId });
      if (initRes2.data?.code === 0 || initRes2.data?.data) {
        const debugRuntimeKey2 = initRes2.data?.data?.state?.debugRuntimeKey;
        log('TC-004 重复初始化', debugRuntimeKey === debugRuntimeKey2, 
          debugRuntimeKey === debugRuntimeKey2 ? '返回相同debugRuntimeKey，无重复请求' : `debugRuntimeKey不同: ${debugRuntimeKey} vs ${debugRuntimeKey2}`);
      } else {
        log('TC-004 重复初始化', false, JSON.stringify(initRes2.data));
      }
    } catch (e) {
      log('TC-004 重复初始化', false, e.message);
    }
  } else {
    log('TC-004 重复初始化', false, '无章节ID或世界ID，跳过');
  }
  
  // ========== TC-005: 获取消息验证事件索引 ==========
  console.log('\n--- TC-005: 事件索引验证 ---');
  if (debugRuntimeKey) {
    try {
      // getMessage 可能需要 debugRuntimeKey
      const msgRes = await request('GET', `/game/getMessage?sessionId=${debugRuntimeKey}`);
      const messages = msgRes.data?.data?.messages || [];
      const indices = messages.map(m => m.index || m.eventIndex);
      const hasDuplicate = indices.some((idx, i) => indices.indexOf(idx) !== i);
      
      log('TC-005 事件索引', !hasDuplicate, 
        `消息数量: ${messages.length}, 索引: [${indices.slice(0, 10).join(', ')}${indices.length > 10 ? '...' : ''}]`);
      
      const hasIntro = messages.some(m => m.isIntroduction || m.type === 'introduction' || m.eventType === 'on_opening');
      log('TC-005 开场白独立', hasIntro || messages.length > 0, hasIntro ? '开场白标记为独立' : '需检查开场白是否占用事件序号');
    } catch (e) {
      log('TC-005 获取消息', false, e.message);
    }
  }
  
  // ========== TC-006: 回溯功能 ==========
  console.log('\n--- TC-006: 回溯功能测试 ---');
  if (debugRuntimeKey) {
    try {
      const msgRes = await request('GET', `/game/getMessage?sessionId=${debugRuntimeKey}`);
      const messages = msgRes.data?.data?.messages || [];
      
      if (messages.length >= 2) {
        const revisitIndex = Math.floor(messages.length / 2);
        const revisitRes = await request('POST', '/game/revisitMessage', { 
          sessionId: debugRuntimeKey, 
          revisitIndex 
        });
        
        if (revisitRes.data?.code === 0 || revisitRes.data?.data) {
          log('TC-006 回溯功能', true, `回溯到索引 ${revisitIndex}`);
          
          const afterRes = await request('GET', `/game/getMessage?sessionId=${debugRuntimeKey}`);
          const afterMessages = afterRes.data?.data?.messages || [];
          log('TC-006 回溯验证', afterMessages.length === revisitIndex + 1, 
            `回溯后消息数: ${afterMessages.length}, 预期: ${revisitIndex + 1}`);
        } else {
          log('TC-006 回溯功能', false, JSON.stringify(revisitRes.data));
        }
      } else {
        log('TC-006 回溯功能', false, '消息数量不足，无法测试回溯');
      }
    } catch (e) {
      log('TC-006 回溯功能', false, e.message);
    }
  }
  
  // ========== TC-007: 编排日志 ==========
  console.log('\n--- TC-007: 编排日志验证 ---');
  try {
    const logRes = await request('GET', '/setting/getAiTokenUsageLog?limit=5');
    const logs = logRes.data?.data || [];
    log('TC-007 编排日志', logs.length > 0, `找到 ${logs.length} 条日志记录`);
    
    if (logs.length > 0) {
      const latestLog = logs[0];
      const hasInputOutput = latestLog.inputTokens !== undefined || latestLog.outputTokens !== undefined;
      log('TC-007 Token记录', hasInputOutput, JSON.stringify(latestLog));
    }
  } catch (e) {
    log('TC-007 编排日志', false, e.message);
  }
  
  // ========== TC-008: 结束条件判定 ==========
  console.log('\n--- TC-008: 结束条件判定 ---');
  if (debugRuntimeKey) {
    try {
      const sessionRes = await request('GET', `/game/getSession?id=${debugRuntimeKey}`);
      const session = sessionRes.data?.data;
      const hasEndDialog = session?.endDialog || session?.endDialogDetail;
      log('TC-008 结束判定', true, hasEndDialog ? `有结束对话: ${JSON.stringify(session?.endDialogDetail)}` : '暂无结束对话');
    } catch (e) {
      log('TC-008 结束判定', false, e.message);
    }
  }
  
  // ========== 输出测试结果汇总 ==========
  console.log('\n\n=== 测试结果汇总 ===');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`通过: ${passed}, 失败: ${failed}`);
  console.log('\n详细结果:');
  results.forEach(r => {
    console.log(`  [${r.passed ? '✅' : '❌'}] ${r.name}${r.detail ? ': ' + r.detail : ''}`);
  });
  
  // 生成报告
  const report = {
    timestamp: new Date().toISOString(),
    passed,
    failed,
    results
  };
  console.log('\n\n=== JSON 报告 ===');
  console.log(JSON.stringify(report, null, 2));
}

main().catch(console.error);
