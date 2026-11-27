/**
 * file: dongdianqiu.js
 * desc: 懂球帝响应改写
 * author: Sebastian
 */

let body = $response.body;
const url = $request.url;

function patchJsonString(value, keyName, nextValue) {
    if (typeof value !== "string") return { value, changed: false };

    const trimmed = value.trim();
    if (trimmed[0] !== "{" && trimmed[0] !== "[") {
        return { value, changed: false };
    }

    try {
        const parsed = JSON.parse(value);
        const changed = patchKey(parsed, keyName, nextValue, true);
        return changed ? { value: JSON.stringify(parsed), changed: true } : { value, changed: false };
    } catch (e) {
        return { value, changed: false };
    }
}

function patchKey(obj, keyName, nextValue, patchStringJson) {
    let changed = false;

    if (Array.isArray(obj)) {
        obj.forEach(item => {
            if (patchKey(item, keyName, nextValue, patchStringJson)) changed = true;
        });
        return changed;
    }

    if (!obj || typeof obj !== "object") return false;

    Object.keys(obj).forEach(key => {
        if (key === keyName) {
            if (obj[key] !== nextValue) changed = true;
            obj[key] = nextValue;
            return;
        }

        if (patchStringJson && typeof obj[key] === "string") {
            const patched = patchJsonString(obj[key], keyName, nextValue);
            if (patched.changed) {
                obj[key] = patched.value;
                changed = true;
                return;
            }
        }

        if (patchKey(obj[key], keyName, nextValue, patchStringJson)) changed = true;
    });

    return changed;
}

if (body) {
    try {
        const obj = JSON.parse(body);

        if (url.indexOf("/api/getMatchTips") !== -1) {
            patchKey(obj, "pay_status", 0, false);
        } else if (url.indexOf("/plan/planDetail") !== -1) {
            patchKey(obj, "is_vip_show", false, false);
        } else if (url.indexOf("/v2/user/is_login") !== -1) {
            patchKey(obj, "vipType", 1, true);
        }

        $done({ body: JSON.stringify(obj) });
    } catch (e) {
        $done({ body });
    }
} else {
    $done({});
}
