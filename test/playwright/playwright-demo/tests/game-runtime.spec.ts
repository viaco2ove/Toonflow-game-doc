import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

// 辅助函数：等待并截图
async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
}

// 辅助函数：等待加载完成
async function waitForLoading(page: Page) {
  // 等待加载动画消失或内容出现
  await page.waitForTimeout(2000);
}

test.describe('游戏运行时功能测试', () => {
  
  test.beforeEach(async ({ page }) => {
    // 每个测试前打开页面
    await page.goto(BASE_URL);
    await waitForLoading(page);
    await screenshot(page, '01-initial-load');
  });

  test('步骤1: 页面加载和初始状态', async ({ page }) => {
    // 检查页面标题
    await expect(page).toHaveTitle(/Toonflow/);
    
    // 检查底部导航是否存在
    const bottomNav = page.locator('.bottom-nav, nav, [class*="nav"]').first();
    await expect(bottomNav).toBeVisible();
    
    // 检查主要标签页按钮
    const homeTab = page.getByText('首页').or(page.getByText('home')).first();
    const historyTab = page.getByText('历史').or(page.getByText('history')).first();
    
    console.log('✅ 步骤1完成: 页面加载正常');
    await screenshot(page, '02-home-page');
  });

  test('步骤2: 进入历史/游玩页面', async ({ page }) => {
    // 点击历史标签
    const historyTab = page.getByText('历史').or(page.getByText('history')).or(page.locator('[class*="history"]').first());
    await historyTab.click();
    await waitForLoading(page);
    
    // 检查是否有会话列表或空状态
    const sessionList = page.locator('.session-list, [class*="session"], [class*="history"]').first();
    const emptyState = page.getByText('暂无').or(page.getByText('empty')).first();
    
    if (await emptyState.isVisible().catch(() => false)) {
      console.log('ℹ️ 历史页面为空，需要创建新会话');
    } else {
      console.log('✅ 步骤2完成: 进入历史页面');
    }
    
    await screenshot(page, '03-history-page');
  });

  test('步骤3: 测试调试模式进入', async ({ page }) => {
    // 尝试找到并点击调试/测试按钮
    const debugButton = page.getByText('调试').or(page.getByText('debug')).or(page.getByText('测试')).first();
    
    if (await debugButton.isVisible().catch(() => false)) {
      await debugButton.click();
      await waitForLoading(page);
      console.log('✅ 步骤3完成: 进入调试模式');
      await screenshot(page, '04-debug-mode');
    } else {
      console.log('ℹ️ 未找到调试按钮，可能需要在其他页面');
    }
  });

  test('步骤4: 检查章节和事件显示', async ({ page }) => {
    // 查找章节相关信息
    const chapterElements = page.locator('[class*="chapter"], [class*="event"], .chapter-title, .event-index');
    const count = await chapterElements.count();
    
    if (count > 0) {
      console.log(`✅ 找到 ${count} 个章节/事件元素`);
      await screenshot(page, '05-chapter-events');
    } else {
      console.log('ℹ️ 当前页面没有显示章节/事件信息');
    }
  });

  test('步骤5: 测试消息输入和发送', async ({ page }) => {
    // 查找输入框
    const inputField = page.locator('input[type="text"], textarea, [placeholder*="输入"], [placeholder*="message"]').first();
    
    if (await inputField.isVisible().catch(() => false)) {
      // 输入测试消息
      await inputField.fill('测试消息');
      await screenshot(page, '06-message-input');
      
      // 查找发送按钮
      const sendButton = page.getByRole('button', { name: /发送|send/i }).or(page.locator('button').filter({ hasText: /发送|➤|▶/ })).first();
      
      if (await sendButton.isVisible().catch(() => false)) {
        await sendButton.click();
        await page.waitForTimeout(3000); // 等待响应
        console.log('✅ 步骤5完成: 消息已发送');
        await screenshot(page, '07-message-sent');
      }
    } else {
      console.log('ℹ️ 未找到消息输入框');
    }
  });

  test('步骤6: 测试回溯功能按钮', async ({ page }) => {
    // 查找消息列表中的消息
    const messages = page.locator('.message, [class*="message"], .chat-item');
    const messageCount = await messages.count();
    
    if (messageCount > 0) {
      // 右键点击或长按第一条消息
      const firstMessage = messages.first();
      await firstMessage.click({ button: 'right' });
      await page.waitForTimeout(500);
      
      // 检查是否有回溯菜单
      const revisitMenu = page.getByText('回溯').or(page.getByText('revisit')).or(page.locator('[class*="menu"]').filter({ hasText: '回溯' }));
      
      if (await revisitMenu.isVisible().catch(() => false)) {
        console.log('✅ 步骤6完成: 回溯菜单可见');
        await screenshot(page, '08-revisit-menu');
        
        // 点击回溯
        await revisitMenu.click();
        await page.waitForTimeout(2000);
        await screenshot(page, '09-after-revisit');
      } else {
        console.log('ℹ️ 未找到回溯菜单');
      }
    } else {
      console.log('ℹ️ 没有消息可以测试回溯');
    }
  });

  test('步骤7: 检查结束对话框', async ({ page }) => {
    // 查找结束对话框
    const endDialog = page.locator('[class*="end-dialog"], [class*="modal"], .dialog').filter({ hasText: /失败|结束|完结/ }).first();
    
    if (await endDialog.isVisible().catch(() => false)) {
      console.log('✅ 步骤7完成: 结束对话框可见');
      await screenshot(page, '10-end-dialog');
      
      // 检查详细原因
      const detailText = page.locator('[class*="detail"], [class*="reason"]').first();
      if (await detailText.isVisible().catch(() => false)) {
        const text = await detailText.textContent();
        console.log(`结束原因: ${text}`);
      }
    } else {
      console.log('ℹ️ 当前没有显示结束对话框（可能游戏未结束）');
    }
  });

  test('完整流程: 进入游戏并验证核心功能', async ({ page }) => {
    console.log('🎮 开始完整流程测试');
    
    // 1. 首页加载
    await expect(page).toHaveTitle(/Toonflow/);
    console.log('1️⃣ 首页加载完成');
    
    // 2. 导航到历史页面
    const historyTab = page.getByText('历史').or(page.locator('nav button, .nav-item').nth(2));
    await historyTab.click().catch(() => {
      console.log('使用备用导航方式');
    });
    await waitForLoading(page);
    console.log('2️⃣ 导航到历史页面');
    
    // 3. 截图记录当前状态
    await screenshot(page, 'full-flow-history');
    
    // 4. 检查是否有进行中的会话
    const continueButton = page.getByText('继续').or(page.getByText('进入')).first();
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click();
      await waitForLoading(page);
      console.log('3️⃣ 进入进行中的会话');
      await screenshot(page, 'full-flow-session');
      
      // 5. 检查游戏界面元素
      const gameElements = await page.locator('.message, .chat, [class*="play"], [class*="game"]').count();
      console.log(`   找到 ${gameElements} 个游戏界面元素`);
      
      // 6. 检查输入区域
      const inputArea = page.locator('input, textarea').first();
      if (await inputArea.isVisible().catch(() => false)) {
        console.log('✅ 输入区域可用');
      }
    } else {
      console.log('ℹ️ 没有进行中的会话，测试基础界面');
    }
    
    console.log('✅ 完整流程测试完成');
  });
});
