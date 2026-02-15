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

    // 导航到新页面
    await page.goto('https://jimeng.jianying.com/ai-tool/generate?type=video', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);

    // === 1. 切换到全能参考 ===
    console.log('=== 切换全能参考 ===');
    // 点击底栏的参考模式按钮
    await page.evaluate(() => {
        const candidates = ['首尾帧','全能参考','无参考','运动参考','局部参考','智能多帧','主体参考'];
        document.querySelectorAll('span').forEach(el => {
            const t = el.textContent.trim();
            const rect = el.getBoundingClientRect();
            if (candidates.includes(t) && rect.y > 800 && rect.width > 20) {
                const parent = el.closest('button') || el.closest('[class*="select"]') || el;
                parent.click();
            }
        });
    });
    await sleep(1000);

    // 选择全能参考
    const clicked = await page.evaluate(() => {
        const items = document.querySelectorAll('li.lv-select-option');
        for (const item of items) {
            if (item.textContent.trim() === '全能参考' && item.getBoundingClientRect().width > 0) {
                item.click();
                return true;
            }
        }
        return false;
    });
    console.log('全能参考 clicked:', clicked);
    await sleep(2000);

    // === 2. 检查设置和模型 ===
    const settings = await page.evaluate(() => {
        const result = { model: '', refMode: '', ratio: '', duration: '' };
        document.querySelectorAll('span').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.y < 800 || rect.width < 20 || rect.height < 8 || rect.height > 50) return;
            const t = el.textContent.trim();
            if (t.length > 30) return;
            if (t.includes('Seedance')) result.model = t;
            if (['首尾帧','全能参考','无参考','运动参考','局部参考','智能多帧','主体参考'].includes(t)) result.refMode = t;
            if (/^\d+:\d+$/.test(t)) result.ratio = t;
            if (/^\d+s$/i.test(t)) result.duration = t;
        });
        return result;
    });
    console.log('设置:', JSON.stringify(settings));
    await page.screenshot({ path: 'D:/aicode/yuncheng/screenshots/diag_after_refmode.png' });

    // === 3. 如果模型变成 Fast，修正 ===
    if (settings.model.includes('Fast') || settings.model.includes('Lite')) {
        console.log('模型被切换为', settings.model, '修正中...');
        // 点击模型打开下拉
        await page.evaluate(() => {
            document.querySelectorAll('span').forEach(el => {
                if (el.textContent.trim().includes('Seedance') && el.getBoundingClientRect().y > 800) {
                    const parent = el.closest('button') || el.closest('[class*="select"]') || el;
                    parent.click();
                }
            });
        });
        await sleep(800);
        // 找模型下拉选项
        const modelItems = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('li.lv-select-option').forEach(el => {
                if (el.getBoundingClientRect().width > 0) {
                    items.push(el.textContent.trim().slice(0, 50));
                }
            });
            return items;
        });
        console.log('模型选项:', modelItems);
        await page.screenshot({ path: 'D:/aicode/yuncheng/screenshots/diag_model_dropdown.png' });

        // 选择不含 Fast/Lite 的 Seedance 2.0
        await page.evaluate(() => {
            document.querySelectorAll('li.lv-select-option').forEach(item => {
                const t = item.textContent.trim();
                if (t.includes('Seedance 2.0') && !t.includes('Fast') && !t.includes('Lite') && item.getBoundingClientRect().width > 0) {
                    item.click();
                }
            });
        });
        await sleep(1000);
        console.log('模型已修正');
    }

    // === 4. 检查 file input ===
    const fileInputs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input[type="file"]')).map((fi, i) => {
            let t = ''; let p = fi.parentElement;
            for (let j = 0; j < 8 && p; j++) { t = p.textContent?.trim().slice(0,80)||''; if(t.length>3) break; p = p.parentElement; }
            return { i, nearby: t };
        });
    });
    console.log('\n全能参考 file inputs:', JSON.stringify(fileInputs));

    // 上传图片
    if (fileInputs.length >= 1) {
        await page.locator('input[type="file"]').nth(0).setInputFiles(IMG1);
        console.log('图片1上传完成');
        await sleep(3000);
    }
    const count2 = await page.evaluate(() => document.querySelectorAll('input[type="file"]').length);
    console.log('上传后 file inputs:', count2);
    if (count2 >= 1) {
        // 找未使用的 file input
        const idx2 = await page.evaluate(() => {
            const inputs = document.querySelectorAll('input[type="file"]');
            for (let i = 0; i < inputs.length; i++) {
                if (inputs[i].files.length === 0) return i;
            }
            return inputs.length - 1;
        });
        await page.locator('input[type="file"]').nth(idx2).setInputFiles(IMG2);
        console.log('图片2上传完成, index:', idx2);
        await sleep(3000);
    }
    await page.screenshot({ path: 'D:/aicode/yuncheng/screenshots/diag_after_upload.png' });

    // === 5. 点击 textarea 输入 @，分析弹出 ===
    console.log('\n=== 诊断 @ 弹出 ===');
    const ta = page.locator('textarea').first();
    await ta.click();
    await sleep(500);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await sleep(300);

    await page.keyboard.type('@');
    await sleep(2500);
    await page.screenshot({ path: 'D:/aicode/yuncheng/screenshots/diag_at_popup.png' });

    // 分析 @ 弹出的 DOM
    const atInfo = await page.evaluate(() => {
        const result = { items: [], containers: [] };

        // 选择器搜索弹出项
        const selectors = [
            '[role="listbox"] [role="option"]',
            '[role="listbox"] li',
            '[class*="mention"] li',
            '[class*="mention"] [class*="item"]',
            '[class*="Mention"] [class*="Item"]',
            '[class*="Mention"] [class*="item"]',
            '[class*="popup"] li',
            '[class*="Popup"] li',
            '[class*="Popup"] [class*="Item"]',
            '[class*="popover"] li',
            '[class*="Popover"] li',
            '[class*="floating"] li',
        ];
        const seen = new Set();
        for (const sel of selectors) {
            document.querySelectorAll(sel).forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    const key = el.tagName + '_' + Math.round(rect.x) + '_' + Math.round(rect.y);
                    if (!seen.has(key)) {
                        seen.add(key);
                        result.items.push({
                            sel, text: el.textContent.trim().slice(0, 40),
                            tag: el.tagName,
                            x: Math.round(rect.x), y: Math.round(rect.y),
                            w: Math.round(rect.width), h: Math.round(rect.height),
                            classes: (typeof el.className === 'string' ? el.className : '').slice(0, 100),
                        });
                    }
                }
            });
        }

        // 搜索弹出层容器
        const popupSelectors = '[class*="popup"], [class*="Popup"], [class*="popover"], [class*="Popover"], [class*="mention"], [class*="Mention"], [class*="floating"], [class*="overlay"], [class*="Overlay"], [class*="tooltip"], [class*="Tooltip"], [class*="dropdown"], [class*="Dropdown"]';
        document.querySelectorAll(popupSelectors).forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 30 && rect.height > 20 && rect.y > 0 && rect.y < 900) {
                result.containers.push({
                    tag: el.tagName,
                    classes: (typeof el.className === 'string' ? el.className : '').slice(0, 120),
                    x: Math.round(rect.x), y: Math.round(rect.y),
                    w: Math.round(rect.width), h: Math.round(rect.height),
                    childCount: el.children.length,
                    innerHTML: el.innerHTML.slice(0, 200),
                });
            }
        });

        return result;
    });

    console.log('@ 弹出选项:');
    atInfo.items.forEach(item => console.log(' ', item.sel, '|', item.text, '| classes:', item.classes?.slice(0,50)));
    console.log('\n弹出层容器:');
    atInfo.containers.forEach(p => console.log(' ', p.tag, '| classes:', p.classes?.slice(0,60), '| children:', p.childCount, '| text:', p.innerHTML?.slice(0,80)));

    // 清理
    await page.keyboard.press('Backspace');
    await sleep(300);

    await browser.close();
})().catch(e => console.error(e.message));
