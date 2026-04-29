/**
 * file: erplus_admin.js
 * desc: 大管加超级管理员
 * author: Sebastian
 */

const MY_CONTACT_ID_KEY = "erplus_my_contact_id";
const ID_FIELDS = ["id", "contactId", "mainContactId"];
const ADMIN_VALUES = {
    isAdmin: true,
    isAdminIdentity: 1,
    isContactManager: 1,
    isSuperAdmin: true,
    isAccountManager: true,
    isHRManager: 1,
    hasCrmPermission: true,
    isCrmAdmin: true,
    isTaskAdmin: true
};

const rules = Object.keys(ADMIN_VALUES).map(key => ({
    reg: `"${key}":.*?((?=,)|(?=\\n)|(?=\\r)|(?=\\}))`,
    val: `"${key}": ${JSON.stringify(ADMIN_VALUES[key])}`
}));

let body = $response.body;
const url = $request.url;

function readMyId() {
    if (typeof $persistentStore === "undefined") return "";
    return $persistentStore.read(MY_CONTACT_ID_KEY) || "";
}

function writeMyId(id) {
    if (typeof $persistentStore === "undefined" || id === undefined || id === null) return;
    $persistentStore.write(String(id), MY_CONTACT_ID_KEY);
}

function getRequestId(requestUrl) {
    const pathMatch = requestUrl.match(/\/api\/v1\/contacts\/(\d+)\/identity/);
    if (pathMatch) return pathMatch[1];

    const queryMatch = requestUrl.match(/[?&](?:id|contactId|mainContactId)=(\d+)/);
    return queryMatch ? queryMatch[1] : "";
}

function getObjectId(obj) {
    if (!obj || typeof obj !== "object") return "";
    for (const field of ID_FIELDS) {
        if (obj[field] !== undefined && obj[field] !== null) return String(obj[field]);
    }
    return "";
}

function patchAdminFields(obj) {
    Object.keys(ADMIN_VALUES).forEach(key => {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            obj[key] = ADMIN_VALUES[key];
        }
    });
}

function patchById(obj, myId) {
    if (!obj || typeof obj !== "object") return false;

    let patched = false;
    if (getObjectId(obj) === myId) {
        patchAdminFields(obj);
        patched = true;
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

function patchByRules(responseBody) {
    let patchedBody = responseBody;
    rules.forEach(item => {
        const re = new RegExp(item.reg, "g");
        patchedBody = patchedBody.replace(re, item.val);
    });
    return patchedBody;
}

if (body) {
    try {
        let obj = JSON.parse(body);
        const isProfile = /\/api\/v1\/profile(?:$|\?)/.test(url);
        const myId = readMyId();
        const requestId = getRequestId(url);

        if (isProfile) {
            writeMyId(obj.id);
            patchAdminFields(obj);
            $done({ body: JSON.stringify(obj) });
        } else if (!myId) {
            $done({ body: patchByRules(body) });
        } else if (requestId) {
            if (requestId === myId) {
                patchAdminFields(obj);
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
        const myId = readMyId();
        const requestId = getRequestId(url);
        if (myId && requestId && requestId !== myId) {
            $done({ body });
        } else {
            $done({ body: patchByRules(body) });
        }
    }
} else {
    $done({});
}
