/**
 * file: xhs.js
 * desc: JSON 正则替换脚本
 */

// ==============================================
// 1. 规则配置区域
// ==============================================
const rules = [
    {
        // 小红书语音评论开关
        reg: '"voice_comment_status":.*?((?=,)|(?=\n)|(?=\r)|(?=\\}))',
        val: '"voice_comment_status": 1'
    },
];

// ==============================================
// 2. 核心处理逻辑
// ==============================================
let body = $response.body;

if (body) {
    rules.forEach(item => {
        // 构造正则对象，'g' 表示全局替换
        const re = new RegExp(item.reg, "g");
        // 执行替换
        body = body.replace(re, item.val);
    });

    $done({ body });
} else {
    $done({});
}
