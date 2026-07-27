const state = {
    data: null,
    filter: "all",
    query: "",
    previewDate: "",
    logLoading: false
};

const toneByKey = {
    all: "cyan",
    working: "green",
    task: "pink",
    leave: "amber",
    absent: "red",
    outdoor: "cyan",
    trip: "violet"
};

const statsEl = document.getElementById("stats");
const tomorrowPanel = document.getElementById("tomorrowPanel");
const insightsEl = document.getElementById("insights");
const gridEl = document.getElementById("departmentGrid");
const searchInput = document.getElementById("searchInput");
const refreshBtn = document.getElementById("refreshBtn");
const syncTime = document.getElementById("syncTime");
const activeFilter = document.getElementById("activeFilter");
const toast = document.getElementById("toast");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalClose = document.getElementById("modalClose");
const modalContent = document.getElementById("modalContent");

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function fmtTime(iso) {
    if (!iso) return "--:--";
    return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function dateRemark(dateText) {
    if (!dateText) return "";
    const target = new Date(`${dateText}T00:00:00+08:00`).getTime();
    const todayText = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
    const today = new Date(`${todayText}T00:00:00+08:00`).getTime();
    const diff = Math.round((target - today) / 86400000);
    const names = {
        "-3": "大前天",
        "-2": "前天",
        "-1": "昨天",
        0: "今天",
        1: "明天",
        2: "后天",
        3: "大后天"
    };
    if (names[String(diff)]) return names[String(diff)];
    return diff > 0 ? `${diff}天后` : `${Math.abs(diff)}天前`;
}

function matches(employee) {
    const tagKeys = employee.state.tagKeys || [employee.state.key];
    const tomorrowKeys = (employee.tomorrow || []).map(item => item.key);
    const statusMatch = state.filter === "all"
        || tagKeys.includes(state.filter)
        || (state.filter === "tomorrowLeave" && (tomorrowKeys.includes("leave") || tomorrowKeys.includes("dayoff")))
        || (state.filter === "tomorrowOutdoor" && tomorrowKeys.includes("outdoor"))
        || (state.filter === "tomorrowTrip" && tomorrowKeys.includes("trip"))
        || (state.filter === "tomorrowOvertime" && tomorrowKeys.includes("overtime"));
    const q = state.query.trim().toLowerCase();
    if (!q) return statusMatch;
    const blob = `${employee.name} ${employee.position} ${employee.department.name} ${employee.phone}`.toLowerCase();
    return statusMatch && blob.includes(q);
}

function renderTomorrow() {
    const tomorrow = state.data.tomorrow;
    if (!tomorrow) {
        tomorrowPanel.innerHTML = "";
        return;
    }
    const logEmployees = tomorrow.employees || state.data.employees.filter(employee => employee.tomorrow && employee.tomorrow.length);
    const activeItems = logEmployees
        .filter(employee => employee.tomorrow && employee.tomorrow.length)
        .slice(0, 8);
    const statCards = (tomorrow.stats || []).map(item => {
        const active = state.filter === item.key ? " active" : "";
        return `
            <button class="tomorrow-stat${active}" data-filter="${item.key}" type="button">
                <span>${item.label}</span>
                <strong>${item.value}</strong>
            </button>
        `;
    }).join("");
    tomorrowPanel.innerHTML = `
        ${state.logLoading ? `<div class="log-loading"><div><strong>同步员工日志</strong><span>${tomorrow.date || ""}</span></div></div>` : ""}
        <div class="tomorrow-head">
            <div>
                <span>员工日志</span>
                <strong>${tomorrow.date || ""}</strong>
                <em>${dateRemark(tomorrow.date)}</em>
            </div>
            <label class="preview-date">
                <span>选择日期</span>
                <input id="previewDateInput" type="date" value="${tomorrow.date || ""}" inputmode="none">
            </label>
            <div class="tomorrow-stats">${statCards}</div>
        </div>
        ${activeItems.length ? `<div class="tomorrow-strip">${activeItems.map(employee => {
            const first = employee.tomorrow[0];
            return `
                <button class="tomorrow-person" data-employee-id="${employee.id}" type="button">
                    <span>${employee.name}</span>
                    <strong>${first.type || first.label}${first.duration ? ` ${first.duration}` : ""}</strong>
                    ${first.reason ? `<em>${first.reason}</em>` : ""}
                </button>
            `;
        }).join("")}</div>` : `<p>所选日期暂无请假、外出、出差或加班预告</p>`}
    `;
}

function renderStats() {
    const stats = state.data.stats;
    statsEl.innerHTML = stats.map(item => {
        const tone = toneByKey[item.key] || "muted";
        const active = state.filter === item.key ? " active" : "";
        return `
            <button class="stat-card tone-${tone}${active}" data-filter="${item.key}" type="button">
                <span class="stat-value">${item.value}</span>
                <span class="stat-label">${item.label}</span>
            </button>
        `;
    }).join("");
}

function renderInsights() {
    const insights = state.data.insights;
    if (!insights) {
        insightsEl.innerHTML = "";
        return;
    }
    const workHours = insights.minutePerDay ? `${Math.round(insights.minutePerDay / 60 * 10) / 10}小时/天` : "";
    const schemeText = insights.schemeNames && insights.schemeNames.length
        ? `${insights.schemeCount} 套：${insights.schemeNames.join(" / ")}${insights.schemeCount > insights.schemeNames.length ? "..." : ""}`
        : `${insights.schemeCount || 0} 套`;
    const items = [
        ["下一工作日", insights.nextWorkDay],
        ["默认班次", insights.defaultWorkTime],
        ["工时标准", workHours],
        ["旷工阈值", insights.absenteeMinute !== undefined ? `${insights.absenteeMinute}分钟` : ""],
        ["设备限制", insights.deviceNum !== undefined ? `${insights.deviceNum}台` : ""],
        ["审批红点", insights.approvalRedPoint !== undefined ? `${insights.approvalRedPoint}` : ""],
        ["未读公告", insights.announceUnread !== undefined ? `${insights.announceUnread}` : ""],
        ["考勤方案", schemeText]
    ].filter(item => item[1] !== undefined && item[1] !== "");
    insightsEl.innerHTML = items.map(item => `
        <div class="insight-chip">
            <span>${item[0]}</span>
            <strong>${item[1]}</strong>
        </div>
    `).join("");
}

function renderEmployee(employee) {
    const tone = employee.state.tone || "muted";
    const statusTags = employee.state.tags || [{ label: employee.state.label, tone }];
    const tomorrow = employee.tomorrow || [];
    const tomorrowText = tomorrow.length ? tomorrow.map(item => `${item.type || item.label}${item.duration ? ` ${item.duration}` : ""}`).join(" / ") : "";
    const avatarStyle = employee.avatarUrl ? `style="background-image: linear-gradient(rgba(5,7,11,.12), rgba(5,7,11,.12)), url('${employee.avatarUrl}')"` : "";
    const position = `<div class="position" title="${employee.position || ""}">${employee.position || ""}</div>`;
    const detail = employee.statusDetail ? `<div class="status-detail" title="${employee.statusDetail}">${employee.statusDetail}</div>` : "";
    const flags = [
        employee.isAdmin ? "管理员" : "",
        employee.isContactManager ? "通讯录" : "",
        employee.isDepManager ? "部门负责人" : ""
    ].filter(Boolean);
    return `
        <article class="employee-card tone-${tone}">
            <button class="employee-hit" type="button" data-employee-id="${employee.id}" aria-label="查看${employee.name}"></button>
            <div class="avatar" ${avatarStyle}>${employee.avatarUrl ? "" : employee.initials}</div>
            <div class="meta">
                <div class="name-row">
                    <div class="name" title="${employee.name}">${employee.name}</div>
                    <div class="status-tags">${statusTags.map(tag => `<span class="badge tone-${tag.tone || "muted"}">${tag.label}</span>`).join("")}</div>
                </div>
                ${position}
                ${detail}
                ${tomorrow.length ? `<div class="tomorrow-badge"><strong>${tomorrowText}</strong>${tomorrow[0].reason ? `<em>${tomorrow[0].reason}</em>` : ""}</div>` : ""}
                <div class="flags">
                    ${flags.length ? flags.map(flag => `<span class="flag">${flag}</span>`).join("") : `<span class="flag">员工</span>`}
                </div>
            </div>
        </article>
    `;
}

function findEmployee(id) {
    return state.data.employees.find(employee => String(employee.id) === String(id));
}

function field(label, value) {
    if (value === undefined || value === null || value === "") return "";
    return `<div class="detail-field"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderTask(task, employee) {
    if (!employee.taskId) return "";
    if (!task) return `<div class="task-panel loading">任务详情加载中...</div>`;
    if (task.error) return `<div class="task-panel"><div class="task-title">任务 #${employee.taskId}</div><p>${task.error}</p></div>`;
    return `
        <div class="task-panel">
            <div class="task-kicker">TASK TRACE #${task.id}</div>
            <div class="task-title">${task.topic || employee.statusDetail || "任务详情"}</div>
            ${task.desc ? `<p>${task.desc}</p>` : ""}
            <div class="detail-grid compact">
                ${field("阶段", task.phaseName)}
                ${field("项目", task.programName)}
                ${field("开始", task.firstStartTime)}
                ${field("截止", task.dueTime)}
                ${field("已耗时", task.consumedTime)}
                ${field("预估", task.estimateConsumedTime ? `${task.estimateConsumedTime}小时` : "")}
            </div>
        </div>
    `;
}

function renderSign(detail) {
    if (!detail) return `<div class="info-panel loading">今日打卡加载中...</div>`;
    if (detail.sign && detail.sign.error) return `<div class="info-panel"><div class="panel-title">今日打卡</div><p>${detail.sign.error}</p></div>`;
    const records = detail.sign && detail.sign.records || [];
    return `
        <div class="info-panel">
            <div class="panel-title">今日打卡</div>
            ${records.length ? `<div class="timeline">${records.map(item => `
                <div class="timeline-item">
                    <strong>${item.time || "未知时间"}</strong>
                    <span>${item.type || item.result || "打卡记录"}</span>
                    ${item.address ? `<em>${item.address}</em>` : ""}
                </div>
            `).join("")}</div>` : `<p>暂无打卡记录</p>`}
        </div>
    `;
}

function renderLeave(detail) {
    if (!detail) return `<div class="info-panel loading">假期余额加载中...</div>`;
    if (detail.leave && detail.leave.error) return `<div class="info-panel"><div class="panel-title">假期余额</div><p>${detail.leave.error}</p></div>`;
    const seen = new Set();
    const items = (detail.leave && detail.leave.items || []).filter(item => {
        const key = `${item.id || ""}-${item.name || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return `
        <div class="info-panel wide">
            <div class="panel-title">假期余额与流水</div>
            ${items.length ? `<div class="leave-ledger">${items.map(renderLeaveItem).join("")}</div>` : `<p>暂无可展示假期余额</p>`}
        </div>
    `;
}

function summaryPill(label, value, active) {
    if (!active) return "";
    return `<span class="summary-pill"><small>${label}</small>${value}</span>`;
}

function renderLeaveItem(item) {
    const summary = item.flowSummary || {};
    const expiring = item.expiring || {};
    const flowRows = Array.isArray(item.flows) ? item.flows : [];
    const flowCount = Number(item.flowCount !== undefined ? item.flowCount : flowRows.length) || 0;
    const annualRest = item.annualRest ? `<span class="annual-rest">接口校验剩余 ${item.annualRest}</span>` : "";
    return `
        <article class="leave-ledger-card">
            <div class="leave-head">
                <div>
                    <span>${item.name}</span>
                    <strong>${item.remain || "0"}</strong>
                </div>
                <div class="leave-tags">
                    <span>流水 ${flowCount} 条</span>
                    ${annualRest}
                </div>
            </div>
            <div class="leave-summary">
                ${summaryPill(item.name === "年假" ? "本年额度" : "账面累计", item.total || summary.currentGrant || "-", item.name === "年假" || item.total)}
                ${summaryPill(item.name === "年假" ? "已请" : "已用", item.used || summary.currentUsed || "-", item.name === "年假" || item.used)}
                ${summaryPill("即将过期", expiring.total, expiring.totalDays)}
                ${summaryPill("今年过期", summary.currentExpired, summary.currentExpiredDays)}
                ${summaryPill("加班转入", summary.overtimeIncome, summary.overtimeIncomeDays)}
                ${summaryPill("手动增加", summary.manualAdd, summary.manualAddDays)}
                ${summaryPill("手动扣减", summary.manualSub, summary.manualSubDays)}
            </div>
            ${expiring.items && expiring.items.length ? `<div class="expire-alert">
                <strong>过期提醒</strong>
                ${expiring.items.map(alert => `
                    <div>
                        <span>${alert.date}</span>
                        <em>${alert.amount} · ${alert.daysLeft}天后过期 · ${alert.source}${alert.note ? ` · ${alert.note}` : ""}</em>
                    </div>
                `).join("")}
            </div>` : ""}
            ${flowRows.length ? `<div class="flow-list">${flowRows.map(flow => `
                <div class="flow-row">
                    <span>${flow.operateTime || "未知日期"}</span>
                    <strong>${flow.label}</strong>
                    <em>${flow.amount || ""}${flow.expireTime ? ` · 到期 ${flow.expireTime}` : ""}${flow.note ? ` · ${flow.note}` : ""}</em>
                </div>
            `).join("")}</div>` : `<p class="empty-note">${flowCount ? "流水明细被缓存拦截，刷新后重试" : `${item.name}当前没有可读流水`}</p>`}
        </article>
    `;
}

function renderAttendance(detail) {
    if (!detail) return `<div class="info-panel loading">排班与审批加载中...</div>`;
    const schedule = detail.schedule;
    const scheme = detail.scheme;
    const approve = detail.approve && detail.approve.items || [];
    const appendTemplates = detail.approve && detail.approve.appendTemplates || [];
    const workTimes = schedule && schedule.workTimes || [];
    const schemeBits = scheme && !scheme.error ? [
        scheme.flexible ? "弹性工时" : "",
        scheme.isAllowChangeSchedule ? "允许换班" : "",
        scheme.isAllowSelectSchedule ? "允许选班" : "",
        scheme.ignoreAbnormalStatus ? "忽略异常" : "",
        scheme.outdoorGracingMinute !== undefined ? `外勤宽限 ${scheme.outdoorGracingMinute}分钟` : "",
        scheme.businessTripGracingMinute !== undefined ? `出差宽限 ${scheme.businessTripGracingMinute}分钟` : "",
        scheme.wifiInfos && scheme.wifiInfos.length ? `WiFi ${scheme.wifiInfos.join(" / ")}` : ""
    ].filter(Boolean) : [];
    return `
        <div class="info-panel">
            <div class="panel-title">排班与审批</div>
            ${schedule && schedule.error ? `<p>${schedule.error}</p>` : ""}
            ${schedule && !schedule.error ? `
                <div class="schedule-card">
                    <strong>${schedule.name || "今日班次"}</strong>
                    ${workTimes.length ? workTimes.map(time => `<span>${time.startTime || "--"} - ${time.endTime || "--"}</span>`).join("") : `<span>${schedule.flexible ? "弹性工时" : "未配置班次"}</span>`}
                    ${schedule.restTimes && schedule.restTimes.length ? `<em>休息 ${schedule.restTimes.map(time => `${time.start}-${time.end}`).join(" / ")}</em>` : ""}
                </div>
            ` : ""}
            ${scheme && !scheme.error ? `
                <div class="scheme-card">
                    <strong>${scheme.name || "考勤方案"}</strong>
                    ${schemeBits.length ? `<div>${schemeBits.map(bit => `<span>${bit}</span>`).join("")}</div>` : `<em>无额外规则</em>`}
                    ${scheme.locationNames || scheme.address ? `<em>${scheme.locationNames || scheme.address}</em>` : ""}
                </div>
            ` : ""}
            ${scheme && scheme.error ? `<p>${scheme.error}</p>` : ""}
            ${detail.approve && detail.approve.error ? `<p>${detail.approve.error}</p>` : ""}
            ${appendTemplates.length ? `<div class="append-list">${appendTemplates.map(item => `
                <span>${item.templateName}：本月剩余 ${item.timesLeftThisMonth}/${item.maxTimePermonth}</span>
            `).join("")}</div>` : ""}
            ${approve.length ? `<div class="approve-list">${approve.map(group => `
                <div class="approve-row">
                    <strong>${group.label}</strong>
                    <span>${group.count} 条</span>
                    ${group.items.map(item => `<em>${item.name}${item.showTime ? ` · ${item.showTime}` : ""}</em>`).join("")}
                </div>
            `).join("")}</div>` : `<p>暂无请假、外出、出差或加班审批</p>`}
        </div>
    `;
}

function renderMonthLeaveStat(detail) {
    if (!detail) return `<div class="info-panel loading">本月请假统计加载中...</div>`;
    if (detail.monthLeaveStat && detail.monthLeaveStat.error) {
        return `<div class="info-panel"><div class="panel-title">本月请假统计</div><p>${detail.monthLeaveStat.error}</p></div>`;
    }
    const stat = detail.monthLeaveStat || {};
    const items = stat.items || [];
    return `
        <div class="info-panel">
            <div class="panel-title">本月请假统计</div>
            ${items.length ? `<div class="mini-stat-list">${items.map(item => `
                <div>
                    <span>${item.leaveType}</span>
                    <strong>${item.showTime}</strong>
                </div>
            `).join("")}</div>` : `<p>${stat.startDate || ""} 至 ${stat.endDate || ""} 暂无请假统计</p>`}
        </div>
    `;
}

function renderRecentApprovals(detail) {
    if (!detail) return `<div class="info-panel loading">近期审批加载中...</div>`;
    if (detail.recentApprovals && detail.recentApprovals.error) {
        return `<div class="info-panel wide"><div class="panel-title">近期审批</div><p>${detail.recentApprovals.error}</p></div>`;
    }
    const items = detail.recentApprovals && detail.recentApprovals.items || [];
    return `
        <div class="info-panel wide">
            <div class="panel-title">近期审批</div>
            ${items.length ? `<div class="approval-stream">${items.map(item => `
                <article class="approval-card">
                    <div>
                        <strong>${item.templateName}</strong>
                        <span>${item.createTime || item.time || ""}</span>
                    </div>
                    <b>${item.state || "审批"}</b>
                    ${item.content || item.cost ? `<p>${item.contentTitle ? `${item.contentTitle}：` : ""}${item.content || ""}${item.cost ? ` · ${item.cost}` : ""}</p>` : ""}
                </article>
            `).join("")}</div>` : `<p>暂无近期审批</p>`}
        </div>
    `;
}

function renderTrends(detail) {
    if (!detail) return `<div class="info-panel loading">今日动态加载中...</div>`;
    if (detail.trends && detail.trends.error) return `<div class="info-panel"><div class="panel-title">今日动态</div><p>${detail.trends.error}</p></div>`;
    const items = detail.trends && detail.trends.items || [];
    return `
        <div class="info-panel wide">
            <div class="panel-title">今日动态</div>
            ${items.length ? `<div class="timeline">${items.map(item => `
                <div class="timeline-item">
                    <strong>${item.time || item.day || "今日"}</strong>
                    <span>${item.title || item.moduleType || "动态"}</span>
                    ${item.content ? `<em>${item.content}</em>` : ""}
                </div>
            `).join("")}</div>` : `<p>暂无今日动态</p>`}
        </div>
    `;
}

function renderModal(employee, task, detail) {
    const avatarStyle = employee.avatarUrl ? `style="background-image: linear-gradient(rgba(5,7,11,.12), rgba(5,7,11,.12)), url('${employee.avatarUrl}')"` : "";
    const statusTags = employee.state.tags || [{ label: employee.state.label, tone: employee.state.tone }];
    const roles = [
        employee.isAdmin ? "管理员" : "",
        employee.isContactManager ? "通讯录管理员" : "",
        employee.isDepManager ? "部门负责人" : ""
    ].filter(Boolean).join(" / ") || "员工";
    const statusText = employee.statusDetail || employee.state.label;
    return `
        <div class="modal-hero tone-${employee.state.tone}">
            <div class="avatar modal-avatar" ${avatarStyle}>${employee.avatarUrl ? "" : employee.initials}</div>
            <div>
                <div class="task-kicker">${employee.department.name}</div>
                <h2 id="modalName">${employee.name}</h2>
                <div class="modal-sub">${employee.department.name}${employee.position ? ` · ${employee.position}` : ""}</div>
            </div>
            <div class="status-tags modal-badge">${statusTags.map(tag => `<span class="badge tone-${tag.tone || "muted"}">${tag.label}</span>`).join("")}</div>
        </div>
        <div class="detail-grid">
            ${field("手机号", employee.phone)}
            ${field("职位", employee.position)}
            ${field("部门", employee.department.name)}
            ${field("当前状态", employee.state.label)}
            ${field("状态说明", statusText)}
            ${field("身份角色", roles)}
        </div>
        ${renderTask(task, employee)}
        <div class="detail-sections">
            ${renderSign(detail)}
            ${renderAttendance(detail)}
            ${renderMonthLeaveStat(detail)}
            ${renderLeave(detail)}
            ${renderRecentApprovals(detail)}
            ${renderTrends(detail)}
        </div>
    `;
}

async function openEmployeeModal(employee) {
    modalBackdrop.hidden = false;
    modalContent.innerHTML = renderModal(employee, null, null);

    const taskPromise = employee.taskId
        ? fetch(`/api/task?id=${employee.taskId}`, { cache: "no-store" }).then(response => response.json()).catch(error => ({ error: error.message }))
        : Promise.resolve(null);
    const detailPromise = fetch(`/api/employee-detail?contactId=${employee.id}&companyInfoId=${employee.companyInfoId}&_=${Date.now()}`, { cache: "no-store" })
        .then(response => response.json())
        .catch(error => ({ sign: { error: error.message }, leave: { error: error.message, items: [] }, trends: { error: error.message, items: [] } }));

    const [task, detail] = await Promise.all([taskPromise, detailPromise]);
    if (!modalBackdrop.hidden) {
        modalContent.innerHTML = renderModal(employee, task, detail);
    }
}

function closeModal() {
    modalBackdrop.hidden = true;
    modalContent.innerHTML = "";
}

function renderDepartments() {
    const cards = (state.data.departmentTree || state.data.departments || [])
        .map(department => renderDepartment(department, 0))
        .filter(Boolean);
    gridEl.innerHTML = cards.length ? cards.join("") : `<section class="department"><div class="department-head"><div class="department-title">没有匹配员工</div><div class="department-count">0</div></div></section>`;
}

function renderDepartment(department, depth) {
    const employees = department.employees.filter(matches);
    const children = department.children.map(child => renderDepartment(child, depth + 1)).filter(Boolean);
    const visibleCount = employees.length + children.reduce((sum, html) => {
        const match = html.match(/data-visible-count="(\d+)"/);
        return sum + (match ? Number(match[1]) : 0);
    }, 0);
    if (!visibleCount) return "";

    return `
        <section class="department depth-${Math.min(depth, 3)}" data-visible-count="${visibleCount}">
            <div class="department-head">
                <div>
                    <div class="department-title">${department.name}</div>
                </div>
                <div class="department-count">${visibleCount}/${department.totalCount}</div>
            </div>
            ${employees.length ? `<div class="employee-grid">${employees.map(renderEmployee).join("")}</div>` : ""}
            ${children.length ? `<div class="child-departments">${children.join("")}</div>` : ""}
        </section>
    `;
}

function render() {
    if (!state.data) return;
    renderStats();
    renderTomorrow();
    renderInsights();
    renderDepartments();
    syncTime.textContent = fmtTime(state.data.generatedAt);
    const selected = state.data.stats.find(item => item.key === state.filter)
        || (state.data.tomorrow && state.data.tomorrow.stats || []).find(item => item.key === state.filter);
    activeFilter.textContent = `过滤：${selected ? selected.label : "全部员工"}`;
}

async function loadDashboard() {
    refreshBtn.disabled = true;
    showToast("同步 ERPlus 状态");
    try {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "加载失败");
        state.data = data;
        state.previewDate = data.tomorrow && data.tomorrow.date || "";
        render();
        showToast("状态已更新");
    } catch (error) {
        showToast(error.message);
    } finally {
        refreshBtn.disabled = false;
    }
}

async function loadEmployeeLog(date) {
    if (!state.data) return;
    state.logLoading = true;
    renderTomorrow();
    try {
        const response = await fetch(`/api/employee-log?date=${encodeURIComponent(date)}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "员工日志加载失败");
        state.data.tomorrow = data;
        state.previewDate = data.date;
        state.logLoading = false;
        renderTomorrow();
    } catch (error) {
        state.logLoading = false;
        renderTomorrow();
        showToast(error.message);
    }
}

statsEl.addEventListener("click", event => {
    const card = event.target.closest("[data-filter]");
    if (!card) return;
    state.filter = card.dataset.filter;
    render();
});

tomorrowPanel.addEventListener("click", event => {
    const filter = event.target.closest("[data-filter]");
    if (filter) {
        state.filter = filter.dataset.filter;
        render();
        return;
    }
    const person = event.target.closest("[data-employee-id]");
    if (person) {
        const employee = findEmployee(person.dataset.employeeId);
        if (employee) openEmployeeModal(employee);
    }
});

tomorrowPanel.addEventListener("change", event => {
    if (event.target && event.target.id === "previewDateInput") {
        state.previewDate = event.target.value;
        loadEmployeeLog(state.previewDate);
    }
});

tomorrowPanel.addEventListener("keydown", event => {
    if (event.target && event.target.id === "previewDateInput") {
        event.preventDefault();
    }
});

tomorrowPanel.addEventListener("paste", event => {
    if (event.target && event.target.id === "previewDateInput") {
        event.preventDefault();
    }
});

searchInput.addEventListener("input", event => {
    state.query = event.target.value;
    renderDepartments();
});

refreshBtn.addEventListener("click", loadDashboard);
gridEl.addEventListener("click", event => {
    const hit = event.target.closest(".employee-hit");
    if (!hit) return;
    const employee = findEmployee(hit.dataset.employeeId);
    if (employee) openEmployeeModal(employee);
});
modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", event => {
    if (event.target === modalBackdrop) closeModal();
});
window.addEventListener("keydown", event => {
    if (event.key === "Escape" && !modalBackdrop.hidden) closeModal();
});

loadDashboard();
window.setInterval(loadDashboard, 60 * 1000);
