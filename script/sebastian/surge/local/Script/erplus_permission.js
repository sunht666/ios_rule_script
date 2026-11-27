/**
 * file: erplus_permission.js
 * desc: 大管加权限码注入 (拦截 getSomeoneAuthByAccessToken / getEveryoneAuthByAccessTokenServlet)
 * author: Sebastian
 *
 * 注入所有管理员权限码，使前端 isXxxAdmin getter 全部返回 true:
 *   5=通讯录  7=考勤  9=通知  11/12/13/14/17=薪资  15=绩效
 *   41=人事  42=企业文化  43=招聘/考试  80=进销存  91=财务  161=表单
 */

const MY_CONTACT_ID_KEY = "erplus_my_contact_id";
const ALL_CODES = [5, 7, 9, 11, 12, 13, 14, 15, 17, 41, 42, 43, 80, 91, 101, 121, 141, 151, 161];
const ID_FIELDS = ["id", "contactId", "mainContactId"];
const PERMISSION_FIELDS = ["item", "permissionCode", "permissionCodes"];

let body = $response.body;
const url = $request.url;

function readMyId() {
    if (typeof $persistentStore === "undefined") return "";
    return $persistentStore.read(MY_CONTACT_ID_KEY) || "";
}

function getRequestId(requestUrl) {
    const match = requestUrl.match(/[?&](?:id|contactId|mainContactId)=(\d+)/);
    return match ? match[1] : "";
}

function getObjectId(obj) {
    if (!obj || typeof obj !== "object") return "";
    for (const field of ID_FIELDS) {
        if (obj[field] !== undefined && obj[field] !== null) return String(obj[field]);
    }
    return "";
}

function mergeCodes(codes) {
    return [...new Set([...(Array.isArray(codes) ? codes : []), ...ALL_CODES])];
}

function isCodeArray(value) {
    return Array.isArray(value) && value.every(item => typeof item === "number" || typeof item === "string");
}

function patchPermissionObject(obj) {
    if (!obj || typeof obj !== "object") return false;

    let patched = false;
    PERMISSION_FIELDS.forEach(field => {
        if (obj[field] !== undefined) {
            if (!Array.isArray(obj[field]) || isCodeArray(obj[field])) {
                obj[field] = mergeCodes(obj[field]);
                patched = true;
            }
        }
    });
    return patched;
}

function patchById(obj, myId) {
    if (!obj || typeof obj !== "object") return false;

    let patched = false;
    if (getObjectId(obj) === myId) {
        if (patchPermissionObject(obj)) patched = true;
    }

    Object.keys(obj).forEach(key => {
        const value = obj[key];
        if (Array.isArray(value)) {
            value.forEach(item => {
                if (patchById(item, myId)) patched = true;
            });
        } else if (value && typeof value === "object") {
            if (patchById(value, myId)) patched = true;
        }
    });

    return patched;
}

function patchLegacy(obj) {
    if (obj.item !== undefined) {
        obj.item = mergeCodes(obj.item);
    }
}

if (body) {
    try {
        let obj = JSON.parse(body);
        const myId = readMyId();
        const requestId = getRequestId(url);
        const isSomeoneAuth = url.indexOf("/mpauth/getSomeoneAuthByAccessToken") !== -1;

        if (isSomeoneAuth || !myId) {
            patchLegacy(obj);
            $done({ body: JSON.stringify(obj) });
        } else if (requestId) {
            if (requestId === myId) {
                patchPermissionObject(obj);
                patchById(obj, myId);
                $done({ body: JSON.stringify(obj) });
            } else {
                $done({ body });
            }
        } else if (patchById(obj, myId)) {
            $done({ body: JSON.stringify(obj) });
        } else {
            $done({ body });
        }
    } catch (e) {
        $done({ body });
    }
} else {
    $done({});
}
