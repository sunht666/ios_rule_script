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
    try {
        rules.forEach(item => {
            const re = new RegExp(item.reg, "g");
            body = body.replace(re, item.val);
        });

        $done({ body: JSON.stringify(JSON.parse(body)) });
    } catch (e) {
        // 非 JSON 响应保持原样，避免脚本异常影响接口。
        $done({ body });
    }
} else {
    $done({});
}
