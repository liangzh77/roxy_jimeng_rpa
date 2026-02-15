const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const IMG2 = String.raw`C:\Users\Administrator\AppData\Roaming\ai-video-maker\storage\好未来测试4\files\2_图片_源角色图片\微信图片_2026-02-14_122141_658.png`;

(async () => {
    const resp = await fetch('http://127.0.0.1:50000/browser/connection_info?dirIds=3879efa7e5c7a9fdbe66a2c5c7d2a241');
    const info = await resp.json();
    const browser = await chromium.connectOverCDP(info.data[0].ws);
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('jimeng')) || context.pages()[0];

    // 上传第二张图（如果还有file input可用）
    const fic = await page.evaluate(() => document.querySelectorAll('input[type="file"]').length);
    console.log('当前 file inputs:', fic);
    if (fic >= 1) {
        await page.locator('input[type="file"]').nth(fic - 1).setInputFiles(IMG2);
        console.log('第2张图上传完成');
        await sleep(3000);
    }

    // 点击编辑器
    const editor = page.locator('div.tiptap.ProseMirror').first();
    const editorVisible = await editor.isVisible().catch(() => false);
    console.log('ProseMirror 可见:', editorVisible);

    if (editorVisible) {
        await editor.click();
        await sleep(500);
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Backspace');
        await sleep(300);

        // 输入 @
        console.log('输入 @ ...');
        await page.keyboard.type('@');
        await sleep(2500);

        // 分析弹出
        const popupData = await page.evaluate(() => {
            const r = { highZ: [], visiblePopups: [] };

            // 搜索高 z-index 元素
            document.querySelectorAll('*').forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width < 30 || rect.height < 15) return;
                const z = parseInt(getComputedStyle(el).zIndex) || 0;
                if (z > 50 && rect.y < 800) {
                    const cn = typeof el.className === 'string' ? el.className : '';
                    r.highZ.push({
                        tag: el.tagName, z,
                        x: Math.round(rect.x), y: Math.round(rect.y),
                        w: Math.round(rect.width), h: Math.round(rect.height),
                        classes: cn.slice(0, 100),
                        childCount: el.children.length,
                        text: el.textContent?.trim().slice(0, 80),
                    });
                }
            });

            // 搜索 tippy / tiptap 弹出
            const popSelectors = [
                '[data-tippy-root]',
                '.tippy-box',
                '.tippy-content',
                '[class*="suggestion"]',
                '[class*="Suggestion"]',
                '[class*="mention"]',
                '[class*="Mention"]',
                '[class*="autocomplete"]',
                '[class*="Autocomplete"]',
                '[class*="at-popup"]',
                '[class*="reference"]',
                '[class*="Reference"]',
            ];
            for (const sel of popSelectors) {
                document.querySelectorAll(sel).forEach(el => {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        r.visiblePopups.push({
                            sel, tag: el.tagName,
                            x: Math.round(rect.x), y: Math.round(rect.y),
                            w: Math.round(rect.width), h: Math.round(rect.height),
                            classes: (typeof el.className === 'string' ? el.className : '').slice(0, 100),
                            html: el.innerHTML.slice(0, 300),
                        });
                    }
                });
            }

            return r;
        });

        console.log('\n=== 高z-index元素 ===');
        popupData.highZ.sort((a, b) => b.z - a.z);
        popupData.highZ.slice(0, 15).forEach(p => {
            console.log(`  z:${p.z} ${p.tag} (${p.x},${p.y}) ${p.w}x${p.h} children:${p.childCount}`);
            console.log(`    classes: ${p.classes}`);
            console.log(`    text: ${p.text?.slice(0, 60)}`);
        });

        console.log('\n=== 特定弹出选择器 ===');
        popupData.visiblePopups.forEach(p => {
            console.log(`  ${p.sel} | ${p.tag} (${p.x},${p.y}) ${p.w}x${p.h}`);
            console.log(`    classes: ${p.classes}`);
            console.log(`    html: ${p.html?.slice(0, 150)}`);
        });

        // 删除 @
        await page.keyboard.press('Backspace');
    } else {
        console.log('编辑器不可见，检查其他编辑器...');
        const others = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('[contenteditable]')).map(el => ({
                tag: el.tagName,
                ce: el.getAttribute('contenteditable'),
                x: Math.round(el.getBoundingClientRect().x),
                y: Math.round(el.getBoundingClientRect().y),
                w: Math.round(el.getBoundingClientRect().width),
                h: Math.round(el.getBoundingClientRect().height),
            }));
        });
        console.log('所有 contenteditable:', others);
    }

    await browser.close();
})().catch(e => console.error(e.message));
