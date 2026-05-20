/**
 * file: erplus_leave.js
 * desc: 大管加调休余额修改
 * author: Sebastian
 */

const LEAVE_NAME = "调休";
const WORKDAY_SECONDS = 8 * 60 * 60;
const TARGET_DAYS = 10;
const TARGET_SECONDS = TARGET_DAYS * WORKDAY_SECONDS;
const TARGET_SHOW = `${TARGET_DAYS}.0天`;
const TEMPLATE_LIMIT_MAX = 100;

let body = $response.body;
const url = $request.url;

function patchLeaveRemain(obj) {
    if (!Array.isArray(obj.erpData)) return;

    obj.erpData.forEach(item => {
        if (item && item.name === LEAVE_NAME) {
            item.leaveRemainTime = TARGET_SECONDS;
            item.leaveRemainShowTimeSec = TARGET_SECONDS;
            item.leaveRemainShowTime = TARGET_SHOW;
        }
    });
}

function hasTemplateLimit(item) {
    if (!item || typeof item !== "object") return false;

    return item.isMaxTime === 1 ||
        item.isMaxTime === true ||
        item.contentTimeLimit === 1 ||
        item.contentTimeLimit === true ||
        Number(item.maxTimePermonth) > 0 ||
        Number(item.timesLeftThisMonth) > 0;
}

function patchTemplateLimit(obj) {
    if (!Array.isArray(obj.item)) return;

    obj.item.forEach(item => {
        if (hasTemplateLimit(item)) {
            item.timesLeftThisMonth = TEMPLATE_LIMIT_MAX;
            item.maxTimePermonth = TEMPLATE_LIMIT_MAX;
        }
    });
}

if (body) {
    try {
        let obj = JSON.parse(body);

        if (url.indexOf("/appreq/getTemplateList") !== -1) {
            patchTemplateLimit(obj);
        } else {
            patchLeaveRemain(obj);
        }

        $done({ body: JSON.stringify(obj) });
    } catch (e) {
        $done({ body });
    }
} else {
    $done({});
}
