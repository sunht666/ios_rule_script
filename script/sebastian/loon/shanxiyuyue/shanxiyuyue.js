/*
 * 山西预约余量显示修改
 *
 * 将响应 data 下每个站点中的 YYYY-MM-DD 日期字段统一设为 100，
 * 并从各站点实际最晚日期向后追加两天。
 * 在 Loon 插件的 [Script] 中以实际预约接口 URL 绑定为 http-response 脚本。
 */

var TARGET_VALUE = 100;
var EXTEND_DAYS = 2;
var DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseDate(dateString) {
  var parts = dateString.split("-");
  var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

  if (
    date.getFullYear() !== Number(parts[0]) ||
    date.getMonth() !== Number(parts[1]) - 1 ||
    date.getDate() !== Number(parts[2])
  ) {
    return null;
  }

  return date;
}

function formatDate(date) {
  var month = String(date.getMonth() + 1).padStart(2, "0");
  var day = String(date.getDate()).padStart(2, "0");

  return date.getFullYear() + "-" + month + "-" + day;
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

    var availableDates = Object.keys(siteAvailability).filter(function (key) {
      return DATE_KEY_PATTERN.test(key) && parseDate(key) !== null;
    });

    availableDates.forEach(function (dateKey) {
      siteAvailability[dateKey] = TARGET_VALUE;
    });

    if (availableDates.length === 0) {
      return;
    }

    var latestDate = availableDates.reduce(function (latest, dateKey) {
      var current = parseDate(dateKey);
      return current.getTime() > latest.getTime() ? current : latest;
    }, parseDate(availableDates[0]));

    for (var offset = 1; offset <= EXTEND_DAYS; offset += 1) {
      var extendedDate = new Date(latestDate.getTime());
      extendedDate.setDate(extendedDate.getDate() + offset);
      siteAvailability[formatDate(extendedDate)] = TARGET_VALUE;
    }
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
