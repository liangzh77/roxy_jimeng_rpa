const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const IMG1 = String.raw`C:\Users\Administrator\AppData\Roaming\ai-video-maker\storage\好未来测试4\files\2_图片_源角色图片\微信图片_2026-02-14_122141_658 - 副本.png`;
const IMG2 = String.raw`C:\Users\Administrator\AppData\Roaming\ai-video-maker\storage\好未来测试4\files\2_图片_源角色图片\微信图片_2026-02-14_122141_658.png`;

(async () => {
    const resp = await fetch('http://127.0.0.1:50000/browser/connection_info?dirIds=3879efa7e5c7a9fdbe66a2c5c7d2a241');
    const info = await resp.json();
    const browser = await chromium.connectOverCDP(info.data[0].ws);
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('jimeng')) || context.pages()[0];

    // 导航
    await page.goto('https://jimeng.jianying.com/ai-tool/generate?type=video', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);

    // 切换全能参考
    console.log('1. 切换全能参考...');
    await page.evaluate(() => {
        const candidates = ['首尾帧','全能参考','无参考','运动参考','局部参考','智能多帧','主体参考'];
        document.querySelectorAll('span').forEach(el => {
            const t = el.textContent.trim();
            const rect = el.getBoundingClientRect();
            if (candidates.includes(t) && rect.y > 800 && rect.width > 20) {
                (el.closest('button') || el.closest('[class*="select"]') || el).click();
            }
        });
    });
    await sleep(800);
    await page.evaluate(() => {
        document.querySelectorAll('li.lv-select-option').forEach(item => {
            if (item.textContent.trim() === '全能参考' && item.getBoundingClientRect().width > 0) item.click();
        });
    });
    await sleep(2000);

    // 修正模型
    console.log('2. 修正模型...');
    await page.evaluate(() => {
        document.querySelectorAll('span').forEach(el => {
            if (el.textContent.trim().includes('Seedance') && el.getBoundingClientRect().y > 800) {
                (el.closest('button') || el.closest('[class*="select"]') || el).click();
            }
        });
    });
    await sleep(800);
    await page.evaluate(() => {
        document.querySelectorAll('li.lv-select-option').forEach(item => {
            const t = item.textContent;
            if (t.includes('Seedance 2.0') && t.includes('全能王者') && item.getBoundingClientRect().width > 0) {
                item.click();
            }
        });
    });
    await sleep(1000);
    // 关闭弹窗
    await page.mouse.click(10, 400);
    await sleep(500);

    // 确认设置
    const settings = await page.evaluate(() => {
        const r = {};
        document.querySelectorAll('span').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.y < 800 || rect.width < 20 || rect.height > 50) return;
            const t = el.textContent.trim();
            if (t.length > 30) return;
            if (t.includes('Seedance')) r.model = t;
            if (['首尾帧','全能参考','无参考','运动参考','局部参考','智能多帧','主体参考'].includes(t)) r.refMode = t;
        });
        return r;
    });
    console.log('设置确认:', JSON.stringify(settings));

    // 上传两张图
    console.log('3. 上传图片...');
    await page.locator('input[type="file"]').nth(0).setInputFiles(IMG1);
    await sleep(3000);
    const idx2 = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input[type="file"]');
        for (let i = 0; i < inputs.length; i++) {
            if (inputs[i].files.length === 0) return i;
        }
        return inputs.length - 1;
    });
    await page.locator('input[type="file"]').nth(idx2).setInputFiles(IMG2);
    await sleep(3000);
    console.log('图片上传完成');

    // === 关键: 输入 @ 并分析弹出 ===
    console.log('4. 点击textarea输入@...');
    await page.locator('textarea').first().click();
    await sleep(500);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await sleep(300);

    await page.keyboard.type('@');
    await sleep(2500);

    // 截图
    await page.screenshot({ path: 'D:/aicode/yuncheng/screenshots/diag_at_popup.png', timeout: 10000 });

    // 获取页面上所有新出现的、可能是 @ 弹出的元素
    const analysis = await page.evaluate(() => {
        const result = { popups: [], allVisibleLi: [] };

        // 遍历所有元素找弹出层
        const all = document.querySelectorAll('*');
        for (const el of all) {
            const rect = el.getBoundingClientRect();
            // 弹出层通常在 textarea 上方(y < 800)，且宽度合理
            if (rect.width < 50 || rect.height < 20 || rect.y > 800 || rect.y < 0) continue;

            const style = getComputedStyle(el);
            const zIndex = parseInt(style.zIndex) || 0;
            const position = style.position;

            // 高 z-index 或 fixed/absolute 定位的弹出层
            if ((zIndex > 100 || position === 'fixed' || position === 'absolute') && rect.height > 30 && rect.height < 500) {
                const cn = typeof el.className === 'string' ? el.className : '';
                result.popups.push({
                    tag: el.tagName,
                    classes: cn.slice(0, 120),
                    zIndex, position,
                    x: Math.round(rect.x), y: Math.round(rect.y),
                    w: Math.round(rect.width), h: Math.round(rect.height),
                    childCount: el.children.length,
                    text: el.textContent?.trim().slice(0, 80),
                    firstChildTag: el.children[0]?.tagName,
                    firstChildClasses: (typeof el.children[0]?.className === 'string' ? el.children[0]?.className : '').slice(0, 60),
                });
            }
        }

        // 搜索所有可见的 li（可能是下拉选项）
        document.querySelectorAll('li').forEach(li => {
            const rect = li.getBoundingClientRect();
            if (rect.width > 30 && rect.height > 10 && rect.y > 0 && rect.y < 800) {
                result.allVisibleLi.push({
                    text: li.textContent.trim().slice(0, 40),
                    x: Math.round(rect.x), y: Math.round(rect.y),
                    w: Math.round(rect.width), h: Math.round(rect.height),
                    classes: (typeof li.className === 'string' ? li.className : '').slice(0, 80),
                    parentClasses: (typeof li.parentElement?.className === 'string' ? li.parentElement?.className : '').slice(0, 80),
                });
            }
        });

        return result;
    });

    console.log('\n=== 高z-index弹出层 ===');
    analysis.popups.forEach(p => {
        console.log(`  ${p.tag} z:${p.zIndex} pos:${p.position} rect:(${p.x},${p.y},${p.w},${p.h}) children:${p.childCount}`);
        console.log(`    classes: ${p.classes?.slice(0,80)}`);
        console.log(`    text: ${p.text?.slice(0,60)}`);
    });

    console.log('\n=== 可见li元素 ===');
    analysis.allVisibleLi.forEach(li => {
        console.log(`  "${li.text}" at (${li.x},${li.y}) ${li.w}x${li.h} classes:${li.classes?.slice(0,50)} parent:${li.parentClasses?.slice(0,50)}`);
    });

    await browser.close();
})().catch(e => console.error(e.message));
