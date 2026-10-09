/**
 * file: erplus_sign.js
 * desc: Set WiFi fields on the sign POST JSON request.
 * author: Sebastian
 */

let result = {};

if (
    /^https:\/\/www\.erplus\.co\/checkinWeb\/sign(?:\?.*)?$/.test($request.url) &&
    String($request.method).toUpperCase() === "POST" &&
    typeof $request.body === "string" &&
    $request.body.trim()
) {
    try {
        const body = JSON.parse($request.body);
        if (body && typeof body === "object" && !Array.isArray(body)) {
            body.wifiName = "SDGC_5G";
            body.wifiId = "48:5f:08:86:bb:d0";
            result = { body: JSON.stringify(body) };
        }
    } catch (e) {
        // Leave non-JSON requests unchanged.
    }
}

$done(result);
