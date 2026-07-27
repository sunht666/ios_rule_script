/*
 * 山西预约余量显示修改
 *
 * 将响应 data 下每个站点中的 YYYY-MM-DD 日期字段统一设为 100。
 * 在 Loon 插件的 [Script] 中以实际预约接口 URL 绑定为 http-response 脚本。
 */

var TARGET_VALUE = 100;
var DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rewriteAvailability(response) {
  if (!isObject(response) || !isObject(response.data)) {
    return response;
  }

  Object.keys(response.data).forEach(function (siteCode) {
    var siteAvailability = response.data[siteCode];

    if (!isObject(siteAvailability)) {
      return;
    }

    Object.keys(siteAvailability).forEach(function (key) {
      if (DATE_KEY_PATTERN.test(key)) {
        siteAvailability[key] = TARGET_VALUE;
      }
    });
  });

  return response;
}

try {
  var response = JSON.parse($response.body);

  $done({
    body: JSON.stringify(rewriteAvailability(response))
  });
} catch (error) {
  // 结构不匹配或非 JSON 响应时保持原样，避免影响正常接口。
  $done({
    body: $response.body
  });
}
