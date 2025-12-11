/**
 * file: erplus_domain.js
 * desc: 大管加修改域名
 * author: Sebastian
 */

// ==============================================
// 1. 规则配置区域
// ==============================================
const rules = [
    {
        // 示例：强制开启语音评论 (修改 voice_comment_status 字段)
        // 解释：匹配 "key": 任意值，直到遇到逗号或右大括号
        reg: '"ip":.*?((?=,)|(?=\n)|(?=\r)|(?=\\}))',
        val: '"ip": "www.erplus.co"'
    },
];

// ==============================================
// 2. 核心处理逻辑
// ==============================================
let body = $response.body;
const url = $request.url;

if (body) {
    console.log("domain 调试 body" + body);
    rules.forEach(item => {
        const re = new RegExp(item.reg, "g");
        body = body.replace(re, item.val);
    });
    console.log("domain 调试 body 替换后" + body);

    $done({ 
        status: 200,
        body: body 
    });
} else {
    console.log("domain 调试 body 为空");
    $done({});
}
