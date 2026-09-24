"use strict";
/* ══════════════════════════════════════════════════════
   转换码头 · ConvertDock
   纯转换核 ConvCore（可独立测试）+ 浏览器装卸线 UI
   ══════════════════════════════════════════════════════ */

const ConvCore = (() => {
  const utf8 = new TextEncoder();
  const dec8 = (bytes, fatal) => {
    try { return new TextDecoder("utf-8", { fatal: !!fatal }).decode(bytes); }
    catch (e) { throw new Error("字节序列不是有效的 UTF-8 文本"); }
  };

  /* —— Base64 —— */
  function toB64(str) {
    const bytes = utf8.encode(String(str));
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromB64(b64) {
    const clean = String(b64).replace(/[\s\r\n]+/g, "");
    if (clean && !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) throw new Error("含有 Base64 字母表之外的字符");
    /* 长度 ≡ 1 (mod 4) 必然非法；其余无填充形式（2/3 字符）按宽容规则解码 */
    if (clean.length % 4 === 1) throw new Error("Base64 长度不合法");
    let bin;
    try { bin = atob(clean); } catch (e) { throw new Error("Base64 长度或格式不合法"); }
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return dec8(bytes, false);
  }

  /* —— URL —— */
  function urlEnc(s) { return encodeURIComponent(String(s)); }
  function urlDec(s) {
    try { return decodeURIComponent(String(s).replace(/\+/g, " ")); }
    catch (e) { throw new Error("URL 编码串不完整，无法解码"); }
  }

  /* —— JSON ⇄ CSV —— */
  function csvEscape(v) {
    let s = v === null || v === undefined ? "" : String(v);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function jsonToCSV(text, delim) {
    delim = delim || ",";
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error("JSON 解析失败：" + e.message); }
    const rows = Array.isArray(data) ? data : [data];
    if (!rows.length) throw new Error("数组为空，没有可转的行");
    const keys = [];
    rows.forEach((r) => {
      if (r && typeof r === "object") Object.keys(r).forEach((k) => { if (!keys.includes(k)) keys.push(k); });
    });
    if (!keys.length) throw new Error("JSON 里没有对象字段（暂不支持嵌套，请先拍平）");
    const out = [keys.map(csvEscape).join(delim)];
    rows.forEach((r) => {
      out.push(keys.map((k) => csvEscape(r && typeof r === "object" ? r[k] : r)).join(delim));
    });
    return out.join("\n");
  }
  function parseCSV(text, delim) {
    delim = delim || ",";
    const s = String(text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    const rows = [];
    let row = [], field = "", inQ = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQ) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += c;
      } else if (c === '"') inQ = true;
      else if (c === delim) { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  function csvToJSON(text, delim) {
    const rows = parseCSV(text, delim);
    if (rows.length < 2) throw new Error("CSV 至少要有表头 + 一行数据");
    const head = rows[0].map((h) => h.trim());
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].length === 1 && rows[i][0] === "") continue;
      const obj = {};
      head.forEach((h, j) => { obj[h] = rows[i][j] !== undefined ? rows[i][j] : ""; });
      out.push(obj);
    }
    return JSON.stringify(out, null, 2);
  }

  /* —— 时间戳 ⇄ 日期 —— */
  function pad(n, w) { return String(n).padStart(w || 2, "0"); }
  function fmtLocal(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
      pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }
  function tsToDate(v) {
    const s = String(v).trim();
    if (!/^-?\d+$/.test(s)) throw new Error("时间戳应为整数（10 位秒或 13 位毫秒）");
    const n = Number(s);
    const ms = Math.abs(n) >= 1e11 ? n : n * 1000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) throw new Error("数值超出可表示的日期范围");
    const week = "日一二三四五六"[d.getDay()];
    return "本地时间　" + fmtLocal(d) + "（周" + week + "）\n" +
      "毫秒级　　" + d.getTime() + "\n" +
      "秒级　　　" + Math.floor(d.getTime() / 1000) + "\n" +
      "ISO 8601　" + d.toISOString();
  }
  function dateToTs(v) {
    const s = String(v).trim().replace(" ", "T");
    const d = new Date(s);
    if (isNaN(d.getTime())) throw new Error("日期无法解析（试试 2026-01-01 12:00:00）");
    return "秒级时间戳　" + Math.floor(d.getTime() / 1000) + "\n" +
      "毫秒级　　　" + d.getTime() + "\n" +
      "本地时间　　" + fmtLocal(d) + "\n" +
      "ISO 8601　　" + d.toISOString();
  }

  /* —— 进制 —— */
  function radixConv(v, from, to) {
    const DIG = "0123456789abcdefghijklmnopqrstuvwxyz";
    let s = String(v).trim().toLowerCase();
    if (from === 16 && s.startsWith("0x")) s = s.slice(2);
    if (from === 2 && s.startsWith("0b")) s = s.slice(2);
    if (from === 8 && s.startsWith("0o")) s = s.slice(2);
    if (!s) throw new Error("没有可解析的数字");
    for (const ch of s) {
      const idx = DIG.indexOf(ch);
      if (idx < 0 || idx >= from) throw new Error("字符「" + ch + "」不是 " + from + " 进制的合法数字");
    }
    return parseInt(s, from).toString(to).toUpperCase();
  }

  /* —— Hex ⇄ 文本 —— */
  function strToHex(s) {
    return Array.from(utf8.encode(String(s)))
      .map((b) => b.toString(16).padStart(2, "0")).join(" ");
  }
  function hexToStr(h) {
    const clean = String(h).replace(/[^0-9a-fA-F]/g, "");
    if (!clean) throw new Error("没有找到十六进制字符");
    if (clean.length % 2) throw new Error("十六进制位数应为偶数（现在是 " + clean.length + " 位）");
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return dec8(bytes, true);
  }

  /* —— 颜色 —— */
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
  }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }
  function parseColor(input) {
    const s = String(input).trim().toLowerCase();
    let r, g, b, kind, m;
    if ((m = s.match(/^#?([0-9a-f]{3})$/))) {
      r = parseInt(m[1][0] + m[1][0], 16); g = parseInt(m[1][1] + m[1][1], 16); b = parseInt(m[1][2] + m[1][2], 16);
      kind = "HEX(3)";
    } else if ((m = s.match(/^#?([0-9a-f]{6})$/))) {
      r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16);
      kind = "HEX(6)";
    } else if ((m = s.match(/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/))) {
      r = +m[1]; g = +m[2]; b = +m[3]; kind = "RGB";
    } else if ((m = s.match(/^hsla?\(\s*([\d.]+)(?:deg|°)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%/))) {
      [r, g, b] = hslToRgb(+m[1], +m[2], +m[3]); kind = "HSL";
    } else throw new Error("认不出的颜色格式，支持 #hex / rgb() / hsl()");
    if ([r, g, b].some((v) => v < 0 || v > 255)) throw new Error("RGB 分量须在 0–255 之间");
    const hx = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
    const [h, sa, l] = rgbToHsl(r, g, b);
    return "HEX　　" + hx + "\nRGB　　rgb(" + r + ", " + g + ", " + b + ")\nHSL　　hsl(" + h + ", " + sa + "%, " + l + "%)\n识别　　按 " + kind + " 解析";
  }

  /* —— Markdown → HTML —— */
  function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function htmlEscape(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function htmlUnescape(s) {
    return String(s)
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
      .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, n) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[n]));
  }
  function mdToHtml(md) {
    const lines = String(md).replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let para = [], list = null, fence = false, code = [];
    const inline = (t) => t
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
    const flushPara = () => { if (para.length) { out.push("<p>" + para.map(inline).join("<br>") + "</p>"); para = []; } };
    const flushList = () => { if (list) { out.push("</" + list + ">"); list = null; } };
    for (const raw of lines) {
      if (/^\s*```/.test(raw)) {
        if (fence) { out.push("<pre><code>" + code.map(escHtml).join("\n") + "</code></pre>"); code = []; }
        else { flushPara(); flushList(); }
        fence = !fence;
        continue;
      }
      if (fence) { code.push(raw); continue; }
      let m;
      if ((m = raw.match(/^(#{1,4})\s+(.*)$/))) {
        flushPara(); flushList();
        out.push("<h" + m[1].length + ">" + inline(escHtml(m[2])) + "</h" + m[1].length + ">");
        continue;
      }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(raw)) { flushPara(); flushList(); out.push("<hr>"); continue; }
      if ((m = raw.match(/^>\s?(.*)$/))) { flushPara(); flushList(); out.push("<blockquote>" + inline(escHtml(m[1])) + "</blockquote>"); continue; }
      if ((m = raw.match(/^\s*[-*+]\s+(.*)$/))) {
        flushPara();
        if (list !== "ul") { flushList(); list = "ul"; out.push("<ul>"); }
        out.push("<li>" + inline(escHtml(m[1])) + "</li>");
        continue;
      }
      if ((m = raw.match(/^\s*\d+[.)]\s+(.*)$/))) {
        flushPara();
        if (list !== "ol") { flushList(); list = "ol"; out.push("<ol>"); }
        out.push("<li>" + inline(escHtml(m[1])) + "</li>");
        continue;
      }
      if (!raw.trim()) { flushPara(); flushList(); continue; }
      para.push(escHtml(raw));
    }
    if (fence && code.length) out.push("<pre><code>" + code.map(escHtml).join("\n") + "</code></pre>");
    flushPara(); flushList();
    return out.join("\n");
  }

  return {
    toB64, fromB64, urlEnc, urlDec,
    jsonToCSV, csvToJSON, parseCSV, csvEscape,
    tsToDate, dateToTs, radixConv,
    strToHex, hexToStr, parseColor,
    mdToHtml, htmlEscape, htmlUnescape,
  };
})();
globalThis.ConvCore = ConvCore;

/* ══════════════ 浏览器装卸线 ══════════════ */
if (typeof document !== "undefined" && document.getElementById) {
  (function () {
    const $ = (id) => document.getElementById(id);
    const C = ConvCore;
    const LS_KEY = "convertdock_n";

    const RAIL = [
      { id: "jcsv",  num: "02", name: "JSON ⇄ CSV", hint: "自动识别方向：[ 或 { 开头按 JSON 进货，否则按 CSV 进货" },
      { id: "b64",   num: "03", name: "Base64", hint: "文本 ⇄ Base64，中文安全" },
      { id: "url",   num: "04", name: "URL 编码", hint: "地址栏转义与还原，+ 还原为空格" },
      { id: "ts",    num: "05", name: "时间戳", hint: "纯数字按时间戳进货，否则按日期进货" },
      { id: "radix", num: "06", name: "进制转换", hint: "二 / 八 / 十 / 十六进制互转" },
      { id: "color", num: "07", name: "颜色换算", hint: "支持 #hex / rgb() / hsl()，一次出全套" },
      { id: "md",    num: "08", name: "Markdown", hint: "Markdown → HTML 片段（标题/列表/代码/链接）" },
      { id: "esc",   num: "09", name: "HTML 转义", hint: "尖括号引号转义与还原" },
      { id: "hex",   num: "10", name: "Hex ⇄ 文本", hint: "十六进制字节 ⇄ 文本" },
      { id: "img",   num: "01", name: "图片转码", mode: "image", hint: "PNG / JPG / WebP 互转 · 可调质量与限宽" },
    ];

    const state = { cur: null, img: null, blob: null, fname: "out.txt" };

    /* 泊位轨道 */
    const rail = $("berthRail");
    RAIL.forEach((c) => {
      const b = document.createElement("button");
      b.className = "berth";
      b.dataset.conv = c.id;
      b.innerHTML = '<span class="no">' + c.num + '</span><span>' + c.name + "</span>";
      b.addEventListener("click", () => pick(c.id));
      rail.appendChild(b);
    });

    function pick(id) {
      state.cur = id;
      state.blob = null;
      document.querySelectorAll(".berth").forEach((b) => b.classList.toggle("on", b.dataset.conv === id));
      const conv = RAIL.find((c) => c.id === id);
      $("inText").hidden = conv.mode === "image";
      $("dropZone").hidden = conv.mode !== "image";
      $("outText").hidden = false;
      $("outPreview").hidden = true;
      $("outErr").hidden = true;
      $("outText").value = "";
      $("outMeta").textContent = "—";
      $("inMeta").textContent = "等待装货";
      $("transferNote").textContent = "泊位 " + conv.num;
      renderOpts(conv);
    }

    /* 选项条 */
    function opt(label, inner) { return '<label class="opt"><span>' + label + "</span>" + inner + "</label>"; }
    function renderOpts(conv) {
      const strip = $("optsStrip");
      let html = '<span class="opt-hint">' + conv.hint + "</span>";
      if (conv.id === "img") {
        html += opt("格式", '<select id="oFmt"><option value="image/png">PNG</option><option value="image/jpeg">JPG</option><option value="image/webp">WebP</option></select>');
        html += opt("质量", '<input type="range" id="oQ" min="10" max="100" value="88"><b id="oQv">88</b>');
        html += opt("限宽", '<input type="number" id="oW" min="0" placeholder="不限" class="num-in">');
      } else if (conv.id === "jcsv") {
        html += opt("分隔符", '<select id="oD"><option value=",">逗号 ,</option><option value=";">分号 ;</option><option value="\t">制表符 Tab</option></select>');
      } else if (["b64", "url", "esc", "hex"].includes(conv.id)) {
        html += '<span class="opt"><span class="pill on" data-dir="enc">编码 →</span><span class="pill" data-dir="dec">← 解码</span></span>';
      } else if (conv.id === "radix") {
        html += opt("进货进制", '<select id="oFrom"><option value="2">2 进制</option><option value="8">8 进制</option><option value="10" selected>10 进制</option><option value="16">16 进制</option></select>');
        html += opt("出货进制", '<select id="oTo"><option value="2">2 进制</option><option value="8">8 进制</option><option value="10">10 进制</option><option value="16" selected>16 进制</option></select>');
      }
      strip.innerHTML = html;
      if ($("oQ")) $("oQ").addEventListener("input", () => { $("oQv").textContent = $("oQ").value; });
      document.querySelectorAll(".pill").forEach((p) => {
        p.addEventListener("click", () => {
          document.querySelectorAll(".pill").forEach((x) => x.classList.remove("on"));
          p.classList.add("on");
        });
      });
    }
    function direction() {
      const on = document.querySelector(".pill.on");
      return on ? on.dataset.dir : "enc";
    }

    /* 图片装卸 */
    const dz = $("dropZone"), fi = $("fileInput"), srcPrev = $("srcPreview");
    dz.addEventListener("click", () => fi.click());
    fi.addEventListener("change", () => { if (fi.files[0]) loadImg(fi.files[0]); });
    ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("hot"); }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("hot"); }));
    dz.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) loadImg(f); });
    function fmtSize(n) {
      return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(2) + " MB";
    }
    function loadImg(file) {
      if (!/^image\//.test(file.type)) { showErr("这不是图片文件：" + file.name); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        state.img = img;
        state.fname = (file.name.replace(/\.[^.]+$/, "") || "image");
        srcPrev.src = url;
        srcPrev.hidden = false;
        dz.classList.add("loaded");
        $("inMeta").textContent = img.naturalWidth + " × " + img.naturalHeight + " · " + fmtSize(file.size) + " · " + (file.type.split("/")[1] || "?").toUpperCase();
      };
      img.onerror = () => showErr("图片读取失败");
      img.src = url;
    }
    function runImage() {
      if (!state.img) { showErr("还没装图片，先拖一张进进货区"); return; }
      const fmt = $("oFmt").value;
      const q = ($("oQ") ? +$("oQ").value : 88) / 100;
      const maxW = +($("oW") ? $("oW").value : 0) || 0;
      const img = state.img;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (maxW && w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d");
      if (fmt === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
      ctx.drawImage(img, 0, 0, w, h);
      cv.toBlob((blob) => {
        if (!blob) { showErr("导出失败，浏览器不支持该格式"); return; }
        state.blob = blob;
        const ext = fmt === "image/png" ? "png" : fmt === "image/jpeg" ? "jpg" : "webp";
        state.fname = (state.fname || "image") + "." + ext;
        $("outText").hidden = true;
        $("outPreview").hidden = false;
        $("outPreview").src = URL.createObjectURL(blob);
        $("outMeta").textContent = w + " × " + h + " · " + (fmt.split("/")[1] || "").toUpperCase() + " · " + fmtSize(blob.size);
        bump();
        toast("转码完成 · " + ext.toUpperCase());
      }, fmt, fmt === "image/png" ? undefined : q);
    }

    /* 主转运 */
    $("goBtn").addEventListener("click", () => {
      $("outErr").hidden = true;
      $("outPreview").hidden = true;
      $("outText").hidden = false;
      state.blob = null;
      if (RAIL.find((c) => c.id === state.cur).mode === "image") { runImage(); return; }
      const src = $("inText").value;
      $("outText").value = "";
      if (!src.trim()) { showErr("进货区是空的，先装货"); return; }
      let out = "", meta = "";
      try {
        const d = direction();
        switch (state.cur) {
          case "jcsv": {
            const t = src.trim();
            const delim = $("oD") ? $("oD").value : ",";
            const dName = delim === "\t" ? "Tab" : delim;
            if (t[0] === "[" || t[0] === "{") { out = C.jsonToCSV(src, delim); meta = "JSON → CSV"; state.fname = "out.csv"; }
            else { out = C.csvToJSON(src, delim); meta = "CSV → JSON"; state.fname = "out.json"; }
            meta += " · 分隔符 " + dName;
            break;
          }
          case "b64":
            out = d === "dec" ? C.fromB64(src) : C.toB64(src);
            meta = d === "dec" ? "Base64 → 文本" : "文本 → Base64";
            state.fname = d === "dec" ? "decoded.txt" : "encoded.b64.txt";
            break;
          case "url":
            out = d === "dec" ? C.urlDec(src) : C.urlEnc(src);
            meta = d === "dec" ? "URL 解码" : "URL 编码";
            state.fname = "out.txt";
            break;
          case "esc":
            out = d === "dec" ? C.htmlUnescape(src) : C.htmlEscape(src);
            meta = d === "dec" ? "HTML 还原" : "HTML 转义";
            state.fname = "out.txt";
            break;
          case "hex":
            out = d === "dec" ? C.hexToStr(src) : C.strToHex(src);
            meta = d === "dec" ? "Hex → 文本" : "文本 → Hex";
            state.fname = d === "dec" ? "decoded.txt" : "bytes.hex.txt";
            break;
          case "ts":
            if (/^-?\d+$/.test(src.trim())) { out = C.tsToDate(src); meta = "时间戳 → 日期"; }
            else { out = C.dateToTs(src); meta = "日期 → 时间戳"; }
            state.fname = "out.txt";
            break;
          case "radix": {
            const from = +$("oFrom").value, to = +$("oTo").value;
            out = C.radixConv(src, from, to);
            meta = from + " 进制 → " + to + " 进制";
            state.fname = "out.txt";
            break;
          }
          case "color":
            out = C.parseColor(src);
            meta = "颜色格式换算";
            state.fname = "out.txt";
            break;
          case "md":
            out = C.mdToHtml(src);
            meta = "Markdown → HTML";
            state.fname = "out.html";
            break;
        }
        $("outText").value = out;
        $("outMeta").textContent = meta + " · " + out.length + " 字符";
        bump();
        toast("转运完成 · " + meta);
      } catch (e) {
        showErr(e && e.message ? e.message : String(e));
      }
    });

    /* 出货动作 */
    $("copyBtn").addEventListener("click", async () => {
      const val = $("outPreview").hidden ? $("outText").value : "";
      if (!val) { toast("出货区没有可复制的文本"); return; }
      try {
        await navigator.clipboard.writeText(val);
        toast("已复制到剪贴板");
      } catch (e) {
        $("outText").select();
        document.execCommand("copy");
        toast("已复制到剪贴板");
      }
    });
    $("dlBtn").addEventListener("click", () => {
      let blob, name;
      if (!$("outPreview").hidden && state.blob) { blob = state.blob; name = state.fname; }
      else if ($("outText").value) { blob = new Blob([$("outText").value], { type: "text/plain;charset=utf-8" }); name = state.fname; }
      else { toast("出货区是空的"); return; }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
    $("clearBtn").addEventListener("click", () => {
      $("inText").value = "";
      $("outText").value = "";
      $("outMeta").textContent = "—";
      $("inMeta").textContent = "等待装货";
      $("outErr").hidden = true;
      $("outPreview").hidden = true;
      $("outText").hidden = false;
      srcPrev.hidden = true;
      state.img = null;
      state.blob = null;
      dz.classList.remove("loaded");
      fi.value = "";
    });

    /* 反馈 */
    function showErr(msg) {
      const el = $("outErr");
      el.textContent = "⛔ " + msg;
      el.hidden = false;
      $("outMeta").textContent = "转运受阻";
    }
    let toastT = null;
    function toast(msg) {
      const t = $("toast");
      t.textContent = msg;
      t.classList.add("show");
      clearTimeout(toastT);
      toastT = setTimeout(() => t.classList.remove("show"), 1800);
    }
    function bump() {
      let n = 0;
      try { n = +localStorage.getItem(LS_KEY) || 0; } catch (e) { /* 隐私模式下忽略 */ }
      n++;
      try { localStorage.setItem(LS_KEY, String(n)); } catch (e) { /* 同上 */ }
      $("statNum").textContent = n;
    }
    try { $("statNum").textContent = (+localStorage.getItem(LS_KEY) || 0) || "0"; } catch (e) { /* 忽略 */ }
    window.addEventListener("error", (e) => {
      const s = $("errSink");
      if (s) s.textContent = "JS错误: " + (e.message || e.type);
    });

    pick("jcsv");
  })();
}
