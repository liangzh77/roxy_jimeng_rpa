/**
 * 会话池管理 - 管理多个 RoxyBrowser 浏览器配置
 * 每个 session = 一个 dirId = 一个独立浏览器实例
 */

const { chromium } = require('playwright');

class SessionPool {
    constructor(roxyConfig) {
        this.roxyApi = roxyConfig.api;
        this.workspaceId = roxyConfig.workspaceId;
        this.sessions = new Map(); // dirId -> sessionInfo
    }

    async _roxyRequest(method, path, body) {
        const url = `${this.roxyApi}${path}`;
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        if (body) opts.body = JSON.stringify(body);
        const resp = await fetch(url, opts);
        return resp.json();
    }

    /**
     * 初始化所有 session：打开浏览器、连接 Playwright、提取 sessionId
     */
    async init(sessionConfigs) {
        for (const cfg of sessionConfigs) {
            console.log(`[SessionPool] 初始化 session: ${cfg.name} (${cfg.dirId})`);
            try {
                await this._initSession(cfg);
                console.log(`[SessionPool] ${cfg.name} 就绪`);
            } catch (err) {
                console.error(`[SessionPool] ${cfg.name} 初始化失败: ${err.message}`);
            }
        }
        console.log(`[SessionPool] 就绪 ${this.sessions.size}/${sessionConfigs.length} 个 session`);
    }

    async _initSession(cfg) {
        // 检查是否已打开
        const connInfo = await this._roxyRequest('GET',
            `/browser/connection_info?dirIds=${cfg.dirId}`);
        let wsUrl;
        if (connInfo.data && connInfo.data.length > 0) {
            wsUrl = connInfo.data[0].ws;
        } else {
            // 通过 API 打开浏览器
            const openResult = await this._roxyRequest('POST', '/browser/open', {
                workspaceId: this.workspaceId,
                dirId: cfg.dirId,
                args: ['--remote-allow-origins=*'],
                forceOpen: true,
            });
            if (openResult.code !== 0) {
                throw new Error(`打开浏览器失败: ${openResult.msg}`);
            }
            wsUrl = openResult.data.ws;
        }

        // Playwright 连接
        const browser = await chromium.connectOverCDP(wsUrl);
        const context = browser.contexts()[0];
        const page = context.pages().find(p => p.url().includes('jimeng')) || context.pages()[0];

        // 提取 sessionId
        const cookies = await context.cookies('https://jimeng.jianying.com');
        const sessionId = cookies.find(c => c.name === 'sessionid')?.value || null;

        this.sessions.set(cfg.dirId, {
            dirId: cfg.dirId,
            name: cfg.name,
            status: 'idle',
            wsUrl,
            browser,
            context,
            page,
            sessionId,
        });
    }

    /**
     * 获取一个空闲 session，标记为 busy
     */
    acquire() {
        for (const [dirId, session] of this.sessions) {
            if (session.status === 'idle') {
                session.status = 'busy';
                return session;
            }
        }
        return null;
    }

    /**
     * 释放 session，标记为 idle
     */
    release(dirId) {
        const session = this.sessions.get(dirId);
        if (session) {
            session.status = 'idle';
        }
    }

    /**
     * 返回所有 session 状态
     */
    getStatus() {
        const list = [];
        for (const [dirId, s] of this.sessions) {
            list.push({
                dirId: s.dirId,
                name: s.name,
                status: s.status,
                sessionId: s.sessionId ? '***' + s.sessionId.slice(-6) : null,
            });
        }
        return list;
    }

    /**
     * 关闭所有浏览器连接
     */
    async shutdown() {
        for (const [dirId, session] of this.sessions) {
            try {
                await session.browser.close();
            } catch {}
        }
        this.sessions.clear();
    }
}

module.exports = SessionPool;
