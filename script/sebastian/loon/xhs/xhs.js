/**
 * file: xhs_cold_start.js
 * desc: 小红书语音评论开关
 * author: yourname
 */

// ==============================================
// 1. 规则配置区域
// ==============================================
const rules = [
    {
        // 示例：强制开启语音评论 (修改 voice_comment_status 字段)
        // 解释：匹配 "key": 任意值，直到遇到逗号或右大括号
        reg: '"voice_comment_status":.*?((?=,)|(?=\n)|(?=\r)|(?=\\}))',
        val: '"voice_comment_status": 1'
    },
];

// ==============================================
// 2. 核心处理逻辑
// ==============================================
let body = $response.body;
const url = $request.url;

if (body) {

    rules.forEach(item => {
        const re = new RegExp(item.reg, "g");
        body = body.replace(re, item.val);
    });

    $done({ body });
} else {
    $done({});
}
