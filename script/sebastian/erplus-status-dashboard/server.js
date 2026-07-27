const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8787);
const BASE_URL = "https://www.erplus.co";
const IMAGE_BASE_URL = "https://image.erplus.co";
const TOKEN_URL = "https://seb.pianotian.cn/sebapi/Constant/GetConstantEntity?Code=ErplusAuth";
const PUBLIC_DIR = path.join(__dirname, "public");

let tokenCache = { value: "", expiresAt: 0 };
let leaveTypeCache = { value: null, expiresAt: 0 };

const FLOW_TYPE_LABELS = {
    0: "导入余额",
    1: "固定发放",
    2: "按司龄发放",
    3: "请假消费",
    4: "加班转调休",
    5: "覆盖导入",
    6: "手动增加",
    7: "手动扣减",
    8: "余额过期",
    10: "按工龄发放",
    11: "按试用日期发放"
};

function send(res, status, body, headers = {}) {
    res.writeHead(status, headers);
    res.end(body);
}

function sendJson(res, status, data) {
    send(res, status, JSON.stringify(data), {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
}

async function getToken() {
    const now = Date.now();
    if (tokenCache.value && tokenCache.expiresAt > now) return tokenCache.value;

    const response = await fetch(TOKEN_URL, {
        headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (!response.ok) throw new Error(`Token request failed: ${response.status}`);

    const data = await response.json();
    const value = data && data.data && data.data.value;
    if (!value) throw new Error("Token response did not include data.value");

    tokenCache = { value, expiresAt: now + 5 * 60 * 1000 };
    return value;
}

async function erplusRequest(pathname, method, body) {
    const token = await getToken();
    const response = await fetch(BASE_URL + pathname, {
        method,
        headers: {
            Authorization: token,
            "Content-Type": "application/json",
            pcPlatform: "PC",
            "User-Agent": "Mozilla/5.0"
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        data = { raw: text };
    }
    if (!response.ok) {
        throw new Error(`${method} ${pathname} failed: ${response.status}`);
    }
    return data;
}

async function getLeaveTypes() {
    const now = Date.now();
    if (leaveTypeCache.value && leaveTypeCache.expiresAt > now) return leaveTypeCache.value;
    const response = await erplusRequest("/mphr/getLeaveTypeList", "GET");
    const rows = Array.isArray(response && response.erpData) ? response.erpData : [];
    const value = rows.reduce((map, item) => {
        const id = item.id || item.leaveTypeId;
        if (id !== undefined) {
            map[String(id)] = {
                id,
                name: item.name || "",
                unit: item.unit,
                distributionType: item.distributionType,
                leaveTerm: item.leaveTerm,
                state: item.state,
                range: item.range
            };
        }
        return map;
    }, {});
    leaveTypeCache = { value, expiresAt: now + 10 * 60 * 1000 };
    return value;
}

async function externalRequest(url, method) {
    const token = await getToken();
    const response = await fetch(url, {
        method,
        headers: {
            Authorization: token,
            "Content-Type": "application/json",
            pcPlatform: "PC",
            "User-Agent": "Mozilla/5.0"
        }
    });
    const text = await response.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        data = { raw: text };
    }
    if (!response.ok) {
        throw new Error(`${method} ${url} failed: ${response.status}`);
    }
    return data;
}

function todayInShanghai() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
}

function normalizeStatus(statusResponse) {
    const rows = Array.isArray(statusResponse.erpData) ? statusResponse.erpData : [];
    return rows.reduce((map, item) => {
        if (item && item.contactId !== undefined) {
            map[String(item.contactId)] = item;
        }
        return map;
    }, {});
}

function normalizeDepartments(departments) {
    const items = Array.isArray(departments) ? departments : [];
    return items.reduce((map, item) => {
        if (item && item.id !== undefined) {
            map[String(item.id)] = item;
        }
        return map;
    }, {});
}

function resolveDepartment(contact, departmentsById) {
    const id = contact.departmentId || (Array.isArray(contact.departmentPath) && contact.departmentPath[contact.departmentPath.length - 1]);
    const department = id ? departmentsById[String(id)] : null;
    return {
        id: id ? String(id) : "unassigned",
        name: contact.departmentName || (department && department.name) || "未分配部门",
        order: department && department.order !== undefined ? Number(department.order) : 999999,
        path: department && Array.isArray(department.path) ? department.path : contact.departmentPath || []
    };
}

function classifyStatus(status) {
    if (!status) {
        return {
            key: "unknown",
            label: "未知",
            tone: "muted",
            tags: [{ key: "unknown", label: "未知", tone: "muted" }],
            tagKeys: ["unknown"]
        };
    }

    const tags = [];
    const addTag = (key, label, tone) => {
        if (!tags.some(item => item.key === key)) tags.push({ key, label, tone });
    };
    const isLeave = Number(status.leave) === 1;
    const isAbsent = Number(status.objectStatus) === 10 || Number(status.isNoRecord) === 1 || Number(status.hasRecord) === 0;

    if (isLeave) {
        addTag("leave", "请假", "amber");
    } else if (isAbsent) {
        addTag("absent", "未到岗", "red");
    } else {
        addTag("working", "在岗", "green");
    }

    if (Number(status.objectType) === 2 || Number(status.objectStatus) === 21) addTag("task", "任务中", "pink");
    if (Number(status.outdoor) === 1 || Number(status.objectType) === 4) addTag("outdoor", "外勤", "cyan");
    if (Number(status.businessTrip) === 1) addTag("trip", "出差", "violet");

    const primary = tags.find(item => item.key !== "working") || tags[0] || { key: "unknown", label: "未知", tone: "muted" };
    return {
        key: primary.key,
        label: tags.map(item => item.label).join(" / "),
        tone: primary.tone,
        tags,
        tagKeys: tags.map(item => item.key)
    };
}

function initials(name) {
    return String(name || "?").trim().slice(0, 2) || "?";
}

function avatarUrl(imageName) {
    if (!imageName) return "";
    if (/^https?:\/\//.test(imageName)) return imageName;
    return IMAGE_BASE_URL + imageName;
}

function statusDetail(status) {
    if (!status) return "";
    if (status.objectDesc) return String(status.objectDesc);
    if (status.objectId && Number(status.objectId) !== 0) {
        return `关联事项 #${status.objectId}`;
    }
    return "";
}

function personKey(employee) {
    if (employee.mainContactId) return `main:${employee.mainContactId}`;
    if (employee.id) return `id:${employee.id}`;
    if (employee.phone) return `phone:${employee.phone}`;
    return `name:${employee.name}`;
}

function buildDashboard(statusResponse, contactsResponse, departmentsResponse) {
    const statusByContactId = normalizeStatus(statusResponse);
    const departmentsById = normalizeDepartments(departmentsResponse);
    const allDepartments = Array.isArray(departmentsResponse) ? departmentsResponse : [];
    const contacts = (Array.isArray(contactsResponse) ? contactsResponse : []).filter(contact => Number(contact.state) === 1);

    const employees = contacts.map(contact => {
        const status = statusByContactId[String(contact.id)] || statusByContactId[String(contact.mainContactId)];
        const state = classifyStatus(status);
        const department = resolveDepartment(contact, departmentsById);
        return {
            id: contact.id,
            mainContactId: contact.mainContactId,
            name: contact.name || "未命名",
            phone: contact.phone || "",
            position: contact.position || "",
            companyInfoId: contact.companyInfoId || "",
            imageName: contact.imageName || "",
            avatarUrl: avatarUrl(contact.imageName),
            initials: initials(contact.name),
            department,
            state,
            statusDetail: statusDetail(status),
            taskId: state.tagKeys.includes("task") && status && status.objectDesc && status.objectId ? Number(status.objectId) : 0,
            rawStatus: status || null,
            isAdmin: Boolean(contact.isAdmin),
            isContactManager: Boolean(contact.isContactManager),
            isDepManager: Boolean(contact.isDepManager),
            isDeleted: Number(contact.state) !== 1
        };
    });

    const stats = [
        { key: "all", label: "全部员工", value: employees.length },
        { key: "working", label: "在岗", value: 0 },
        { key: "task", label: "任务中", value: 0 },
        { key: "leave", label: "请假", value: 0 },
        { key: "absent", label: "未到岗", value: 0 },
        { key: "outdoor", label: "外勤", value: 0 },
        { key: "trip", label: "出差", value: 0 }
    ];
    const statMap = Object.fromEntries(stats.map(item => [item.key, item]));
    const statPeople = {};
    employees.forEach(employee => {
        employee.state.tagKeys.forEach(key => {
            if (!statMap[key]) return;
            if (!statPeople[key]) statPeople[key] = new Set();
            statPeople[key].add(personKey(employee));
        });
    });
    Object.keys(statPeople).forEach(key => {
        statMap[key].value = statPeople[key].size;
    });
    statMap.all.value = new Set(employees.map(personKey)).size;

    const employeeDepartments = employees.reduce((map, employee) => {
        const key = employee.department.id;
        if (!map[key]) map[key] = [];
        map[key].push(employee);
        return map;
    }, {});

    const nodeMap = {};
    allDepartments.forEach(department => {
        nodeMap[String(department.id)] = {
            id: String(department.id),
            name: department.name || "未命名部门",
            order: department.order !== undefined ? Number(department.order) : 999999,
            parentId: department.parentId === null || department.parentId === undefined ? "" : String(department.parentId),
            path: Array.isArray(department.path) ? department.path : [],
            employees: employeeDepartments[String(department.id)] || [],
            children: []
        };
    });

    Object.keys(employeeDepartments).forEach(id => {
        if (!nodeMap[id]) {
            nodeMap[id] = {
                id,
                name: employeeDepartments[id][0].department.name,
                order: employeeDepartments[id][0].department.order,
                parentId: "",
                path: employeeDepartments[id][0].department.path,
                employees: employeeDepartments[id],
                children: []
            };
        }
    });

    Object.values(nodeMap).forEach(node => {
        node.employees.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
    });

    const roots = [];
    Object.values(nodeMap).forEach(node => {
        if (node.parentId && nodeMap[node.parentId]) {
            nodeMap[node.parentId].children.push(node);
        } else if (node.employees.length || node.children.length || allDepartments.some(item => String(item.id) === node.id)) {
            roots.push(node);
        }
    });

    function sortTree(nodes) {
        nodes.sort((a, b) => {
            if (a.order !== b.order) return a.order - b.order;
            return a.name.localeCompare(b.name, "zh-Hans-CN");
        });
        nodes.forEach(node => sortTree(node.children));
    }

    function summarizeNode(node) {
        node.directCount = node.employees.length;
        node.totalCount = node.directCount + node.children.reduce((sum, child) => sum + summarizeNode(child), 0);
        return node.totalCount;
    }

    sortTree(roots);
    roots.forEach(summarizeNode);

    const departmentTree = roots.filter(node => node.totalCount > 0);

    return {
        generatedAt: new Date().toISOString(),
        stats,
        departments: departmentTree,
        departmentTree,
        employees
    };
}

function normalizeDashboardInsights(baseInfoResponse, nextWorkDayResponse, redPointResponse, announceResponse, schemeListResponse) {
    const base = baseInfoResponse && baseInfoResponse.item || {};
    const global = base.globalSettings || {};
    const defaultSchedule = global.defaultSchedule || {};
    const workTimes = Array.isArray(defaultSchedule.workTimes) ? defaultSchedule.workTimes : [];
    const schemes = Array.isArray(schemeListResponse && schemeListResponse.item) ? schemeListResponse.item : [];
    const red = redPointResponse && redPointResponse.erpData || {};
    const announce = announceResponse && announceResponse.item !== undefined ? announceResponse.item : 0;
    return {
        nextWorkDay: nextWorkDayResponse && nextWorkDayResponse.item || "",
        defaultWorkTime: workTimes.length ? workTimes.map(item => `${item.startTime || "--"}-${item.endTime || "--"}`).join(" / ") : "",
        absenteeMinute: global.absenteeMinute,
        minutePerDay: global.minutePerDay,
        deviceNum: global.deviceNum,
        approvalRedPoint: Number(red.bigRed || 0) + Number(red.smallRed || 0),
        announceUnread: Number(announce || 0),
        schemeCount: schemes.length,
        schemeNames: schemes.map(item => item.name).filter(Boolean).slice(0, 4)
    };
}

function normalizeTomorrowPreview(approveResponse) {
    const item = approveResponse && approveResponse.item || {};
    const groups = [
        { key: "leave", source: "leaves", label: "请假" },
        { key: "outdoor", source: "outdoors", label: "外出" },
        { key: "trip", source: "businessTrips", label: "出差" },
        { key: "overtime", source: "overTimes", label: "加班" },
        { key: "dayoff", source: "daysOffs", label: "调休" }
    ];
    const items = [];
    groups.forEach(group => {
        const rows = Array.isArray(item[group.source]) ? item[group.source] : [];
        rows.forEach(row => {
            items.push({
                key: group.key,
                label: group.label,
                type: row.leaveType || row.typeName || group.label,
                duration: row.duration || row.showTime || "",
                reason: row.reason || row.remark || "",
                startTime: row.startTime || "",
                endTime: row.endTime || "",
                finished: row.finished,
                approveId: row.approveId || ""
            });
        });
    });
    return items;
}

async function buildTomorrowPreviews(employees, day) {
    const previews = {};
    const runnable = employees.filter(employee => employee.companyInfoId);
    const batchSize = 8;
    for (let i = 0; i < runnable.length; i += batchSize) {
        const batch = runnable.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(employee => {
            return erplusRequest(`/checkinWeb/getApproveInfo?companyInfoId=${employee.companyInfoId}&calculateDate=${day}`, "GET")
                .then(value => ({ employee, value }))
                .catch(error => ({ employee, error }));
        }));
        results.forEach(result => {
            if (result.error) return;
            const items = normalizeTomorrowPreview(result.value);
            if (items.length) previews[String(result.employee.id)] = items;
        });
    }
    return previews;
}

async function buildEmployeeLogPayload(date) {
    const [status, contacts, departments] = await Promise.all([
        erplusRequest("/checkinWeb/getCompanyUserStatus", "POST"),
        erplusRequest("/api/v1/contacts", "GET"),
        erplusRequest("/api/v1/departments", "GET")
    ]);
    const dashboard = buildDashboard(status, contacts, departments);
    const previews = await buildTomorrowPreviews(dashboard.employees, date);
    dashboard.employees.forEach(employee => {
        employee.tomorrow = previews[String(employee.id)] || [];
    });
    return {
        date,
        stats: buildTomorrowStats(dashboard.employees),
        employees: dashboard.employees
            .filter(employee => employee.tomorrow && employee.tomorrow.length)
            .map(employee => ({
                id: employee.id,
                name: employee.name,
                department: employee.department,
                position: employee.position,
                avatarUrl: employee.avatarUrl,
                initials: employee.initials,
                tomorrow: employee.tomorrow
            }))
    };
}

function buildTomorrowStats(employees) {
    const stats = [
        { key: "tomorrowLeave", label: "请假", value: 0 },
        { key: "tomorrowOutdoor", label: "外出", value: 0 },
        { key: "tomorrowTrip", label: "出差", value: 0 },
        { key: "tomorrowOvertime", label: "加班", value: 0 }
    ];
    const buckets = {
        tomorrowLeave: new Set(),
        tomorrowOutdoor: new Set(),
        tomorrowTrip: new Set(),
        tomorrowOvertime: new Set()
    };
    employees.forEach(employee => {
        const key = personKey(employee);
        (employee.tomorrow || []).forEach(item => {
            if (item.key === "leave" || item.key === "dayoff") buckets.tomorrowLeave.add(key);
            if (item.key === "outdoor") buckets.tomorrowOutdoor.add(key);
            if (item.key === "trip") buckets.tomorrowTrip.add(key);
            if (item.key === "overtime") buckets.tomorrowOvertime.add(key);
        });
    });
    stats.forEach(item => {
        item.value = buckets[item.key].size;
    });
    return stats;
}

function normalizeTask(taskResponse) {
    const task = taskResponse && taskResponse.erpData;
    if (!task || typeof task !== "object") {
        return {
            error: taskResponse && taskResponse.erpMsg ? taskResponse.erpMsg : "未获取到任务详情"
        };
    }

    return {
        id: task.id,
        topic: task.topic || task.title || "",
        desc: task.desc || "",
        phaseName: task.phaseName || "",
        programId: task.programId,
        programName: task.programParentTask && task.programParentTask.topic || "",
        createTime: task.createTime || "",
        firstStartTime: task.firstStartTime || "",
        dueTime: task.dueTime || "",
        consumedTime: task.consumedTime || "",
        estimateConsumedTime: task.estimateConsumedTime,
        priority: task.priority,
        progress: task.progress,
        principalName: task.principal && task.principal.name || "",
        assignerName: task.assigner && task.assigner.name || ""
    };
}

function normalizeLeave(leaveResponse, leaveTypesById, flowsByType, annualInfo) {
    const rows = Array.isArray(leaveResponse && leaveResponse.erpData) ? leaveResponse.erpData : [];
    return rows.map(item => {
        const leaveType = leaveTypesById && leaveTypesById[String(item.leaveTypeId)] || {};
        const name = leaveType.name || item.leaveType && item.leaveType.name || "假期";
        const standardTime = item.standardTime || 8;
        const flows = flowsByType && flowsByType[String(item.leaveTypeId)] || [];
        const flowSummary = summarizeLeaveFlows(flows, standardTime);
        const expiring = summarizeExpiringLeave(flows, item.leaveRemainShowTime);
        const useFlowForAnnual = name === "年假" && flowSummary.currentGrantDays > 0;
        const total = useFlowForAnnual ? formatDays(flowSummary.currentGrantDays) : formatLeaveTime(item.leaveTotalTime, standardTime, item.leaveTotalShowTime);
        const used = useFlowForAnnual ? formatDays(flowSummary.currentUsedDays) : formatLeaveTime(item.leaveUseTime, standardTime, item.leaveUseShowTime);

        return {
            id: item.leaveTypeId,
            name,
            remain: item.leaveRemainShowTime || "",
            total,
            used,
            manualAdd: item.leaveManualAddShowTime || "",
            manualSub: item.leaveManualSubShowTime || "",
            manualAddTime: item.leaveManualAddTime || 0,
            manualSubTime: item.leaveManualSubTime || 0,
            standardTime,
            type: leaveType,
            annualRest: name === "年假" && annualInfo ? annualInfo.restAnnualLeaveDays || "" : "",
            flowSummary,
            expiring,
            flowCount: flows.length,
            flows: flows.slice(0, 8)
        };
    });
}

function normalizeLeaveFlow(flowResponse, standardTime) {
    const rows = Array.isArray(flowResponse && flowResponse.erpData) ? flowResponse.erpData : [];
    return rows.map(item => {
        const flowType = Number(item.flowType);
        return {
            id: item.id || `${flowType}-${item.operateTime || ""}-${item.approvalId || ""}`,
            flowType,
            label: FLOW_TYPE_LABELS[flowType] || `流水 ${flowType}`,
            amount: item.viewTime || formatFlowAmount(item, standardTime),
            operateTime: item.operateTime || "",
            expireTime: item.expireTime || "",
            approvalId: item.approvalId || "",
            note: item.note || "",
            days: getFlowDays(item, standardTime)
        };
    });
}

function summarizeLeaveFlows(flows, standardTime) {
    const currentYear = todayInShanghai().slice(0, 4);
    const summary = {
        currentGrantDays: 0,
        currentUsedDays: 0,
        currentExpiredDays: 0,
        manualAddDays: 0,
        manualSubDays: 0,
        overtimeIncomeDays: 0
    };
    flows.forEach(flow => {
        const year = String(flow.operateTime || "").slice(0, 4);
        const days = Number(flow.days) || 0;
        if (year !== currentYear) return;
        if ([1, 2, 10, 11].includes(flow.flowType)) summary.currentGrantDays += days;
        if (flow.flowType === 3) summary.currentUsedDays += days;
        if (flow.flowType === 8) summary.currentExpiredDays += days;
        if (flow.flowType === 6) summary.manualAddDays += days;
        if (flow.flowType === 7) summary.manualSubDays += days;
        if (flow.flowType === 4) summary.overtimeIncomeDays += days;
    });
    return {
        currentGrant: formatDays(summary.currentGrantDays),
        currentUsed: formatDays(summary.currentUsedDays),
        currentExpired: formatDays(summary.currentExpiredDays),
        manualAdd: formatDays(summary.manualAddDays),
        manualSub: formatDays(summary.manualSubDays),
        overtimeIncome: formatDays(summary.overtimeIncomeDays),
        currentGrantDays: roundDays(summary.currentGrantDays),
        currentUsedDays: roundDays(summary.currentUsedDays),
        currentExpiredDays: roundDays(summary.currentExpiredDays),
        manualAddDays: roundDays(summary.manualAddDays),
        manualSubDays: roundDays(summary.manualSubDays),
        overtimeIncomeDays: roundDays(summary.overtimeIncomeDays)
    };
}

function summarizeExpiringLeave(flows, remainText) {
    const today = todayInShanghai();
    let remainingDays = parseDays(remainText);
    const candidates = flows
        .filter(flow => flow.expireTime && flow.expireTime > today && [1, 2, 4, 6, 10, 11].includes(flow.flowType))
        .sort((a, b) => String(a.expireTime).localeCompare(String(b.expireTime)));
    const items = [];
    for (const flow of candidates) {
        if (remainingDays <= 0) break;
        const rawDays = Number(flow.days) || 0;
        if (rawDays <= 0) continue;
        const days = Math.min(rawDays, remainingDays);
        remainingDays = roundDays(remainingDays - days);
        items.push({
            date: flow.expireTime,
            days: roundDays(days),
            amount: formatDays(days),
            source: flow.label,
            operateTime: flow.operateTime || "",
            daysLeft: daysBetween(today, flow.expireTime),
            note: flow.note || ""
        });
    }
    const urgentItems = items.filter(item => item.daysLeft <= 90);
    const displayItems = urgentItems.length ? urgentItems : items.slice(0, 3);
    const totalDays = displayItems.reduce((sum, item) => sum + item.days, 0);
    return {
        totalDays: roundDays(totalDays),
        total: formatDays(totalDays),
        items: displayItems.slice(0, 5),
        hasMoreFuture: items.length > displayItems.length
    };
}

function parseDays(text) {
    const match = String(text || "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
}

function daysBetween(startDay, endDay) {
    const start = new Date(`${startDay}T00:00:00+08:00`).getTime();
    const end = new Date(`${endDay}T00:00:00+08:00`).getTime();
    return Math.max(0, Math.round((end - start) / 86400000));
}

function getFlowDays(item, standardTime) {
    const text = item.viewTime || "";
    const match = String(text).match(/-?\d+(?:\.\d+)?/);
    if (match) return Number(match[0]);
    const raw = item.income || item.payout || item.trueIncome || item.truePayOut || 0;
    if (typeof raw === "string" && /^\d+(?:\.\d+)?$/.test(raw) && Number(raw) < 1000) return Number(raw);
    const workdaySeconds = (standardTime || 8) * 60 * 60;
    return Number(raw || 0) / workdaySeconds;
}

function formatFlowAmount(item, standardTime) {
    const days = getFlowDays(item, standardTime);
    return days ? formatDays(days) : "";
}

function roundDays(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function formatDays(value) {
    const rounded = roundDays(value);
    const text = Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
    return `${text}天`;
}

function formatLeaveTime(seconds, standardTime, fallback) {
    if (seconds === undefined || seconds === null) return fallback || "";
    const workdaySeconds = (standardTime || 8) * 60 * 60;
    const days = seconds / workdaySeconds;
    const rounded = Math.round(days * 100) / 100;
    const text = Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
    return `${text}天`;
}

function normalizeTrends(trendsResponse) {
    const rows = Array.isArray(trendsResponse && trendsResponse.erpData) ? trendsResponse.erpData : [];
    return rows.map(item => ({
        id: item.id,
        title: item.title || "",
        content: item.content || "",
        time: item.crtAt || "",
        day: item.day || "",
        moduleType: item.moduleType || "",
        workType: item.workType || ""
    }));
}

function normalizeSign(signResponse) {
    if (signResponse && signResponse.respCode && signResponse.respCode !== "000") {
        return { error: signResponse.respDesc || "打卡接口未返回成功" };
    }
    const rows = Array.isArray(signResponse && signResponse.item)
        ? signResponse.item
        : Array.isArray(signResponse && signResponse.erpData)
        ? signResponse.erpData
        : Array.isArray(signResponse && signResponse.data)
            ? signResponse.data
            : Array.isArray(signResponse)
                ? signResponse
                : [];
    return {
        records: rows.map(item => ({
            id: item.id || item.recordId || "",
            type: signTypeLabel(item.signType !== undefined ? item.signType : item.checkinType !== undefined ? item.checkinType : item.type || item.title),
            time: item.signTime || item.checkinTime || item.time || item.createTime || item.crtAt || "",
            address: item.signAddress || item.address || item.location || item.poiName || "",
            result: item.result || item.status || item.resultName || "",
            device: item.device && item.device.deviceName || item.deviceName || "",
            wifiName: item.wifiName || "",
            raw: item
        }))
    };
}

function normalizeSchedule(scheduleResponse) {
    const item = scheduleResponse && scheduleResponse.item || null;
    if (!item || typeof item !== "object") return null;
    return {
        name: item.name || "",
        schemeId: item.schemeId || "",
        flexible: Boolean(item.flexible),
        restTimes: Array.isArray(item.restTimes) ? item.restTimes : [],
        workTimes: Array.isArray(item.workTimes) ? item.workTimes.map(time => ({
            startTime: time.startTime || "",
            endTime: time.endTime || "",
            earliestSignIn: time.earliestSignIn,
            latestSignOut: time.latestSignOut
        })) : []
    };
}

function normalizeScheme(schemeResponse) {
    const item = schemeResponse && schemeResponse.item || null;
    if (!item || typeof item !== "object") return null;
    return {
        name: item.name || "",
        flexible: Boolean(item.flexible),
        address: item.address || "",
        locationNames: item.locationNames || "",
        outdoorGracingMinute: item.outdoorGracingMinute,
        businessTripGracingMinute: item.businessTripGracingMinute,
        crmGracingMinute: item.crmGracingMinute,
        wifiInfos: Array.isArray(item.wifiInfos) ? item.wifiInfos.map(wifi => wifi.wifiName || wifi.name || "").filter(Boolean).slice(0, 4) : [],
        isAllowChangeSchedule: Number(item.isAllowChangeSchedule) === 1,
        isAllowSelectSchedule: Number(item.isAllowSelectSchedule) === 1,
        ignoreAbnormalStatus: Number(item.ignoreAbnormalStatus) === 1
    };
}

function normalizeApproveInfo(approveResponse) {
    const item = approveResponse && approveResponse.item || {};
    const groups = [
        { key: "leaves", label: "请假" },
        { key: "outdoors", label: "外出" },
        { key: "businessTrips", label: "出差" },
        { key: "overTimes", label: "加班" },
        { key: "daysOffs", label: "调休" }
    ];
    return groups.map(group => ({
        key: group.key,
        label: group.label,
        count: Array.isArray(item[group.key]) ? item[group.key].length : 0,
        items: (Array.isArray(item[group.key]) ? item[group.key] : []).slice(0, 5).map(entry => ({
            name: entry.templateName || entry.name || entry.typeName || group.label,
            startTime: entry.startTime || entry.beginTime || entry.startDate || "",
            endTime: entry.endTime || entry.endDate || "",
            showTime: entry.showTime || entry.duration || entry.leaveDuration || "",
            requestDkey: entry.requestDkey || entry.requestId || entry.approvalId || ""
        }))
    })).filter(group => group.count > 0);
}

function normalizeAppendTemplates(approveResponse) {
    const rows = approveResponse && approveResponse.item && Array.isArray(approveResponse.item.appendTemplates)
        ? approveResponse.item.appendTemplates
        : [];
    return rows.map(item => ({
        templateName: item.templateName || "补打卡申请",
        timesLeftThisMonth: item.timesLeftThisMonth,
        maxTimePermonth: item.maxTimePermonth
    }));
}

function normalizeLeaveStat(statResponse) {
    const rows = Array.isArray(statResponse && statResponse.erpData) ? statResponse.erpData : [];
    return rows.map(item => ({
        leaveType: item.leaveType || "请假",
        totalLeaveTime: item.totalLeaveTime || 0,
        showTime: formatLeaveMinutes(item.totalLeaveTime || 0)
    }));
}

function formatLeaveMinutes(minutes) {
    const value = Number(minutes) || 0;
    if (!value) return "0小时";
    if (value % 480 === 0) return `${value / 480}天`;
    if (value >= 480) {
        const days = Math.floor(value / 480);
        const hours = Math.round((value % 480) / 60 * 10) / 10;
        return hours ? `${days}天${hours}小时` : `${days}天`;
    }
    const hours = Math.round(value / 60 * 10) / 10;
    return `${hours}小时`;
}

function normalizeRecentApprovals(approvalResponse) {
    const rows = Array.isArray(approvalResponse && approvalResponse.item) ? approvalResponse.item : [];
    return rows.slice(0, 6).map(item => {
        const summary = item.summary || {};
        return {
            requestDkey: item.requestDkey || "",
            templateName: item.templateName || "审批",
            createTime: item.createTime || item.requestTime || "",
            state: summary.state || finishedLabel(item.finished),
            contentTitle: summary.contentTitle || "",
            content: summary.content || "",
            cost: summary.cost || item.totalMoney || "",
            time: summary.time || "",
            color: summary.color || ""
        };
    });
}

function finishedLabel(value) {
    if (Number(value) === 0) return "处理中";
    if (Number(value) === 1) return "已完成";
    if (Number(value) === 2) return "已拒绝";
    if (Number(value) === 3) return "已撤销";
    return "";
}

function signTypeLabel(value) {
    if (value === 0 || value === "0") return "上班签到";
    if (value === 1 || value === "1") return "下班签退";
    return value ? String(value) : "";
}

async function handleApiDashboard(url, res) {
    try {
        const [status, contacts, departments, baseInfo, nextWorkDay, redPoints, announceCount, schemeList] = await Promise.all([
            erplusRequest("/checkinWeb/getCompanyUserStatus", "POST"),
            erplusRequest("/api/v1/contacts", "GET"),
            erplusRequest("/api/v1/departments", "GET"),
            erplusRequest("/checkinWeb/getCheckInBaseInfo", "GET"),
            erplusRequest("/checkinWeb/getNextWorkDay", "GET"),
            erplusRequest("/appreq/getRedPoints", "GET"),
            erplusRequest("/announceWeb/getNotReadAnnounceCount", "GET"),
            erplusRequest("/checkinWeb/getSchemeListV2", "GET")
        ]);
        const dashboard = buildDashboard(status, contacts, departments);
        dashboard.insights = normalizeDashboardInsights(baseInfo, nextWorkDay, redPoints, announceCount, schemeList);
        const requestedDate = url.searchParams.get("previewDate");
        const previewDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || "") ? requestedDate : todayInShanghai();
        const previews = await buildTomorrowPreviews(dashboard.employees, previewDate);
        dashboard.employees.forEach(employee => {
            employee.tomorrow = previews[String(employee.id)] || [];
        });
        dashboard.tomorrow = {
            date: previewDate,
            defaultDate: todayInShanghai(),
            stats: buildTomorrowStats(dashboard.employees)
        };
        sendJson(res, 200, dashboard);
    } catch (error) {
        sendJson(res, 500, { error: error.message });
    }
}

async function handleApiEmployeeDetail(url, res) {
    const contactId = url.searchParams.get("contactId");
    const companyInfoId = url.searchParams.get("companyInfoId");
    if (!/^\d+$/.test(contactId || "") || !/^\d+$/.test(companyInfoId || "")) {
        sendJson(res, 400, { error: "Invalid employee ids" });
        return;
    }

    const day = todayInShanghai();
    const signUrl = `${BASE_URL}/checkinWeb/getSignRecordList?companyInfoId=${companyInfoId}&calculateDate=${day}`;

    const settle = promise => promise.then(value => ({ value })).catch(error => ({ error: error.message }));
    const monthStart = `${day.slice(0, 8)}01`;
    const [sign, leave, trends, leaveTypes, annual, schedule, approve, scheme, recentApprovals, monthLeaveStat] = await Promise.all([
        settle(externalRequest(signUrl, "GET")),
        settle(erplusRequest(`/mphr/getUserLeaveRemainList?contactId=${contactId}`, "GET")),
        settle(erplusRequest(`/base/getContactWorkTrends?contactId=${contactId}&moduleTypes=&startDay=${day}&endDay=${day}`, "GET")),
        settle(getLeaveTypes()),
        settle(erplusRequest(`/mphr/getSomeoneAnnualLeaveInfo?contactId=${contactId}`, "GET")),
        settle(erplusRequest(`/checkinWeb/getUserScheduleByDate?companyInfoId=${companyInfoId}&calculateDate=${day}`, "GET")),
        settle(erplusRequest(`/checkinWeb/getApproveInfo?companyInfoId=${companyInfoId}&calculateDate=${day}`, "GET")),
        settle(erplusRequest(`/checkinWeb/getUserSchemeByDate?companyInfoId=${companyInfoId}&calculateDate=${day}`, "GET")),
        settle(erplusRequest("/appreq/searchRequestList", "POST", {
            keywords: "",
            page: 1,
            dataNum: 6,
            searchType: 3,
            currentStatus: "0,1,2,3",
            applicant: Number(contactId)
        })),
        settle(erplusRequest(`/appreq/getUserLeaveStat?companyInfoId=${companyInfoId}&startDate=${monthStart}&endDate=${day}`, "GET"))
    ]);

    const leaveTypesById = leaveTypes.error ? {} : leaveTypes.value;
    const annualInfo = annual.error ? null : annual.value && annual.value.data || null;
    let leaveItems = [];
    if (!leave.error) {
        const rows = Array.isArray(leave.value && leave.value.erpData) ? leave.value.erpData : [];
        const flowEntries = await Promise.all(rows.map(item => {
            const standardTime = item.standardTime || 8;
            return settle(erplusRequest(`/mphr/getUserLeaveFlowList?leaveTypeId=${item.leaveTypeId}&contactId=${contactId}`, "GET"))
                .then(result => ({
                    id: String(item.leaveTypeId),
                    flows: result.error ? [] : normalizeLeaveFlow(result.value, standardTime),
                    error: result.error || ""
                }));
        }));
        const flowsByType = flowEntries.reduce((map, item) => {
            map[item.id] = item.flows;
            return map;
        }, {});
        leaveItems = normalizeLeave(leave.value, leaveTypesById, flowsByType, annualInfo);
    }

    sendJson(res, 200, {
        day,
        sign: sign.error ? { error: sign.error } : normalizeSign(sign.value),
        leave: leave.error ? { error: leave.error, items: [] } : { items: leaveItems, types: leaveTypesById },
        trends: trends.error ? { error: trends.error, items: [] } : { items: normalizeTrends(trends.value) },
        schedule: schedule.error ? { error: schedule.error } : normalizeSchedule(schedule.value),
        scheme: scheme.error ? { error: scheme.error } : normalizeScheme(scheme.value),
        approve: approve.error ? { error: approve.error, items: [], appendTemplates: [] } : { items: normalizeApproveInfo(approve.value), appendTemplates: normalizeAppendTemplates(approve.value) },
        recentApprovals: recentApprovals.error ? { error: recentApprovals.error, items: [] } : { items: normalizeRecentApprovals(recentApprovals.value) },
        monthLeaveStat: monthLeaveStat.error ? { error: monthLeaveStat.error, items: [] } : { startDate: monthStart, endDate: day, items: normalizeLeaveStat(monthLeaveStat.value) }
    });
}

async function handleApiTask(url, res) {
    const id = url.searchParams.get("id");
    if (!/^\d+$/.test(id || "")) {
        sendJson(res, 400, { error: "Invalid task id" });
        return;
    }

    try {
        const task = await erplusRequest(`/task/v1/tasks/${id}`, "GET");
        sendJson(res, 200, normalizeTask(task));
    } catch (error) {
        sendJson(res, 500, { error: error.message });
    }
}

async function handleApiEmployeeLog(url, res) {
    const requestedDate = url.searchParams.get("date");
    const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || "") ? requestedDate : todayInShanghai();
    try {
        sendJson(res, 200, await buildEmployeeLogPayload(date));
    } catch (error) {
        sendJson(res, 500, { error: error.message });
    }
}

function serveStatic(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
    if (!filePath.startsWith(PUBLIC_DIR)) {
        send(res, 403, "Forbidden");
        return;
    }
    fs.readFile(filePath, (error, content) => {
        if (error) {
            send(res, 404, "Not found");
            return;
        }
        const ext = path.extname(filePath);
        const type = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8"
        }[ext] || "application/octet-stream";
        send(res, 200, content, { "Content-Type": type });
    });
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/dashboard") {
        handleApiDashboard(url, res);
        return;
    }
    if (url.pathname === "/api/task") {
        handleApiTask(url, res);
        return;
    }
    if (url.pathname === "/api/employee-log") {
        handleApiEmployeeLog(url, res);
        return;
    }
    if (url.pathname === "/api/employee-detail") {
        handleApiEmployeeDetail(url, res);
        return;
    }
    serveStatic(req, res);
});

server.listen(PORT, () => {
    console.log(`ERPlus status dashboard running at http://localhost:${PORT}`);
});
