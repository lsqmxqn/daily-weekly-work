/* =========================================================================
   日管控 · 周排查 · 月调度 —— 离线工作台
   数据层 / 视图层 / 事件层
   依赖：js/data.js（98 类清单）、js/core.js（ZIP/DOCX/XLSX/文档解析）
   ========================================================================= */
"use strict";

/* ============================ 基础工具 ============================ */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const KEY = "dwq_offline_v1";
const DRAFT = "dwq_draft_";

function esc(s){
  return String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function pad(n,w){ return String(n).padStart(w||2,"0"); }
function uid(){ return Math.random().toString(36).slice(2,10); }
function pct(a,b){ return b ? Math.round(a/b*100) : 0; }
function sum(o){ return Object.keys(o).reduce((n,k)=>n+(Number(o[k])||0),0); }
function uniq(arr){ return Array.from(new Set(arr)); }

let toastTimer = 0;
function toast(msg, kind){
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast on" + (kind ? " " + kind : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.className = "toast"; }, 2600);
}

function modal(opts){
  const m = $("#modal"), mask = $("#mask");
  m.className = "modal" + (opts.wide ? " wide" : "");
  m.innerHTML =
    '<div class="modal-h"><h3>' + esc(opts.title||"") + '</h3><button class="x" data-close="1" aria-label="关闭">×</button></div>' +
    '<div class="modal-b">' + (opts.body||"") + '</div>' +
    (opts.foot === false ? "" : '<div class="modal-f">' + (opts.foot || '<button class="btn" data-close="1">关闭</button>') + '</div>');
  mask.classList.add("on");
  if (opts.onMount) opts.onMount(m);
}
function closeModal(){ $("#mask").classList.remove("on"); $("#modal").innerHTML = ""; }

/* ============================ 日期工具 ============================ */
const DT = {
  today(){
    const d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
  },
  parse(s){
    const p = String(s||"").split("-").map(Number);
    return new Date(p[0], (p[1]||1)-1, p[2]||1);
  },
  fmt(d){ return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate()); },
  add(s, n){ const d = DT.parse(s); d.setDate(d.getDate()+n); return DT.fmt(d); },
  dow(s){ const w = DT.parse(s).getDay(); return w===0 ? 7 : w; },
  weekStart(s){ return DT.add(s, -(DT.dow(s)-1)); },
  weekEnd(s){ return DT.add(DT.weekStart(s), 6); },
  isoWeek(s){
    const d = DT.parse(s);
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() + 3 - ((t.getDay()+6)%7));
    const w1 = new Date(t.getFullYear(), 0, 4);
    w1.setDate(w1.getDate() + 3 - ((w1.getDay()+6)%7));
    return 1 + Math.round((t - w1) / 604800000);
  },
  weekKey(s){
    const d = DT.parse(s);
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() + 3 - ((t.getDay()+6)%7));
    return t.getFullYear() + "-W" + pad(DT.isoWeek(s));
  },
  weekOfKey(k){
    const y = Number(k.split("-W")[0]), w = Number(k.split("-W")[1]);
    const jan4 = new Date(y, 0, 4);
    const ws = new Date(jan4);
    ws.setDate(jan4.getDate() - ((jan4.getDay()+6)%7) + (w-1)*7);
    return DT.fmt(ws);
  },
  monthKey(s){ return String(s).slice(0,7); },
  monthStart(mk){ return mk + "-01"; },
  monthEnd(mk){
    const y = Number(mk.slice(0,4)), m = Number(mk.slice(5,7));
    return DT.fmt(new Date(y, m, 0));
  },
  nextMonth(mk){
    const y = Number(mk.slice(0,4)), m = Number(mk.slice(5,7));
    return (m===12 ? (y+1)+"-01" : y+"-"+pad(m+1));
  },
  prevMonth(mk){
    const y = Number(mk.slice(0,4)), m = Number(mk.slice(5,7));
    return (m===1 ? (y-1)+"-12" : y+"-"+pad(m-1));
  },
  cn(s){
    const d = DT.parse(s);
    return d.getFullYear() + "年" + (d.getMonth()+1) + "月" + d.getDate() + "日";
  },
  cnMonth(mk){ return Number(mk.slice(0,4)) + "年" + Number(mk.slice(5,7)) + "月"; },
  wd(s){ return "周" + "一二三四五六日"[DT.dow(s)-1]; },
  md(s){ return String(s).slice(5).replace("-","-"); },
  daysBetween(a,b){ return Math.round((DT.parse(b) - DT.parse(a)) / 86400000); }
};
const TODAY = DT.today();

/* ============================ 清单来源 ============================ */
const DATA = window.DWQ_DATA;
const CATS = DATA.CATS;
const IND_LABEL = DATA.IND;
const PERIODS = ["日","周","月","年","按需"];
const PERIOD_LABEL = {日:"日管控",周:"周排查",月:"月度检查",年:"年度事项",按需:"按需开展"};
const PERIOD_HINT = {
  日:"每天逐项勾选，形成每日检查记录",
  周:"在每周排查中核查",
  月:"每月任意一周检查",
  年:"到期提醒，进入月调度",
  按需:"发生时开展并记录"
};
const PERIOD_CLS = {日:"day",周:"week",月:"month",年:"year",按需:"need"};
const LEVELS = ["一般","较大","重大"];
const STATUS = { "整改中":"整改中", "待验证":"待验证", "已关闭":"已关闭" };

/* 责任部门对照：清单里的部门名 → 本企业实际部门名 */
function deptName(raw){
  if (!raw) return "";
  try{
    const m = DB && DB.deptMap;
    const v = m && m[raw];
    return (v && String(v).trim()) ? String(v).trim() : raw;
  }catch(e){ return raw; }
}
function deptRawList(){
  const m = {};
  (DB ? DB.items : []).forEach(it => { if (it.dept) m[it.dept] = (m[it.dept] || 0) + 1; });
  return Object.keys(m).sort((a, b) => m[b] - m[a]).map(k => ({ name:k, n:m[k] }));
}
function mappedCount(){
  if (!DB || !DB.deptMap) return 0;
  return Object.keys(DB.deptMap).filter(k => DB.deptMap[k] && DB.deptMap[k] !== k).length;
}
function deptOptions(){
  const set = [];
  if (DB) DB.co.depts.forEach(d => set.push(d));
  deptRawList().forEach(d => set.push(d.name));
  return uniq(set.filter(Boolean));
}

function catByNo(no){ return CATS.find(c => c.no === Number(no)); }
function catName(no){ const c = catByNo(no); return c ? c.name : ("类别" + no); }

/* ============================ 数据层 ============================ */
let DB = null;

function emptyDB(){
  return {
    v: 1,
    co: { name:"", chief:"", director:"", officers:[], depts:[], license:"", addr:"", place:"公司会议室" },
    cats: [],
    deptMap: {},
    items: [],
    days: {},
    weeks: {},
    months: {},
    issues: [],
    meta: { created: TODAY, demo: false }
  };
}

function loadDB(){
  try{
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    const e = emptyDB();
    Object.keys(e).forEach(k => { if (j[k] == null) j[k] = e[k]; });
    j.co = Object.assign(e.co, j.co || {});
    if (!Array.isArray(j.items)) j.items = [];
    return j;
  }catch(err){
    console.error(err);
    return null;
  }
}

let saveTimer = 0;
function save(now){
  const doSave = () => {
    try{
      localStorage.setItem(KEY, JSON.stringify(DB));
      paintSide();
    }catch(err){
      toast("保存失败：浏览器存储空间不足，请先导出备份后清理历史记录", "ng");
    }
  };
  if (now) { clearTimeout(saveTimer); doSave(); return; }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 260);
}

function storageKB(){
  try{ return Math.round((localStorage.getItem(KEY) || "").length / 1024); }catch(e){ return 0; }
}

/* ============================ 清单构建 ============================ */
function buildItems(nos, variants){
  const out = [], seen = new Set();
  let merged = 0;
  nos.forEach(no => {
    const cat = catByNo(no);
    if (!cat) return;
    cat.items.forEach(it => {
      const v = variants && variants[no];
      if (v && v.length && it.variant && v.indexOf(it.variant) < 0) return;
      const dk = it.env + "|" + it.name;
      if (seen.has(dk)) { merged++; return; }
      seen.add(dk);
      out.push({
        id: no + "-" + it.i,
        no: no,
        code: (cat.code ? cat.code + "-" : "") + pad(it.i),
        env: it.env || "其他",
        sub: it.sub || "",
        point: it.name,
        desc: it.desc || "",
        measure: it.measure || "",
        target: it.target || "",
        period: PERIODS.indexOf(it.period) >= 0 ? it.period : "日",
        freqText: it.freqText || "",
        dept: it.dept || "",
        on: true,
        added: ""
      });
    });
  });
  return { items: out, merged };
}

function previewCount(nos, variants){
  const r = buildItems(nos, variants);
  const c = { total: r.items.length, merged: r.merged, 日:0, 周:0, 月:0, 年:0, 按需:0 };
  r.items.forEach(it => { c[it.period] = (c[it.period]||0) + 1; });
  return c;
}

/* 生效日期：新增风险点从当天起计入 */
function activeItems(date){
  const d = date || TODAY;
  return DB.items.filter(it => it.on && (!it.added || it.added <= d));
}
function itemsByPeriod(p, date){
  return activeItems(date).filter(it => it.period === p);
}

/* ============================ 不符合项 ============================ */
function nextNcId(){
  let n = 0;
  DB.issues.forEach(i => { const m = /^NC(\d+)$/.exec(i.id || ""); if (m) n = Math.max(n, Number(m[1])); });
  return "NC" + pad(n + 1, 4);
}
function findIssue(src, date, itemId){
  return DB.issues.find(i => i.src === src && i.date === date && i.itemId === itemId && i.status !== "已关闭");
}
function isOpen(i){ return i.status !== "已关闭"; }
function isOverdue(i){
  return isOpen(i) && i.deadline && i.deadline < TODAY;
}
function createIssue(o){
  const it = DB.items.find(x => x.id === o.itemId);
  const iss = Object.assign({
    id: nextNcId(),
    date: TODAY,
    itemId: "",
    code: it ? it.code : "",
    env: it ? it.env : "其他",
    point: it ? it.point : "其他问题",
    desc: "",
    level: "一般",
    owner: it ? deptName(it.dept) : "",
    deadline: DT.add(TODAY, 5),
    status: "整改中",
    action: "",
    verifier: "",
    closedOn: "",
    src: "手工",
    by: ""
  }, o);
  DB.issues.unshift(iss);
  save();
  return iss;
}
function openIssues(){ return DB.issues.filter(isOpen); }
function overdueIssues(){ return DB.issues.filter(isOverdue); }

/* ============================ 记录访问 ============================ */
function dayRec(d, create){
  if (!DB.days[d] && create) DB.days[d] = { status:"normal", results:{}, by:"", note:"", savedAt:"" };
  return DB.days[d] || null;
}
function weekRec(s, create){
  const k = DT.weekKey(s);
  if (!DB.weeks[k] && create) DB.weeks[k] = { periodic:{}, analysis:"", plan:[], host:"", att:"", date:DT.weekEnd(s), savedAt:"" };
  return DB.weeks[k] || null;
}
function monthRec(mk, create){
  if (!DB.months[mk] && create) DB.months[mk] = { monthly:{}, annual:{}, lastPlan:[], analysis:"", plan:[], host:"", reporter:"", att:"", date:DT.monthEnd(mk), place:"", savedAt:"" };
  return DB.months[mk] || null;
}

/* ============================ 日状态 ============================ */
function dayState(d){
  if (d > TODAY) return "future";
  const rec = DB.days[d];
  if (rec && rec.status === "off") return "off";
  if (rec){
    const items = itemsByPeriod("日", d);
    const res = rec.results || {};
    const filled = items.filter(it => res[it.id]).length;
    if (items.length && filled === items.length){
      return items.some(it => res[it.id] === "ng") ? "issue" : "clean";
    }
    if (filled) return "partial";
  }
  if (d === TODAY) return "todo";
  if (DB.meta.created && d < DB.meta.created) return "before";
  return "missed";
}

function statsRange(from, to){
  const st = { planned:0, done:0, off:0, missed:[], checks:0, ok:0, ng:0, na:0, clean:0 };
  let d = from;
  while (d <= to && d <= TODAY){
    const s = dayState(d);
    if (s !== "future" && s !== "before"){
      if (s === "off"){ st.off++; }
      else if (s === "todo"){ }
      else {
        st.planned++;
        if (s === "clean" || s === "issue"){
          st.done++;
          const r = (DB.days[d].results) || {};
          itemsByPeriod("日", d).forEach(it => {
            const v = r[it.id];
            if (v === "ok"){ st.ok++; st.checks++; }
            else if (v === "ng"){ st.ng++; st.checks++; }
            else if (v === "na"){ st.na++; }
          });
          if (s === "clean") st.clean++;
        } else st.missed.push(d);
      }
    }
    d = DT.add(d, 1);
  }
  return st;
}

/* ============================ 界面状态 ============================ */
const UI = {
  view: "overview",
  day: TODAY,
  week: DT.weekStart(TODAY),
  month: DT.monthKey(TODAY),
  cal: DT.monthKey(TODAY),
  ncFilter: "open",
  ncMonth: "",
  listPeriod: "日",
  setup: { ind:"生产", nos:[], q:"", variants:{}, step:1, err:"" },
  fold: {},
  compact: false,
  issueOpen: "",
  ready: false
};

const TITLES = {
  setup: "建立台账", overview: "工作台概览", daily: "日管控", weekly: "周排查",
  monthly: "月调度", issues: "不符合项汇总", list: "风险管控清单", data: "数据与企业信息", help: "使用说明"
};
const NAV = [
  ["g", "日常"],
  ["overview", "工作台概览", "i-home"],
  ["daily", "日管控", "i-day"],
  ["weekly", "周排查", "i-week"],
  ["monthly", "月调度", "i-month"],
  ["issues", "不符合项汇总", "i-nc"],
  ["g", "配置"],
  ["list", "风险管控清单", "i-list"],
  ["data", "数据与企业信息", "i-db"],
  ["help", "使用说明", "i-help"]
];

function go(v){
  UI.view = v;
  try{ history.replaceState(null, "", "#" + v); }catch(e){ location.hash = v; }
  render();
  window.scrollTo(0, 0);
  $("#side").classList.remove("open");
}

function navHTML(){
  const open = DB ? openIssues().length : 0;
  return NAV.map(n => {
    if (n[0] === "g") return '<div class="nav-group">' + n[1] + '</div>';
    const on = UI.view === n[0] ? " on" : "";
    const cnt = (n[0] === "issues" && open) ? '<span class="cnt">' + open + '</span>' : '';
    return '<button data-act="nav" data-v="' + n[0] + '" class="' + on.trim() + '">' +
      '<svg><use href="#' + n[2] + '"/></svg>' + n[1] + cnt + '</button>';
  }).join("");
}

function paintSide(){
  $("#nav").innerHTML = navHTML();
  const cfg = (typeof AI !== "undefined") ? AI.config() : null;
  $("#sideFoot").innerHTML =
    '<div><span class="dot ' + (cfg && cfg.key ? "on" : "off") + '"></span>AI ' + (cfg && cfg.key ? "已接入" : "未配置") + '</div>' +
    '<div style="margin-top:4px">数据仅保存在本机浏览器<br>换电脑前请导出备份</div>';
}

/* ============================ 渲染入口 ============================ */
const VIEWS = {};

function render(){
  if (!DB){ VIEWS.setup(); return; }
  $("#pageTitle").textContent = TITLES[UI.view] || "工作台";
  $("#ctx").textContent = (DB.co.name || "未填写企业") + " · " + (DB.cats.length ? DB.cats.map(c => catName(c)).join("、") : "未选择类别");
  $("#todayTxt").textContent = DT.cn(TODAY) + " " + DT.wd(TODAY);
  paintSide();
  const fn = VIEWS[UI.view] || VIEWS.overview;
  fn();
}

function setView(html){
  $("#view").innerHTML = html;
}

/* ============================ 视图：首次设置 ============================ */
VIEWS.setup = function(){
  $("#pageTitle").textContent = "建立台账";
  $("#ctx").textContent = "";
  paintSide();
  const u = UI.setup;
  const list = CATS.filter(c => c.ind === u.ind && (!u.q || (c.name + c.full).indexOf(u.q) >= 0));
  const cards = ["生产","餐饮","流通"].map(k => {
    const n = CATS.filter(c => c.ind === k).length;
    const desc = k === "生产" ? "食品及食品添加剂生产企业" : k === "餐饮" ? "餐饮服务企业、集中用餐单位食堂" : "食品销售、农产品市场、网络食品经营";
    return '<button class="ind' + (u.ind === k ? " on" : "") + '" data-act="setup-ind" data-v="' + k + '">' +
      "<b>" + IND_LABEL[k] + "</b><span>" + desc + "</span><span class=\"n\">" + n + " 类清单</span></button>";
  }).join("");
  const grid = list.map(c => {
    const on = u.nos.indexOf(c.no) >= 0;
    return '<button class="cat' + (on ? " on" : "") + '" data-act="setup-cat" data-v="' + c.no + '" title="' + esc(c.full) + '">' +
      '<span class="no">' + pad(c.no) + '</span><span class="nm">' + esc(c.name) + '</span>' +
      (on ? '<span class="tick">✓</span>' : "") + "</button>";
  }).join("");
  const pv = u.nos.length ? previewCount(u.nos, u.variants) : null;
  const selected = u.nos.map(no => {
    const c = catByNo(no);
    return '<span class="chip on">' + esc(c.name) + ' <b data-act="setup-rm" data-v="' + no + '" style="cursor:pointer;margin-left:3px">×</b></span>';
  }).join("");

  setView(
    '<div class="setup-hero"><h1>先把清单建起来，之后每天只做勾选</h1>' +
    "<p>依据《食品生产经营企业落实食品安全主体责任监督管理规定》。按风险管控清单每天检查、每周排查、每月调度，" +
    "系统自动汇总生成《每日食品安全检查记录》《每周食品安全排查治理报告》《每月食品安全调度会议纪要》。" +
    "全部数据保存在本机浏览器，不联网也能用；AI 仅在你自己配置接口后才会联网。</p></div>" +

    '<div class="step"><div class="step-h"><span class="n">1</span><h2>选择行业与食品类别</h2>' +
    '<span class="muted">共 ' + CATS.length + ' 类清单，可多选合并</span></div>' +
    '<div class="ind-cards">' + cards + "</div>" +
    '<div class="cat-search"><span class="search-box"><svg><use href="#i-search"/></svg>' +
    '<input class="inp" id="catQ" placeholder="搜索类别，如：大米、糕点、餐饮、食品添加剂" value="' + esc(u.q) + '"></span>' +
    '<span class="muted">当前 ' + list.length + ' 个类别' + (u.nos.length ? '，已选 <b>' + u.nos.length + '</b> 个' : "") + "</span></div>" +
    '<div class="cat-grid">' + (grid || '<div class="empty">没有匹配的类别</div>') + "</div>" +
    (u.nos.length ? '<div class="chips" style="margin-top:10px">' + selected + '</div>' : "") +
    "</div>" +

    (pv ? '<div class="card">' + variantHTML(u) + '<div class="card-h"><h3>将加载 ' + pv.total + ' 个风险点</h3>' +
      '<span class="sub">多类别合并时自动去重' + (pv.merged ? "，已合并 " + pv.merged + " 条重复项" : "") + "</span></div>" +
      '<div class="dist">' + PERIODS.map(p => '<span>' + PERIOD_LABEL[p] + '<b>' + (pv[p]||0) + '</b>项</span>').join("") + "</div>" +
      '<div class="hint" style="margin-top:8px">日管控每天约 ' + (pv["日"]||0) + ' 项；条目越多越细，但每日填报耗时也越长。一般企业单类别即可。</div></div>' : "") +

    '<div class="step"><div class="step-h"><span class="n">2</span><h2>填写企业信息</h2>' +
    '<span class="muted">用于记录表头与签字栏</span></div>' +
    '<div class="card"><div class="grid g2">' +
    '<label class="field"><span>企业名称 *</span><input class="inp" id="coName" placeholder="××食品有限公司" value="' + esc(u.name||"") + '"></label>' +
    '<label class="field"><span>生产许可证编号（选填）</span><input class="inp" id="coLic" placeholder="SC10132058200071" value="' + esc(u.lic||"") + '"></label>' +
    '<label class="field"><span>主要负责人</span><input class="inp" id="coChief" placeholder="姓名" value="' + esc(u.chief||"") + '"></label>' +
    '<label class="field"><span>食品安全总监</span><input class="inp" id="coDirector" placeholder="姓名" value="' + esc(u.director||"") + '"></label>' +
    '<label class="field"><span>食品安全员（多人用顿号分隔）</span><input class="inp" id="coOfficers" placeholder="张三、李四" value="' + esc(u.officers||"") + '"></label>' +
    '<label class="field"><span>责任部门（顿号分隔，供整改责任人快选）</span><input class="inp" id="coDepts" placeholder="生产部、品控部、仓储部、设备部" value="' + esc(u.depts||"") + '"></label>' +
    "</div>" +
    (u.err ? '<p class="err" style="margin-top:6px">' + esc(u.err) + "</p>" : "") +
    '<div class="row" style="margin-top:10px"><button class="btn pri" data-act="setup-go">生成台账并开始使用</button>' +
    '<span class="hint">生成后仍可在「风险管控清单」中停用、新增或调整频次。</span></div></div></div>'
  );
};

/* ============================ 视图：概览 ============================ */
function calendarHTML(){
  const mk = UI.cal;
  const first = DT.monthStart(mk);
  const lead = DT.dow(first) - 1;
  const days = Number(DT.monthEnd(mk).slice(8));
  let cells = "";
  for (let i=0;i<lead;i++) cells += '<button class="blank"></button>';
  for (let d=1; d<=days; d++){
    const ds = mk + "-" + pad(d);
    const st = dayState(ds);
    const cls = ["", st === "clean" ? "clean" : st === "issue" ? "issue" : st === "off" ? "off" : st === "missed" ? "missed" : "",
      ds === TODAY ? "today" : "", ds === UI.day ? "sel" : ""].join(" ").trim();
    const mark = st === "clean" ? "✓" : st === "issue" ? "!" : st === "off" ? "停" : st === "missed" ? "漏" : "";
    cells += '<button class="' + cls + '" data-act="cal-day" data-v="' + ds + '">' + d + (mark ? "<i>" + mark + "</i>" : "") + "</button>";
  }
  return '<div class="cal">' + ["一","二","三","四","五","六","日"].map(w => '<div class="wd">' + w + "</div>").join("") + cells + "</div>" +
    '<div class="cal-legend"><span><i style="background:#2f9e6b"></i>已完成·无问题</span>' +
    '<span><i style="background:#c0392b"></i>已完成·有不符合</span>' +
    '<span><i style="background:#c9ced1"></i>停产/休息</span>' +
    '<span><i style="background:#e3c983"></i>漏检</span>' +
    '<span><i style="background:#fff;border:1px solid #e3e6e8"></i>未到期</span></div>';
}

function variantHTML(u){
  const groups = [];
  u.nos.forEach(no => {
    const c = catByNo(no);
    const vs = uniq(c.items.map(i => i.variant).filter(Boolean));
    if (vs.length > 1) groups.push({ no, name:c.name, vs });
  });
  if (!groups.length) return "";
  return groups.map(g => {
    const sel = (u.variants && u.variants[g.no]) || [];
    return '<div class="card-h" style="margin-bottom:6px"><h3>' + esc(g.name) + ' · 选择品种</h3>' +
      '<span class="sub">该清单按品种细分，可多选；不选默认全部</span></div>' +
      '<div class="chips" style="margin-bottom:12px">' + g.vs.map(v =>
        '<button class="chip' + (sel.indexOf(v) >= 0 ? " on" : "") + '" data-act="setup-var" data-cat="' + g.no + '" data-v="' + esc(v) + '">' + esc(v) + "</button>").join("") + "</div>";
  }).join("");
}

VIEWS.overview = function(){
  const mk = DT.monthKey(TODAY);
  const st = statsRange(DT.monthStart(mk), DT.monthEnd(mk));
  const monthIssues = DB.issues.filter(i => DT.monthKey(i.date) === mk);
  const open = openIssues(), over = overdueIssues();
  const rec = DB.days[TODAY];
  const dayItems = itemsByPeriod("日", TODAY);
  const done = rec && rec.results ? dayItems.filter(it => rec.results[it.id]).length : 0;

  let todayTxt = "今日日管控尚未开始，共 " + dayItems.length + " 项";
  let todayBtn = "开始检查";
  if (DB.days[TODAY] && DB.days[TODAY].status === "off"){ todayTxt = "今日已登记为停产 / 停业"; todayBtn = "查看记录"; }
  else if (dayState(TODAY) === "clean"){ todayTxt = "今日日管控已完成，零风险报告"; todayBtn = "查看记录单"; }
  else if (dayState(TODAY) === "issue"){ todayTxt = "今日已完成，发现 " + Object.values(rec.results).filter(v => v === "ng").length + " 项不符合"; todayBtn = "查看记录单"; }
  else if (done > 0){ todayTxt = "今日日管控进行中（" + done + " / " + dayItems.length + "）"; todayBtn = "继续检查"; }

  const annual = activeItems(TODAY).filter(it => it.period === "年");
  const annualDue = annual.filter(it => {
    const r = monthRec(mk, false);
    return !(r && r.annual && r.annual[it.id]);
  }).slice(0, 6);

  const recent = DB.issues.filter(isOpen).slice(0, 5);

  setView(
    '<div class="card today-card"><div style="flex:1"><div class="lb">今日任务 · ' + DT.cn(TODAY) + " " + DT.wd(TODAY) + "</div>" +
    '<div class="big">' + esc(todayTxt) + "</div></div>" +
    '<button class="btn pri" data-act="go-day" data-v="' + TODAY + '">' + todayBtn + "</button></div>" +

    '<div class="kpis" style="margin-top:14px">' +
    kpi("本月日管控执行率", pct(st.done, st.planned) + "%", "应检 " + st.planned + " 天 · 实检 " + st.done + " 天 · 停业 " + st.off + " 天") +
    kpi("本月不符合项", monthIssues.length, "日管控与周排查合计") +
    kpi("未关闭", open.length, "含待验证", open.length ? "" : "") +
    kpi("已逾期", over.length, "超过整改期限", over.length ? "ng" : "") +
    kpi("本月零风险报告", st.clean + " 天", "占已检 " + (st.done ? pct(st.clean, st.done) : 0) + "%") +
    "</div>" +

    '<div class="grid g2" style="margin-top:14px">' +
    '<div class="card"><div class="card-h"><h3>' + DT.cnMonth(mk) + " · 日管控日历</h3><span class=\"sub\">点日期直接补录或查看</span>" +
    '<div class="sp"></div><button class="btn sm ghost" data-act="cal-prev">‹</button><button class="btn sm ghost" data-act="cal-next">›</button></div>' +
    calendarHTML() + "</div>" +

    '<div class="card"><div class="card-h"><h3>近 14 天</h3><span class="sub">绿=无问题　红=有不符合　灰=停产　黄=漏检</span></div>' +
    barsHTML() +
    '<div class="card-h" style="margin-top:16px"><h3>待关闭的不符合项</h3><div class="sp"></div>' +
    '<button class="btn sm ghost" data-act="nav" data-v="issues">全部 →</button></div>' +
    (recent.length ? recent.map(i =>
      '<div class="row" style="padding:6px 0;border-bottom:1px solid #eef1f2;font-size:12.5px">' +
      '<span class="tag ' + (isOverdue(i) ? "r" : "y") + '">' + (isOverdue(i) ? "逾期" : (STATUS[i.status] || "整改中")) + "</span>" +
      '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(i.point) + "</span>" +
      '<span class="muted" style="font-size:11.5px">' + esc(i.deadline || "") + "</span></div>").join("")
      : '<div class="empty" style="padding:14px">暂无未关闭的不符合项</div>') +
    "</div></div>" +

    '<div class="card"><div class="card-h"><h3>本月年度事项</h3><span class="sub">频次为「年度事项」的风险点，在月调度中登记</span>' +
    '<div class="sp"></div><button class="btn sm ghost" data-act="nav" data-v="monthly">月调度 →</button></div>' +
    (annualDue.length ? annualDue.map(it =>
      '<div class="row" style="padding:5px 0;font-size:12.5px"><span class="tag year">年度</span>' +
      '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(it.point) + "</span>" +
      '<span class="muted" style="font-size:11.5px">' + esc(deptName(it.dept)) + "</span></div>").join("")
      : '<div class="empty" style="padding:14px">' + (annual.length ? "本月年度事项已全部登记" : "当前清单没有年度事项") + "</div>") +
    "</div>"
  );
};

function kpi(k, v, d, cls){
  return '<div class="kpi ' + (cls||"") + '"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div><div class="d">' + esc(d||"") + "</div></div>";
}

function barsHTML(){
  const arr = [];
  for (let i=13;i>=0;i--) arr.push(DT.add(TODAY, -i));
  return '<div class="bars">' + arr.map(d => {
    const s = dayState(d);
    const cls = s === "clean" ? "clean" : s === "issue" ? "issue" : s === "off" ? "off" : s === "missed" ? "missed" : "";
    return '<div class="b ' + cls + '" title="' + d + " " + DT.wd(d) + '"></div>';
  }).join("") + "</div>" +
  '<div class="row" style="justify-content:space-between;font-size:11px;color:var(--mut2);margin-top:5px">' +
  "<span>" + DT.md(arr[0]) + "</span><span>今天</span></div>";
}

/* ============================ 视图：日管控 ============================ */
VIEWS.daily = function(){
  const d = UI.day;
  const rec = dayRec(d, false);
  const off = rec && rec.status === "off";
  const items = itemsByPeriod("日", d);
  const res = (rec && rec.results) || {};
  const n = items.filter(it => res[it.id]).length;

  setView(
    '<div class="sticky-tools">' +
    '<div class="pager"><button data-act="day-move" data-v="-1">‹</button>' +
    '<span class="cur">' + DT.md(d) + " " + DT.wd(d) + "</span>" +
    '<button data-act="day-move" data-v="1"' + (d >= TODAY ? " disabled" : "") + ">›</button>" +
    '<input class="inp sm" type="date" id="dayPick" value="' + d + '" max="' + TODAY + '" style="width:138px;margin-left:4px"></div>' +
    '<div class="seg sm"><button data-act="day-status" data-v="normal" class="' + (off ? "" : "on") + '">正常生产</button>' +
    '<button data-act="day-status" data-v="off" class="' + (off ? "on" : "") + '">停产/休息</button></div>' +
    '<div class="sp"></div>' +
    (off ? "" : '<div class="prog"><div class="txt">已检查 ' + n + " / " + items.length + " · " + pct(n, items.length) + '%</div>' +
      '<div class="bar"><i style="width:' + pct(n, items.length) + '%"></i></div></div>') +
    '<button class="btn sm ok" data-act="day-allok"' + (off || n === items.length ? " disabled" : "") + '><svg><use href="#i-check"/></svg>其余全部符合</button>' +
    '<button class="btn sm pri" data-act="day-save"><svg><use href="#i-save"/></svg>保存记录</button>' +
    '<button class="btn sm ghost" data-act="compact">' + (UI.compact ? "详细" : "紧凑") + '</button>' +
    '<button class="btn sm" data-act="day-doc"><svg><use href="#i-word"/></svg>记录单</button>' +
    "</div>" +

    (DB.meta.demo ? '<div class="card" style="background:#fffbe9;border-color:#efdfae"><div class="hint">当前是演示数据。正式使用前，请到「数据与企业信息」清空记录后重新建立台账。</div></div>' : "") +

    '<div id="quickBox" style="margin-top:12px"></div>' +

    '<div class="card"><div class="row">' +
    '<label class="field" style="flex:1;margin:0;min-width:180px"><span>检查人（食品安全员）</span>' +
    '<input class="inp sm" data-bind="day.by" value="' + esc((rec && rec.by) || (DB.co.officers[0]||"")) + '" placeholder="姓名"></label>' +
    '<label class="field" style="flex:2;margin:0;min-width:240px"><span>当日备注</span>' +
    '<input class="inp sm" data-bind="day.note" value="' + esc((rec && rec.note) || "") + '" placeholder="班次、特殊情况说明"></label>' +
    "</div>" + (off ? '<div class="hint" style="margin-top:8px">停产 / 休息日如实记录即可，无需逐项检查。</div>' : "") + "</div>" +

    '<div style="margin-top:12px">' + (off ? offCard(rec) : (items.length ? checkListHTML(items, res, d) : emptyListHTML())) + "</div>"
  );
  if (typeof Quick !== "undefined") Quick.render("daily");
};

function offCard(rec){
  return '<div class="card"><div class="card-h"><h3>本日登记为停产 / 休息</h3></div>' +
    '<label class="field"><span>原因说明</span><input class="inp" data-bind="day.note" value="' + esc((rec && rec.note) || "") + '" placeholder="如：周日休息、设备检修、国庆假期"></label>' +
    '<div class="hint">停产期间可暂不执行日管控，但应如实记录、存档备查。切换回「正常生产」后可继续检查。</div></div>';
}

function emptyListHTML(){
  return '<div class="card"><div class="empty"><b>当前清单没有日管控项目</b>请到「风险管控清单」检查是否有启用中的日频次风险点。</div></div>';
}

function checkListHTML(items, res, d){
  const groups = {};
  items.forEach(it => { (groups[it.env] = groups[it.env] || []).push(it); });
  return Object.keys(groups).map(env => {
    const g = groups[env];
    const done = g.filter(it => res[it.id]).length;
    const ng = g.filter(it => res[it.id] === "ng").length;
    const fold = UI.fold["d:" + env];
    return '<div class="env-group"><div class="env-head' + (fold ? " fold" : "") + '" data-act="fold" data-v="d:' + esc(env) + '">' +
      "<h4>" + esc(env) + '</h4><span class="st"><b>' + done + "</b> / " + g.length + " 已检查" +
      (ng ? ' · <span style="color:var(--ng)">' + ng + " 项不符合</span>" : "") + '</span><span class="arrow">▾</span></div>' +
      '<div class="env-body' + (fold ? " fold" : "") + '">' + g.map(it => itemHTML(it, res[it.id], d)).join("") + "</div></div>";
  }).join("");
}

function itemHTML(it, v, d){
  const nc = v === "ng" ? findIssue("日管控", d, it.id) : null;
  return '<div class="item ' + (v || "") + (UI.compact ? " compact" : "") + '" data-item="' + esc(it.id) + '">' +
    '<div class="body"><div class="title"><span class="code">' + esc(it.code) + "</span>" + esc(it.point) +
    '<span class="tag ' + PERIOD_CLS[it.period] + '">' + PERIOD_LABEL[it.period] + "</span>" +
    (it.dept ? '<span class="tag n">' + esc(deptName(it.dept)) + "</span>" : "") + "</div>" +
    (it.measure ? '<div class="meta"><b>管控措施：</b>' + esc(it.measure) + "</div>" : "") +
    (it.target ? '<div class="meta"><b>管控目标：</b>' + esc(it.target) + "</div>" : "") +
    (it.desc ? '<div class="desc">' + esc(it.desc) + "</div>" : "") +
    (nc ? ngFormHTML(nc, it) : "") +
    "</div>" +
    '<div class="res"><button class="ok ' + (v === "ok" ? "on" : "") + '" data-act="pick" data-v="ok">符合</button>' +
    '<button class="ng ' + (v === "ng" ? "on" : "") + '" data-act="pick" data-v="ng">不符合</button>' +
    '<button class="na ' + (v === "na" ? "on" : "") + '" data-act="pick" data-v="na">不涉及</button></div></div>';
}

function ngFormHTML(nc, it){
  const depts = DB.co.depts.length ? DB.co.depts : [];
  return '<div class="ngform" data-nc="' + esc(nc.id) + '">' +
    '<div class="full"><label>问题描述</label><textarea class="inp" data-nc-bind="desc" placeholder="写清位置、数量、现象，如：原料库2袋大米未离地存放">' + esc(nc.desc) + "</textarea></div>" +
    "<div><label>整改责任人</label>" + (depts.length
      ? '<select class="inp" data-nc-bind="owner"><option value="">待定</option>' + depts.map(x => '<option' + (nc.owner === x ? " selected" : "") + ">" + esc(x) + "</option>").join("") + "</select>"
      : '<input class="inp" data-nc-bind="owner" value="' + esc(nc.owner) + '" placeholder="部门/姓名">') + "</div>" +
    '<div><label>整改期限</label><input class="inp" type="date" data-nc-bind="deadline" value="' + esc(nc.deadline) + '"></div>' +
    "<div><label>风险等级</label>" + '<select class="inp" data-nc-bind="level">' + LEVELS.map(l => '<option' + (nc.level === l ? " selected" : "") + ">" + l + "</option>").join("") + "</select></div>" +
    '<div class="full hint">保存记录后，该问题会进入「不符合项汇总」跟踪整改；整改完成填写情况并由验证人关闭。</div>' +
    "</div>";
}

/* ============================ 视图：清单 ============================ */
VIEWS.list = function(){
  const p = UI.listPeriod;
  const all = DB.items;
  const items = all.filter(it => it.period === p);
  const off = all.filter(it => !it.on).length;
  const custom = all.filter(it => it.added).length;

  setView(
    '<div class="card"><div class="card-h"><h3>' + (DB.cats.length ? DB.cats.map(c => catName(c)).join("、") : "") + "</h3>" +
    '<span class="sub">共 ' + all.length + " 项" + (custom ? "，新增 " + custom + " 项" : "") + (off ? "，停用 " + off + " 项" : "") + "</span>" +
    '<div class="sp"></div>' +
    '<button class="btn sm" data-act="dept-map">部门对照</button>' +
    '<button class="btn sm" data-act="imp-list"><svg><use href="#i-up"/></svg>导入清单</button>' +
    '<button class="btn sm ai" data-act="ai-items"><svg><use href="#i-ai"/></svg>AI 补充</button>' +
    '<button class="btn sm" data-act="exp-items"><svg><use href="#i-xls"/></svg>导出</button>' +
    '<button class="btn sm pri" data-act="item-add"><svg><use href="#i-plus"/></svg>新增</button></div>' +
    '<div class="chips">' + PERIODS.map(x => {
      const n = all.filter(it => it.period === x).length;
      return '<button class="chip' + (p === x ? " on" : "") + '" data-act="list-period" data-v="' + x + '">' + PERIOD_LABEL[x] + '<span class="n">' + n + "</span></button>";
    }).join("") + "</div>" +
    '<div class="hint" style="margin-top:8px">清单决定每天要检查什么。可按企业实际停用不适用的项目、调整检查频次与责任部门；新增的风险点从添加当天起计入。' +
    (mappedCount() ? ' 已做 <b>' + mappedCount() + '</b> 项部门对照（点「部门对照」修改）。' : ' 清单里的部门是通用写法，点「部门对照」可换成你企业的叫法。') + '</div>' +
    "</div>" +

    '<div class="twrap" style="margin-top:12px"><table class="tbl"><thead><tr>' +
    "<th style=\"width:52px\">序号</th><th>风险点</th><th style=\"width:150px\">环节</th><th style=\"width:120px\">责任部门</th>" +
    '<th style="width:96px">频次</th><th style="width:150px">操作</th></tr></thead><tbody>' +
    (items.length ? items.map((it, i) =>
      '<tr' + (it.on ? "" : ' style="opacity:.55"') + "><td class=\"num\">" + (i+1) + "</td>" +
      "<td><b>" + esc(it.point) + "</b>" + (it.added ? ' <span class="tag b">新增</span>' : "") +
      (it.freqText ? '<div class="mini" style="margin-top:2px">清单原文频次：' + esc(it.freqText) + "</div>" : "") + "</td>" +
      "<td>" + esc(it.env) + "</td><td" + (deptName(it.dept) !== it.dept ? ' title="清单原部门：' + esc(it.dept) + '"' : "") + ">" +
      esc(deptName(it.dept)) + "</td>" +
      '<td><span class="tag ' + PERIOD_CLS[it.period] + '">' + PERIOD_LABEL[it.period] + "</span></td>" +
      '<td><button class="btn xs" data-act="item-edit" data-v="' + esc(it.id) + '">编辑</button> ' +
      '<button class="btn xs" data-act="item-toggle" data-v="' + esc(it.id) + '">' + (it.on ? "停用" : "启用") + "</button></td></tr>"
    ).join("") : '<tr><td colspan="6"><div class="empty">该频次下暂无风险点</div></td></tr>') +
    "</tbody></table></div>"
  );
};

/* ============================ 视图：数据 ============================ */
VIEWS.data = function(){
  const st = DB.items.length;
  const days = Object.keys(DB.days).length;
  const weeks = Object.keys(DB.weeks).length;
  const months = Object.keys(DB.months).length;
  const cfg = (typeof AI !== "undefined") ? AI.config() : {};

  setView(
    '<div class="grid g2">' +
    '<div class="card"><div class="card-h"><h3>企业信息</h3><span class="sub">用于表头与签字栏</span></div>' +
    '<label class="field"><span>企业名称</span><input class="inp" data-bind="co.name" value="' + esc(DB.co.name) + '"></label>' +
    '<div class="grid g2">' +
    '<label class="field"><span>主要负责人</span><input class="inp" data-bind="co.chief" value="' + esc(DB.co.chief) + '"></label>' +
    '<label class="field"><span>食品安全总监</span><input class="inp" data-bind="co.director" value="' + esc(DB.co.director) + '"></label>' +
    "</div>" +
    '<label class="field"><span>食品安全员（顿号分隔）</span><input class="inp" data-bind="co.officers" value="' + esc(DB.co.officers.join("、")) + '"></label>' +
    '<label class="field"><span>责任部门（顿号分隔）</span><input class="inp" data-bind="co.depts" value="' + esc(DB.co.depts.join("、")) + '"></label>' +
    '<div class="grid g2">' +
    '<label class="field"><span>许可证编号</span><input class="inp" data-bind="co.license" value="' + esc(DB.co.license) + '"></label>' +
    '<label class="field"><span>会议地点</span><input class="inp" data-bind="co.place" value="' + esc(DB.co.place) + '"></label>' +
    "</div>" +
    '<div class="row"><button class="btn pri" data-act="co-save"><svg><use href="#i-save"/></svg>保存企业信息</button>' +
    '<button class="btn" data-act="dept-map">责任部门对照</button>' +
    (mappedCount() ? '<span class="mini">已对照 ' + mappedCount() + ' 项</span>' : "") + "</div>" +
    '<div class="hint" style="margin-top:8px">清单里的部门是通用写法。填好上面的部门后，点「责任部门对照」把 生产部 / 品控部 换成本企业的实际叫法，检查和报告会同步显示。</div></div>' +

    '<div class="card"><div class="card-h"><h3>数据备份与恢复</h3><span class="sub">全部数据只存在本机浏览器</span></div>' +
    '<div class="row" style="margin-bottom:12px"><button class="btn pri" data-act="backup"><svg><use href="#i-save"/></svg>导出备份（JSON）</button>' +
    '<button class="btn" data-act="restore"><svg><use href="#i-up"/></svg>导入备份</button></div>' +
    '<div class="hint" style="margin-bottom:12px">换电脑、重装系统、清理浏览器数据前务必导出。备份文件包含清单、记录与不符合项，可直接在另一台电脑导入继续使用。</div>' +
    '<hr class="sep">' +
    '<div class="grid g2" style="gap:8px">' +
    '<div class="kpi"><div class="k">风险管控清单</div><div class="v">' + st + '</div><div class="d">启用 ' + DB.items.filter(i => i.on).length + " 项</div></div>" +
    '<div class="kpi"><div class="k">日管控记录</div><div class="v">' + days + '</div><div class="d">已归档 ' + Object.values(DB.days).filter(d => d.savedAt).length + " 天</div></div>" +
    '<div class="kpi"><div class="k">周排查</div><div class="v">' + weeks + '</div><div class="d">已归档 ' + Object.values(DB.weeks).filter(w => w.savedAt).length + " 周</div></div>" +
    '<div class="kpi"><div class="k">月调度</div><div class="v">' + months + '</div><div class="d">已归档 ' + Object.values(DB.months).filter(m => m.savedAt).length + " 月</div></div>" +
    "</div>" +
    '<div class="hint" style="margin-top:10px">不符合项 ' + DB.issues.length + " 项 · 占用空间约 " + storageKB() + " KB</div>" +
    '<hr class="sep">' +
    '<div class="card-h"><h3>重新开始</h3></div>' +
    '<div class="row"><button class="btn danger" data-act="clear-records">清空检查记录（保留清单与企业信息）</button>' +
    '<button class="btn danger" data-act="clear-all">清空全部数据</button></div>' +
    '<div class="hint" style="margin-top:6px">清空前请先导出备份。清空记录不会删除风险管控清单。</div>' +
    "</div></div>" +

    '<div class="card"><div class="card-h"><h3>AI 接口（可选）</h3><span class="sub">不配置也能正常使用全部手工功能</span></div>' +
    '<div class="row"><div style="flex:1;min-width:240px"><div style="font-size:13px">' +
    (cfg.key ? '<b style="color:var(--ok)">已接入：' + esc(cfg.model || "未填模型") + "</b>" : '<b style="color:var(--warn)">未配置</b>') +
    '</div><div class="hint" style="margin-top:2px">' + (cfg.base || "默认使用本机 Ollama（http://localhost:11434/v1）") + "</div></div>" +
    '<button class="btn ai" data-act="ai-cfg"><svg><use href="#i-ai"/></svg>配置接口</button></div>' +
    '<div class="hint" style="margin-top:10px">配置后可启用：① 现场问题/照片自动匹配清单并勾选 ② 周排查与月调度研判自动起草。' +
    '只支持 OpenAI 兼容接口（/chat/completions），密钥仅保存在本机浏览器。</div></div>' +

    '<div class="card"><div class="card-h"><h3>关于与合规提示</h3></div>' +
    '<div class="hint">' +
    "1. 内置 98 类风险管控清单，依据《食品安全风险管控清单》整理，供企业建立台账时参考；企业应结合自身工艺核实后使用。<br>" +
    "2. 工具生成的记录、研判与建议是初稿，最终结论由食品安全总监、主要负责人确认后归档。<br>" +
    "3. 本项目完全离线运行，不上传任何数据；只有在你主动点击 AI 功能时，才会把当次输入发送到你配置的接口。<br>" +
    "4. 数据保存在浏览器 localStorage，清理浏览器数据会导致记录丢失，请定期导出备份。</div></div>"
  );
};

/* ============================ 视图：帮助 ============================ */
VIEWS.help = function(){
  setView(
    '<div class="card"><div class="card-h"><h3>四步上手</h3></div>' +
    '<div class="grid g4">' +
    stepCard("1", "建立清单", "选行业、勾类别、填企业名，生成台账。98 类清单已内置，可多选合并。") +
    stepCard("2", "每天勾选", "日管控页按环节逐项点「符合 / 不符合 / 不涉及」，剩下的点「其余全部符合」。") +
    stepCard("3", "每周每月汇总", "周排查、月调度自动汇总本周本月数据，点「AI 起草」或「生成初稿」得到研判文字。") +
    stepCard("4", "保存并导出", "点保存归档，再导出 Word 或打印。记录单可直接签字留存。") +
    "</div></div>" +

    '<div class="card"><div class="card-h"><h3>常见问题</h3></div>' +
    faq("没有发现问题也要记录吗？", "要。每天全部勾选「符合」即为零风险报告；停产、休息也要如实登记，监管检查时同样是有效证据。") +
    faq("只输入不符合项，其他项目算检查过了吗？", "不算。录入问题只代表这几项不符合，其余项目需逐项点选或点「其余全部符合」。") +
    faq("清单里的部门名和我们公司不一样怎么办？", "到「风险管控清单」点「部门对照」，左边列出清单里的通用部门（生产部、品控部…），右边填你企业的实际名称（控制中心、检测中心…），可以下拉选也可以直接输入。保存后，检查项、报告表头和整改责任人都会显示成你的叫法；留空则沿用原名。") +
    faq("我有自己的风险管控清单，能导进去吗？", "能。在清单页点「导入清单」，上传 Word / Excel / PDF / 图片，AI 会识别成结构化条目并列出预览，你可以勾选需要的，再选择「追加到清单」或「替换现有清单」。替换时同名的条目会保留原记录，被替换掉的旧条目会停用而不是删除，历史台账不受影响。") +
    faq("AI 能帮我补风险点吗？", "能。清单页点「AI 补充」，它会在当前类别的基础上，避开已有条目再补 12~18 条，覆盖人员、设施、原辅料、生产过程、贮存运输等环节。生成结果先预览，勾选后才写入。") +
    faq("清单条目太多，每天要全查吗？", "日管控只列频次为「日」的项目。频次为周、月、年的项目分别进入周排查、月度检查与年度事项，不必每天查。") +
    faq("AI 一定要配置吗？", "不需要。不配置时，清单、勾选、汇总、报告生成、导出全部可用；只有「自动识别问题」和「AI 起草研判」需要接口。") +
    faq("AI 接口怎么填？", "填 OpenAI 兼容地址即可，例如 DeepSeek：https://api.deepseek.com/v1，模型 deepseek-chat。Ollama 本地模型填 http://localhost:11434/v1，密钥可留空。") +
    faq("浏览器直连报跨域错误怎么办？", "多数国产服务商允许浏览器直连；若报 CORS，请在服务商后台放行，或改用本地 Ollama / 自建反向代理。") +
    faq("换电脑怎么迁移？", "到「数据与企业信息」导出备份 JSON，在新电脑导入即可，清单与全部记录都会带过去。") +
    faq("数据存在哪里？安全吗？", "只存在本机浏览器的 localStorage，不上传服务器。清理浏览器数据会丢失，请定期导出备份。") +
    "</div>"
  );
};
function stepCard(n, t, d){
  return '<div class="card" style="box-shadow:none;background:var(--panel2)"><div class="step-h" style="margin-bottom:6px">' +
    '<span class="n">' + n + '</span><h2 style="font-size:13.5px">' + t + "</h2></div>" +
    '<div class="hint">' + d + "</div></div>";
}
function faq(q, a){
  return '<details style="border-bottom:1px solid #eef1f2;padding:8px 0"><summary style="cursor:pointer;font-size:13px;font-weight:500">' + q + "</summary>" +
    '<div class="hint" style="margin-top:5px">' + a + "</div></details>";
}
