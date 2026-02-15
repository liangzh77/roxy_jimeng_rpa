const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const resp = await fetch('http://127.0.0.1:50000/browser/connection_info?dirIds=3879efa7e5c7a9fdbe66a2c5c7d2a241');
    const info = await resp.json();
    const browser = await chromium.connectOverCDP(info.data[0].ws);
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('jimeng')) || context.pages()[0];

    // 点击编辑器输入 @
    const editor = page.locator('div.tiptap.ProseMirror').first();
    await editor.click();
    await sleep(500);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await sleep(300);
    await page.keyboard.type('@');
    await sleep(2500);

    // 获取弹出层的内部结构
    const popup = await page.evaluate(() => {
        // 找 z:1000 的 lv-trigger 元素
        const triggers = document.querySelectorAll('.lv-trigger');
        for (const t of triggers) {
            const z = parseInt(getComputedStyle(t).zIndex) || 0;
            const rect = t.getBoundingClientRect();
            if (z >= 100 && rect.width > 50 && rect.height > 50) {
                // 获取内部所有子元素
                const children = [];
                t.querySelectorAll('*').forEach(el => {
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) {
                        const text = el.textContent?.trim();
                        const ownText = Array.from(el.childNodes)
                            .filter(n => n.nodeType === 3)
                            .map(n => n.textContent.trim())
                            .join('');
                        if (text && text.length < 30) {
                            children.push({
                                tag: el.tagName,
                                text,
                                ownText,
                                x: Math.round(r.x), y: Math.round(r.y),
                                w: Math.round(r.width), h: Math.round(r.height),
                                classes: (typeof el.className === 'string' ? el.className : '').slice(0, 100),
                                clickable: el.onclick !== null || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.style.cursor === 'pointer',
                            });
                        }
                    }
                });
                return {
                    triggerClasses: (typeof t.className === 'string' ? t.className : '').slice(0, 100),
                    rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
                    innerHTML: t.innerHTML.slice(0, 500),
                    children,
                };
            }
        }
        return null;
    });

    if (popup) {
        console.log('弹出层:', popup.triggerClasses);
        console.log('位置:', JSON.stringify(popup.rect));
        console.log('\nInnerHTML (前500字符):');
        console.log(popup.innerHTML);
        console.log('\n子元素:');
        popup.children.forEach(c => {
            console.log(`  ${c.tag} "${c.text}" (own:"${c.ownText}") at(${c.x},${c.y}) ${c.w}x${c.h} classes:${c.classes?.slice(0,50)}`);
        });
    } else {
        console.log('未找到弹出层');
    }

    await page.keyboard.press('Backspace');
    await browser.close();
})().catch(e => console.error(e.message));
