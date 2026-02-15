# 即梦视频生成 API 文档

基于 RoxyBrowser + Playwright 的即梦 AI 视频生成服务。管理多个浏览器会话，通过 HTTP API 提交视频生成任务，异步返回结果。

## 快速开始

### 前置条件

1. RoxyBrowser 桌面端已启动（提供 REST API，默认端口 50000）
2. 每个 `dirId` 对应的浏览器环境已手动登录即梦账号

### 启动服务

```bash
node server.js
```

服务默认端口 `3080`，可在 `config.json` 中修改。

---

## API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/file/check/:md5` | 检查文件是否已上传 |
| POST | `/api/file/upload` | 上传文件 |
| POST | `/api/task/submit` | 提交视频生成任务 |
| GET | `/api/task/:taskId` | 查询任务状态 |
| GET | `/api/sessions` | 查看会话池状态 |

---

## 1. 检查文件是否存在

检查指定 MD5 的文件是否已上传到服务器。用于避免重复上传。

**请求**

```
GET /api/file/check/:md5
```

**响应 — 文件存在**

```json
{
  "exists": true,
  "md5": "8a2d577559e6d10cfda51990461025e1",
  "size": 240379
}
```

**响应 — 文件不存在**

```json
{
  "exists": false,
  "md5": "0000000000000000000000000000dead"
}
```

---

## 2. 上传文件

上传图片/视频/音频文件到服务器。文件按 MD5 去重存储，相同文件不会重复保存。

**请求**

```
POST /api/file/upload
Content-Type: multipart/form-data
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `file` | File | 要上传的文件（最大 100MB） |

**示例**

```bash
curl -F "file=@photo.png" http://localhost:3080/api/file/upload
```

**响应**

```json
{
  "md5": "8a2d577559e6d10cfda51990461025e1",
  "size": 240379
}
```

---

## 3. 提交视频生成任务

提交一个视频生成任务到队列。接口立即返回 `taskId`，任务在后台异步执行。

**请求**

```
POST /api/task/submit
Content-Type: application/json
```

**请求体**

```json
{
  "images": ["md5_1", "md5_2"],
  "videos": ["md5_3"],
  "audios": ["md5_4"],
  "promptParts": [
    { "type": "at", "label": "图片1" },
    { "type": "text", "value": " 作为起始帧，" },
    { "type": "at", "label": "图片2" },
    { "type": "text", "value": " 作为结束帧，女生做各种好看的pose" }
  ],
  "model": "seedance_2.0",
  "refMode": "全能参考",
  "ratio": "9:16",
  "duration": "8s"
}
```

**参数说明**

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `images` | 是 | — | 图片文件 MD5 数组（需先通过上传接口上传） |
| `videos` | 否 | `[]` | 视频文件 MD5 数组 |
| `audios` | 否 | `[]` | 音频文件 MD5 数组 |
| `promptParts` | 是 | — | 提示词片段数组，见下方说明 |
| `model` | 否 | `seedance_2.0` | 模型版本 |
| `refMode` | 否 | `全能参考` | 参考模式 |
| `ratio` | 否 | `9:16` | 画幅比例 |
| `duration` | 否 | `8s` | 视频时长 |

> **注意**：`videos` 和 `audios` 仅在支持多类型文件的参考模式（如「全能参考」）下有效。在「首尾帧」等模式下，仅支持图片上传。

**promptParts 类型**

| type | 字段 | 说明 |
|------|------|------|
| `text` | `value` | 普通文本内容 |
| `at` | `label` | 图片引用标签（如 "图片1"、"图片2"） |

**refMode 可选值**

`首尾帧`、`全能参考`、`无参考`、`运动参考`、`局部参考`、`智能多帧`、`主体参考`

**ratio 可选值**

`9:16`、`16:9`、`1:1`、`3:4`、`4:3` 等

**duration 可选值**

`5s`、`8s`、`10s` 等

**响应**

```json
{
  "taskId": "835159f5-feca-417c-8116-b3dcfbcf966b"
}
```

**示例**

```bash
curl -X POST http://localhost:3080/api/task/submit \
  -H "Content-Type: application/json" \
  -d '{
    "images": ["8a2d577559e6d10cfda51990461025e1", "86c4fdd6e57e13feaf51b67f622c73b2"],
    "promptParts": [
      {"type": "text", "value": "女生从画面左侧走向右侧，自然摆动手臂"}
    ],
    "refMode": "全能参考",
    "ratio": "9:16",
    "duration": "8s"
  }'
```

---

## 4. 查询任务状态

根据 `taskId` 查询任务执行状态。

**请求**

```
GET /api/task/:taskId
```

**任务状态流转**

```
waiting → submitting → submitted
                     → failed
```

| 状态 | 说明 |
|------|------|
| `waiting` | 排队等待中，暂无空闲会话 |
| `submitting` | 正在通过浏览器自动化提交（约 30-60 秒） |
| `submitted` | 提交成功，返回 `sessionId` 和 `historyId` |
| `failed` | 提交失败，返回错误信息 |

**响应 — waiting / submitting**

```json
{
  "taskId": "835159f5-feca-417c-8116-b3dcfbcf966b",
  "status": "submitting",
  "createdAt": "2026-02-15T04:37:39.299Z"
}
```

**响应 — submitted**

```json
{
  "taskId": "835159f5-feca-417c-8116-b3dcfbcf966b",
  "status": "submitted",
  "createdAt": "2026-02-15T04:37:39.299Z",
  "sessionId": "51cacc23c9fca45cb3c8386872bcd63a",
  "historyId": "11880837749004"
}
```

调用方拿到 `sessionId` 和 `historyId` 后，需自行调用即梦 API 完成后续的轮询和下载，见文末 [后续步骤：轮询与下载](#后续步骤轮询与下载)。

**响应 — failed**

```json
{
  "taskId": "835159f5-feca-417c-8116-b3dcfbcf966b",
  "status": "failed",
  "createdAt": "2026-02-15T04:37:39.299Z",
  "error": "无法选择参考模式: 首尾帧"
}
```

**响应 — 任务不存在**

```json
HTTP 404
{
  "error": "任务不存在"
}
```

---

## 5. 查看会话池状态

查看所有浏览器会话的当前状态。

**请求**

```
GET /api/sessions
```

**响应**

```json
{
  "sessions": [
    {
      "dirId": "3879efa7e5c7a9fdbe66a2c5c7d2a241",
      "name": "账号1",
      "status": "idle",
      "sessionId": "***bcd63a"
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `dirId` | RoxyBrowser 环境 ID |
| `name` | 会话名称 |
| `status` | `idle`（空闲）或 `busy`（正在执行任务） |
| `sessionId` | 即梦 sessionId（脱敏显示） |

---

## 典型调用流程

```
1. 上传文件
   POST /api/file/upload  ×N 个文件（图片/视频/音频）
        ↓ 返回各文件的 md5

2. （可选）确认文件已存在
   GET /api/file/check/:md5

3. 提交任务
   POST /api/task/submit  { images: [...], videos: [...], audios: [...], promptParts: [...] }
        ↓ 返回 taskId

4. 轮询任务状态
   GET /api/task/:taskId
        ↓ 等待 status 变为 submitted

5. 拿到 sessionId + historyId，自行调用即梦 API 轮询下载
```

---

## 配置文件

`config.json` 示例：

```json
{
  "port": 3080,
  "roxy": {
    "api": "http://127.0.0.1:50000",
    "workspaceId": 67641
  },
  "sessions": [
    { "dirId": "3879efa7e5c7a9fdbe66a2c5c7d2a241", "name": "账号1" },
    { "dirId": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "name": "账号2" }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `port` | HTTP 服务端口 |
| `roxy.api` | RoxyBrowser REST API 地址 |
| `roxy.workspaceId` | RoxyBrowser 工作空间 ID |
| `sessions` | 浏览器会话列表，每项包含 `dirId` 和 `name` |

添加多个 session 可实现并行处理任务，每个 session 同一时刻只处理一个任务。

---

## 后续步骤：轮询与下载

任务提交成功（`status: "submitted"`）后，返回的 `sessionId` 和 `historyId` **不能直接获取视频文件**，还需要调用即梦平台 API 完成轮询和下载。这部分不经过本服务，由调用方自行实现。

### 认证方式

所有即梦 API 请求需要以下 Header：

| Header | 值 |
|--------|------|
| `Cookie` | `sessionid=<sessionId>` |
| `sign` | `md5("9e2c\|<URI后7位>\|7\|8.4.0\|<unix时间戳>\|\|11ac")` |

**sign 计算示例（URI = `/mweb/v1/get_history_by_ids`）：**

```
URI 后 7 位 = "by_ids"（取路径最后 7 个字符）
timestamp = 当前 Unix 时间戳（秒）
sign = md5("9e2c|ory_by_ids|7|8.4.0|1739592000||11ac")
```

### 1. 轮询生成进度

```
POST https://jimeng.jianying.com/mweb/v1/get_history_by_ids
Content-Type: application/json

{
  "history_ids": ["<historyId>"]
}
```

**响应结构**（`data` 是以 `historyId` 为 key 的对象，不是数组）：

```json
{
  "data": {
    "11880837749004": {
      "status": 20,
      "item_list": []
    }
  }
}
```

取状态值：`data[historyId].status`

**status 状态码**

| status | 含义 | 操作 |
|--------|------|------|
| 20 | 生成中 (PROCESSING) | 继续轮询 |
| 42 | 后处理中 | 继续轮询 |
| 45 | 收尾中 | 继续轮询 |
| 10 | 成功 (SUCCESS) | 提取视频 URL |
| 50 | 完成 (COMPLETED) | 提取视频 URL |
| 30 | 失败 (FAILED) | 停止轮询 |

建议轮询间隔 3-5 秒，首次可等待 5 秒后开始。

### 2. 下载视频

生成完成（status 为 10 或 50）后，从 `data[historyId].item_list[0].video` 中提取视频 URL，优先级：

```
video.transcoded_video.origin.video_url
→ video.play_url
→ video.download_url
→ video.url
```

如果以上都没有但有 `item_id`，可通过 `get_local_item_list` 接口获取高清视频 URL：

```
POST https://jimeng.jianying.com/mweb/v1/get_local_item_list
Content-Type: application/json

{
  "item_id_list": ["<item_id>"],
  "pack_item_opt": {"scene": 1, "need_data_integrity": true},
  "is_for_video_download": true
}
```

### 参考实现

完整的轮询 + 下载逻辑可参考项目中 `jimeng_auto.js` 的步骤 9-10。
