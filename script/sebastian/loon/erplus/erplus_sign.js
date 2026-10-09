/**
 * file: erplus_sign.js
 * desc: Set WiFi and location fields on the sign POST JSON request.
 * author: Sebastian
 */

const CENTER_LATITUDE = 36.665811;
const CENTER_LONGITUDE = 117.072258;
const RADIUS_METERS = 50;

function randomLocation() {
    const radians = Math.PI / 180;
    const latitude = CENTER_LATITUDE * radians;
    const longitude = CENTER_LONGITUDE * radians;
    // Square-root sampling spreads points uniformly over the small disk.
    const distance = RADIUS_METERS * Math.sqrt(Math.random()) / 6371000;
    const bearing = 2 * Math.PI * Math.random();
    const nextLatitude = Math.asin(
        Math.sin(latitude) * Math.cos(distance) +
        Math.cos(latitude) * Math.sin(distance) * Math.cos(bearing)
    );
    const nextLongitude = longitude + Math.atan2(
        Math.sin(bearing) * Math.sin(distance) * Math.cos(latitude),
        Math.cos(distance) - Math.sin(latitude) * Math.sin(nextLatitude)
    );
    return {
        latitude: nextLatitude / radians,
        longitude: nextLongitude / radians
    };
}

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
            const location = randomLocation();
            body.latitude = location.latitude;
            body.longitude = location.longitude;
            body.signAddress = "\u5c71\u4e1c\u7701\u6d4e\u5357\u5e02\u5386\u4e0b\u533a\u89e3\u653e\u8def";
            result = { body: JSON.stringify(body) };
        }
    } catch (e) {
        // Leave non-JSON requests unchanged.
    }
}

$done(result);
