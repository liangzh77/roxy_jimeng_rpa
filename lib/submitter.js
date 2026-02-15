/**
 * 即梦视频生成 - 提交自动化模块
 * 从 jimeng_auto.js 提取步骤 1-8，参数化处理
 */

const REF_MODES = ['首尾帧', '全能参考', '无参考', '运动参考', '局部参考', '智能多帧', '主体参考'];

function log(step, msg) {
    const ts = new Date().toLocaleTimeString('zh-CN');
    console.log(`[${ts}] [submitter][步骤${step}] ${msg}`);
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

/**
 * 提交视频生成任务
 * @param {import('playwright').Page} page - Playwright page 对象
 * @param {Object} opts
 * @param {string[]} opts.images - 图片文件绝对路径数组
 * @param {Array<{type:'at',label:string}|{type:'text',value:string}>} opts.promptParts - 提示词片段
 * @param {string} [opts.refMode='全能参考'] - 参考模式
 * @param {string} [opts.model='seedance_2.0'] - 模型
 * @param {string} [opts.ratio='9:16'] - 画幅比例
 * @param {string} [opts.duration='8s'] - 视频时长
 * @returns {Promise<{historyId: string}>}
 */
async function submitTask(page, opts) {
    const {
        images,
        promptParts,
        refMode = '全能参考',
        model = 'seedance_2.0',
        ratio = '9:16',
        duration = '8s',
    } = opts;

    // === 步骤 1: 导航到视频生成页 ===
    log(1, '导航到即梦视频生成...');
    await page.goto('https://jimeng.jianying.com/ai-tool/generate?type=video', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
    });
    await sleep(5000);
    log(1, `URL: ${page.url()}`);

    // === 步骤 2: 切换参考模式 ===
    log(2, `切换参考模式为"${refMode}"...`);
    const currentRefMode = await page.evaluate((modes) => {
        let found = '';
        document.querySelectorAll('span').forEach(el => {
            const t = el.textContent.trim();
            const rect = el.getBoundingClientRect();
            if (modes.includes(t) && rect.y > 800 && rect.width > 20) found = t;
        });
        return found;
    }, REF_MODES);
    log(2, `当前模式: ${currentRefMode}`);

    if (currentRefMode !== refMode) {
        await page.evaluate((modes) => {
            document.querySelectorAll('span').forEach(el => {
                const t = el.textContent.trim();
                const rect = el.getBoundingClientRect();
                if (modes.includes(t) && rect.y > 800 && rect.width > 20) {
                    (el.closest('button') || el.closest('[class*="select"]') || el).click();
                }
            });
        }, REF_MODES);
        await sleep(1000);

        const switched = await page.evaluate((targetMode) => {
            const items = document.querySelectorAll('li.lv-select-option');
            for (const item of items) {
                if (item.textContent.trim() === targetMode && item.getBoundingClientRect().width > 0) {
                    item.click();
                    return true;
                }
            }
            return false;
        }, refMode);
        if (!switched) throw new Error(`无法选择参考模式: ${refMode}`);
        log(2, `已切换到${refMode}`);
        await sleep(2000);
    } else {
        log(2, `已是${refMode}模式`);
    }

    // === 步骤 3: 修正模型版本 ===
    log(3, '检查并修正模型...');
    const currentModel = await page.evaluate(() => {
        let model = '';
        document.querySelectorAll('span').forEach(el => {
            const t = el.textContent.trim();
            const rect = el.getBoundingClientRect();
            if (t.includes('Seedance') && t.length < 30 && rect.y > 800 && rect.width > 20) model = t;
        });
        return model;
    });
    log(3, `当前模型: ${currentModel}`);

    if (currentModel.includes('Fast') || currentModel.includes('Lite') || !currentModel.includes('Seedance 2.0')) {
        await page.evaluate(() => {
            document.querySelectorAll('span').forEach(el => {
                const t = el.textContent.trim();
                const rect = el.getBoundingClientRect();
                if (t.includes('Seedance') && t.length < 30 && rect.y > 800 && rect.width > 20) {
                    (el.closest('button') || el.closest('[class*="select"]') || el).click();
                }
            });
        });
        await sleep(1000);

        const modelFixed = await page.evaluate(() => {
            const items = document.querySelectorAll('li.lv-select-option');
            for (const item of items) {
                const t = item.textContent;
                const rect = item.getBoundingClientRect();
                if (t.includes('全能王者') && rect.width > 0) {
                    item.click();
                    return t.trim().slice(0, 40);
                }
            }
            for (const item of items) {
                const t = item.textContent;
                const rect = item.getBoundingClientRect();
                if (t.includes('Seedance 2.0') && !t.includes('Fast') && !t.includes('Lite') && rect.width > 0) {
                    item.click();
                    return t.trim().slice(0, 40);
                }
            }
            return null;
        });
        if (!modelFixed) throw new Error('无法选择 Seedance 2.0 全能王者');
        log(3, `已选择模型: ${modelFixed}`);
        await sleep(1000);
    } else {
        log(3, '模型已正确');
    }

    // 关闭可能残留的下拉
    await page.mouse.click(10, 400);
    await sleep(500);

    // === 步骤 4: 设置画幅和时长 ===
    log(4, `设置画幅 ${ratio} 和时长 ${duration}...`);
    const settings = await page.evaluate(() => {
        let r = '', d = '';
        document.querySelectorAll('span').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.y < 800 || rect.width < 20 || rect.height > 50) return;
            const t = el.textContent.trim();
            if (/^\d+:\d+$/.test(t)) r = t;
            if (/^\d+s$/i.test(t)) d = t;
        });
        return { ratio: r, duration: d };
    });

    if (settings.ratio !== ratio) {
        log(4, `比例 ${settings.ratio} → ${ratio}...`);
        await page.evaluate(() => {
            document.querySelectorAll('span').forEach(el => {
                if (/^\d+:\d+$/.test(el.textContent.trim()) && el.getBoundingClientRect().y > 800) {
                    (el.closest('button') || el).click();
                }
            });
        });
        await sleep(500);
        await page.evaluate((target) => {
            document.querySelectorAll('li.lv-select-option, li, [role="option"]').forEach(item => {
                if (item.textContent.includes(target) && item.getBoundingClientRect().width > 0) item.click();
            });
        }, ratio);
        await sleep(500);
        await page.mouse.click(10, 400);
        await sleep(300);
    }

    if (settings.duration !== duration) {
        log(4, `时长 ${settings.duration} → ${duration}...`);
        await page.evaluate(() => {
            document.querySelectorAll('span').forEach(el => {
                if (/^\d+s$/i.test(el.textContent.trim()) && el.getBoundingClientRect().y > 800) {
                    (el.closest('button') || el).click();
                }
            });
        });
        await sleep(500);
        await page.evaluate((target) => {
            const t = target.toLowerCase();
            document.querySelectorAll('li.lv-select-option, li, [role="option"]').forEach(item => {
                if (item.textContent.toLowerCase().includes(t) && item.getBoundingClientRect().width > 0) item.click();
            });
        }, duration);
        await sleep(500);
        await page.mouse.click(10, 400);
        await sleep(300);
    }

    // 最终确认
    const finalSettings = await page.evaluate((modes) => {
        const r = {};
        document.querySelectorAll('span').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.y < 800 || rect.width < 20 || rect.height > 50) return;
            const t = el.textContent.trim();
            if (t.length > 30) return;
            if (t.includes('Seedance')) r.model = t;
            if (modes.includes(t)) r.refMode = t;
            if (/^\d+:\d+$/.test(t)) r.ratio = t;
            if (/^\d+s$/i.test(t)) r.duration = t;
        });
        return r;
    }, REF_MODES);
    log(4, `最终: ${finalSettings.model} | ${finalSettings.refMode} | ${finalSettings.ratio} | ${finalSettings.duration}`);

    // === 步骤 5: 上传参考图片 ===
    log(5, `上传 ${images.length} 张参考图片...`);

    // 上传第一张
    let fic = await page.evaluate(() => document.querySelectorAll('input[type="file"]').length);
    log(5, `页面有 ${fic} 个 file input`);
    if (fic < 1) throw new Error('未找到 file input');

    await page.locator('input[type="file"]').nth(0).setInputFiles(images[0]);
    log(5, '图片1 上传完成');
    await sleep(3000);

    // 上传剩余图片（按顺序依次上传到对应 file input）
    for (let i = 1; i < images.length; i++) {
        fic = await page.evaluate(() => document.querySelectorAll('input[type="file"]').length);
        const targetIdx = Math.min(i, fic - 1);
        await page.locator('input[type="file"]').nth(targetIdx).setInputFiles(images[i]);
        log(5, `图片${i + 1} 上传完成 (index: ${targetIdx})`);
        await sleep(3000);
    }

    // === 步骤 6: 输入提示词 ===
    log(6, '输入提示词...');

    // 优先查找 ProseMirror 编辑器，如果不存在则使用 textarea
    const hasProseMirror = await page.evaluate(() => !!document.querySelector('div.tiptap.ProseMirror'));
    const hasTextarea = await page.evaluate(() => !!document.querySelector('textarea.lv-textarea'));
    log(6, `编辑器类型: ProseMirror=${hasProseMirror}, Textarea=${hasTextarea}`);

    if (hasProseMirror) {
        // --- 旧版：TipTap ProseMirror 编辑器（含 @ 引用）---
        const editor = page.locator('div.tiptap.ProseMirror').first();
        await editor.click();
        await sleep(500);
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Backspace');
        await sleep(300);

        let atSuccess = true;
        for (const part of promptParts) {
            if (part.type === 'text') {
                await page.evaluate((text) => {
                    document.execCommand('insertText', false, text);
                }, part.value);
                log(6, `  文本: "${part.value.slice(0, 30)}${part.value.length > 30 ? '...' : ''}"`);
                await sleep(300);
            } else if (part.type === 'at') {
                await page.keyboard.type('@');
                await sleep(2000);
                const atResult = await page.evaluate((label) => {
                    const popups = document.querySelectorAll('.lv-select-popup li.lv-select-option');
                    for (const item of popups) {
                        const rect = item.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0 && item.textContent.trim() === label) {
                            item.click();
                            return { text: item.textContent.trim() };
                        }
                    }
                    return null;
                }, part.label);
                if (atResult) {
                    log(6, `  @引用成功: "${atResult.text}"`);
                } else {
                    log(6, `  ERROR: @"${part.label}" 未找到!`);
                    atSuccess = false;
                    await page.keyboard.press('Backspace');
                }
                await sleep(500);
            }
        }
        if (!atSuccess) throw new Error('@ 引用不完整，中止提交');

        const mentionCount = await page.evaluate(() => {
            const ed = document.querySelector('div.tiptap.ProseMirror');
            if (!ed) return 0;
            return ed.querySelectorAll('[data-type="mention"], .mention, [class*="mention"]').length;
        });
        const expectedMentions = promptParts.filter(p => p.type === 'at').length;
        log(6, `mention 标签: ${mentionCount}, 期望: ${expectedMentions}`);
    } else if (hasTextarea) {
        // --- 新版：普通 textarea（@ 引用转为纯文本）---
        const ta = page.locator('textarea.lv-textarea').first();
        await ta.click();
        await sleep(500);
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Backspace');
        await sleep(300);

        // 拼接所有 promptParts 为纯文本
        const fullText = promptParts.map(p => p.type === 'at' ? p.label : p.value).join('');
        await ta.fill(fullText);
        log(6, `  textarea 输入: "${fullText.slice(0, 60)}${fullText.length > 60 ? '...' : ''}"`);
        await sleep(500);
    } else {
        throw new Error('未找到提示词输入框（ProseMirror 或 textarea 均不存在）');
    }

    log(6, '提示词输入完成');

    // === 步骤 7: 拦截网络 + 点击"生成" ===
    log(7, '设置网络拦截，准备捕获 history_record_id...');

    const generateResponsePromise = new Promise((resolve) => {
        const handler = async (response) => {
            const url = response.url();
            if (url.includes('/mweb/v1/aigc_draft/generate')) {
                try {
                    const json = await response.json();
                    page.off('response', handler);
                    resolve(json);
                } catch (e) { /* ignore */ }
            }
        };
        page.on('response', handler);
        setTimeout(() => resolve(null), 30000);
    });

    log(7, '点击"生成"按钮...');
    const submitClicked = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            const cn = typeof btn.className === 'string' ? btn.className : '';
            const rect = btn.getBoundingClientRect();
            if (rect.y > 800 && cn.includes('lv-btn-primary') && (cn.includes('circle') || cn.includes('submit'))) {
                btn.click();
                return { via: 'primary-circle' };
            }
        }
        let rightMost = null;
        for (const btn of buttons) {
            const rect = btn.getBoundingClientRect();
            if (rect.y > 800 && rect.width > 20 && rect.width < 100 && btn.querySelector('svg')) {
                if (!rightMost || rect.x > rightMost.x) rightMost = { btn, x: rect.x };
            }
        }
        if (rightMost) {
            rightMost.btn.click();
            return { via: 'rightmost-svg' };
        }
        return null;
    });

    if (!submitClicked) throw new Error('未找到生成按钮');
    log(7, `已点击生成: ${submitClicked.via}`);

    // === 步骤 8: 捕获 history_record_id ===
    log(8, '等待 generate 响应...');
    const generateResp = await generateResponsePromise;

    let historyId = null;
    if (generateResp && generateResp.data && generateResp.data.aigc_data) {
        historyId = generateResp.data.aigc_data.history_record_id;
    }

    if (!historyId) {
        throw new Error('无法获取 history_record_id');
    }

    log(8, `history_record_id: ${historyId}`);
    return { historyId };
}

module.exports = { submitTask };
