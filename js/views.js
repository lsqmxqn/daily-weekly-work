/* =========================================================================
   周排查 / 月调度 / 不符合项 + 交互事件 + 启动
   ========================================================================= */
"use strict";

/* ============================ 统计：周 / 月 ============================ */
function weekFacts(ws){
  const we = DT.weekEnd(ws);
  const st = statsRange(ws, we);
  const items = itemsByPeriod("周", we);
  const rec = weekRec(ws, false) || { periodic:{} };
  const per = rec.periodic || {};
  const periodicDone = items.filter(it => per[it.id]).length;
  const issues = DB.issues.filter(i => i.date >= ws && i.date <= we && i.src !== "周排查");
  const weekIssues = DB.issues.filter(i => i.date >= ws && i.date <= we);
  const lastWs = DT.add(ws, -7);
  const left = DB.issues.filter(i => i.date < ws && isOpen(i));
  const recent = {};
  const from = DT.add(ws, -28);
  DB.issues.forEach(i => {
    if (i.date >= from && i.date <= we && i.itemId) recent[i.itemId] = (recent[i.itemId]||0) + 1;
  });
  return {
    ws, we, st, items, per, periodicDone,
    issues: weekIssues,
    left,
    recent,
    closed: DB.issues.filter(i => i.closedOn && i.closedOn >= ws && i.closedOn <= we).length
  };
}

VIEWS.weekly = function(){
  const ws = UI.week, we = DT.weekEnd(ws);
  const rec = weekRec(ws, false) || { periodic:{}, plan:[], analysis:"" };
  const F = weekFacts(ws);
  const k = DT.weekKey(ws);

  setView(
    '<div class="sticky-tools">' +
    '<div class="pager"><button data-act="week-move" data-v="-1">‹</button>' +
    '<span class="cur" style="min-width:190px">第 ' + DT.isoWeek(ws) + " 周 · " + DT.md(ws) + " ~ " + DT.md(we) + "</span>" +
    '<button data-act="week-move" data-v="1"' + (ws >= DT.weekStart(TODAY) ? " disabled" : "") + ">›</button>" +
    '<button class="btn sm" data-act="week-this" style="margin-left:4px">本周</button></div>' +
    '<div class="sp"></div>' +
    '<button class="btn sm pri" data-act="week-save"><svg><use href="#i-save"/></svg>保存归档</button>' +
    '<button class="btn sm" data-act="week-doc"><svg><use href="#i-word"/></svg>导出 Word</button>' +
    '<button class="btn sm" data-act="week-print"><svg><use href="#i-print"/></svg>打印</button>' +
    "</div>" +

    '<div id="quickBox" style="margin-top:12px"></div>' +

    '<div class="kpis" style="margin-top:12px">' +
    kpi("应检 / 实检", F.st.done + " / " + F.st.planned, "执行率 " + pct(F.st.done, F.st.planned) + "%") +
    kpi("本周隐患", F.issues.length, "日管控 " + F.issues.filter(i => i.src === "日管控").length + " 项") +
    kpi("周期性排查", F.periodicDone + " / " + F.items.length, "周频次项目") +
    kpi("上周遗留", F.left.length, "未关闭 " + F.left.filter(isOpen).length + " 项") +
    kpi("本周关闭", F.closed, "已完成整改验证") +
    "</div>" +

    '<div class="card" style="margin-top:14px"><div class="card-h"><h3>一、本周日管控执行情况</h3>' +
    '<span class="sub">' + DT.md(ws) + " ~ " + DT.md(we) + "</span></div>" +
    weekDailyTable(ws, we) + "</div>" +

    '<div class="card"><div class="card-h"><h3>二、本周发现的风险隐患</h3><span class="sub">日管控与本页周期性排查发现的不符合项</span></div>' +
    issuesMiniTable(F.issues) + "</div>" +

    '<div class="card"><div class="card-h"><h3>三、上周遗留问题整改情况</h3><span class="sub">本周开始前尚未关闭的不符合项</span></div>' +
    issuesMiniTable(F.left) + "</div>" +

    '<div class="card"><div class="card-h"><h3>四、周期性排查项目</h3><span class="sub">清单中频次为「周排查」的风险点，本周逐项核查</span>' +
    '<div class="sp"></div><button class="btn sm ok" data-act="week-allok"><svg><use href="#i-check"/></svg>其余全部符合</button></div>' +
    (F.items.length ? periodicHTML(F.items, rec.periodic || {}, "week", k) : '<div class="empty">当前清单没有周频次风险点</div>') +
    "</div>" +

    '<div class="card"><div class="card-h"><h3>五、重复性问题提示</h3><span class="sub">同一风险点近 4 周出现 2 次及以上</span></div>' +
    repeatHTML(F.recent, F.we) + "</div>" +

    '<div class="card"><div class="card-h"><h3>六、分析研判与下周工作重点</h3><div class="sp"></div>' +
    '<button class="btn ai" data-act="week-ai"><svg><use href="#i-ai"/></svg>AI 起草</button>' +
    '<button class="btn sm" data-act="week-rule">生成初稿</button></div>' +
    '<div class="grid g2">' +
    '<div class="ai-box"><div class="h"><h4>分析研判</h4><div class="sp"></div><span class="mini">可直接修改</span></div>' +
    '<textarea class="inp" data-bind="week.analysis" placeholder="填写本周总体判断、主要风险与原因分析，或点「AI 起草」">' + esc(rec.analysis || "") + "</textarea></div>" +
    '<div class="ai-box"><div class="h"><h4>下周工作重点</h4><div class="sp"></div><button class="btn xs" data-act="plan-add" data-v="week">＋ 添加</button></div>' +
    planHTML(rec.plan || [], "week") + "</div></div>" +
    '<div class="row" style="margin-top:12px">' +
    '<label class="field" style="flex:1;margin:0"><span>主持人（食品安全总监）</span><input class="inp sm" data-bind="week.host" value="' + esc(rec.host || DB.co.director) + '"></label>' +
    '<label class="field" style="flex:2;margin:0"><span>参加人员（顿号分隔）</span><input class="inp sm" data-bind="week.att" value="' + esc(rec.att || "") + '" placeholder="' + esc([DB.co.director].concat(DB.co.officers).filter(Boolean).join("、")) + '"></label>' +
    '<label class="field" style="margin:0"><span>排查日期</span><input class="inp sm" type="date" data-bind="week.date" value="' + esc(rec.date || we) + '"></label>' +
    "</div></div>"
  );
  if (typeof Quick !== "undefined") Quick.render("weekly");
};

function weekDailyTable(ws, we){
  const rows = [];
  let d = ws;
  while (d <= we && d <= TODAY){
    const s = dayState(d);
    const rec = DB.days[d] || {};
    const r = rec.results || {};
    const items = itemsByPeriod("日", d);
    const done = items.filter(it => r[it.id]).length;
    const ng = items.filter(it => r[it.id] === "ng").length;
    const txt = s === "off" ? "停产/休息" : s === "clean" ? "零风险" : s === "issue" ? "有不符合" : s === "missed" ? "未检查" : s === "partial" ? "进行中" : "未开始";
    rows.push([DT.md(d), DT.wd(d), txt, done + " / " + items.length, ng ? String(ng) : "—"]);
    d = DT.add(d, 1);
  }
  if (!rows.length) return '<div class="empty">本周还没有记录</div>';
  return '<div class="twrap"><table class="tbl"><thead><tr><th>日期</th><th>星期</th><th>状态</th><th>已检查</th><th>不符合</th></tr></thead><tbody>' +
    rows.map(r => "<tr>" + r.map((c, i) => "<td" + (i ? ' class="num"' : "") + ">" + esc(c) + "</td>").join("") + "</tr>").join("") +
    "</tbody></table></div>";
}

function issuesMiniTable(list){
  if (!list.length) return '<div class="empty">本期间没有发现不符合项</div>';
  return '<div class="twrap"><table class="tbl"><thead><tr><th>日期</th><th>风险点</th><th>问题描述</th><th>等级</th><th>责任人</th><th>状态</th></tr></thead><tbody>' +
    list.map(i => "<tr><td class=\"nw\">" + DT.md(i.date) + "</td><td>" + esc(i.point) + "</td>" +
      '<td style="max-width:340px">' + esc(i.desc || "—") + "</td>" +
      '<td><span class="tag ' + (i.level === "重大" ? "r" : i.level === "较大" ? "y" : "n") + '">' + esc(i.level) + "</span></td>" +
      "<td>" + esc(i.owner || "—") + "</td>" +
      '<td><span class="tag ' + (i.status === "已关闭" ? "g" : isOverdue(i) ? "r" : "y") + '">' + (isOverdue(i) ? "逾期" : (STATUS[i.status] || "整改中")) + "</span></td></tr>").join("") +
    "</tbody></table></div>";
}

function periodicHTML(items, res, scope, key){
  return '<div class="twrap"><table class="tbl"><thead><tr><th style="width:52px">#</th><th>风险点</th><th style="width:170px">管控措施</th><th style="width:190px">结果</th></tr></thead><tbody>' +
    items.map((it, i) => {
      const v = res[it.id] || "";
      return "<tr><td class=\"num\">" + (i+1) + "</td><td><b>" + esc(it.point) + "</b>" +
        '<div class="mini">' + esc(it.env) + (it.dept ? " · " + esc(deptName(it.dept)) : "") + "</div></td>" +
        '<td class="mini clamp2">' + esc(it.measure || "") + "</td>" +
        '<td><div class="res"><button class="ok ' + (v === "ok" ? "on" : "") + '" data-act="per-pick" data-scope="' + scope + '" data-key="' + esc(key) + '" data-item="' + esc(it.id) + '" data-v="ok">符合</button>' +
        '<button class="ng ' + (v === "ng" ? "on" : "") + '" data-act="per-pick" data-scope="' + scope + '" data-key="' + esc(key) + '" data-item="' + esc(it.id) + '" data-v="ng">不符合</button>' +
        '<button class="na ' + (v === "na" ? "on" : "") + '" data-act="per-pick" data-scope="' + scope + '" data-key="' + esc(key) + '" data-item="' + esc(it.id) + '" data-v="na">不涉及</button></div></td></tr>';
    }).join("") + "</tbody></table></div>";
}

function repeatHTML(recent, ref){
  const arr = Object.keys(recent).filter(id => recent[id] >= 2);
  if (!arr.length) return '<div class="empty">近 4 周未出现重复性问题</div>';
  return arr.map(id => {
    const it = DB.items.find(x => x.id === id);
    const ex = DB.issues.filter(i => i.itemId === id).sort((a, b) => a.date < b.date ? 1 : -1)[0];
    return '<div class="row" style="padding:7px 0;border-bottom:1px solid #eef1f2">' +
      '<span class="tag r">' + recent[id] + " 次</span>" +
      '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:500">' + esc(it ? it.point : id) + "</div>" +
      '<div class="mini">' + (ex ? DT.md(ex.date) + "：" + esc((ex.desc||"").slice(0, 60)) : "") + "</div></div>" +
      '<span class="hint">建议从设施、制度、培训层面查原因</span></div>';
  }).join("");
}

function planHTML(list, scope){
  if (!list.length) return '<div class="hint" style="padding:8px">还没有工作重点，点「＋ 添加」或生成初稿。</div>';
  return '<div class="plist">' + list.map((p, i) =>
    '<div class="prow" data-plan-scope="' + scope + '" data-plan-i="' + i + '"><span class="idx">' + (i+1) + "</span>" +
    '<input value="' + esc(p) + '" data-plan-bind="1" placeholder="内容 · 责任部门 · 完成时限">' +
    '<button data-act="plan-del" data-scope="' + scope + '" data-v="' + i + '" title="删除">×</button></div>').join("") + "</div>";
}

/* ============================ 视图：月调度 ============================ */
function monthFacts(mk){
  const ms = DT.monthStart(mk), me = DT.monthEnd(mk);
  const st = statsRange(ms, me);
  const found = DB.issues.filter(i => i.date >= ms && i.date <= me);
  const prevMk = DT.prevMonth(mk);
  const prevFound = DB.issues.filter(i => DT.monthKey(i.date) === prevMk);
  const items = itemsByPeriod("月", me);
  const rec = monthRec(mk, false) || { monthly:{} };
  const mon = rec.monthly || {};
  const done = items.filter(it => mon[it.id]).length;
  const weeks = [];
  const curWs = DT.weekStart(TODAY);
  let ws = DT.weekStart(ms);
  while (ws <= me && ws <= curWs){
    if (DT.weekEnd(ws) >= ms) weeks.push(ws);
    ws = DT.add(ws, 7);
  }
  const byEnv = {};
  found.forEach(i => { byEnv[i.env || "其他"] = (byEnv[i.env || "其他"]||0) + 1; });
  const recent = {};
  DB.issues.forEach(i => {
    if (i.date >= ms && i.date <= me && i.itemId) recent[i.itemId] = (recent[i.itemId]||0) + 1;
  });
  return { ms, me, st, found, prevFound, items, mon, done, weeks, byEnv, recent, prevMk };
}

VIEWS.monthly = function(){
  const mk = UI.month;
  const rec = monthRec(mk, false) || { monthly:{}, annual:{}, plan:[], analysis:"", lastPlan:[] };
  const F = monthFacts(mk);
  const openNow = F.found.filter(isOpen);
  const over = DB.issues.filter(isOverdue);

  setView(
    '<div class="sticky-tools">' +
    '<div class="pager"><button data-act="month-move" data-v="-1">‹</button>' +
    '<span class="cur" style="min-width:120px">' + DT.cnMonth(mk) + "</span>" +
    '<button data-act="month-move" data-v="1"' + (mk >= DT.monthKey(TODAY) ? " disabled" : "") + ">›</button>" +
    '<button class="btn sm" data-act="month-this" style="margin-left:4px">本月</button></div>' +
    '<div class="sp"></div>' +
    '<button class="btn sm pri" data-act="month-save"><svg><use href="#i-save"/></svg>保存归档</button>' +
    '<button class="btn sm" data-act="month-doc"><svg><use href="#i-word"/></svg>导出 Word</button>' +
    '<button class="btn sm" data-act="month-print"><svg><use href="#i-print"/></svg>打印</button>' +
    "</div>" +

    '<div id="quickBox" style="margin-top:12px"></div>' +

    '<div class="kpis" style="margin-top:12px">' +
    kpi("日管控执行率", pct(F.st.done, F.st.planned) + "%", "应检 " + F.st.planned + " 天 · 实检 " + F.st.done + " 天") +
    kpi("本月隐患", F.found.length, "上月 " + F.prevFound.length + " 项") +
    kpi("整改关闭率", pct(F.found.filter(i => !isOpen(i)).length, F.found.length) + "%", "关闭 " + F.found.filter(i => !isOpen(i)).length + " / " + F.found.length) +
    kpi("未关闭", openNow.length, "含跨月遗留") +
    kpi("逾期", over.length, "需在调度会上明确", over.length ? "ng" : "") +
    "</div>" +

    '<div class="grid g2" style="margin-top:14px">' +
    '<div class="card"><div class="card-h"><h3>一、本月日管控执行情况</h3></div>' +
    '<div class="hint" style="line-height:2">本月应开展日管控 <b>' + F.st.planned + "</b> 天，实际完成 <b>" + F.st.done + "</b> 天，执行率 <b>" + pct(F.st.done, F.st.planned) + "%</b>；" +
    "停产/休息 " + F.st.off + " 天；零风险报告 " + F.st.clean + " 天；漏检 " + F.st.missed.length + " 天" +
    (F.st.missed.length ? "（" + F.st.missed.map(d => DT.md(d)).join("、") + "）" : "") + "。" +
    '<div style="margin-top:8px">累计检查 ' + F.st.checks + " 项次，其中符合 " + F.st.ok + " 项、不符合 " + F.st.ng + " 项，符合率 " + pct(F.st.ok, F.st.checks) + "%。</div></div>" +
    barsHTML() + "</div>" +

    '<div class="card"><div class="card-h"><h3>二、风险隐患按环节分布</h3></div>' +
    distHTML(F.byEnv) + "</div></div>" +

    '<div class="card"><div class="card-h"><h3>三、各周排查结论</h3></div>' +
    '<div class="twrap"><table class="tbl"><thead><tr><th style="width:120px">周次</th><th style="width:110px">区间</th><th>分析研判</th><th style="width:100px">状态</th></tr></thead><tbody>' +
    F.weeks.map(ws => {
      const k = DT.weekKey(ws), w = DB.weeks[k];
      return '<tr><td class="nw">第 ' + DT.isoWeek(ws) + " 周</td><td class=\"nw\">" + DT.md(ws) + " ~ " + DT.md(DT.weekEnd(ws)) + "</td>" +
        '<td style="max-width:520px">' + (w && w.analysis ? esc(w.analysis.slice(0, 110)) + (w.analysis.length > 110 ? "…" : "") : '<span class="muted">尚未填写研判</span>') + "</td>" +
        '<td><span class="tag ' + (w && w.savedAt ? "g" : "n") + '">' + (w && w.savedAt ? "已归档" : "未归档") + "</span></td></tr>";
    }).join("") + "</tbody></table></div></div>" +

    '<div class="card"><div class="card-h"><h3>四、不符合项整改关闭情况</h3></div>' + issuesMiniTable(F.found) + "</div>" +

    '<div class="card"><div class="card-h"><h3>五、月度检查项目完成情况</h3><span class="sub">清单中频次为「月度检查」的风险点</span>' +
    '<div class="sp"></div><button class="btn sm ok" data-act="month-allok"><svg><use href="#i-check"/></svg>其余全部符合</button></div>' +
    (F.items.length ? periodicHTML(F.items, F.mon, "month", mk) : '<div class="empty">当前清单没有月度检查项目</div>') + "</div>" +

    '<div class="card"><div class="card-h"><h3>六、年度事项到期提醒</h3><span class="sub">频次为「年度事项」的风险点，在月调度中登记完成情况</span></div>' +
    annualHTML(mk, rec) + "</div>" +

    '<div class="card"><div class="card-h"><h3>七、上月调度事项落实情况</h3><span class="sub">' + DT.cnMonth(F.prevMk) + " 部署的重点工作</span></div>" +
    lastPlanHTML(mk, rec) + "</div>" +

    '<div class="card"><div class="card-h"><h3>八、分析研判与下月工作调度</h3><div class="sp"></div>' +
    '<button class="btn ai" data-act="month-ai"><svg><use href="#i-ai"/></svg>AI 起草</button>' +
    '<button class="btn sm" data-act="month-rule">生成初稿</button></div>' +
    '<div class="grid g2">' +
    '<div class="ai-box"><div class="h"><h4>分析研判</h4><div class="sp"></div><span class="mini">会上确认后可修改</span></div>' +
    '<textarea class="inp" data-bind="month.analysis" style="min-height:200px" placeholder="填写本月总体研判，或点「AI 起草」">' + esc(rec.analysis || "") + "</textarea></div>" +
    '<div class="ai-box"><div class="h"><h4>下月重点工作调度</h4><div class="sp"></div><button class="btn xs" data-act="plan-add" data-v="month">＋ 添加</button></div>' +
    planHTML(rec.plan || [], "month") + "</div></div>" +
    '<div class="row" style="margin-top:12px">' +
    '<label class="field" style="flex:1;margin:0"><span>主持人（主要负责人）</span><input class="inp sm" data-bind="month.host" value="' + esc(rec.host || DB.co.chief) + '"></label>' +
    '<label class="field" style="flex:1;margin:0"><span>汇报人（食品安全总监）</span><input class="inp sm" data-bind="month.reporter" value="' + esc(rec.reporter || DB.co.director) + '"></label>' +
    '<label class="field" style="flex:1.6;margin:0"><span>参加人员</span><input class="inp sm" data-bind="month.att" value="' + esc(rec.att || "") + '" placeholder="顿号分隔"></label>' +
    '<label class="field" style="margin:0"><span>会议日期</span><input class="inp sm" type="date" data-bind="month.date" value="' + esc(rec.date || F.me) + '"></label>' +
    '<label class="field" style="flex:1;margin:0"><span>地点</span><input class="inp sm" data-bind="month.place" value="' + esc(rec.place || DB.co.place) + '"></label>' +
    "</div></div>"
  );
  if (typeof Quick !== "undefined") Quick.render("monthly");
};

function distHTML(byEnv){
  const ks = Object.keys(byEnv).sort((a, b) => byEnv[b] - byEnv[a]);
  const total = ks.reduce((n, k) => n + byEnv[k], 0);
  if (!total) return '<div class="empty">本月未发现风险隐患</div>';
  return ks.map(k => {
    const w = Math.max(2, Math.round(byEnv[k] / total * 100));
    return '<div style="margin-bottom:9px"><div class="row" style="justify-content:space-between;font-size:12.5px">' +
      "<span>" + esc(k) + '</span><span class="muted">' + byEnv[k] + " 项 · " + Math.round(byEnv[k]/total*100) + "%</span></div>" +
      '<div style="height:6px;background:var(--na-bg);border-radius:3px;margin-top:3px;overflow:hidden">' +
      '<i style="display:block;height:100%;width:' + w + '%;background:var(--pri);border-radius:3px"></i></div></div>';
  }).join("");
}

function annualHTML(mk, rec){
  const items = activeItems(TODAY).filter(it => it.period === "年");
  if (!items.length) return '<div class="empty">当前清单没有年度事项</div>';
  const res = rec.annual || {};
  return '<div class="twrap"><table class="tbl"><thead><tr><th>年度事项</th><th style="width:140px">责任部门</th><th style="width:120px">完成月份</th><th style="width:130px">状态</th></tr></thead><tbody>' +
    items.map(it => "<tr><td><b>" + esc(it.point) + '</b><div class="mini">' + esc(it.measure || "").slice(0, 60) + "</div></td>" +
      "<td>" + esc(deptName(it.dept)) + "</td>" +
      '<td><input class="inp sm" type="month" data-annual="' + esc(it.id) + '" value="' + esc((res[it.id] && res[it.id].month) || "") + '"></td>' +
      '<td><button class="btn xs ' + (res[it.id] && res[it.id].done ? "ok" : "") + '" data-act="annual-toggle" data-v="' + esc(it.id) + '">' +
      (res[it.id] && res[it.id].done ? "已完成" : "标记完成") + "</button></td></tr>").join("") +
    "</tbody></table></div>";
}

function lastPlanHTML(mk, rec){
  const prev = DB.months[DT.prevMonth(mk)];
  const plan = (rec.lastPlan && rec.lastPlan.length) ? rec.lastPlan : (prev && prev.plan || []).map(t => ({ text:t, done:false }));
  if (!plan.length) return '<div class="empty">上月没有部署调度事项</div>';
  return plan.map((p, i) =>
    '<div class="row" style="padding:6px 0;border-bottom:1px solid #eef1f2">' +
    '<button class="btn xs ' + (p.done ? "ok" : "") + '" data-act="lastplan-toggle" data-v="' + i + '">' + (p.done ? "已落实" : "未落实") + "</button>" +
    '<span style="flex:1;min-width:0;font-size:13px">' + esc(p.text) + "</span></div>").join("");
}

/* ============================ 视图：不符合项 ============================ */
VIEWS.issues = function(){
  const f = UI.ncFilter;
  let list = DB.issues.slice();
  if (UI.ncMonth) list = list.filter(i => DT.monthKey(i.date) === UI.ncMonth);
  const cnt = {
    open: list.filter(isOpen).length,
    overdue: list.filter(isOverdue).length,
    closed: list.filter(i => !isOpen(i)).length,
    all: list.length
  };
  if (f === "open") list = list.filter(isOpen);
  else if (f === "overdue") list = list.filter(isOverdue);
  else if (f === "closed") list = list.filter(i => !isOpen(i));
  list.sort((a, b) => isOpen(a) !== isOpen(b) ? (isOpen(a) ? -1 : 1) : (a.deadline || "9999") < (b.deadline || "9999") ? -1 : 1);
  const months = uniq(DB.issues.map(i => DT.monthKey(i.date))).sort().reverse();

  setView(
    '<div class="kpis">' +
    kpi("未关闭", cnt.open, "整改中 + 待验证") +
    kpi("逾期", cnt.overdue, "超整改期限", cnt.overdue ? "ng" : "") +
    kpi("已关闭", cnt.closed, "完成验证") +
    kpi("累计", cnt.all, "全部记录") +
    kpi("本月新增", DB.issues.filter(i => DT.monthKey(i.date) === DT.monthKey(TODAY)).length, DT.cnMonth(DT.monthKey(TODAY))) +
    "</div>" +

    '<div class="card" style="margin-top:14px"><div class="card-h">' +
    '<div class="chips">' + [["open","未关闭"],["overdue","逾期"],["closed","已关闭"],["all","全部"]].map(x =>
      '<button class="chip' + (f === x[0] ? " on" : "") + '" data-act="nc-filter" data-v="' + x[0] + '">' + x[1] + '<span class="n">' + cnt[x[0]] + "</span></button>").join("") + "</div>" +
    '<select class="inp sm" id="ncMonth" style="width:auto;margin-left:8px"><option value="">全部月份</option>' +
    months.map(m => '<option value="' + m + '"' + (UI.ncMonth === m ? " selected" : "") + ">" + DT.cnMonth(m) + "</option>").join("") + "</select>" +
    '<div class="sp"></div><button class="btn sm" data-act="nc-add"><svg><use href="#i-plus"/></svg>手工登记</button>' +
    '<button class="btn sm" data-act="nc-xls"><svg><use href="#i-xls"/></svg>导出 Excel</button></div>' +
    '<div class="twrap"><table class="tbl"><thead><tr>' +
    '<th style="width:76px">编号</th><th style="width:86px">发现日期</th><th style="width:70px">来源</th><th style="width:150px">风险点</th><th>问题描述</th>' +
    '<th style="width:64px">等级</th><th style="width:110px">责任人</th><th style="width:100px">期限</th><th style="width:88px">状态</th><th style="width:96px">操作</th>' +
    "</tr></thead><tbody>" +
    (list.length ? list.map(i => issueRow(i)).join("") : '<tr><td colspan="10"><div class="empty">没有符合条件的记录</div></td></tr>') +
    "</tbody></table></div>" +
    '<div class="hint" style="margin-top:8px">点击「处理」填写整改情况；验证通过后点「关闭」，该问题才会从待办中移除。</div></div>'
  );
};

function issueRow(i){
  const open = UI.issueOpen === i.id;
  const row = "<tr" + (open ? ' style="background:#fbfdfc"' : "") + ">" +
    '<td class="num nw">' + esc(i.id) + "</td>" +
    '<td class="nw">' + DT.md(i.date) + "</td>" +
    '<td><span class="tag n">' + esc(i.src) + "</span></td>" +
    "<td>" + esc(i.point) + "</td>" +
    '<td style="max-width:330px">' + esc(i.desc || "—") + (i.action ? '<div class="mini" style="margin-top:3px">整改：' + esc(i.action) + "</div>" : "") + "</td>" +
    '<td><span class="tag ' + (i.level === "重大" ? "r" : i.level === "较大" ? "y" : "n") + '">' + esc(i.level) + "</span></td>" +
    "<td>" + esc(i.owner || "—") + "</td>" +
    '<td class="nw"' + (isOverdue(i) ? ' style="color:var(--ng)"' : "") + ">" + esc(i.deadline || "—") + "</td>" +
    '<td><span class="tag ' + (i.status === "已关闭" ? "g" : isOverdue(i) ? "r" : "y") + '">' + (isOverdue(i) ? "逾期" : (STATUS[i.status] || "整改中")) + "</span></td>" +
    '<td class="nw"><button class="btn xs" data-act="nc-open" data-v="' + esc(i.id) + '">' + (open ? "收起" : "处理") + "</button></td></tr>";
  if (!open) return row;
  return row + '<tr><td colspan="10" style="background:#fbfdfc;padding:12px 14px">' + ncEditHTML(i) + "</td></tr>";
}

function ncEditHTML(i){
  return '<div class="grid g3">' +
    '<label class="field" style="grid-column:1/-1;margin-bottom:4px"><span>问题描述</span>' +
    '<textarea class="inp" data-nc2="desc" data-id="' + esc(i.id) + '" style="min-height:56px">' + esc(i.desc) + "</textarea></label>" +
    '<label class="field"><span>整改责任人</span><input class="inp sm" data-nc2="owner" data-id="' + esc(i.id) + '" value="' + esc(i.owner) + '"></label>' +
    '<label class="field"><span>整改期限</span><input class="inp sm" type="date" data-nc2="deadline" data-id="' + esc(i.id) + '" value="' + esc(i.deadline) + '"></label>' +
    '<label class="field"><span>风险等级</span><select class="inp sm" data-nc2="level" data-id="' + esc(i.id) + '">' + LEVELS.map(l => '<option' + (i.level === l ? " selected" : "") + ">" + l + "</option>").join("") + "</select></label>" +
    '<label class="field" style="grid-column:1/-1"><span>整改情况（实际做了什么、谁验证）</span>' +
    '<textarea class="inp" data-nc2="action" data-id="' + esc(i.id) + '" style="min-height:56px" placeholder="如：已清理离地存放并加装垫板，8 月 12 日仓储部完成，品控复核通过">' + esc(i.action) + "</textarea></label>" +
    '<label class="field"><span>验证人</span><input class="inp sm" data-nc2="verifier" data-id="' + esc(i.id) + '" value="' + esc(i.verifier) + '"></label>' +
    '<div style="display:flex;align-items:flex-end;gap:8px;grid-column:2/-1;justify-content:flex-end">' +
    (i.status === "整改中" ? '<button class="btn sm" data-act="nc-fixed" data-v="' + esc(i.id) + '">提交待验证</button>' : "") +
    (i.status !== "已关闭" ? '<button class="btn sm pri" data-act="nc-close" data-v="' + esc(i.id) + '">验证并关闭</button>' : '<span class="tag g">已关闭 ' + esc(i.closedOn) + "</span>") +
    (i.status === "已关闭" ? '<button class="btn sm" data-act="nc-reopen" data-v="' + esc(i.id) + '">重新打开</button>' : "") +
    "</div></div>";
}

/* ============================ 事件绑定 ============================ */
function bindPath(path, val){
  const p = path.split(".");
  if (p[0] === "day"){
    const rec = dayRec(UI.day, true);
    rec[p[1]] = val;
  }else if (p[0] === "week"){
    const rec = weekRec(UI.week, true);
    rec[p[1]] = val;
  }else if (p[0] === "month"){
    const rec = monthRec(UI.month, true);
    rec[p[1]] = val;
  }else if (p[0] === "co"){
    if (p[1] === "officers" || p[1] === "depts"){
      DB.co[p[1]] = String(val).split(/[、,，\s]+/).filter(Boolean);
    }else{
      DB.co[p[1]] = val;
    }
  }
  save();
}

document.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "dayPick" && t.value){ UI.day = t.value; render(); return; }
  if (t.id === "ncMonth"){ UI.ncMonth = t.value; render(); return; }
  if (t.hasAttribute && t.hasAttribute("data-bind")){
    bindPath(t.getAttribute("data-bind"), t.value);
    return;
  }
  if (t.hasAttribute && t.hasAttribute("data-nc-bind")){
    const wrap = t.closest("[data-nc]");
    if (!wrap) return;
    const iss = DB.issues.find(i => i.id === wrap.getAttribute("data-nc"));
    if (!iss) return;
    iss[t.getAttribute("data-nc-bind")] = t.value;
    save();
    return;
  }
  if (t.hasAttribute && t.hasAttribute("data-nc2")){
    const iss = DB.issues.find(i => i.id === t.getAttribute("data-id"));
    if (!iss) return;
    iss[t.getAttribute("data-nc2")] = t.value;
    save();
    return;
  }
  if (t.hasAttribute && t.hasAttribute("data-annual")){
    const rec = monthRec(UI.month, true);
    rec.annual = rec.annual || {};
    const id = t.getAttribute("data-annual");
    rec.annual[id] = rec.annual[id] || { done:false };
    rec.annual[id].month = t.value;
    save();
    return;
  }
  if (t.hasAttribute && t.hasAttribute("data-plan-bind")){
    const row = t.closest("[data-plan-scope]");
    if (!row) return;
    const scope = row.getAttribute("data-plan-scope");
    const i = Number(row.getAttribute("data-plan-i"));
    const rec = scope === "week" ? weekRec(UI.week, true) : monthRec(UI.month, true);
    rec.plan[i] = t.value;
    save();
  }
});

document.addEventListener("input", e => {
  const t = e.target;
  if (t.id === "catQ"){ UI.setup.q = t.value; const pos = t.selectionStart; VIEWS.setup(); const el = $("#catQ"); if (el){ el.focus(); el.setSelectionRange(pos, pos); } return; }
  if (t.hasAttribute && t.hasAttribute("data-dept")){
    const pv = document.querySelector('[data-preview="' + t.getAttribute("data-dept") + '"]');
    if (pv) pv.textContent = String(t.value || "").trim() || "沿用原名";
  }
  if (t.hasAttribute && t.hasAttribute("data-bind") && t.tagName === "INPUT" && t.type !== "date" && t.type !== "month"){
    bindPath(t.getAttribute("data-bind"), t.value);
  }
  if (t.hasAttribute && t.hasAttribute("data-nc-bind") && t.tagName === "TEXTAREA"){
    const wrap = t.closest("[data-nc]");
    const iss = wrap && DB.issues.find(i => i.id === wrap.getAttribute("data-nc"));
    if (iss){ iss[t.getAttribute("data-nc-bind")] = t.value; save(); }
  }
});

document.addEventListener("click", e => {
  const close = e.target.closest("[data-close]");
  if (close || e.target.id === "mask"){ closeModal(); if (!close) return; }
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.getAttribute("data-act");
  const v = el.getAttribute("data-v");

  switch (act){
    case "nav": go(v); break;
    case "fold": UI.fold[v] = !UI.fold[v]; render(); break;

    /* --- 首次设置 --- */
    case "setup-ind": UI.setup.ind = v; render(); break;
    case "setup-cat": {
      const no = Number(v);
      const i = UI.setup.nos.indexOf(no);
      if (i >= 0) UI.setup.nos.splice(i, 1); else UI.setup.nos.push(no);
      UI.setup.nos.sort((a, b) => a - b);
      UI.setup.err = "";
      render();
      break;
    }
    case "setup-rm": {
      const no = Number(v);
      UI.setup.nos = UI.setup.nos.filter(x => x !== no);
      render();
      break;
    }
    case "setup-var": {
      const cat = el.getAttribute("data-cat");
      UI.setup.variants = UI.setup.variants || {};
      const arr = UI.setup.variants[cat] || [];
      const i = arr.indexOf(v);
      if (i >= 0) arr.splice(i, 1); else arr.push(v);
      UI.setup.variants[cat] = arr;
      render();
      break;
    }
    case "setup-go": {
      const u = UI.setup;
      const name = ($("#coName") || {}).value || "";
      const lic = ($("#coLic") || {}).value || "";
      const chief = ($("#coChief") || {}).value || "";
      const director = ($("#coDirector") || {}).value || "";
      const officers = ($("#coOfficers") || {}).value || "";
      const depts = ($("#coDepts") || {}).value || "";
      if (!u.nos.length){ u.err = "请至少选择一个食品类别。"; render(); return; }
      if (!name.trim()){ u.err = "请填写企业名称。"; render(); return; }
      const built = buildItems(u.nos, u.variants);
      DB = emptyDB();
      DB.co.name = name.trim();
      DB.co.license = lic.trim();
      DB.co.chief = chief.trim();
      DB.co.director = director.trim();
      DB.co.officers = officers.split(/[、,，\s]+/).filter(Boolean);
      DB.co.depts = depts.split(/[、,，\s]+/).filter(Boolean);
      DB.cats = u.nos.slice();
      DB.items = built.items;
      save(true);
      UI.view = "overview";
      UI.setup.err = "";
      toast("已生成 " + built.items.length + " 个风险点的管控清单", "ok");
      render();
      break;
    }

    /* --- 概览 --- */
    case "go-day": UI.day = v; go("daily"); break;
    case "cal-day": UI.day = v; go("daily"); break;
    case "cal-prev": UI.cal = DT.prevMonth(UI.cal); render(); break;
    case "cal-next": UI.cal = DT.nextMonth(UI.cal); render(); break;

    /* --- 日管控 --- */
    case "day-move": {
      const d = DT.add(UI.day, Number(v));
      if (d > TODAY) return;
      UI.day = d; render(); break;
    }
    case "day-status": {
      const rec = dayRec(UI.day, true);
      rec.status = v;
      save();
      render();
      break;
    }
    case "day-allok": {
      const rec = dayRec(UI.day, true);
      if (rec.status === "off"){ toast("当日为停产 / 休息", "ng"); return; }
      let n = 0;
      itemsByPeriod("日", UI.day).forEach(it => { if (!rec.results[it.id]){ rec.results[it.id] = "ok"; n++; } });
      save(true); render();
      toast("已将其余 " + n + " 项标记为符合");
      break;
    }
    case "day-save": {
      const rec = dayRec(UI.day, true);
      if (rec.status !== "off"){
        const items = itemsByPeriod("日", UI.day);
        const miss = items.filter(it => !rec.results[it.id]).length;
        if (miss){ toast("还有 " + miss + " 项未检查，可点「其余全部符合」", "ng"); return; }
      }
      rec.savedAt = new Date().toISOString();
      save(true); render();
      toast("已保存当日记录", "ok");
      break;
    }
    case "pick": {
      const row = el.closest(".item");
      const id = row && row.getAttribute("data-item");
      if (!id) return;
      const rec = dayRec(UI.day, true);
      const prev = rec.results[id];
      rec.results[id] = v;
      const it = DB.items.find(x => x.id === id);
      if (v === "ng" && !findIssue("日管控", UI.day, id)){
        createIssue({ date: UI.day, itemId: id, code: it ? it.code : "", env: it ? it.env : "", point: it ? it.point : "", desc: "", level: "一般", owner: it ? deptName(it.dept) : "", deadline: DT.add(UI.day, 5), src: "日管控", by: rec.by || "" });
      }
      if (prev === "ng" && v !== "ng"){
        const iss = findIssue("日管控", UI.day, id);
        if (iss && !iss.action && iss.status === "整改中") DB.issues = DB.issues.filter(x => x.id !== iss.id);
      }
      rec.savedAt = "";
      save();
      render();
      if (v === "ng"){
        const f = document.querySelector('.item[data-item="' + id + '"] textarea');
        if (f) f.focus();
      }
      break;
    }
    case "compact": UI.compact = !UI.compact; render(); break;
    case "day-doc": openDayDoc(); break;

    /* --- 周排查 --- */
    case "week-move": {
      const ws = DT.add(UI.week, Number(v) * 7);
      if (ws > DT.weekStart(TODAY)) return;
      UI.week = ws; render(); break;
    }
    case "week-this": UI.week = DT.weekStart(TODAY); render(); break;
    case "week-save": {
      const rec = weekRec(UI.week, true);
      rec.savedAt = new Date().toISOString();
      save(true); render(); toast("周排查已保存归档", "ok"); break;
    }
    case "week-allok": {
      const rec = weekRec(UI.week, true);
      let n = 0;
      itemsByPeriod("周", DT.weekEnd(UI.week)).forEach(it => { if (!rec.periodic[it.id]){ rec.periodic[it.id] = "ok"; n++; } });
      save(true); render(); toast("已将其余 " + n + " 项标记为符合"); break;
    }
    case "week-doc": EXPORT.week(UI.week); break;
    case "week-print": printDoc("week", UI.week); break;
    case "week-rule": {
      const rec = weekRec(UI.week, true);
      const d = ruleWeek(UI.week);
      rec.analysis = d.analysis; rec.plan = d.plan;
      save(true); render(); toast("已生成初稿，请核对后修改"); break;
    }
    case "week-ai": aiWeek(); break;

    /* --- 月调度 --- */
    case "month-move": {
      const mk = v === "-1" ? DT.prevMonth(UI.month) : DT.nextMonth(UI.month);
      if (mk > DT.monthKey(TODAY)) return;
      UI.month = mk; render(); break;
    }
    case "month-this": UI.month = DT.monthKey(TODAY); render(); break;
    case "month-save": {
      const rec = monthRec(UI.month, true);
      rec.savedAt = new Date().toISOString();
      save(true); render(); toast("月调度已保存归档", "ok"); break;
    }
    case "month-allok": {
      const rec = monthRec(UI.month, true);
      let n = 0;
      itemsByPeriod("月", DT.monthEnd(UI.month)).forEach(it => { if (!rec.monthly[it.id]){ rec.monthly[it.id] = "ok"; n++; } });
      save(true); render(); toast("已将其余 " + n + " 项标记为符合"); break;
    }
    case "month-doc": EXPORT.month(UI.month); break;
    case "month-print": printDoc("month", UI.month); break;
    case "month-rule": {
      const rec = monthRec(UI.month, true);
      const d = ruleMonth(UI.month);
      rec.analysis = d.analysis; rec.plan = d.plan;
      save(true); render(); toast("已生成初稿，请核对后修改"); break;
    }
    case "month-ai": aiMonth(); break;
    case "annual-toggle": {
      const rec = monthRec(UI.month, true);
      rec.annual = rec.annual || {};
      const id = v;
      const cur = rec.annual[id] || {};
      rec.annual[id] = { month: cur.month || "", done: !cur.done };
      save(); render(); break;
    }
    case "lastplan-toggle": {
      const rec = monthRec(UI.month, true);
      if (!rec.lastPlan || !rec.lastPlan.length){
        const prev = DB.months[DT.prevMonth(UI.month)];
        rec.lastPlan = (prev && prev.plan || []).map(t => ({ text:t, done:false }));
      }
      const i = Number(v);
      if (rec.lastPlan[i]) rec.lastPlan[i].done = !rec.lastPlan[i].done;
      save(); render(); break;
    }

    /* --- 周期性排查 --- */
    case "per-pick": {
      const scope = el.getAttribute("data-scope");
      const key = el.getAttribute("data-key");
      const item = el.getAttribute("data-item");
      const rec = scope === "week" ? weekRec(DT.weekOfKey(key), true) : monthRec(key, true);
      const map = scope === "week" ? "periodic" : "monthly";
      rec[map][item] = el.getAttribute("data-v");
      const it = DB.items.find(x => x.id === item);
      if (it && el.getAttribute("data-v") === "ng" && scope === "week"){
        const date = DT.weekEnd(DT.weekOfKey(key));
        if (!findIssue("周排查", date, item)){
          createIssue({ date: date > TODAY ? TODAY : date, itemId: item, code: it.code, env: it.env, point: it.point, desc:"", level:"一般", owner: deptName(it.dept), deadline: DT.add(TODAY, 5), src:"周排查" });
        }
      }
      if (scope === "week") rec.savedAt = "";
      save(); render(); break;
    }

    /* --- 计划列表 --- */
    case "plan-add": {
      const rec = v === "week" ? weekRec(UI.week, true) : monthRec(UI.month, true);
      rec.plan = rec.plan || [];
      rec.plan.push("");
      save(); render();
      const rows = $$('[data-plan-scope="' + v + '"] input');
      if (rows.length) rows[rows.length - 1].focus();
      break;
    }
    case "plan-del": {
      const rec = el.getAttribute("data-scope") === "week" ? weekRec(UI.week, true) : monthRec(UI.month, true);
      rec.plan.splice(Number(v), 1);
      save(); render(); break;
    }

    /* --- 不符合项 --- */
    case "nc-filter": UI.ncFilter = v; render(); break;
    case "nc-open": UI.issueOpen = UI.issueOpen === v ? "" : v; render(); break;
    case "nc-fixed": {
      const i = DB.issues.find(x => x.id === v);
      if (i){ i.status = "待验证"; save(); render(); }
      break;
    }
    case "nc-close": {
      const i = DB.issues.find(x => x.id === v);
      if (!i) return;
      if (!i.action){ toast("请先填写整改情况再关闭", "ng"); return; }
      i.status = "已关闭";
      i.closedOn = TODAY;
      if (!i.verifier) i.verifier = DB.co.director || "";
      save(); render(); toast("已关闭 " + i.id, "ok");
      break;
    }
    case "nc-reopen": {
      const i = DB.issues.find(x => x.id === v);
      if (i){ i.status = "整改中"; i.closedOn = ""; save(); render(); }
      break;
    }
    case "nc-add": {
      modal({
        title: "手工登记问题",
        body: '<label class="field"><span>发现日期</span><input class="inp" id="mDate" type="date" value="' + TODAY + '"></label>' +
          '<label class="field"><span>问题描述 *</span><input class="inp" id="mDesc" placeholder="写清位置、数量、现象"></label>' +
          '<div class="grid g2"><label class="field"><span>风险点 / 环节</span><input class="inp" id="mPoint" placeholder="如：原料贮存-离地存放"></label>' +
          '<label class="field"><span>风险等级</span><select class="inp" id="mLevel">' + LEVELS.map(l => "<option>" + l + "</option>").join("") + "</select></label></div>" +
          '<div class="grid g2"><label class="field"><span>整改责任人</span><input class="inp" id="mOwner" value="' + esc(DB.co.depts[0] || "") + '"></label>' +
          '<label class="field"><span>整改期限</span><input class="inp" id="mDeadline" type="date" value="' + DT.add(TODAY, 5) + '"></label></div>',
        foot: '<button class="btn" data-close="1">取消</button><button class="btn pri" data-act="nc-add-go">登记</button>'
      });
      break;
    }
    case "nc-add-go": {
      const desc = ($("#mDesc") || {}).value || "";
      if (!desc.trim()){ toast("请填写问题描述", "ng"); return; }
      createIssue({
        date: ($("#mDate") || {}).value || TODAY,
        point: ($("#mPoint") || {}).value || "其他问题",
        desc: desc.trim(),
        level: ($("#mLevel") || {}).value || "一般",
        owner: ($("#mOwner") || {}).value || "",
        deadline: ($("#mDeadline") || {}).value || DT.add(TODAY, 5),
        src: "手工"
      });
      closeModal(); render(); toast("已登记", "ok");
      break;
    }
    case "nc-xls": EXPORT.issues(); break;

    /* --- 清单 --- */
    case "list-period": UI.listPeriod = v; render(); break;
    case "item-toggle": {
      const it = DB.items.find(x => x.id === v);
      if (it){ it.on = !it.on; save(); render(); }
      break;
    }
    case "item-edit": editItem(v); break;
    case "item-add": editItem(""); break;
    case "exp-items": EXPORT.items(); break;
    case "dept-map": openDeptMap(); break;
    case "dept-save": saveDeptMap(); break;
    case "dept-auto": autoDeptMap(); break;
    case "ai-items": genItemsFlow(); break;
    case "imp-list": importListFlow(); break;
    case "pending-commit": commitPending(el.getAttribute("data-mode")); break;
    case "pending-all": {
      const box = $("#pickAll");
      if (box){ const on = !box.checked; box.checked = on; $$("[data-pick]").forEach(x => { x.checked = on; }); }
      break;
    }

    /* --- 数据 --- */
    case "co-save": {
      DB.co.name = ($("#view input[data-bind='co.name']") || {}).value || DB.co.name;
      save(true); render(); toast("企业信息已保存", "ok"); break;
    }
    case "backup": {
      const name = "日周月台账备份_" + (DB.co.name || "企业") + "_" + TODAY + ".json";
      CORE.download(new Blob([JSON.stringify(DB, null, 1)], { type:"application/json" }), name);
      toast("备份已导出");
      break;
    }
    case "restore": {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = ".json,application/json";
      inp.onchange = () => {
        const f = inp.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          try{
            const j = JSON.parse(r.result);
            if (!j.items || !Array.isArray(j.items)) throw new Error("不是有效的备份文件");
            if (DB.items.length && !confirm("导入会覆盖当前全部数据，确定继续？")) return;
            DB = j;
            const e = emptyDB();
            Object.keys(e).forEach(k => { if (DB[k] == null) DB[k] = e[k]; });
            DB.co = Object.assign(e.co, DB.co || {});
            save(true); UI.view = "overview"; render();
            toast("已导入备份：" + (DB.co.name || "未命名企业"), "ok");
          }catch(err){ toast("导入失败：" + err.message, "ng"); }
        };
        r.readAsText(f);
      };
      inp.click();
      break;
    }
    case "clear-records": {
      if (!confirm("将清空全部日管控、周排查、月调度记录与不符合项，保留清单和企业信息。\n建议先导出备份。确定继续？")) return;
      const keep = { co: DB.co, cats: DB.cats, items: DB.items, meta: DB.meta };
      DB = emptyDB();
      DB.co = keep.co; DB.cats = keep.cats; DB.items = keep.items; DB.meta = Object.assign(DB.meta, keep.meta);
      save(true); render(); toast("记录已清空");
      break;
    }
    case "clear-all": {
      if (!confirm("将删除全部数据并回到建立台账页面，此操作不可恢复。\n确定继续？")) return;
      localStorage.removeItem(KEY);
      DB = null; UI.view = "overview";
      VIEWS.setup();
      toast("已清空全部数据");
      break;
    }
    case "ai-cfg": if (typeof AI !== "undefined") AI.openSettings(); break;
  }
});

/* ============================ 清单编辑弹窗 ============================ */
function editItem(id){
  const it = id ? DB.items.find(x => x.id === id) : null;
  modal({
    title: it ? "编辑风险点" : "新增风险点",
    body:
      '<datalist id="deptOpts">' + deptOptions().map(o => '<option value="' + esc(o) + '"></option>').join("") + "</datalist>" +
      '<div class="grid g2">' +
      '<label class="field" style="grid-column:1/-1"><span>风险点名称 *</span><input class="inp" id="itPoint" value="' + esc(it ? it.point : "") + '" placeholder="如：原料离地存放"></label>' +
      '<label class="field"><span>环节</span><input class="inp" id="itEnv" value="' + esc(it ? it.env : (DB.items[0] ? DB.items[0].env : "其他")) + '"></label>' +
      '<label class="field"><span>责任部门（可输入或从下拉选）</span><input class="inp" id="itDept" list="deptOpts" value="' + esc(it ? it.dept : (DB.co.depts[0] || "")) + '"></label>' +
      '<label class="field"><span>检查频次</span><select class="inp" id="itPeriod">' + PERIODS.map(p => '<option' + (it && it.period === p ? " selected" : "") + ">" + p + "</option>").join("") + "</select></label>" +
      '<label class="field"><span>管控目标</span><input class="inp" id="itTarget" value="' + esc(it ? it.target : "") + '" placeholder="如：无交叉污染"></label>' +
      '<label class="field" style="grid-column:1/-1"><span>风险描述</span><textarea class="inp" id="itDesc" style="min-height:56px">' + esc(it ? it.desc : "") + "</textarea></label>" +
      '<label class="field" style="grid-column:1/-1"><span>管控措施 *</span><textarea class="inp" id="itMeasure" style="min-height:64px" placeholder="写明谁、做什么、达到什么标准">' + esc(it ? it.measure : "") + "</textarea></label>" +
      "</div>",
    foot: (it ? '<button class="btn danger" data-act="item-del" data-v="' + esc(it.id) + '">删除</button>' : "") +
      '<button class="btn" data-close="1">取消</button><button class="btn pri" data-act="item-save" data-v="' + esc(id || "") + '">保存</button>'
  });
}

document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.getAttribute("data-act"), v = el.getAttribute("data-v");
  if (act === "item-save"){
    const point = ($("#itPoint") || {}).value || "";
    const measure = ($("#itMeasure") || {}).value || "";
    if (!point.trim()){ toast("请填写风险点名称", "ng"); return; }
    if (!measure.trim()){ toast("请填写管控措施", "ng"); return; }
    const obj = {
      point: point.trim(),
      env: ($("#itEnv") || {}).value || "其他",
      dept: ($("#itDept") || {}).value || "",
      period: ($("#itPeriod") || {}).value || "日",
      target: ($("#itTarget") || {}).value || "",
      desc: ($("#itDesc") || {}).value || "",
      measure: measure.trim()
    };
    if (v){
      const it = DB.items.find(x => x.id === v);
      Object.assign(it, obj);
    }else{
      DB.items.push(Object.assign({
        id: "x-" + uid(), no: 0, code: "自定义", sub: "", on: true, added: TODAY, freqText: ""
      }, obj));
    }
    closeModal(); save(true); render(); toast("已保存");
  }
  if (act === "item-del"){
    if (!confirm("确定删除该风险点？已产生的检查记录不会被删除。")) return;
    DB.items = DB.items.filter(x => x.id !== v);
    closeModal(); save(true); render(); toast("已删除");
  }
});

/* ============================ 部门悬浮清单 ============================ */
function deptItems(raw){
  return (DB ? DB.items : []).filter(i => i.dept === raw);
}

function ensureDeptTip(){
  let tip = document.getElementById("deptTip");
  if (!tip){
    tip = document.createElement("div");
    tip.id = "deptTip";
    tip.className = "dept-tip";
    tip.addEventListener("mouseenter", () => clearTimeout(tipTimer));
    tip.addEventListener("mouseleave", () => hideDeptTipSoon());
    document.body.appendChild(tip);
  }
  return tip;
}

let tipTimer = 0;

function showDeptTip(el){
  clearTimeout(tipTimer);
  const raw = el.getAttribute("data-tip-dept");
  const list = deptItems(raw);
  const tip = ensureDeptTip();
  tip.innerHTML = '<div class="dept-tip-h"><b>' + esc(raw) + '</b><span>' + list.length + ' 项检查内容</span></div>' +
    '<ul>' + (list.length ? list.map(it =>
      '<li><span class="e">' + esc(it.env) + '</span><span class="p">' + esc(it.point) + "</span>" +
      '<span class="tag ' + PERIOD_CLS[it.period] + '">' + PERIOD_LABEL[it.period] + "</span></li>").join("")
      : '<li class="empty-li">该部门下暂无条目</li>') + "</ul>" +
    (list.length > 6 ? '<div class="dept-tip-f">可在此区域内滚动查看全部</div>' : "");
  tip.classList.add("on");

  const r = el.getBoundingClientRect();
  const w = 360, gap = 10;
  tip.style.width = w + "px";
  const h = Math.min(tip.scrollHeight, 280);
  let left = r.right + gap;
  if (left + w > window.innerWidth - 10) left = Math.max(10, r.left - w - gap);
  let top = r.top - 10;
  if (top + h > window.innerHeight - 10) top = Math.max(10, window.innerHeight - h - 10);
  tip.style.left = left + "px";
  tip.style.top = top + "px";
}

function hideDeptTipSoon(){
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => {
    const tip = document.getElementById("deptTip");
    if (tip) tip.classList.remove("on");
  }, 180);
}

document.addEventListener("mouseover", e => {
  const el = e.target.closest && e.target.closest("[data-tip-dept]");
  if (el) showDeptTip(el);
});
document.addEventListener("mouseout", e => {
  const el = e.target.closest && e.target.closest("[data-tip-dept]");
  if (el && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest("#deptTip"))) hideDeptTipSoon();
});
window.addEventListener("scroll", () => {
  const tip = document.getElementById("deptTip");
  if (tip) tip.classList.remove("on");
}, true);

/* ============================ 部门对照 ============================ */
function openDeptMap(){
  const raws = deptRawList();
  if (!raws.length){ toast("当前清单没有责任部门信息", "ng"); return; }
  const rows = raws.map(r => {
    const cur = (DB.deptMap && DB.deptMap[r.name]) || "";
    return '<tr><td><span class="dept-hover" data-tip-dept="' + esc(r.name) + '"><b>' + esc(r.name) + '</b>' +
      '<span class="dept-n">' + r.n + ' 项</span></span></td>' +
      '<td><input class="inp sm" data-dept="' + esc(r.name) + '" value="' + esc(cur) + '" placeholder="留空表示沿用原名"></td>' +
      '<td class="mini" data-preview="' + esc(r.name) + '">' + (cur ? esc(cur) : "沿用原名") + "</td></tr>";
  }).join("");
  modal({
    title: "责任部门对照",
    wide: true,
    body:
      '<div class="hint" style="margin-bottom:10px">清单里的部门是通用写法（生产部、品控部…）。把你企业实际的部门名填在右边，检查项、报告表头和整改责任人都会显示成你的叫法；留空则沿用原名。<b>鼠标停在左侧部门名上</b>可以查看它包含哪些检查项，便于判断该交给哪个部门。</div>' +
      '<div class="twrap"><table class="tbl"><thead><tr><th style="width:180px">清单中的部门</th><th>本企业对应部门</th><th style="width:180px">显示效果</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<div class="row" style="margin-top:10px"><button class="btn sm" data-act="dept-auto">按顺序自动匹配</button>' +
      '<span class="hint">把你在设置里填的部门按顺序对应到出现次数最多的清单部门，可再手工调整。</span></div>',
    foot: '<button class="btn" data-close="1">取消</button><button class="btn pri" data-act="dept-save">保存对照</button>'
  });
}

function saveDeptMap(){
  const map = {};
  $$("[data-dept]").forEach(inp => {
    const raw = inp.getAttribute("data-dept");
    const val = String(inp.value || "").trim();
    if (val && val !== raw) map[raw] = val;
  });
  DB.deptMap = map;
  save(true);
  closeModal();
  render();
  toast(map && Object.keys(map).length ? "已对照 " + Object.keys(map).length + " 个部门" : "已清除部门对照", "ok");
}

function autoDeptMap(){
  const raws = deptRawList();
  const co = DB.co.depts || [];
  if (!co.length){ toast("请先在「数据与企业信息」填写本企业部门", "ng"); return; }
  let n = 0;
  raws.forEach((r, i) => {
    const inp = document.querySelector('[data-dept="' + r.name + '"]');
    if (!inp) return;
    if (i < co.length){ inp.value = co[i]; n++; }
  });
  $$("[data-dept]").forEach(inp => {
    const pv = document.querySelector('[data-preview="' + inp.getAttribute("data-dept") + '"]');
    if (pv) pv.textContent = inp.value.trim() || "沿用原名";
  });
  toast("已按顺序匹配 " + n + " 项，请核对后保存");
}

/* ============================ 待确认清单（AI 生成 / 模板导入） ============================ */
let PENDING = null;
let PENDING_SRC = "ai";

function openLoading(text){
  modal({ title: "请稍候", body: '<div class="empty" style="padding:28px"><b>' + esc(text) + '</b><div class="mini" style="margin-top:8px">AI 处理通常需要 20~60 秒，请勿关闭页面</div></div>', foot: false });
}

function openPending(list, opts){
  opts = opts || {};
  if (!list || !list.length){ toast("没有识别到可用的风险点", "ng"); return; }
  PENDING = list;
  PENDING_SRC = opts.source || "ai";
  const rows = list.map((it, i) =>
    "<tr><td><input type=\"checkbox\" data-pick=\"" + i + "\" checked></td>" +
    "<td>" + esc(it.env) + "</td>" +
    "<td><b>" + esc(it.point) + "</b>" + (it.desc ? '<div class="mini clamp2">' + esc(it.desc) + "</div>" : "") + "</td>" +
    '<td class="mini clamp2">' + esc(it.measure) + "</td>" +
    '<td><span class="tag ' + PERIOD_CLS[it.period] + '">' + PERIOD_LABEL[it.period] + "</span></td>" +
    "<td>" + esc(deptName(it.dept)) + "</td></tr>").join("");
  modal({
    title: (opts.source === "import" ? "导入清单 · 待确认" : "AI 补充风险点 · 待确认") + "（" + list.length + " 条）",
    wide: true,
    body:
      '<div class="hint" style="margin-bottom:10px">' +
      (opts.source === "import"
        ? "以下是 AI 从「" + esc(opts.name || "文件") + "」中识别出的风险点，请核对后选择处理方式。"
        : "以下是 AI 针对当前类别补充的风险点，请核对后勾选需要的条目。") +
      "取消勾选的不会写入。</div>" +
      '<div class="twrap" style="max-height:52vh"><table class="tbl"><thead><tr>' +
      '<th style="width:36px"><input type="checkbox" id="pickAll" checked data-act="pending-all"></th>' +
      "<th style=\"width:130px\">环节</th><th style=\"width:240px\">风险点</th><th>管控措施</th><th style=\"width:80px\">频次</th><th style=\"width:110px\">部门</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>",
    foot:
      '<button class="btn" data-close="1">取消</button>' +
      (opts.source === "import" ? '<button class="btn" data-act="pending-commit" data-mode="replace">替换现有清单</button>' : "") +
      '<button class="btn pri" data-act="pending-commit" data-mode="append">追加到清单</button>'
  });
}

function commitPending(mode){
  if (!PENDING) return;
  const picks = $$("[data-pick]").filter(x => x.checked).map(x => Number(x.getAttribute("data-pick")));
  const list = picks.map(i => PENDING[i]).filter(Boolean);
  if (!list.length){ toast("请至少勾选一条", "ng"); return; }
  if (mode === "replace" && !confirm("替换会清空当前清单（历史检查记录仍保留，但被替换的条目会停用）。确定继续？")) return;

  const stamp = TODAY;
  const make = it => ({
    id: "ai-" + uid(), no: 0, code: it.code || (mode === "replace" ? "导入" : "补充"),
    env: it.env || "其他", sub: "", point: it.point, desc: it.desc || "",
    measure: it.measure || "", target: it.target || "", period: it.period || "日",
    freqText: it.freqText || "", dept: it.dept || "", on: true, added: stamp,
    source: PENDING_SRC
  });

  let added = 0, skipped = 0;
  if (mode === "append"){
    const exist = new Set(DB.items.map(i => i.point));
    list.forEach(it => {
      if (exist.has(it.point)){ skipped++; return; }
      exist.add(it.point);
      DB.items.push(make(it));
      added++;
    });
  } else {
    const oldByPoint = new Map(DB.items.map(i => [i.point, i]));
    const next = [];
    list.forEach(it => {
      const old = oldByPoint.get(it.point);
      const obj = make(it);
      if (old){ obj.id = old.id; obj.added = old.added || stamp; obj.code = old.code || obj.code; }
      next.push(obj);
    });
    const kept = DB.items.filter(i => !list.some(x => x.point === i.point));
    kept.forEach(i => { i.on = false; i.archived = true; next.push(i); });
    DB.items = next;
    added = list.length;
  }

  PENDING = null;
  save(true);
  closeModal();
  render();
  toast("已" + (mode === "replace" ? "替换" : "追加") + " " + added + " 条" + (skipped ? "，跳过重复 " + skipped + " 条" : ""), "ok");
}

/* ============================ 入口：AI 补充 / 导入 ============================ */
async function genItemsFlow(){
  if (!AI.ready()){ AI.openSettings(); return; }
  if (!DB.cats.length){ toast("请先建立台账", "ng"); return; }
  openLoading("AI 正在根据当前类别生成补充风险点…");
  try{
    const list = await AI.genItems();
    closeModal();
    if (!list.length){ toast("AI 没有返回可用条目，可换个模型再试", "ng"); return; }
    openPending(list, { source:"ai" });
  }catch(e){
    closeModal();
    toast(e.message || "生成失败", "ng");
  }
}

function importListFlow(){
  if (!AI.ready()){ AI.openSettings(); return; }
  const inp = $("#fileIn");
  inp.value = "";
  inp.onchange = async () => {
    const f = (inp.files || [])[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024){ toast("文件超过 20 MB，请拆分后再试", "ng"); return; }
    openLoading("正在解析文件…");
    try{
      const doc = await readDoc(f);
      if (!doc.text && !doc.images.length) throw new Error(doc.error || "没有读取到文字，建议截图后上传");
      openLoading("AI 正在识别清单结构，请稍候…");
      const list = await AI.parseItems(doc);
      closeModal();
      if (!list.length) throw new Error("没有识别到风险点，请确认文件是风险管控清单表格");
      openPending(list, { source:"import", name:f.name });
    }catch(e){
      closeModal();
      toast(e.message || "导入失败", "ng");
    }
  };
  inp.click();
}
