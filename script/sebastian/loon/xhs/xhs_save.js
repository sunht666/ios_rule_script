/**
 * file: xhs_water.js
 * desc: 小红书去水印
 * author: yourname
 */

// ==============================================
// 1. 规则配置区域
// ==============================================
const rules = [
    {
        reg: '"disable_watermark":.*?((?=,)|(?=\n)|(?=\r)|(?=\\}))',
        val: '"disable_watermark":true'
    },
    {
        reg: '"disable_save":.*?((?=,)|(?=\n)|(?=\r)|(?=\\}))',
        val: '"disable_save":false'
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
