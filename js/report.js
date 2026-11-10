/* =========================================================================
   报告模型 / 规则初稿 / Word 导出 / 打印预览
   ========================================================================= */
"use strict";

/* ============================ 规则初稿（无 AI 也能出稿） ============================ */
function ruleWeek(ws){
  const we = DT.weekEnd(ws);
  const st = statsRange(ws, we);
  const F = weekFacts(ws);
  const parts = [];
  parts.push("本周（" + DT.md(ws) + " 至 " + DT.md(we) + "）应开展日管控 " + st.planned + " 天，实际完成 " + st.done + " 天，执行率 " + pct(st.done, st.planned) +
    "%" + (st.off ? "，其中停产 / 休息 " + st.off + " 天" : "") + "，形成零风险报告 " + st.clean + " 天" +
    (st.missed.length ? "；" + st.missed.map(d => DT.md(d)).join("、") + " 未形成检查记录，需核实原因并补充说明" : "") + "。");

  if (F.issues.length){
    const byEnv = {};
    F.issues.forEach(i => { byEnv[i.env || "其他"] = (byEnv[i.env || "其他"] || 0) + 1; });
    const top = Object.keys(byEnv).sort((a, b) => byEnv[b] - byEnv[a])[0];
    parts.push("本周日管控与周期性排查共发现不符合项 " + F.issues.length + " 项（日管控 " + F.issues.filter(i => i.src === "日管控").length +
      " 项，周期性排查 " + F.issues.filter(i => i.src !== "日管控").length + " 项），主要集中在「" + top + "」环节（" + byEnv[top] + " 项）。" +
      "主要问题：" + F.issues.slice(0, 4).map(i => i.point).join("、") + "。");
  }else{
    parts.push("本周日管控与周期性排查未发现新的不符合项，各环节管控措施执行有效，未出现系统性风险征兆。");
  }

  const reps = Object.keys(F.recent).filter(id => F.recent[id] >= 2);
  parts.push(reps.length
    ? "重复性问题方面，" + reps.slice(0, 3).map(id => { const it = DB.items.find(x => x.id === id); return "「" + (it ? it.point : id) + "」近 4 周出现 " + F.recent[id] + " 次"; }).join("；") +
      "，说明临时纠正未触及根本原因，应从设施条件、制度流程和人员培训层面分析并落实整改。"
    : "本周未出现重复发生的风险隐患，现场纠正措施基本有效。");

  const left = F.left.filter(isOpen);
  const over = left.filter(isOverdue);
  parts.push((F.left.length
    ? "上周遗留问题 " + F.left.length + " 项，本周已关闭 " + (F.left.length - left.length) + " 项，仍在整改或待验证 " + left.length + " 项" +
      (over.length ? "，其中 " + over.length + " 项已超过整改期限（" + over.map(i => i.point).join("、") + "），须由责任部门书面说明原因并限期完成" : "") + "。"
    : "上周无遗留问题。") +
    "综合判断，本周" + ((F.issues.some(i => i.level === "重大") || over.length) ? "存在需要重点关注的风险，须在下周排查中跟踪验证" : "食品安全风险总体可控，未发现可能导致食品安全事故的重大隐患") + "。");

  const plan = [];
  if (over.length) plan.push("督办超期未整改事项，责任部门书面说明原因并明确完成时间（食品安全总监）");
  if (reps.length) plan.push("针对重复性问题开展原因分析，从设施与制度层面制定纠正措施（品控部）");
  if (st.missed.length) plan.push("补齐漏检日期的检查记录，明确未执行原因（食品安全员）");
  const doneP = itemsByPeriod("周", we);
  const missP = doneP.filter(it => !(F.per[it.id]));
  if (missP.length) plan.push("完成本周未开展的周期性排查项目：" + missP.slice(0, 3).map(it => it.point).join("、") + "（责任部门）");
  if (F.issues.filter(isOpen).length) plan.push("跟踪本周未关闭不符合项的整改与验证，确保按期销号（食品安全总监）");
  plan.push("按清单持续开展日管控，重点关注人员卫生、原料贮存与生产过程控制（生产部）");
  plan.push("整理本周记录并归档，准备下周排查重点（品控部）");

  return { analysis: parts.join("\n\n"), plan: plan.slice(0, 7) };
}

function ruleMonth(mk){
  const F = monthFacts(mk);
  const st = F.st;
  const parts = [];
  parts.push("本月应开展日管控 " + st.planned + " 天" + (st.off ? "（停产 / 休息 " + st.off + " 天）" : "") + "，实际完成 " + st.done + " 天，执行率 " +
    pct(st.done, st.planned) + "%；累计检查 " + st.checks + " 项次，发现不符合 " + st.ng + " 项，符合率 " + pct(st.ok, st.checks) + "%，形成零风险报告 " + st.clean + " 天" +
    (st.missed.length ? "；漏检 " + st.missed.length + " 天（" + st.missed.map(d => DT.md(d)).join("、") + "）" : "") + "。");

  const diff = F.found.length - F.prevFound.length;
  parts.push("本月共发现不符合项 " + F.found.length + " 项（含周期性排查）" + (F.prevFound.length || F.found.length
    ? "，上月 " + F.prevFound.length + " 项，" + (diff > 0 ? "增加 " + diff + " 项" : diff < 0 ? "减少 " + (-diff) + " 项" : "持平")
    : "") + "。" +
    (Object.keys(F.byEnv).length ? "按环节分布，" + Object.keys(F.byEnv).sort((a, b) => F.byEnv[b] - F.byEnv[a]).slice(0, 3).map(k => "「" + k + "」" + F.byEnv[k] + " 项").join("、") + "。" : ""));

  const closed = F.found.filter(i => !isOpen(i)).length;
  const openN = F.found.filter(isOpen).length;
  const over = DB.issues.filter(isOverdue);
  parts.push("整改方面，本月不符合项已关闭 " + closed + " 项，未关闭 " + openN + " 项，关闭率 " + pct(closed, F.found.length) + "%" +
    (over.length ? "；截至今日仍有 " + over.length + " 项超过整改期限（" + over.slice(0, 3).map(i => i.point).join("、") + "），需在本次调度会上明确责任与完成时限" : "") + "。");

  const weeks = F.weeks.map(ws => DB.weeks[DT.weekKey(ws)]).filter(Boolean);
  const archived = weeks.filter(w => w.savedAt).length;
  parts.push("本月共 " + F.weeks.length + " 个排查周，已归档周排查报告 " + archived + " 份" +
    (F.weeks.length > archived ? "，尚有 " + (F.weeks.length - archived) + " 周未归档，需补做并归档" : "") +
    "；月度检查项目完成 " + F.done + " / " + F.items.length + " 项。" +
    "综合研判，本月" + (over.length ? "风险总体可控但存在逾期未整改事项，需提级督办" : "食品安全风险总体可控，各项管控措施基本落实到位") + "。");

  const plan = [];
  if (over.length) plan.push("对逾期未整改事项实行销号管理，责任部门书面说明并明确完成时限（食品安全总监）");
  const reps = Object.keys(F.recent).filter(id => F.recent[id] >= 2);
  if (reps.length) plan.push("对「" + (DB.items.find(x => x.id === reps[0]) || {}).point + "」等重复性问题开展专项原因分析（品控部）");
  if (F.found.length) plan.push("复核本月不符合项整改效果，组织现场验证并关闭（食品安全总监）");
  if (st.missed.length) plan.push("规范日管控执行，杜绝漏检，明确缺检追责与补录要求（食品安全员）");
  plan.push("按计划开展下月月度检查项目，重点覆盖设备、计量与追溯（设备部、品控部）");
  plan.push("组织一次食品安全专题培训并考核，覆盖一线操作人员（人事行政部）");
  plan.push("完善风险管控清单，结合本月问题补充针对性风险点（品控部）");
  plan.push("做好季度监管自查准备，整理三本账归档资料（品控部）");

  return { analysis: parts.join("\n\n"), plan: plan.slice(0, 8) };
}

/* ============================ 文档模型 ============================ */
function ymd(d){ return String(d||"").split("-").join(""); }

function modelDay(d){
  const rec = DB.days[d] || {};
  const off = rec.status === "off";
  const items = itemsByPeriod("日", d);
  const res = rec.results || {};
  const B = [];
  B.push({ t:"title", x:"每日食品安全检查记录" });
  B.push({ t:"meta", x:(DB.co.name || "") });
  B.push({ t:"kv", rows:[
    [{ label:"检查日期" }, { value:DT.cn(d) + " " + DT.wd(d) }, { label:"生产状态" }, { value: off ? "停产 / 休息" : "正常生产" }],
    [{ label:"检查人" }, { value:(rec.by || "") + "（食品安全员）" }, { label:"依据" }, { value:"食品安全风险管控清单" }]
  ]});
  if (off){
    B.push({ t:"p", x:"本日" + (rec.note || "停产 / 休息") + "，按规定暂不执行日管控检查，如实记录、存档备查。" });
  }else{
    const rows = [["序号", "环节", "风险点", "结果", "发现的问题"]];
    items.forEach((it, i) => {
      const v = res[it.id];
      const iss = v === "ng" ? findIssue("日管控", d, it.id) : null;
      rows.push([String(i + 1), it.env || "", it.point, v === "ok" ? "√" : v === "ng" ? "×" : v === "na" ? "/" : "未查", iss ? (iss.desc || "") : ""]);
    });
    B.push({ t:"table", widths:[6, 16, 26, 7, 45], aligns:["center","left","left","center","left"], rows:rows });
    B.push({ t:"note", x:"结果栏：√ 符合　× 不符合　/ 不涉及（当日无该项作业）" });
    if (rec.note) B.push({ t:"p", x:"备注：" + rec.note });
    const ng = items.filter(it => res[it.id] === "ng").length;
    B.push({ t:"p", x:"本日共检查 " + items.length + " 项，其中不符合 " + ng + " 项，" + (ng ? "已登记不符合项并明确整改责任人与期限。" : "未发现不符合项，属零风险报告。") });
  }
  B.push({ t:"sig", cols:["检查人签字：", "食品安全员：", "日期："] });
  return { title:"每日食品安全检查记录", blocks:B, ftr:DB.co.name + " · 日管控" };
}

function modelWeek(ws){
  const we = DT.weekEnd(ws);
  const rec = weekRec(ws, false) || {};
  const F = weekFacts(ws);
  const B = [];
  B.push({ t:"title", x:"每周食品安全排查治理报告" });
  B.push({ t:"meta", x:DB.co.name || "" });
  B.push({ t:"kv", rows:[
    [{ label:"排查周期" }, { value:DT.cn(ws) + " 至 " + DT.cn(we) }, { label:"第几周" }, { value:"第 " + DT.isoWeek(ws) + " 周" }],
    [{ label:"主持人" }, { value:(rec.host || DB.co.director || "") + "（食品安全总监）" }, { label:"排查日期" }, { value:rec.date || we }]
  ]});
  B.push({ t:"p", x:"参加人员：" + (rec.att || [DB.co.director].concat(DB.co.officers).filter(Boolean).join("、") || "—") });

  B.push({ t:"h2", x:"一、本周日管控执行情况" });
  const st = F.st;
  B.push({ t:"p", x:"本周应开展日管控 " + st.planned + " 天，实际完成 " + st.done + " 天，执行率 " + pct(st.done, st.planned) + "%" +
    (st.off ? "，停产 / 休息 " + st.off + " 天" : "") + "，零风险报告 " + st.clean + " 天；累计检查 " + st.checks + " 项次，不符合 " + st.ng + " 项。" +
    (st.missed.length ? "未检查日期：" + st.missed.map(d => DT.md(d)).join("、") + "。" : "") });

  B.push({ t:"h2", x:"二、本周发现的风险隐患" });
  if (F.issues.length){
    B.push({ t:"table", widths:[6, 20, 34, 8, 14, 10, 8], aligns:["center","left","left","center","left","center","center"],
      rows:[["序号","环节","问题描述","等级","责任人","期限","状态"]].concat(F.issues.map((i, k) =>
        [String(k+1), i.env || "", (i.point + (i.desc ? "：" + i.desc : "")), i.level, i.owner || "", i.deadline || "", (STATUS[i.status] || "整改中")])) });
  }else B.push({ t:"p", x:"本周未发现风险隐患。" });

  B.push({ t:"h2", x:"三、上周遗留问题整改情况" });
  if (F.left.length){
    B.push({ t:"table", widths:[6, 26, 30, 12, 14, 12], aligns:["center","left","left","center","left","center"],
      rows:[["序号","风险点","整改情况","责任人","期限","状态"]].concat(F.left.map((i, k) =>
        [String(k+1), i.point, i.action || "整改中", i.owner || "", i.deadline || "", isOverdue(i) ? "逾期" : (STATUS[i.status] || "整改中")])) });
  }else B.push({ t:"p", x:"上周无遗留问题。" });

  B.push({ t:"h2", x:"四、周期性排查项目" });
  const per = rec.periodic || {};
  if (F.items.length){
    B.push({ t:"table", widths:[6, 30, 40, 10], aligns:["center","left","left","center"],
      rows:[["序号","风险点","管控措施","结果"]].concat(F.items.map((it, k) =>
        [String(k+1), it.point, it.measure || "", per[it.id] === "ok" ? "√" : per[it.id] === "ng" ? "×" : per[it.id] === "na" ? "/" : "未查"])) });
  }else B.push({ t:"p", x:"本周无周期性排查项目。" });

  B.push({ t:"h2", x:"五、重复性问题提示" });
  const reps = Object.keys(F.recent).filter(id => F.recent[id] >= 2);
  B.push({ t:"p", x: reps.length
    ? reps.map(id => { const it = DB.items.find(x => x.id === id); return "「" + (it ? it.point : id) + "」近 4 周出现 " + F.recent[id] + " 次"; }).join("；") +
      "，属重复性问题，需从设施、制度或人员培训层面查找根本原因，防止再次发生。"
    : "近 4 周未出现重复性问题。" });

  B.push({ t:"h2", x:"六、分析研判与下周工作重点" });
  const ana = rec.analysis || ruleWeek(ws).analysis;
  ana.split(/\n+/).filter(Boolean).forEach(p => B.push({ t:"p", x:p }));
  const plan = (rec.plan && rec.plan.length) ? rec.plan : ruleWeek(ws).plan;
  B.push({ t:"h3", x:"下周工作重点" });
  plan.filter(Boolean).forEach((p, i) => B.push({ t:"num", n:i+1, x:p }));

  B.push({ t:"sig", cols:["食品安全总监：", "食品安全员：", "日期："] });
  return { title:"每周食品安全排查治理报告", blocks:B, ftr:DB.co.name + " · 周排查" };
}

function modelMonth(mk){
  const F = monthFacts(mk);
  const rec = monthRec(mk, false) || {};
  const B = [];
  B.push({ t:"title", x:"每月食品安全调度会议纪要" });
  B.push({ t:"meta", x:DB.co.name || "" });
  B.push({ t:"kv", rows:[
    [{ label:"会议时间" }, { value:rec.date || F.me }, { label:"会议地点" }, { value:rec.place || DB.co.place || "" }],
    [{ label:"主持人" }, { value:(rec.host || DB.co.chief || "") + "（主要负责人）" }, { label:"汇报人" }, { value:(rec.reporter || DB.co.director || "") + "（食品安全总监）" }]
  ]});
  B.push({ t:"p", x:"参加人员：" + (rec.att || [DB.co.chief, DB.co.director].concat(DB.co.officers).filter(Boolean).join("、") || "—") });

  B.push({ t:"h2", x:"一、本月日管控执行情况" });
  B.push({ t:"p", x:"本月应开展日管控 " + F.st.planned + " 天" + (F.st.off ? "（停产 / 休息 " + F.st.off + " 天）" : "") + "，实际完成 " + F.st.done +
    " 天，执行率 " + pct(F.st.done, F.st.planned) + "%；累计检查 " + F.st.checks + " 项次，其中符合 " + F.st.ok + " 项、不符合 " + F.st.ng +
    " 项，符合率 " + pct(F.st.ok, F.st.checks) + "%，零风险报告 " + F.st.clean + " 天。" +
    (F.st.missed.length ? "漏检 " + F.st.missed.length + " 天（" + F.st.missed.map(d => DT.md(d)).join("、") + "）。" : "") });

  B.push({ t:"h2", x:"二、风险隐患按环节分布" });
  const envs = Object.keys(F.byEnv).sort((a, b) => F.byEnv[b] - F.byEnv[a]);
  B.push({ t:"p", x: envs.length ? envs.map(k => "「" + k + "」" + F.byEnv[k] + " 项").join("；") + "。本月共发现不符合项 " + F.found.length + " 项。" : "本月未发现风险隐患。" });

  B.push({ t:"h2", x:"三、各周排查结论" });
  const weekRows = [["周次", "起止日期", "分析研判摘要", "归档"]];
  F.weeks.forEach(ws => {
    const w = DB.weeks[DT.weekKey(ws)] || {};
    weekRows.push(["第 " + DT.isoWeek(ws) + " 周", DT.md(ws) + " ~ " + DT.md(DT.weekEnd(ws)), (w.analysis || "").slice(0, 160), w.savedAt ? "已归档" : "未归档"]);
  });
  B.push({ t:"table", widths:[10, 22, 60, 10], aligns:["center","center","left","center"], rows:weekRows });

  B.push({ t:"h2", x:"四、不符合项整改关闭情况" });
  if (F.found.length){
    B.push({ t:"table", widths:[16, 22, 32, 16, 14], aligns:["left","left","left","center","center"],
      rows:[["风险点","问题描述","整改情况","责任人","状态"]].concat(F.found.map(i =>
        [i.point, i.desc || "", i.action || "整改中", i.owner || "", isOverdue(i) ? "逾期" : (STATUS[i.status] || "整改中")])) });
  }else B.push({ t:"p", x:"本月无不符合项。" });

  B.push({ t:"h2", x:"五、月度检查项目完成情况" });
  const mon = rec.monthly || {};
  if (F.items.length){
    B.push({ t:"table", widths:[6, 40, 30, 10], aligns:["center","left","left","center"],
      rows:[["序号","风险点","责任部门","结果"]].concat(F.items.map((it, k) =>
        [String(k+1), it.point, deptName(it.dept), mon[it.id] === "ok" ? "√" : mon[it.id] === "ng" ? "×" : mon[it.id] === "na" ? "/" : "未查"])) });
  }else B.push({ t:"p", x:"本月无月度检查项目。" });

  B.push({ t:"h2", x:"六、年度事项到期提醒" });
  const annual = activeItems(TODAY).filter(it => it.period === "年");
  const ares = rec.annual || {};
  if (annual.length){
    B.push({ t:"table", widths:[46, 20, 16, 12], aligns:["left","left","center","center"],
      rows:[["年度事项","责任部门","计划月份","状态"]].concat(annual.map(it =>
        [it.point, deptName(it.dept), (ares[it.id] || {}).month || "", (ares[it.id] || {}).done ? "已完成" : "未完成"])) });
  }else B.push({ t:"p", x:"无年度事项。" });

  B.push({ t:"h2", x:"七、上月调度事项落实情况" });
  const lp = (rec.lastPlan && rec.lastPlan.length) ? rec.lastPlan : ((DB.months[DT.prevMonth(mk)] || {}).plan || []).map(t => ({ text:t, done:false }));
  if (lp.length) lp.forEach((p, i) => B.push({ t:"num", n:i+1, x:p.text + "（" + (p.done ? "已落实" : "未落实") + "）" }));
  else B.push({ t:"p", x:"上月无部署事项。" });

  B.push({ t:"h2", x:"八、分析研判与下月工作调度" });
  const ana = rec.analysis || ruleMonth(mk).analysis;
  ana.split(/\n+/).filter(Boolean).forEach(p => B.push({ t:"p", x:p }));
  const plan = (rec.plan && rec.plan.length) ? rec.plan : ruleMonth(mk).plan;
  B.push({ t:"h3", x:"会议决定事项" });
  plan.filter(Boolean).forEach((p, i) => B.push({ t:"num", n:i+1, x:p }));

  B.push({ t:"sig", cols:["主持人：", "汇报人：", "记录人：", "日期："] });
  return { title:"每月食品安全调度会议纪要", blocks:B, ftr:DB.co.name + " · 月调度" };
}

/* ============================ 演示数据（仅在无数据且带 ?demo=1 时生成） ============================ */
function seedDemo(){
  const built = buildItems([2], {});
  DB = emptyDB();
  DB.co = {
    name: "示例 · 稻丰米业有限公司",
    chief: "王志强",
    director: "李敏",
    officers: ["张伟", "陈静"],
    depts: ["生产部", "品控部", "仓储部", "设备部", "人事行政部"],
    license: "SC10132058200071",
    addr: "",
    place: "公司二楼会议室"
  };
  DB.cats = [2];
  DB.items = built.items;
  DB.meta.demo = true;
  DB.meta.created = DT.add(TODAY, -20);

  const daily = DB.items.filter(it => it.period === "日");
  const weekly = DB.items.filter(it => it.period === "周");
  const monthlyIt = DB.items.filter(it => it.period === "月");

  for (let i = 19; i >= 0; i--){
    const d = DT.add(TODAY, -i);
    if (DT.dow(d) === 7 && i > 2){ DB.days[d] = { status:"off", results:{}, by:"张伟", note:"周日休息", savedAt:d + "T17:00:00" }; continue; }
    const res = {};
    daily.forEach(it => { res[it.id] = "ok"; });
    const rec = { status:"normal", results:res, by: i % 2 ? "张伟" : "陈静", note:"", savedAt: d === TODAY ? "" : d + "T16:30:00" };
    if (i === 1 || i === 6){
      const kw = i === 1 ? "堆放" : "洗手";
      const it = daily.find(x => x.point.indexOf(kw) >= 0) || daily[Math.min(4, daily.length-1)];
      res[it.id] = "ng";
      DB.issues.push({
        id: "NC" + pad(DB.issues.length + 1, 4), date:d, itemId:it.id, code:it.code, env:it.env, point:it.point,
        desc: i === 1 ? "辅料库 2 袋食用盐未离地存放，直接放在地面托盘外" : "包装间洗手池旁洗手液空瓶未及时更换",
        level:"一般", owner:it.dept, deadline:DT.add(d, i === 1 ? 5 : 3), status:"整改中", action:"", verifier:"", closedOn:"", src:"日管控", by:rec.by
      });
    }
    if (i === 9){
      const it = daily[Math.min(2, daily.length-1)];
      res[it.id] = "ng";
      DB.issues.push({
        id: "NC" + pad(DB.issues.length + 1, 4), date:d, itemId:it.id, code:it.code, env:it.env, point:it.point,
        desc:"成品库温湿度记录连续两天未填写", level:"较大", owner:"仓储部", deadline:DT.add(d, 3), status:"已关闭",
        action:"已补录记录并加装温湿度自动记录仪，库管员每日巡检签字", verifier:"李敏", closedOn:DT.add(d, 3), src:"日管控", by:"张伟"
      });
    }
    DB.days[d] = rec;
  }

  const lastWs = DT.add(DT.weekStart(TODAY), -7);
  const per = {};
  weekly.forEach(it => { per[it.id] = "ok"; });
  DB.weeks[DT.weekKey(lastWs)] = {
    periodic: per, host:"李敏", att:"李敏、张伟、陈静、王强", date:DT.weekEnd(lastWs), savedAt:DT.weekEnd(lastWs) + "T17:00:00",
    analysis: ruleWeek(lastWs).analysis, plan: ruleWeek(lastWs).plan
  };

  const lastMk = DT.prevMonth(DT.monthKey(TODAY));
  const mon = {};
  monthlyIt.forEach(it => { mon[it.id] = "ok"; });
  DB.months[lastMk] = {
    monthly: mon, annual:{}, lastPlan:[], host:"王志强", reporter:"李敏", att:"王志强、李敏、张伟、陈静", date:DT.monthEnd(lastMk), place:"公司二楼会议室",
    savedAt:DT.monthEnd(lastMk) + "T15:00:00", analysis: ruleMonth(lastMk).analysis, plan: ruleMonth(lastMk).plan
  };

  save(true);
  UI.view = "overview";
  UI.day = TODAY;
  UI.week = DT.weekStart(TODAY);
  UI.month = DT.monthKey(TODAY);
}

/* ============================ 导出 ============================ */
const EXPORT = {
  async day(d){
    const M = modelDay(d);
    try{
      const bytes = await CORE.buildDocx({ title:M.title, company:DB.co.name, hdrLeft:DB.co.name, hdrRight:M.title, ftr:M.ftr }, M.blocks);
      CORE.download(bytes, "每日食品安全检查记录_" + DT.md(d).replace("-", "") + ".docx");
      toast("已导出 Word", "ok");
    }catch(e){ toast("导出失败：" + (e.message || e), "ng"); }
  },
  async week(ws){
    const M = modelWeek(ws);
    try{
      const bytes = await CORE.buildDocx({ title:M.title, company:DB.co.name, hdrLeft:DB.co.name, hdrRight:M.title, ftr:M.ftr }, M.blocks);
      CORE.download(bytes, "每周食品安全排查治理报告_第" + DT.isoWeek(ws) + "周_" + ymd(ws) + ".docx");
      toast("已导出 Word", "ok");
    }catch(e){ toast("导出失败：" + (e.message || e), "ng"); }
  },
  async month(mk){
    const M = modelMonth(mk);
    try{
      const bytes = await CORE.buildDocx({ title:M.title, company:DB.co.name, hdrLeft:DB.co.name, hdrRight:M.title, ftr:M.ftr }, M.blocks);
      CORE.download(bytes, "每月食品安全调度会议纪要_" + mk.replace("-", "") + ".docx");
      toast("已导出 Word", "ok");
    }catch(e){ toast("导出失败：" + (e.message || e), "ng"); }
  },
  async items(){
    const rows = [["序号", "类别", "环节", "子环节", "风险点", "风险描述", "管控措施", "管控目标", "清单原文频次", "检查频次", "责任部门", "状态"]];
    DB.items.forEach((it, i) => rows.push([String(i+1), catName(it.no), it.env, it.sub, it.point, it.desc, it.measure, it.target, it.freqText, it.period, deptName(it.dept), it.on ? "启用" : "停用"]));
    try{
      const bytes = await CORE.buildXlsx([{ name:"风险管控清单", widths:[6,16,16,16,22,40,52,20,26,10,12,8], rows, head:1, land:true }]);
      CORE.download(bytes, "风险管控清单_" + DB.co.name + "_" + TODAY + ".xlsx");
      toast("已导出 Excel", "ok");
    }catch(e){ toast("导出失败：" + (e.message || e), "ng"); }
  },
  async issues(){
    const rows = [["编号", "发现日期", "来源", "环节", "风险点", "问题描述", "风险等级", "整改责任人", "整改期限", "状态", "整改情况", "验证人", "关闭日期"]];
    DB.issues.forEach(i => rows.push([i.id, i.date, i.src, i.env, i.point, i.desc, i.level, i.owner, i.deadline, isOverdue(i) ? "逾期" : (STATUS[i.status] || "整改中"), i.action, i.verifier, i.closedOn]));
    try{
      const bytes = await CORE.buildXlsx([{ name:"不符合项汇总", widths:[9,12,9,16,22,42,9,14,12,9,42,10,12], rows, head:1, land:true }]);
      CORE.download(bytes, "不符合项汇总_" + DB.co.name + "_" + TODAY + ".xlsx");
      toast("已导出 Excel", "ok");
    }catch(e){ toast("导出失败：" + (e.message || e), "ng"); }
  }
};

/* ============================ 打印 / 记录单预览 ============================ */
function docHTML(kind, key){
  const M = kind === "day" ? modelDay(key) : kind === "week" ? modelWeek(key) : modelMonth(key);
  const body = M.blocks.map(b => {
    if (b.t === "title") return "<h2>" + esc(b.x) + "</h2>";
    if (b.t === "meta") return '<div class="subline">' + esc(b.x) + "</div>";
    if (b.t === "h2") return "<h3 class=\"sec\">" + esc(b.x) + "</h3>";
    if (b.t === "h3") return "<h3 class=\"sec\" style=\"font-weight:600\">" + esc(b.x) + "</h3>";
    if (b.t === "p") return '<p class="body">' + esc(b.x) + "</p>";
    if (b.t === "note") return '<p style="font-size:11.5px;color:#666">' + esc(b.x) + "</p>";
    if (b.t === "num") return '<p style="font-size:13px;line-height:1.9">' + (b.n || "") + "．" + esc(b.x) + "</p>";
    if (b.t === "table") return "<table>" + (b.rows || []).map((r, ri) =>
      "<tr>" + r.map((c, ci) => ri === 0 ? "<th>" + esc(c) + "</th>" : "<td" + (ci === 3 ? ' class="c"' : "") + ">" + esc(c) + "</td>").join("") + "</tr>").join("") + "</table>";
    if (b.t === "kv") return '<div class="meta">' + b.rows.map(r =>
      r.map(c => "<span>" + esc(c.label) + "：<b>" + esc(c.value) + "</b></span>").join("")).join("") + "</div>";
    if (b.t === "sig") return '<div class="sign">' + b.cols.map(c => "<span>" + esc(c) + "<i></i></span>").join("") + "</div>";
    return "";
  }).join("");
  return '<div class="doc" id="printDocInner">' + body + "</div>";
}

function previewDoc(kind, key){
  modal({
    title: kind === "day" ? "每日食品安全检查记录" : kind === "week" ? "每周食品安全排查治理报告" : "每月食品安全调度会议纪要",
    wide: true,
    body: docHTML(kind, key),
    foot: '<button class="btn" data-close="1">关闭</button>' +
      '<button class="btn" data-act="doc-print">打印</button>' +
      '<button class="btn pri" data-act="doc-word" data-kind="' + kind + '" data-key="' + key + '">导出 Word</button>'
  });
}

function openDayDoc(){
  const rec = dayRec(UI.day, false);
  if (rec && !rec.savedAt){
    const items = itemsByPeriod("日", UI.day);
    const miss = rec.status === "off" ? 0 : items.filter(it => !rec.results[it.id]).length;
    if (miss){ toast("还有 " + miss + " 项未检查，建议完成后再生成记录单", "ng"); }
  }
  previewDoc("day", UI.day);
}

function printDoc(kind, key){ previewDoc(kind, key); }

document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.getAttribute("data-act");
  if (act === "doc-print"){
    const html = ($("#printDocInner") || {}).outerHTML || "";
    const area = $("#printArea");
    area.innerHTML = html;
    area.style.display = "block";
    document.body.classList.add("printing");
    window.print();
    setTimeout(() => { area.style.display = "none"; area.innerHTML = ""; document.body.classList.remove("printing"); }, 400);
  }
  if (act === "doc-word"){
    const kind = el.getAttribute("data-kind"), key = el.getAttribute("data-key");
    if (kind === "day") EXPORT.day(key);
    else if (kind === "week") EXPORT.week(key);
    else EXPORT.month(key);
  }
});
