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
        // 强制开启语音评论
        reg: '"ip":.*?((?=,)|(?=\n)|(?=\r)|(?=\\}))',
        val: '"ip":"www.erplus.co"'
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

    $done({ body: JSON.stringify(JSON.parse(body)) });
} else {
    console.log("domain 调试 body 为空");
    $done({});
}
