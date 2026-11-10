/* 日管控·周排查·月调度 AI 工作台 —— 原页面内联 <script id="core-engine"> 抽取 */
/* =========================================================================
   核心引擎：ZIP 读写 / DOCX 生成 / XLSX 生成 / Office 文本提取 / JSON 容错
   纯函数，无 DOM 依赖
   ========================================================================= */
const CORE = (function(){
"use strict";
const TE = new TextEncoder();
function u8(s){ return TE.encode(s); }
function escXml(s){
  return String(s==null?"":s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&apos;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"");
}
function safeName(s){
  return String(s||"").replace(/[\\/:*?"<>|\r\n\t]/g,"_").replace(/\s+/g," ").trim().slice(0,80);
}

/* ---------------- CRC32 ---------------- */
const CRCT = (function(){
  const t = new Uint32Array(256);
  for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = (c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[n]=c>>>0; }
  return t;
})();
function crc32(buf){
  let c = 0xFFFFFFFF;
  for(let i=0;i<buf.length;i++) c = CRCT[(c^buf[i])&0xFF]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0;
}

/* ---------------- deflate / inflate ---------------- */
async function deflateRaw(data){
  if(typeof CompressionStream==="undefined") return null;
  try{
    const cs = new CompressionStream("deflate-raw");
    const ab = await new Response(new Blob([data]).stream().pipeThrough(cs)).arrayBuffer();
    return new Uint8Array(ab);
  }catch(e){ return null; }
}
async function inflateRaw(data){
  if(typeof DecompressionStream==="undefined") return null;
  try{
    const ds = new DecompressionStream("deflate-raw");
    const ab = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(ab);
  }catch(e){ return null; }
}
async function inflateZlib(data){
  if(typeof DecompressionStream==="undefined") return null;
  try{
    const ds = new DecompressionStream("deflate");
    const ab = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(ab);
  }catch(e){ return await inflateRaw(data); }
}

/* ---------------- ZIP 写 ---------------- */
function dosTime(d){ return ((d.getHours()&31)<<11) | ((d.getMinutes()&63)<<5) | ((d.getSeconds()/2)&31); }
function dosDate(d){ return (((d.getFullYear()-1980)&127)<<9) | (((d.getMonth()+1)&15)<<5) | (d.getDate()&31); }
async function makeZip(files, opts){
  opts = opts||{};
  const now = new Date();
  const tt = dosTime(now), dd = dosDate(now);
  const chunks = [], central = [];
  let offset = 0;
  for(const f of files){
    let data = (typeof f.data === "string") ? u8(f.data) : f.data;
    if(!data) data = new Uint8Array(0);
    const nameBytes = u8(f.name);
    const crc = crc32(data);
    let method = 0, out = data;
    if(opts.store !== true && data.length > 120){
      const z = await deflateRaw(data);
      if(z && z.length < data.length){ method = 8; out = z; }
    }
    const lh = new Uint8Array(30);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0,0x04034b50,true); lv.setUint16(4,20,true); lv.setUint16(6,0x0800,true);
    lv.setUint16(8,method,true); lv.setUint16(10,tt,true); lv.setUint16(12,dd,true);
    lv.setUint32(14,crc,true); lv.setUint32(18,out.length,true); lv.setUint32(22,data.length,true);
    lv.setUint16(26,nameBytes.length,true); lv.setUint16(28,0,true);
    chunks.push(lh, nameBytes, out);
    const ch = new Uint8Array(46);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0,0x02014b50,true); cv.setUint16(4,0x0314,true); cv.setUint16(6,20,true);
    cv.setUint16(8,0x0800,true); cv.setUint16(10,method,true); cv.setUint16(12,tt,true); cv.setUint16(14,dd,true);
    cv.setUint32(16,crc,true); cv.setUint32(20,out.length,true); cv.setUint32(24,data.length,true);
    cv.setUint16(28,nameBytes.length,true); cv.setUint16(30,0,true); cv.setUint16(32,0,true);
    cv.setUint16(34,0,true); cv.setUint16(36,0,true); cv.setUint32(38,0x81a40000,true);
    cv.setUint32(42,offset,true);
    central.push(ch, nameBytes);
    offset += 30 + nameBytes.length + out.length;
  }
  let cdSize = 0;
  for(const c of central) cdSize += c.length;
  const eo = new Uint8Array(22);
  const ev = new DataView(eo.buffer);
  ev.setUint32(0,0x06054b50,true); ev.setUint16(4,0,true); ev.setUint16(6,0,true);
  ev.setUint16(8,files.length,true); ev.setUint16(10,files.length,true);
  ev.setUint32(12,cdSize,true); ev.setUint32(16,offset,true); ev.setUint16(20,0,true);
  return new Blob(chunks.concat(central,[eo]),{type:"application/zip"});
}

/* ---------------- ZIP 读 ---------------- */
async function readZip(buf){
  const d = new Uint8Array(buf), dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  let eocd = -1;
  for(let i=d.length-22;i>=Math.max(0,d.length-66000);i--){ if(dv.getUint32(i,true)===0x06054b50){ eocd=i; break; } }
  if(eocd<0) throw new Error("非ZIP格式");
  const n = dv.getUint16(eocd+10,true);
  let p = dv.getUint32(eocd+16,true);
  const out = {};
  const dec = new TextDecoder("utf-8");
  for(let i=0;i<n;i++){
    if(dv.getUint32(p,true)!==0x02014b50) break;
    const method = dv.getUint16(p+10,true);
    const csize = dv.getUint32(p+20,true);
    const nlen = dv.getUint16(p+28,true), elen = dv.getUint16(p+30,true), clen = dv.getUint16(p+32,true);
    const lho = dv.getUint32(p+42,true);
    const name = dec.decode(d.subarray(p+46,p+46+nlen));
    const lnl = dv.getUint16(lho+26,true), lel = dv.getUint16(lho+28,true);
    const start = lho+30+lnl+lel;
    out[name] = {method, raw:d.subarray(start,start+csize)};
    p += 46+nlen+elen+clen;
  }
  return {
    names(){ return Object.keys(out); },
    async text(name){
      const e = out[name]; if(!e) return "";
      const b = e.method===0 ? e.raw : (await inflateRaw(e.raw));
      return b ? new TextDecoder("utf-8").decode(b) : "";
    }
  };
}

/* ---------------- Office / PDF 文本提取 ---------------- */
function stripTags(xml, sep){
  return xml
    .replace(/<w:p[ >]/g,"\n<w:p ").replace(/<\/w:p>/g,"\n")
    .replace(/<\/a:p>/g,"\n").replace(/<\/w:tr>/g,"\n").replace(/<\/row>/g,"\n")
    .replace(/<w:tab\/>/g,"\t").replace(/<\/w:tc>/g," | ")
    .replace(/<[^>]+>/g, sep==null?"":sep)
    .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&")
    .replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim();
}
async function officeText(buf, kind){
  const z = await readZip(buf);
  let out = "";
  if(kind==="docx"){
    out = stripTags(await z.text("word/document.xml"));
  }else if(kind==="pptx"){
    const slides = z.names().filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a,b)=>(+a.replace(/\D/g,""))-(+b.replace(/\D/g,"")));
    for(const s of slides) out += "\n【幻灯片】\n" + stripTags(await z.text(s)) + "\n";
  }else if(kind==="xlsx"){
    let shared = [];
    const ss = await z.text("xl/sharedStrings.xml");
    if(ss) shared = (ss.match(/<si>[\s\S]*?<\/si>/g)||[]).map(x=>stripTags(x));
    const wb = await z.text("xl/workbook.xml");
    const snames = (wb.match(/<sheet[^>]*name="([^"]*)"/g)||[]).map(x=>(x.match(/name="([^"]*)"/)||[])[1]);
    const sheets = z.names().filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort((a,b)=>(+a.replace(/\D/g,""))-(+b.replace(/\D/g,"")));
    let idx = 0;
    for(const sn of sheets){
      const xml = await z.text(sn);
      out += "\n【工作表】" + (snames[idx++]||sn) + "\n";
      const rows = xml.match(/<row[\s\S]*?<\/row>/g)||[];
      for(const r of rows.slice(0,600)){
        const cells = r.match(/<c[\s\S]*?(?:\/>|<\/c>)/g)||[];
        const line = cells.map(c=>{
          const isS = /t="s"/.test(c);
          const v = (c.match(/<v>([\s\S]*?)<\/v>/)||[])[1];
          const isr = (c.match(/<is>([\s\S]*?)<\/is>/)||[])[1];
          if(isr!=null) return stripTags(isr);
          if(v==null) return "";
          return isS ? (shared[+v]||"") : v;
        }).join(" | ").trim();
        if(line.replace(/[ |]/g,"")) out += line + "\n";
      }
    }
  }
  return out;
}
async function pdfText(buf){
  const d = new Uint8Array(buf);
  const bin = Array.from(d.subarray(0, d.length)).map(c=>String.fromCharCode(c)).join("");
  let out = "";
  const re = /stream\r?\n?/g; let m;
  const pieces = [];
  while((m = re.exec(bin))){
    const st = m.index + m[0].length;
    const en = bin.indexOf("endstream", st);
    if(en<0) break;
    pieces.push([st,en]);
    re.lastIndex = en;
    if(pieces.length>800) break;
  }
  for(const [st,en] of pieces){
    let seg = d.subarray(st,en);
    let txt = null;
    if(seg.length>2 && seg[0]===0x78){ const inf = await inflateZlib(seg); if(inf) txt = new TextDecoder("utf-8",{fatal:false}).decode(inf); }
    if(txt==null){
      const head = bin.slice(st,st+4);
      if(/^[\x20-\x7e\s]*$/.test(head)) txt = bin.slice(st,en);
    }
    if(!txt || txt.indexOf("Tj")<0 && txt.indexOf("TJ")<0) continue;
    const chunk = [];
    const tre = /\((?:\\.|[^\\()])*\)/g; let t;
    while((t = tre.exec(txt))){
      let s = t[0].slice(1,-1).replace(/\\([()\\])/g,"$1").replace(/\\n/g,"\n").replace(/\\r/g,"").replace(/\\t/g,"\t");
      if(s.trim()) chunk.push(s);
    }
    if(chunk.length) out += chunk.join("") + "\n";
  }
  out = out.replace(/\n{3,}/g,"\n\n").trim();
  const printable = (out.match(/[一-龥A-Za-z0-9，。：；、（）%℃]/g)||[]).length;
  if(out.length && printable/out.length < 0.5) return "";
  return out;
}

/* ---------------- JSON 容错解析 ---------------- */
function repairJSON(t){
  const stack = [];
  let inStr = false, esc = false, last = 0;
  for(let i=0;i<t.length;i++){
    const ch = t[i];
    if(inStr){
      if(esc){ esc=false; continue; }
      if(ch==="\\"){ esc=true; continue; }
      if(ch==='"'){ inStr=false; last=i; }
      continue;
    }
    if(ch==='"'){ inStr=true; continue; }
    if(ch==="{"||ch==="["){ stack.push(ch); continue; }
    if(ch==="}"||ch==="]"){ stack.pop(); last=i; continue; }
    if(!/\s/.test(ch)) last=i;
  }
  let s = inStr ? t.slice(0, t.lastIndexOf('"')) : t.slice(0, last+1);
  s = s.replace(/,\s*$/,"").replace(/:\s*$/,': ""').replace(/"\s*[^":,\]\}]*$/,"\"");
  while(stack.length){ const o = stack.pop(); s += (o==="{"?"}":"]"); }
  return s;
}
function looseJSON(s){
  if(!s) return null;
  let t = String(s).trim().replace(/^```[a-zA-Z]*\s*/i,"").replace(/```\s*$/,"").trim();
  const a = t.indexOf("["), b = t.indexOf("{");
  let st = (a<0)?b : (b<0)?a : Math.min(a,b);
  if(st<0) return null;
  const open = t[st], close = open==="[" ? "]" : "}";
  const end = t.lastIndexOf(close);
  let body = end>st ? t.slice(st, end+1) : t.slice(st);
  const tries = [
    body,
    body.replace(/,\s*([\]}])/g,"$1"),
    body.replace(/[“”]/g,'"').replace(/,\s*([\]}])/g,"$1"),
    repairJSON(t.slice(st)).replace(/,\s*([\]}])/g,"$1")
  ];
  for(const x of tries){ try{ return JSON.parse(x); }catch(e){} }
  return null;
}

/* =========================================================================
   DOCX（公文版式：标题居中 / 黑体小标题 / 宋体正文 / 黑线表格 / 签字栏）
   ========================================================================= */
const PAGE_W = 9638, PAGE_W_L = 14570;
function rPr(o){
  o = o||{};
  const ea = o.ea || "宋体", la = o.la || "Times New Roman";
  let s = '<w:rPr><w:rFonts w:ascii="'+la+'" w:hAnsi="'+la+'" w:eastAsia="'+ea+'" w:cs="'+la+'"/>';
  if(o.b) s += "<w:b/><w:bCs/>";
  if(o.i) s += "<w:i/>";
  if(o.u) s += '<w:u w:val="single"/>';
  if(o.color) s += '<w:color w:val="'+o.color+'"/>';
  if(o.sz) s += '<w:sz w:val="'+o.sz+'"/><w:szCs w:val="'+o.sz+'"/>';
  s += "</w:rPr>";
  return s;
}
function runs(text, base){
  const parts = String(text==null?"":text).split(/(\*\*[^*]+\*\*)/g);
  let s = "";
  for(const p of parts){
    if(!p) continue;
    const bold = /^\*\*[^*]+\*\*$/.test(p);
    const t = bold ? p.slice(2,-2) : p.replace(/\*\*/g,"");
    if(!t) continue;
    const o = Object.assign({}, base||{});
    if(bold) o.b = 1;
    const lines = t.split("\n");
    lines.forEach((ln,i)=>{
      if(i>0) s += "<w:r>" + rPr(o) + "<w:br/></w:r>";
      s += "<w:r>" + rPr(o) + '<w:t xml:space="preserve">' + escXml(ln) + "</w:t></w:r>";
    });
  }
  if(!s) s = "<w:r>" + rPr(base) + '<w:t xml:space="preserve"></w:t></w:r>';
  return s;
}
function para(text, o){
  o = o||{};
  let p = "<w:p><w:pPr>";
  if(o.keep) p += "<w:keepNext/>";
  p += '<w:spacing w:before="'+(o.before||0)+'" w:after="'+(o.after==null?60:o.after)+'" w:line="'+(o.line||340)+'" w:lineRule="auto"/>';
  if(o.ind) p += '<w:ind w:firstLine="'+o.ind+'"/>';
  if(o.left) p += '<w:ind w:left="'+o.left+'" w:hanging="'+(o.hang||0)+'"/>';
  if(o.align) p += '<w:jc w:val="'+o.align+'"/>';
  if(o.shd) p += '<w:shd w:val="clear" w:color="auto" w:fill="'+o.shd+'"/>';
  if(o.brdBottom) p += '<w:pBdr><w:bottom w:val="single" w:sz="'+(o.brdSz||8)+'" w:space="2" w:color="'+o.brdBottom+'"/></w:pBdr>';
  if(o.page) p += '<w:pageBreakBefore/>';
  if(o.tabs) p += '<w:tabs>' + o.tabs.map(t=>'<w:tab w:val="'+(t.v||"left")+'" w:pos="'+t.pos+'"'+(t.leader?' w:leader="'+t.leader+'"':'')+'/>').join("") + '</w:tabs>';
  p += "</w:pPr>" + runs(text, o) + "</w:p>";
  return p;
}
function tcell(text, o){
  o = o||{};
  return '<w:tc><w:tcPr><w:tcW w:w="'+(o.w||1000)+'" w:type="dxa"/>'
    + (o.fill?'<w:shd w:val="clear" w:color="auto" w:fill="'+o.fill+'"/>':"")
    + (o.span?'<w:gridSpan w:val="'+o.span+'"/>':"")
    + (o.noBorder?'<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>':"")
    + '<w:tcMar><w:top w:w="50" w:type="dxa"/><w:bottom w:w="50" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>'
    + '<w:vAlign w:val="center"/></w:tcPr>'
    + para(text,{align:o.align||"left", sz:o.sz||20, b:o.b, color:o.color, ea:o.ea||"宋体", after:0, line:280})
    + "</w:tc>";
}
/* rows: 二维数组；opt: {widths:[比例], head:true, align, fills:{ri:{ci:fill}}, colors:{ri:{ci:color}}, land} */
function table(rows, opt){
  opt = opt||{};
  if(!rows || !rows.length) return "";
  const pw = opt.land ? PAGE_W_L : PAGE_W;
  const nc = Math.max.apply(null, rows.map(r=>r.length));
  let widths = opt.widths;
  if(!widths || widths.length!==nc){ widths = new Array(nc).fill(Math.floor(pw/nc)); }
  else{
    const tot = widths.reduce((a,b)=>a+b,0);
    widths = widths.map(w=>Math.max(420, Math.floor(w/tot*pw)));
  }
  let s = '<w:tbl><w:tblPr><w:tblW w:w="'+pw+'" w:type="dxa"/><w:jc w:val="center"/>'
    + '<w:tblBorders>'
    + '<w:top w:val="single" w:sz="8" w:color="000000"/><w:left w:val="single" w:sz="8" w:color="000000"/>'
    + '<w:bottom w:val="single" w:sz="8" w:color="000000"/><w:right w:val="single" w:sz="8" w:color="000000"/>'
    + '<w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/>'
    + '</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>';
  widths.forEach(w=>{ s += '<w:gridCol w:w="'+w+'"/>'; });
  s += "</w:tblGrid>";
  rows.forEach((r,ri)=>{
    const head = (ri===0 && opt.head!==false);
    s += "<w:tr>" + (head?'<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>':'<w:trPr><w:cantSplit/></w:trPr>');
    for(let ci=0; ci<nc; ci++){
      const c = r[ci]==null ? "" : r[ci];
      const fill = head ? (opt.headFill||"E7E6E6") : ((opt.fills&&opt.fills[ri]&&opt.fills[ri][ci])||"");
      const color = (opt.colors&&opt.colors[ri]&&opt.colors[ri][ci])||"";
      const al = head ? "center" : ((opt.aligns&&opt.aligns[ci])||opt.align||"left");
      s += tcell(c,{w:widths[ci], fill:fill, b:head||(opt.boldCol===ci), align:al, sz:opt.sz||19, ea: head?"黑体":"宋体", color:color});
    }
    s += "</w:tr>";
  });
  s += "</w:tbl>" + para("",{sz:10,after:0,line:200});
  return s;
}
function docStyles(){
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
  + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="宋体" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>'
  + '<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault>'
  + '<w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="340" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
  + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
  + '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>'
  + '</w:styles>';
}
function pageField(){
  return '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>'
    + '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
}
function pagesField(){
  return '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r>'
    + '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
}
function hdrXml(left,right,land){
  const w = land ? PAGE_W_L : PAGE_W;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="'+w+'"/></w:tabs><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr><w:spacing w:after="0"/></w:pPr>'
    + '<w:r>' + rPr({sz:18,color:"404040"}) + '<w:t xml:space="preserve">' + escXml(left) + '</w:t></w:r>'
    + '<w:r><w:tab/></w:r><w:r>' + rPr({sz:18,color:"404040"}) + '<w:t xml:space="preserve">' + escXml(right) + '</w:t></w:r>'
    + '</w:p></w:hdr>';
}
function ftrXml(left,land){
  const w = land ? PAGE_W_L : PAGE_W;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:p><w:pPr><w:tabs><w:tab w:val="center" w:pos="'+Math.floor(w/2)+'"/><w:tab w:val="right" w:pos="'+w+'"/></w:tabs><w:spacing w:after="0"/></w:pPr>'
    + '<w:r>' + rPr({sz:18,color:"595959"}) + '<w:t xml:space="preserve">' + escXml(left) + '</w:t></w:r>'
    + '<w:r><w:tab/></w:r><w:r>' + rPr({sz:18,color:"595959"}) + '<w:t xml:space="preserve">第 </w:t></w:r>' + pageField()
    + '<w:r>' + rPr({sz:18,color:"595959"}) + '<w:t xml:space="preserve"> 页 / 共 </w:t></w:r>' + pagesField()
    + '<w:r>' + rPr({sz:18,color:"595959"}) + '<w:t xml:space="preserve"> 页</w:t></w:r>'
    + '</w:p></w:ftr>';
}
/* blocks: title / meta / h2 / h3 / p / pn / li / num / table / kv / sig / blank / page / note */
function renderBlocks(blocks, land){
  let body = "";
  let numN = 0;
  for(const b of blocks){
    if(!b) continue;
    if(b.t==="title") body += para(b.x,{align:"center", sz:b.sz||36, b:1, ea:"黑体", after:120, before:b.before||120, line:360});
    else if(b.t==="sub") body += para(b.x,{align:"center", sz:24, ea:"楷体", after:60, color:"404040"});
    else if(b.t==="meta") body += para(b.x,{align:"center", sz:21, after:160, color:"262626"});
    else if(b.t==="h2"){ numN=0; body += para(b.x,{sz:26, b:1, ea:"黑体", before:200, after:80, keep:1}); }
    else if(b.t==="h3") body += para(b.x,{sz:22, b:1, ea:"黑体", before:120, after:60, keep:1});
    else if(b.t==="p") body += para(b.x,{ind:420, sz:b.sz||22});
    else if(b.t==="pn") body += para(b.x,{sz:b.sz||22});
    else if(b.t==="li") body += para("● " + b.x,{left:560, hang:280, sz:22, after:40});
    else if(b.t==="num"){ numN++; body += para((b.n||numN) + "．" + b.x,{left:560, hang:420, sz:22, after:40}); }
    else if(b.t==="note") body += para(b.x,{sz:18, color:"595959", after:40});
    else if(b.t==="table") body += table(b.rows, Object.assign({land:land}, b));
    else if(b.t==="kv"){
      const rows = b.rows;
      body += table(rows, {head:false, widths:b.widths||[16,34,16,34], land:land, fills:b.rows.map(()=>({0:"F2F2F2",2:"F2F2F2"})), sz:20});
    }
    else if(b.t==="sig"){
      const cols = b.cols||[];
      let s = '<w:tbl><w:tblPr><w:tblW w:w="'+(land?PAGE_W_L:PAGE_W)+'" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>';
      const w = Math.floor((land?PAGE_W_L:PAGE_W)/cols.length);
      cols.forEach(()=>{ s += '<w:gridCol w:w="'+w+'"/>'; });
      s += "</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>";
      cols.forEach(c=>{ s += tcell(c,{w:w, noBorder:1, sz:21, align:"left"}); });
      s += "</w:tr></w:tbl>";
      body += para("",{after:0}) + s;
    }
    else if(b.t==="blank") body += para("",{after:b.after||120});
    else if(b.t==="page") body += para("",{page:true, after:0});
    else if(b.t==="line") body += para("",{brdBottom:"000000", brdSz:12, after:120});
  }
  return body;
}
/* meta: {title, company, hdrLeft, hdrRight, ftr, land} */
async function buildDocx(meta, blocks){
  const land = !!meta.land;
  let body = renderBlocks(blocks, land);
  body += '<w:sectPr><w:headerReference w:type="default" r:id="rId4" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>'
    + '<w:footerReference w:type="default" r:id="rId5" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>'
    + (land ? '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' : '<w:pgSz w:w="11906" w:h="16838"/>')
    + '<w:pgMar w:top="1418" w:right="1134" w:bottom="1418" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/>'
    + '<w:docGrid w:linePitch="312"/></w:sectPr>';
  const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + "<w:body>" + body + "</w:body></w:document>";
  const files = [
    {name:"[Content_Types].xml", data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
      + '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
      + '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
      + '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '</Types>'},
    {name:"_rels/.rels", data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + '</Relationships>'},
    {name:"docProps/core.xml", data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
      + 'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + "<dc:title>" + escXml(meta.title||"") + "</dc:title><dc:creator>" + escXml(meta.company||"") + "</dc:creator>"
      + "<cp:lastModifiedBy>" + escXml(meta.company||"") + "</cp:lastModifiedBy></cp:coreProperties>"},
    {name:"word/_rels/document.xml.rels", data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
      + '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
      + '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
      + '</Relationships>'},
    {name:"word/settings.xml", data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + '<w:zoom w:percent="100"/><w:updateFields w:val="true"/>'
      + '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>'
      + '</w:settings>'},
    {name:"word/styles.xml", data:docStyles()},
    {name:"word/header1.xml", data:hdrXml(meta.hdrLeft||meta.company||"", meta.hdrRight||meta.title||"", land)},
    {name:"word/footer1.xml", data:ftrXml(meta.ftr||"", land)},
    {name:"word/document.xml", data:doc}
  ];
  const blob = await makeZip(files);
  return new Uint8Array(await blob.arrayBuffer());
}

/* =========================================================================
   XLSX（样式：0默认 1标题 2表头 3正文左 4正文中 5红字 6说明 7黄底 8绿底）
   sheets: [{name, widths:[], rows:[[...]], styles:[[...]] , head:1, merges:[], land:true, rowH:{r:h}}]
   ========================================================================= */
function colName(n){ let s=""; n=n+1; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); } return s; }
function xlStyles(){
  const fonts = '<fonts count="6">'
    + '<font><sz val="11"/><name val="宋体"/><charset val="134"/></font>'
    + '<font><b/><sz val="15"/><name val="黑体"/><charset val="134"/></font>'
    + '<font><b/><sz val="10"/><name val="黑体"/><charset val="134"/></font>'
    + '<font><sz val="10"/><name val="宋体"/><charset val="134"/></font>'
    + '<font><b/><sz val="10"/><color rgb="FFC00000"/><name val="宋体"/><charset val="134"/></font>'
    + '<font><sz val="9"/><color rgb="FF595959"/><name val="宋体"/><charset val="134"/></font>'
    + '</fonts>';
  const fills = '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F1"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFE2EFDA"/><bgColor indexed="64"/></patternFill></fill></fills>';
  const borders = '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
    + '<border><left style="thin"><color rgb="FF7F7F7F"/></left><right style="thin"><color rgb="FF7F7F7F"/></right>'
    + '<top style="thin"><color rgb="FF7F7F7F"/></top><bottom style="thin"><color rgb="FF7F7F7F"/></bottom><diagonal/></border></borders>';
  const A = (h,w)=>'<alignment horizontal="'+h+'" vertical="center"'+(w?' wrapText="1"':'')+'/>';
  const xf = (f,fi,b,al)=>'<xf numFmtId="0" fontId="'+f+'" fillId="'+fi+'" borderId="'+b+'" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">'+al+'</xf>';
  const xfs = '<cellXfs count="9">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + xf(1,0,0,A("center"))
    + xf(2,2,1,A("center",1))
    + xf(3,0,1,A("left",1))
    + xf(3,0,1,A("center",1))
    + xf(4,0,1,A("left",1))
    + xf(5,0,0,A("left",1))
    + xf(3,3,1,A("left",1))
    + xf(3,4,1,A("left",1))
    + '</cellXfs>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + fonts + fills + borders
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + xfs + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}
function sheetXml(sh){
  const rows = sh.rows||[];
  const nc = Math.max.apply(null, rows.map(r=>r.length).concat([1]));
  let s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
    + '<dimension ref="A1:' + colName(nc-1) + Math.max(1,rows.length) + '"/>'
    + '<sheetViews><sheetView workbookViewId="0" showGridLines="0">'
    + (sh.head ? '<pane ySplit="'+sh.head+'" topLeftCell="A'+(sh.head+1)+'" activePane="bottomLeft" state="frozen"/>' : '')
    + '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/>';
  if(sh.widths && sh.widths.length){
    s += "<cols>";
    sh.widths.forEach((w,i)=>{ s += '<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>'; });
    s += "</cols>";
  }
  s += "<sheetData>";
  rows.forEach((r,ri)=>{
    const h = sh.rowH && sh.rowH[ri+1];
    s += '<row r="'+(ri+1)+'"' + (h?' ht="'+h+'" customHeight="1"':'') + '>';
    r.forEach((v,ci)=>{
      const st = (sh.styles && sh.styles[ri] && sh.styles[ri][ci]!=null) ? sh.styles[ri][ci] : (ri < (sh.head||0) ? 2 : 3);
      const ref = colName(ci)+(ri+1);
      if(typeof v === "number" && isFinite(v)) s += '<c r="'+ref+'" s="'+st+'"><v>'+v+'</v></c>';
      else if(v==null || v==="") s += '<c r="'+ref+'" s="'+st+'"/>';
      else s += '<c r="'+ref+'" s="'+st+'" t="inlineStr"><is><t xml:space="preserve">'+escXml(v)+'</t></is></c>';
    });
    s += "</row>";
  });
  s += "</sheetData>";
  if(sh.merges && sh.merges.length){
    s += '<mergeCells count="'+sh.merges.length+'">' + sh.merges.map(m=>'<mergeCell ref="'+m+'"/>').join("") + '</mergeCells>';
  }
  s += '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
    + '<pageSetup paperSize="9" orientation="'+(sh.land?"landscape":"portrait")+'" fitToWidth="1" fitToHeight="0"/>'
    + '</worksheet>';
  return s;
}
async function buildXlsx(sheets){
  const files = [];
  let ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
  let wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
  let rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
  sheets.forEach((sh,i)=>{
    const n = i+1;
    ct += '<Override PartName="/xl/worksheets/sheet'+n+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    wb += '<sheet name="'+escXml(String(sh.name||("Sheet"+n)).slice(0,31))+'" sheetId="'+n+'" r:id="rId'+n+'"/>';
    rels += '<Relationship Id="rId'+n+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+n+'.xml"/>';
    files.push({name:"xl/worksheets/sheet"+n+".xml", data:sheetXml(sh)});
  });
  ct += "</Types>";
  wb += "</sheets></workbook>";
  rels += '<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  files.push({name:"[Content_Types].xml", data:ct});
  files.push({name:"_rels/.rels", data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'});
  files.push({name:"xl/workbook.xml", data:wb});
  files.push({name:"xl/_rels/workbook.xml.rels", data:rels});
  files.push({name:"xl/styles.xml", data:xlStyles()});
  const blob = await makeZip(files);
  return new Uint8Array(await blob.arrayBuffer());
}

/* ---------------- 下载 ---------------- */
function download(bytes, name, mime){
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], {type: mime||"application/octet-stream"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = safeName(name);
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

return {u8, escXml, safeName, makeZip, readZip, officeText, pdfText, looseJSON, repairJSON,
        buildDocx, buildXlsx, download, renderBlocks};
})();
