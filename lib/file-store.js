/**
 * 文件存储模块 - 基于 MD5 去重
 * 文件存储在 uploads/<md5>.<ext>
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// 确保目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function computeMd5(buffer) {
    return crypto.createHash('md5').update(buffer).digest('hex');
}

function findFileByMd5(md5) {
    const files = fs.readdirSync(UPLOAD_DIR);
    for (const file of files) {
        if (file.startsWith(md5 + '.')) {
            return {
                exists: true,
                md5,
                size: fs.statSync(path.join(UPLOAD_DIR, file)).size,
            };
        }
    }
    return { exists: false, md5 };
}

function saveFile(buffer, originalName) {
    const md5 = computeMd5(buffer);
    const ext = path.extname(originalName) || '.bin';
    const filename = `${md5}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    // 已存在则跳过写入
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, buffer);
    }

    return {
        md5,
        size: buffer.length,
    };
}

function getFilePath(md5) {
    const info = findFileByMd5(md5);
    return info.exists ? info.path : null;
}

module.exports = { findFileByMd5, saveFile, getFilePath, computeMd5 };
