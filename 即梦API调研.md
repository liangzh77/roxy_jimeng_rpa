# 即梦(Jimeng) 前端 API 调研

> 基于 https://github.com/iptag/jimeng-api 项目逆向分析

## 一、核心 API 端点

| 用途 | 方法 | 端点 |
|------|------|------|
| 提交生成任务 | POST | `/mweb/v1/aigc_draft/generate` |
| 轮询任务状态 | POST | `/mweb/v1/get_history_by_ids` |
| 获取高清视频 | POST | `/mweb/v1/get_local_item_list` |
| 查询积分 | POST | `/commerce/v1/benefits/user_credit` |
| 领取每日积分 | POST | `/commerce/v1/benefits/credit_receive` |
| 获取上传 token | POST | `/mweb/v1/get_upload_token` |
| 内容安全检查 | POST | `/mweb/v1/algo_proxy` |

## 二、认证方式

完全基于 cookie，核心是 `sessionid` 字段。所有请求还需要签名头：

```
Sign: md5("9e2c|<URI后7位>|7|8.4.0|<unix_timestamp>||11ac")
Sign-Ver: 1
Device-Time: <unix_timestamp>
```

通过 Playwright 在已登录浏览器内用 `page.evaluate(fetch(...))` 发请求，可自动携带 cookie，无需手动处理认证。

## 三、提交任务流程

### 请求: POST `/mweb/v1/aigc_draft/generate`

请求体核心结构：
```json
{
  "extend": {
    "root_model": "dreamina_seedance_40_pro",
    "m_video_commerce_info": {
      "benefit_type": "dreamina_video_seedance_15_pro",
      "resource_id": "generate_video"
    }
  },
  "submit_id": "<uuid>",
  "draft_content": "<JSON字符串，包含完整的草稿内容>",
  "http_common_info": { "aid": 513695 }
}
```

`draft_content` 内嵌套的关键字段：
- `prompt`: 提示词文本
- `video_mode`: 2
- `fps`: 24
- `duration_ms`: 视频时长（毫秒），如 8000
- `resolution`: "720p"
- `video_aspect_ratio`: "9:16"
- `seed`: 随机整数
- `model_req_key`: 模型标识符

### 响应:
```json
{
  "ret": "0",
  "data": {
    "aigc_data": {
      "history_record_id": "7474512345678901234"
    }
  }
}
```

**`history_record_id` 就是后续轮询用的任务 ID。**

## 四、轮询任务状态

### 请求: POST `/mweb/v1/get_history_by_ids`

```json
{
  "history_ids": ["7474512345678901234"]
}
```

### 响应:
```json
{
  "data": {
    "7474512345678901234": {
      "status": 20,
      "item_list": [
        {
          "item_id": "...",
          "video": {
            "transcoded_video": {
              "origin": {
                "video_url": "https://v1-dreamnia.jimeng.com/..."
              }
            },
            "play_url": "...",
            "download_url": "..."
          }
        }
      ]
    }
  }
}
```

### 状态码:

| 状态码 | 含义 | 说明 |
|--------|------|------|
| 20 | PROCESSING | 生成中 |
| 42 | POST_PROCESSING | 后处理 |
| 45 | FINALIZING | 收尾中 |
| 10 | SUCCESS | 成功 |
| 50 | COMPLETED | 完成 |
| 30 | FAILED | 失败 |

### 轮询策略（参照 jimeng-api SmartPoller）:
- 基础间隔: 2-3 秒
- 首次轮询前等待: 5 秒
- 最大轮询次数: 900 次
- 超时: 20 分钟
- 状态 42 时间隔 ×1.2，状态 45 时间隔 ×1.5

## 五、获取高清视频 URL

### 请求: POST `/mweb/v1/get_local_item_list`

```json
{
  "item_id_list": ["<item_id>"],
  "pack_item_opt": { "scene": 1, "need_data_integrity": true },
  "is_for_video_download": true
}
```

URL 提取优先级：
1. `video.transcoded_video.origin.video_url`
2. `video.play_url`
3. `video.download_url`
4. `video.url`

## 六、模型名称映射

| 用户可见名 | 内部 model_req_key |
|-----------|-------------------|
| Seedance 2.0 (全能王者) | `dreamina_seedance_40_pro` |
| Seedance 2.0 Fast | `dreamina_seedance_40` |
| 视频 3.5 Pro | `dreamina_ic_generate_video_model_vgfm_3.5_pro` |
| 视频 3.0 Pro | `dreamina_ic_generate_video_model_vgfm_3.0_pro` |
| 视频 3.0 | `dreamina_ic_generate_video_model_vgfm_3.0` |
| 视频 3.0 Fast | `dreamina_ic_generate_video_model_vgfm_3.0_fast` |

## 七、Playwright 集成方案

通过 Playwright 操作已登录的浏览器，可以：

1. **拦截提交响应**: `page.on('response')` 监听 `/aigc_draft/generate` 获取 `history_record_id`
2. **浏览器内轮询**: `page.evaluate(fetch('/mweb/v1/get_history_by_ids', ...))` 自动带 cookie
3. **下载视频**: 拿到视频 URL 后用 Node.js `fetch` 或浏览器内下载

优势：无需处理签名、cookie、指纹等复杂认证，直接复用浏览器会话。
