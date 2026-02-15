/**
 * 即梦视频生成 API 服务
 * 管理多个 RoxyBrowser 会话，通过 API 提交视频生成任务
 */

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const SessionPool = require('./lib/session-pool');
const { submitTask } = require('./lib/submitter');
const fileStore = require('./lib/file-store');

// 加载配置
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));

const app = express();
app.use(express.json());

// multer 配置：文件暂存到内存
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// ========== 全局状态 ==========
const pool = new SessionPool(config.roxy);
const tasks = new Map();   // taskId -> taskInfo
const queue = [];           // 等待处理的 taskId 列表
let workerRunning = false;

// ========== 文件 API ==========

// 检查文件是否存在
app.get('/api/file/check/:md5', (req, res) => {
    const info = fileStore.findFileByMd5(req.params.md5);
    res.json(info);
});

// 上传文件
app.post('/api/file/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '未上传文件' });
    }
    const result = fileStore.saveFile(req.file.buffer, req.file.originalname);
    res.json(result);
});

// ========== 任务 API ==========

// 提交任务
app.post('/api/task/submit', (req, res) => {
    const { images, videos, audios, promptParts, model, refMode, ratio, duration } = req.body;

    // 校验必填参数
    if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ error: 'images 必须是非空数组（MD5 值）' });
    }
    if (!promptParts || !Array.isArray(promptParts) || promptParts.length === 0) {
        return res.status(400).json({ error: 'promptParts 必须是非空数组' });
    }

    // 校验所有 MD5 文件是否存在，解析为本地路径
    const resolveMd5List = (md5List, label) => {
        const paths = [];
        for (const md5 of md5List) {
            const filePath = fileStore.getFilePath(md5);
            if (!filePath) {
                return { error: `${label}文件不存在: ${md5}` };
            }
            paths.push(filePath);
        }
        return { paths };
    };

    const imageResult = resolveMd5List(images, '图片');
    if (imageResult.error) return res.status(400).json({ error: imageResult.error });

    const videoResult = resolveMd5List(videos || [], '视频');
    if (videoResult.error) return res.status(400).json({ error: videoResult.error });

    const audioResult = resolveMd5List(audios || [], '音频');
    if (audioResult.error) return res.status(400).json({ error: audioResult.error });

    // 生成 taskId
    const taskId = crypto.randomUUID();
    const taskInfo = {
        taskId,
        status: 'waiting',
        images: imageResult.paths,
        videos: videoResult.paths,
        audios: audioResult.paths,
        promptParts,
        model: model || 'seedance_2.0',
        refMode: refMode || '全能参考',
        ratio: ratio || '9:16',
        duration: duration || '8s',
        sessionId: null,
        historyId: null,
        error: null,
        createdAt: new Date().toISOString(),
    };

    tasks.set(taskId, taskInfo);
    queue.push(taskId);

    console.log(`[server] 任务入队: ${taskId} (队列长度: ${queue.length})`);

    // 触发 worker
    processQueue();

    res.json({ taskId });
});

// 查询任务状态
app.get('/api/task/:taskId', (req, res) => {
    const task = tasks.get(req.params.taskId);
    if (!task) {
        return res.status(404).json({ error: '任务不存在' });
    }

    const result = {
        taskId: task.taskId,
        status: task.status,
        createdAt: task.createdAt,
    };

    if (task.status === 'submitted') {
        result.sessionId = task.sessionId;
        result.historyId = task.historyId;
    }
    if (task.status === 'failed') {
        result.error = task.error;
    }

    res.json(result);
});

// ========== 会话 API ==========

app.get('/api/sessions', (req, res) => {
    res.json({ sessions: pool.getStatus() });
});

// ========== 任务队列 Worker ==========

async function processQueue() {
    if (workerRunning) return;
    workerRunning = true;

    while (queue.length > 0) {
        // 尝试获取空闲 session
        const session = pool.acquire();
        if (!session) {
            console.log('[worker] 无空闲 session，等待 5 秒...');
            await new Promise(r => setTimeout(r, 5000));
            continue;
        }

        const taskId = queue.shift();
        const task = tasks.get(taskId);
        if (!task) continue;

        console.log(`[worker] 开始处理任务 ${taskId}，使用 session ${session.name}`);
        task.status = 'submitting';

        try {
            const result = await submitTask(session.page, {
                images: task.images,
                videos: task.videos,
                audios: task.audios,
                promptParts: task.promptParts,
                model: task.model,
                refMode: task.refMode,
                ratio: task.ratio,
                duration: task.duration,
            });

            // 提交成功后重新提取 sessionId（cookie 可能已刷新）
            const cookies = await session.context.cookies('https://jimeng.jianying.com');
            const sessionId = cookies.find(c => c.name === 'sessionid')?.value || session.sessionId;

            task.status = 'submitted';
            task.historyId = result.historyId;
            task.sessionId = sessionId;
            console.log(`[worker] 任务 ${taskId} 提交成功: historyId=${result.historyId}`);
        } catch (err) {
            task.status = 'failed';
            task.error = err.message;
            console.error(`[worker] 任务 ${taskId} 失败: ${err.message}`);
        } finally {
            pool.release(session.dirId);
        }
    }

    workerRunning = false;
}

// ========== 启动服务 ==========

async function start() {
    console.log('========================================');
    console.log('  即梦视频生成 API 服务');
    console.log('========================================\n');

    // 初始化会话池
    console.log('[server] 初始化会话池...');
    await pool.init(config.sessions);

    // 启动 HTTP 服务
    app.listen(config.port, () => {
        console.log(`\n[server] 服务已启动: http://localhost:${config.port}`);
        console.log('[server] API 列表:');
        console.log('  GET  /api/file/check/:md5   - 检查文件是否存在');
        console.log('  POST /api/file/upload        - 上传文件');
        console.log('  POST /api/task/submit         - 提交生成任务');
        console.log('  GET  /api/task/:taskId        - 查询任务状态');
        console.log('  GET  /api/sessions            - 查看会话状态');
    });

    // 优雅关闭
    process.on('SIGINT', async () => {
        console.log('\n[server] 正在关闭...');
        await pool.shutdown();
        process.exit(0);
    });
}

start().catch(err => {
    console.error('启动失败:', err.message);
    process.exit(1);
});
