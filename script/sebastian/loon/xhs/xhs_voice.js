/**
 * file: xhs_voice.js
 * desc: 小红书语音评论开关
 * author: yourname
 */

// ==============================================
// 1. 规则配置区域
// ==============================================
const rules = [
    {
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
