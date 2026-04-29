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

let body = $response.body;

if (body) {
    try {
        let obj = JSON.parse(body);

        if (Array.isArray(obj.erpData)) {
            obj.erpData.forEach(item => {
                if (item && item.name === LEAVE_NAME) {
                    item.leaveRemainTime = TARGET_SECONDS;
                    item.leaveRemainShowTimeSec = TARGET_SECONDS;
                    item.leaveRemainShowTime = TARGET_SHOW;
                }
            });
        }

        $done({ body: JSON.stringify(obj) });
    } catch (e) {
        $done({ body });
    }
} else {
    $done({});
}
