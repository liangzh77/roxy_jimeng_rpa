const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const resp = await fetch('http://127.0.0.1:50000/browser/connection_info?dirIds=3879efa7e5c7a9fdbe66a2c5c7d2a241');
    const info = await resp.json();
    const browser = await chromium.connectOverCDP(info.data[0].ws);
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('jimeng')) || context.pages()[0];

    console.log('URL:', page.url());

    // 先检查是否有对话框
    page.on('dialog', async dialog => {
        console.log('DIALOG:', dialog.type(), dialog.message());
        await dialog.dismiss();
    });

    // 检查当前页面的编辑器元素
    const editorInfo = await page.evaluate(() => {
        const r = {};
        r.textareas = Array.from(document.querySelectorAll('textarea')).map(ta => ({
            x: Math.round(ta.getBoundingClientRect().x),
            y: Math.round(ta.getBoundingClientRect().y),
            w: Math.round(ta.getBoundingClientRect().width),
            h: Math.round(ta.getBoundingClientRect().height),
            display: getComputedStyle(ta).display,
            placeholder: ta.placeholder?.slice(0, 50),
        }));
        r.editables = Array.from(document.querySelectorAll('[contenteditable="true"]')).map(el => ({
            tag: el.tagName,
            x: Math.round(el.getBoundingClientRect().x),
            y: Math.round(el.getBoundingClientRect().y),
            w: Math.round(el.getBoundingClientRect().width),
            h: Math.round(el.getBoundingClientRect().height),
            text: el.textContent?.slice(0, 50),
            classes: (typeof el.className === 'string' ? el.className : '').slice(0, 80),
        }));
        r.fileInputs = document.querySelectorAll('input[type="file"]').length;
        r.settings = {};
        document.querySelectorAll('span').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.y < 800 || rect.width < 20 || rect.height > 50) return;
            const t = el.textContent.trim();
            if (t.length > 30) return;
            if (t.includes('Seedance')) r.settings.model = t;
            if (['首尾帧','全能参考','无参考','运动参考','局部参考','智能多帧','主体参考'].includes(t)) r.settings.refMode = t;
            if (/^\d+:\d+$/.test(t)) r.settings.ratio = t;
            if (/^\d+s$/i.test(t)) r.settings.duration = t;
        });
        return r;
    });

    console.log(JSON.stringify(editorInfo, null, 2));
    await browser.close();
})().catch(e => console.error(e.message));
