/**
 * file: typeless_usage.js
 * desc: Typeless 语音转写周用量修改
 * author: Sebastian
 */

const TARGET_VALUE = 6;
const TARGET_LIMIT = -1;
const TARGET_PATH = ["data", "voice_transcription"];

function patchUsage(obj) {
    let target = obj;

    for (const key of TARGET_PATH) {
        if (!target || typeof target !== "object") return false;
        target = target[key];
    }

    if (!target || typeof target !== "object") return false;

    let changed = false;
    if (Object.prototype.hasOwnProperty.call(target, "week_word_usage_value")) {
        target.week_word_usage_value = TARGET_VALUE;
        changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(target, "week_word_usage_limit")) {
        target.week_word_usage_limit = TARGET_LIMIT;
        changed = true;
    }

    return changed;
}

let body = $response.body;

if (body) {
    try {
        const obj = JSON.parse(body);
        if (patchUsage(obj)) {
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
