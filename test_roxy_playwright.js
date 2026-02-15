/**
 * 测试 RoxyBrowser + Playwright 连接
 * 流程：
 * 1. 通过 RoxyBrowser API 打开一个浏览器配置
 * 2. 获取 WebSocket CDP 地址
 * 3. 用 Playwright connectOverCDP 连接
 * 4. 验证页面操作能力
 * 5. 关闭浏览器
 */

const { chromium } = require('playwright');

const ROXY_API_BASE = 'http://127.0.0.1:50000';
const WORKSPACE_ID = 67641;

// 使用 "端强" 这个配置来测试
const TEST_DIR_ID = '8cad7738e5f3432907501466a2288d9f';

async function roxyRequest(method, path, body) {
    const url = `${ROXY_API_BASE}${path}`;
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    const resp = await fetch(url, options);
    return resp.json();
}

async function main() {
    console.log('=== 测试 RoxyBrowser + Playwright 连接 ===\n');

    // 1. 通过 API 打开浏览器
    console.log('1. 调用 /browser/open 打开浏览器...');
    const openResult = await roxyRequest('POST', '/browser/open', {
        workspaceId: WORKSPACE_ID,
        dirId: TEST_DIR_ID,
        args: ['--remote-allow-origins=*'],
        forceOpen: false,
    });

    if (openResult.code !== 0) {
        console.error('打开浏览器失败:', openResult.msg);
        return;
    }

    const { ws, http, pid, windowName } = openResult.data;
    console.log(`   窗口名称: ${windowName}`);
    console.log(`   WebSocket: ${ws}`);
    console.log(`   HTTP: ${http}`);
    console.log(`   PID: ${pid}`);

    // 2. 用 Playwright 连接
    console.log('\n2. 使用 Playwright connectOverCDP 连接...');
    let browser;
    try {
        browser = await chromium.connectOverCDP(ws);
        console.log('   连接成功!');

        // 3. 获取已有上下文和页面
        const contexts = browser.contexts();
        console.log(`   现有 context 数量: ${contexts.length}`);

        let page;
        if (contexts.length > 0 && contexts[0].pages().length > 0) {
            page = contexts[0].pages()[0];
            console.log(`   使用已有页面: ${page.url()}`);
        } else {
            const context = contexts[0] || await browser.newContext();
            page = await context.newPage();
            console.log('   创建了新页面');
        }

        // 4. 导航到即梦
        console.log('\n3. 导航到 jimeng.jianying.com...');
        await page.goto('https://jimeng.jianying.com', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        console.log(`   当前 URL: ${page.url()}`);

        // 5. 获取页面标题
        const title = await page.title();
        console.log(`   页面标题: ${title}`);

        // 6. 截图验证
        await page.screenshot({ path: 'D:\\aicode\\yuncheng\\roxy_test_screenshot.png' });
        console.log('   截图已保存: roxy_test_screenshot.png');

        // 7. 测试页面操作能力
        console.log('\n4. 测试页面操作能力...');
        const userAgent = await page.evaluate(() => navigator.userAgent);
        console.log(`   UserAgent: ${userAgent}`);

        const dimensions = await page.evaluate(() => ({
            width: window.innerWidth,
            height: window.innerHeight,
        }));
        console.log(`   窗口尺寸: ${dimensions.width}x${dimensions.height}`);

        console.log('\n=== 测试完成! Playwright 成功连接 RoxyBrowser ===');

        // 断开连接（不关闭浏览器）
        await browser.close();
        console.log('   Playwright 已断开（浏览器保持运行）');

    } catch (err) {
        console.error('Playwright 连接失败:', err.message);
    }

    // 8. 关闭 RoxyBrowser 配置
    console.log('\n5. 关闭 RoxyBrowser 浏览器配置...');
    const closeResult = await roxyRequest('POST', '/browser/close', {
        dirId: TEST_DIR_ID,
    });
    console.log(`   关闭结果: code=${closeResult.code}`);
}

main().catch(console.error);
