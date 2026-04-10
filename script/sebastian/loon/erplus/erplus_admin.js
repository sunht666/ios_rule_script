/**
 * file: erplus_admin.js
 * desc: 大管加超级管理员
 * author: Sebastian
 */

// ==============================================
// 1. 规则配置区域
// ==============================================
const rules = [
    // 原有
    {
        reg: '"isAdmin":.*?((?=,)|(?=\n)|(?=\r)|(?=\\}))',
        val: '"isAdmin": true'
    },
    {
        reg: '"isAdminIdentity":.*?((?=,)|(?=\n)|(?=\r)|(?=\\}))',
        val: '"isAdminIdentity": 1'
    },
    {
        reg: '"isContactManager":.*?((?=,)|(?=\n)|(?=\r)|(?=\\}))',
        val: '"isContactManager": 1'
    },
    // 新增: 超级管理员 + 各模块管理员
    {
        reg: '"isSuperAdmin":.*?((?=,)|(?=\n)|(?=\r)|(?=\\}))',
        val: '"isSuperAdmin": true'
    },
    {
        reg: '"isAccountManager":.*?((?=,)|(?=\n)|(?=\r)|(?=\\}))',
        val: '"isAccountManager": true'
    },
    {
        reg: '"isHRManager":.*?((?=,)|(?=\n)|(?=\r)|(?=\\}))',
        val: '"isHRManager": 1'
    },
    {
        reg: '"hasCrmPermission":.*?((?=,)|(?=\n)|(?=\r)|(?=\\}))',
        val: '"hasCrmPermission": true'
    },
    {
        reg: '"isCrmAdmin":.*?((?=,)|(?=\n)|(?=\r)|(?=\\}))',
        val: '"isCrmAdmin": true'
    },
    {
        reg: '"isTaskAdmin":.*?((?=,)|(?=\n)|(?=\r)|(?=\\}))',
        val: '"isTaskAdmin": true'
    }
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
