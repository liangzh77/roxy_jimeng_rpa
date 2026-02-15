/**
 * 即梦视频生成 - 完整自动化脚本 (v2)
 * 通过 RoxyBrowser API + Playwright 实现
 *
 * 模式: 全能参考 + Seedance 2.0 (全能王者)
 * 编辑器: TipTap ProseMirror (contenteditable)
 * @ 弹出: lv-select-popup > li.lv-select-option
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ========== 配置 ==========
const CONFIG = {
    roxy: {
        api: 'http://127.0.0.1:50000',
        workspaceId: 67641,
        dirId: '3879efa7e5c7a9fdbe66a2c5c7d2a241', // forfrank
    },
    jimeng: {
        url: 'https://jimeng.jianying.com/ai-tool/generate?type=video',
    },
    images: [
        String.raw`C:\Users\Administrator\AppData\Roaming\ai-video-maker\storage\好未来测试4\files\2_图片_源角色图片\微信图片_2026-02-14_122141_658 - 副本.png`,
        String.raw`C:\Users\Administrator\AppData\Roaming\ai-video-maker\storage\好未来测试4\files\2_图片_源角色图片\微信图片_2026-02-14_122141_658.png`,
    ],
    // 提示词片段：文本和 @ 引用交替
    promptParts: [
        { type: 'at', label: '图片1' },
        { type: 'text', value: ' 作为起始帧，' },
        { type: 'at', label: '图片2' },
        { type: 'text', value: ' 作为末尾帧，' },
        { type: 'at', label: '图片1' },
        { type: 'text', value: ' 中女士正在用兴奋的口吻对着镜头聊天，画面逐渐拉近至面部特写，展现出丰富的面部表情和自然的嘴部动作。' },
    ],
    screenshots: 'D:/aicode/yuncheng/screenshots',
};

function log(step, msg) {
    const ts = new Date().toLocaleTimeString('zh-CN');
    console.log(`[${ts}] [步骤${step}] ${msg}`);
}

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function roxyApi(method, path, body) {
    const url = `${CONFIG.roxy.api}${path}`;
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(url, opts);
    return resp.json();
}

/** 安全截图（带超时保护） */
async function safeScreenshot(page, path) {
    try {
        await page.screenshot({ path, timeout: 8000 });
    } catch {
        log('-', `截图跳过: ${path}`);
    }
}

// ========== 主流程 ==========
async function main() {
    console.log('========================================');
    console.log('  即梦视频生成 - Playwright 自动化 v2');
    console.log('  模式: 全能参考 + Seedance 2.0');
    console.log('========================================\n');

    // === 步骤 0: 连接浏览器 ===
    log(0, '连接 RoxyBrowser...');
    const connInfo = await roxyApi('GET', `/browser/connection_info?dirIds=${CONFIG.roxy.dirId}`);
    let wsUrl;
    if (connInfo.data && connInfo.data.length > 0) {
        wsUrl = connInfo.data[0].ws;
    } else {
        const openResult = await roxyApi('POST', '/browser/open', {
            workspaceId: CONFIG.roxy.workspaceId,
            dirId: CONFIG.roxy.dirId,
            args: ['--remote-allow-origins=*'],
            forceOpen: true,
        });
        if (openResult.code !== 0) throw new Error(`打开浏览器失败: ${openResult.msg}`);
        wsUrl = openResult.data.ws;
    }
    log(0, `WebSocket: ${wsUrl}`);

    const browser = await chromium.connectOverCDP(wsUrl);
    const context = browser.contexts()[0];
    let page = context.pages().find(p => p.url().includes('jimeng')) || context.pages()[0];
    log(0, 'Playwright 连接成功');

    // === 步骤 1: 导航到视频生成页 ===
    log(1, '导航到即梦视频生成...');
    await page.goto(CONFIG.jimeng.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
    log(1, `URL: ${page.url()}`);
    await safeScreenshot(page, `${CONFIG.screenshots}/01_initial.png`);

    // === 步骤 2: 切换参考模式为"全能参考" ===
    log(2, '切换参考模式为"全能参考"...');

    // 读取当前参考模式
    const currentRefMode = await page.evaluate(() => {
        const modes = ['首尾帧', '全能参考', '无参考', '运动参考', '局部参考', '智能多帧', '主体参考'];
        let found = '';
        document.querySelectorAll('span').forEach(el => {
            const t = el.textContent.trim();
            const rect = el.getBoundingClientRect();
            if (modes.includes(t) && rect.y > 800 && rect.width > 20) found = t;
        });
        return found;
    });
    log(2, `当前模式: ${currentRefMode}`);

    if (currentRefMode !== '全能参考') {
        // 点击参考模式区域打开下拉
        await page.evaluate(() => {
            const modes = ['首尾帧', '全能参考', '无参考', '运动参考', '局部参考', '智能多帧', '主体参考'];
            document.querySelectorAll('span').forEach(el => {
                const t = el.textContent.trim();
                const rect = el.getBoundingClientRect();
                if (modes.includes(t) && rect.y > 800 && rect.width > 20) {
                    (el.closest('button') || el.closest('[class*="select"]') || el).click();
                }
            });
        });
        await sleep(1000);

        // 选择"全能参考"
        const switched = await page.evaluate(() => {
            const items = document.querySelectorAll('li.lv-select-option');
            for (const item of items) {
                if (item.textContent.trim() === '全能参考' && item.getBoundingClientRect().width > 0) {
                    item.click();
                    return true;
                }
            }
            return false;
        });
        if (!switched) throw new Error('无法选择全能参考模式');
        log(2, '已切换到全能参考');
        await sleep(2000);
    } else {
        log(2, '已是全能参考模式');
    }

    // === 步骤 3: 修正模型版本（全能参考会导致自动切换为 Fast） ===
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
        // 点击模型区域打开下拉
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

        // 选择 Seedance 2.0 全能王者
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
            // fallback: Seedance 2.0 without Fast/Lite
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

    // === 步骤 4: 确认 9:16 和 8s ===
    log(4, '确认画幅和时长...');
    const settings = await page.evaluate(() => {
        let ratio = '', duration = '';
        document.querySelectorAll('span').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.y < 800 || rect.width < 20 || rect.height > 50) return;
            const t = el.textContent.trim();
            if (/^\d+:\d+$/.test(t)) ratio = t;
            if (/^\d+s$/i.test(t)) duration = t;
        });
        return { ratio, duration };
    });

    if (settings.ratio !== '9:16') {
        log(4, `比例 ${settings.ratio} → 9:16...`);
        await page.evaluate(() => {
            document.querySelectorAll('span').forEach(el => {
                if (/^\d+:\d+$/.test(el.textContent.trim()) && el.getBoundingClientRect().y > 800) {
                    (el.closest('button') || el).click();
                }
            });
        });
        await sleep(500);
        await page.evaluate(() => {
            document.querySelectorAll('li.lv-select-option, li, [role="option"]').forEach(item => {
                if (item.textContent.includes('9:16') && item.getBoundingClientRect().width > 0) item.click();
            });
        });
        await sleep(500);
        await page.mouse.click(10, 400);
        await sleep(300);
    }

    if (settings.duration !== '8s') {
        log(4, `时长 ${settings.duration} → 8s...`);
        await page.evaluate(() => {
            document.querySelectorAll('span').forEach(el => {
                if (/^\d+s$/i.test(el.textContent.trim()) && el.getBoundingClientRect().y > 800) {
                    (el.closest('button') || el).click();
                }
            });
        });
        await sleep(500);
        await page.evaluate(() => {
            document.querySelectorAll('li.lv-select-option, li, [role="option"]').forEach(item => {
                if ((item.textContent.includes('8s') || item.textContent.includes('8S')) && item.getBoundingClientRect().width > 0) item.click();
            });
        });
        await sleep(500);
        await page.mouse.click(10, 400);
        await sleep(300);
    }

    // 最终确认
    const finalSettings = await page.evaluate(() => {
        const r = {};
        document.querySelectorAll('span').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.y < 800 || rect.width < 20 || rect.height > 50) return;
            const t = el.textContent.trim();
            if (t.length > 30) return;
            if (t.includes('Seedance')) r.model = t;
            if (['首尾帧', '全能参考', '无参考', '运动参考', '局部参考', '智能多帧', '主体参考'].includes(t)) r.refMode = t;
            if (/^\d+:\d+$/.test(t)) r.ratio = t;
            if (/^\d+s$/i.test(t)) r.duration = t;
        });
        return r;
    });
    log(4, `最终: ${finalSettings.model} | ${finalSettings.refMode} | ${finalSettings.ratio} | ${finalSettings.duration}`);

    // 验证
    if (finalSettings.refMode !== '全能参考') throw new Error(`参考模式错误: ${finalSettings.refMode}`);
    if (finalSettings.model.includes('Fast') || finalSettings.model.includes('Lite')) throw new Error(`模型错误: ${finalSettings.model}`);

    await safeScreenshot(page, `${CONFIG.screenshots}/02_settings.png`);

    // === 步骤 5: 上传参考图片 ===
    log(5, '上传参考图片...');

    // 上传图片1
    let fic = await page.evaluate(() => document.querySelectorAll('input[type="file"]').length);
    log(5, `页面有 ${fic} 个 file input`);
    if (fic < 1) throw new Error('未找到 file input');

    await page.locator('input[type="file"]').nth(0).setInputFiles(CONFIG.images[0]);
    log(5, '图片1 上传完成');
    await sleep(3000);

    // 上传图片2（DOM 可能已变）
    fic = await page.evaluate(() => document.querySelectorAll('input[type="file"]').length);
    log(5, `上传后页面有 ${fic} 个 file input`);
    // 找到空的 file input
    const emptyIdx = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input[type="file"]');
        for (let i = 0; i < inputs.length; i++) {
            if (inputs[i].files.length === 0) return i;
        }
        return inputs.length - 1;
    });
    await page.locator('input[type="file"]').nth(emptyIdx).setInputFiles(CONFIG.images[1]);
    log(5, `图片2 上传完成 (index: ${emptyIdx})`);
    await sleep(3000);

    await safeScreenshot(page, `${CONFIG.screenshots}/03_images.png`);

    // === 步骤 6: 输入提示词（含 @ 引用） ===
    log(6, '输入提示词...');

    // 点击 ProseMirror 编辑器
    const editor = page.locator('div.tiptap.ProseMirror').first();
    await editor.click();
    await sleep(500);

    // 清空
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await sleep(300);

    let atSuccess = true; // 跟踪 @ 引用是否全部成功

    for (let i = 0; i < CONFIG.promptParts.length; i++) {
        const part = CONFIG.promptParts[i];

        if (part.type === 'text') {
            await page.evaluate((text) => {
                document.execCommand('insertText', false, text);
            }, part.value);
            log(6, `  文本: "${part.value.slice(0, 30)}${part.value.length > 30 ? '...' : ''}"`);
            await sleep(300);

        } else if (part.type === 'at') {
            // 输入 @ 触发 TipTap mention 弹出
            await page.keyboard.type('@');
            await sleep(2000);

            // 在 lv-select-popup 中找到对应选项
            const atResult = await page.evaluate((label) => {
                // 找到高 z-index 的 lv-trigger 弹出层内的 lv-select-option
                const popups = document.querySelectorAll('.lv-select-popup li.lv-select-option');
                for (const item of popups) {
                    const rect = item.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 && item.textContent.trim() === label) {
                        item.click();
                        return { text: item.textContent.trim(), x: Math.round(rect.x), y: Math.round(rect.y) };
                    }
                }
                return null;
            }, part.label);

            if (atResult) {
                log(6, `  @引用成功: "${atResult.text}" at (${atResult.x}, ${atResult.y})`);
            } else {
                log(6, `  ERROR: @"${part.label}" 未找到!`);
                atSuccess = false;
                // 删除输入的 @
                await page.keyboard.press('Backspace');
            }
            await sleep(500);
        }
    }

    await safeScreenshot(page, `${CONFIG.screenshots}/04_prompt.png`);
    log(6, '提示词输入完成');

    // === 验证 @ 引用是否正确 ===
    if (!atSuccess) {
        log('X', 'ERROR: @ 引用不完整，中止提交！');
        console.log('\n========================================');
        console.log('  流程中止 - @ 引用错误');
        console.log('========================================');
        await browser.close();
        process.exit(1);
    }

    // 额外验证：检查编辑器中 mention 标签数量
    const mentionCount = await page.evaluate(() => {
        const editor = document.querySelector('div.tiptap.ProseMirror');
        if (!editor) return 0;
        // TipTap mention 通常渲染为 span[data-type="mention"] 或类似
        const mentions = editor.querySelectorAll('[data-type="mention"], .mention, [class*="mention"]');
        return mentions.length;
    });
    const expectedMentions = CONFIG.promptParts.filter(p => p.type === 'at').length;
    log('V', `编辑器中 mention 标签: ${mentionCount}, 期望: ${expectedMentions}`);

    if (mentionCount < expectedMentions) {
        log('X', `WARNING: mention 标签数量不匹配 (${mentionCount} < ${expectedMentions})，但 @ 选择步骤成功，继续提交`);
    }

    // === 步骤 7: 拦截网络 + 点击"生成" ===
    log(7, '设置网络拦截，准备捕获 history_record_id...');

    // 设置 Promise 在点击前注册，捕获 /aigc_draft/generate 的响应
    const generateResponsePromise = new Promise((resolve) => {
        const handler = async (response) => {
            const url = response.url();
            if (url.includes('/mweb/v1/aigc_draft/generate')) {
                try {
                    const json = await response.json();
                    page.off('response', handler);
                    resolve(json);
                } catch (e) {
                    // 可能是非 JSON 响应，忽略
                }
            }
        };
        page.on('response', handler);
        // 30秒超时
        setTimeout(() => resolve(null), 30000);
    });

    log(7, '点击"生成"按钮...');

    // 精确匹配：底栏圆形主按钮
    const submitClicked = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            const cn = typeof btn.className === 'string' ? btn.className : '';
            const rect = btn.getBoundingClientRect();
            if (rect.y > 800 && cn.includes('lv-btn-primary') && (cn.includes('circle') || cn.includes('submit'))) {
                btn.click();
                return { via: 'primary-circle', x: Math.round(rect.x), y: Math.round(rect.y) };
            }
        }
        let rightMost = null;
        for (const btn of buttons) {
            const rect = btn.getBoundingClientRect();
            if (rect.y > 800 && rect.width > 20 && rect.width < 100 && btn.querySelector('svg')) {
                if (!rightMost || rect.x > rightMost.x) rightMost = { btn, x: rect.x, y: rect.y };
            }
        }
        if (rightMost) {
            rightMost.btn.click();
            return { via: 'rightmost-svg', x: Math.round(rightMost.x), y: Math.round(rightMost.y) };
        }
        return null;
    });

    if (submitClicked) {
        log(7, `已点击生成: ${submitClicked.via} at (${submitClicked.x}, ${submitClicked.y})`);
    } else {
        throw new Error('未找到生成按钮');
    }

    // === 步骤 8: 捕获 history_record_id ===
    log(8, '等待 generate 响应...');
    const generateResp = await generateResponsePromise;

    let historyId = null;
    if (generateResp && generateResp.data && generateResp.data.aigc_data) {
        historyId = generateResp.data.aigc_data.history_record_id;
    }

    if (!historyId) {
        log(8, 'WARNING: 未从 response 捕获到 history_record_id，尝试从 DOM 获取...');
        // 备选：从页面历史记录 API 获取最近的生成任务
        await sleep(3000);
        historyId = await page.evaluate(async () => {
            // 页面可能会自己轮询，我们从最新的网络请求中拿
            // 或者可以检查页面上显示的最新任务
            return null; // 依赖网络拦截
        });
    }

    if (historyId) {
        log(8, `✓ history_record_id: ${historyId}`);
    } else {
        log(8, 'ERROR: 无法获取 history_record_id!');
        await safeScreenshot(page, `${CONFIG.screenshots}/05_result.png`);
        await browser.close();
        process.exit(1);
    }

    await safeScreenshot(page, `${CONFIG.screenshots}/05_submitted.png`);

    // === 步骤 9: 轮询任务状态 ===
    log(9, '开始轮询视频生成状态...');

    const STATUS_MAP = {
        10: 'SUCCESS',
        20: 'PROCESSING',
        30: 'FAILED',
        42: 'POST_PROCESSING',
        45: 'FINALIZING',
        50: 'COMPLETED',
    };
    const POLL_INTERVAL = 3000;  // 3秒
    const MAX_POLLS = 400;       // 最多轮询 400 次 (~20分钟)

    let videoUrl = null;
    let finalStatus = null;

    for (let poll = 1; poll <= MAX_POLLS; poll++) {
        await sleep(poll === 1 ? 5000 : POLL_INTERVAL); // 首次等5秒

        const pollResult = await page.evaluate(async (hid) => {
            try {
                const resp = await fetch('/mweb/v1/get_history_by_ids', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ history_ids: [hid] }),
                });
                return await resp.json();
            } catch (e) {
                return { error: e.message };
            }
        }, historyId);

        if (pollResult.error) {
            log(9, `  轮询 ${poll}: 网络错误 - ${pollResult.error}`);
            continue;
        }

        // 解析响应
        const taskData = pollResult.data?.[historyId] || pollResult.data;
        const status = taskData?.status;
        const statusName = STATUS_MAP[status] || `UNKNOWN(${status})`;

        if (poll % 10 === 1 || status === 10 || status === 50 || status === 30) {
            log(9, `  轮询 ${poll}: 状态=${statusName} (${status})`);
        }

        // 检查完成
        if (status === 10 || status === 50) {
            finalStatus = statusName;
            // 提取视频 URL
            const items = taskData?.item_list || [];
            if (items.length > 0) {
                const item = items[0];
                videoUrl = item?.video?.transcoded_video?.origin?.video_url
                    || item?.video?.play_url
                    || item?.video?.download_url
                    || item?.video?.url;

                // 如果没有直接 URL，尝试通过 get_local_item_list 获取高清 URL
                if (!videoUrl && item?.item_id) {
                    log(9, '  尝试获取高清视频 URL...');
                    const hdResult = await page.evaluate(async (itemId) => {
                        try {
                            const resp = await fetch('/mweb/v1/get_local_item_list', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    item_id_list: [itemId],
                                    pack_item_opt: { scene: 1, need_data_integrity: true },
                                    is_for_video_download: true,
                                }),
                            });
                            return await resp.json();
                        } catch (e) {
                            return { error: e.message };
                        }
                    }, item.item_id);

                    const hdItems = hdResult.data?.item_list || [];
                    if (hdItems.length > 0) {
                        const hdItem = hdItems[0];
                        videoUrl = hdItem?.video?.transcoded_video?.origin?.video_url
                            || hdItem?.video?.play_url
                            || hdItem?.video?.download_url;
                    }
                }
            }
            break;
        }

        if (status === 30) {
            finalStatus = 'FAILED';
            log(9, '  ✗ 视频生成失败!');
            break;
        }
    }

    // === 步骤 10: 写入结果 + 下载视频 ===
    const result = {
        history_record_id: historyId,
        status: finalStatus || 'TIMEOUT',
        video_url: videoUrl || null,
        timestamp: new Date().toISOString(),
    };

    // 写入 JSON 结果文件
    const resultPath = path.join(CONFIG.screenshots, '..', 'result.json');
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf-8');
    log(10, `结果已写入: ${resultPath}`);

    console.log('\n========================================');
    console.log('  生成结果');
    console.log('========================================');
    console.log(`  history_id:  ${historyId}`);
    console.log(`  状态:        ${result.status}`);

    if (videoUrl) {
        console.log(`  视频 URL:    ${videoUrl}`);

        // 下载视频
        log(10, '开始下载视频...');
        const videoDir = path.join(CONFIG.screenshots, '..', 'videos');
        if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });
        const videoPath = path.join(videoDir, `${historyId}.mp4`);

        try {
            // 在浏览器内通过 fetch 下载（自动带 cookie / referer）
            const videoBase64 = await page.evaluate(async (url) => {
                const resp = await fetch(url);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const blob = await resp.blob();
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            }, videoUrl);

            fs.writeFileSync(videoPath, Buffer.from(videoBase64, 'base64'));
            const sizeMB = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(2);
            log(10, `视频已下载: ${videoPath} (${sizeMB} MB)`);
            console.log(`  本地文件:    ${videoPath} (${sizeMB} MB)`);

            result.local_path = videoPath;
            fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf-8');
        } catch (dlErr) {
            log(10, `浏览器内下载失败 (${dlErr.message})，尝试 Node fetch...`);
            try {
                const resp = await fetch(videoUrl);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const buf = Buffer.from(await resp.arrayBuffer());
                fs.writeFileSync(videoPath, buf);
                const sizeMB = (buf.length / 1024 / 1024).toFixed(2);
                log(10, `视频已下载(Node): ${videoPath} (${sizeMB} MB)`);
                console.log(`  本地文件:    ${videoPath} (${sizeMB} MB)`);
                result.local_path = videoPath;
                fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf-8');
            } catch (e2) {
                log(10, `下载失败: ${e2.message}`);
                console.log('  下载失败，请手动下载上方 URL');
            }
        }
    } else {
        console.log('  视频 URL:    (未能提取)');
    }

    console.log('========================================\n');

    await safeScreenshot(page, `${CONFIG.screenshots}/06_final.png`);
    await browser.close();
    return result;
}

main().catch(err => {
    console.error('\n执行出错:', err.message);
    process.exit(1);
});
