// ==UserScript==
// @name         AMSS ส่งหนังสือ - กรอกข้อมูลอัตโนมัติจาก "ร่างหนังสือนำส่ง"
// @namespace    ban-kaeng-charoen
// @version      1.7
// @description  รับข้อมูลจากแอปร่างหนังสือนำส่ง แล้วกรอกฟอร์มส่งหนังสือให้ (ไม่กดส่งให้ ต้องตรวจและกดเอง)
// @match        http://101.51.2.178/amss-ubn3/*
// @grant        none
// @run-at       document-idle
// @inject-into  page
// ==/UserScript==
(function () {
  "use strict";
  var T;
  try { T = window.top; if (!T.document) { T = window; } } catch (e) { T = window; }   // หน้าหลักสุด (เผื่อฟอร์มอยู่ในเฟรม)
  var IS_TOP = (T === window);
  var op = null;
  try { op = T.opener || window.opener; } catch (e) { op = window.opener; }
  var filled = false;

  function norm(t) { return String(t || "").replace(/\s+/g, " ").trim(); }
  function ownText(el) {
    var t = "";
    for (var i = 0; i < el.childNodes.length; i++) if (el.childNodes[i].nodeType === 3) t += el.childNodes[i].textContent;
    t = norm(t);
    return t || norm(el.textContent);
  }
  var TEXT = "input[type=text],input:not([type]),input[type=search],textarea";

  /* หาช่องกรอกจากข้อความหัวข้อ: label[for] -> ช่องถัดจากหัวข้อในแถวเดียวกัน -> name/id/placeholder */
  function findControl(re, sel, skip) {
    skip = skip || [];
    var ok = function (e) { return e && skip.indexOf(e) < 0 && !e.disabled && e.type !== "hidden"; };
    var labels = document.querySelectorAll("label");
    for (var i = 0; i < labels.length; i++) {
      var l = labels[i];
      if (!re.test(norm(l.textContent))) continue;
      if (l.htmlFor) { var e1 = document.getElementById(l.htmlFor); if (e1 && e1.matches(sel) && ok(e1)) return e1; }
      var in1 = l.querySelector(sel); if (ok(in1)) return in1;
    }
    var cells = document.querySelectorAll("td,th,div,span,p,b,strong,dt,label,li,font");
    for (var j = 0; j < cells.length; j++) {
      var c = cells[j], own = ownText(c);
      if (own.length > 70 || !re.test(own)) continue;
      var el = c;
      for (var d = 0; d < 4 && el; d++) {
        var n = el.nextElementSibling;
        while (n) { var f = n.matches(sel) ? n : n.querySelector(sel); if (ok(f)) return f; n = n.nextElementSibling; }
        el = el.parentElement;
      }
    }
    var all = document.querySelectorAll(sel);
    for (var k = 0; k < all.length; k++) {
      var s = (all[k].name || "") + " " + (all[k].id || "") + " " + (all[k].placeholder || "");
      if (re.test(s) && ok(all[k])) return all[k];
    }
    return null;
  }
  function setVal(el, v) {
    var proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  /* กล่องแจ้งสถานะ (แสดงในหน้าหลักสุด) */
  function banner(title, lines, bad) {
    var doc = T.document, b = doc.getElementById("amss-fill-banner");
    if (!b) {
      b = doc.createElement("div"); b.id = "amss-fill-banner";
      b.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483647;max-width:380px;background:#fff;color:#1b2233;border:2px solid #e8710a;border-radius:12px;padding:10px 14px;font:14px/1.5 sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.3)";
      (doc.body || doc.documentElement).appendChild(b);
    }
    b.innerHTML = "";
    var h = doc.createElement("div"); h.style.cssText = "font-weight:700;margin-bottom:4px;color:" + (bad ? "#b3261e" : "#c85f00");
    h.textContent = title; b.appendChild(h);
    (lines || []).forEach(function (t) { var d = doc.createElement("div"); d.textContent = t; b.appendChild(d); });
    var x = doc.createElement("button"); x.type = "button"; x.textContent = "ปิด"; x.style.cssText = "margin-top:6px;padding:3px 12px";
    x.onclick = function () { b.remove(); }; b.appendChild(x);
  }

  /* เลือก “ถึง” จากปุ่มเลือก (radio) หรือรายการเลือก (select) ที่ข้อความตรงกัน */
  function cmp(t) { return norm(t).replace(/[ๆฯ\s]/g, ""); }
  function pickGroup(name) {
    var want = cmp(name), i, e, txt;
    var radios = document.querySelectorAll("input[type=radio]");
    for (i = 0; i < radios.length; i++) {
      e = radios[i]; txt = "";
      if (e.id) { var lb = document.querySelector('label[for="' + e.id + '"]'); if (lb) txt = lb.textContent; }
      if (!txt && e.parentElement && e.parentElement.tagName === "LABEL") txt = e.parentElement.textContent;
      if (!txt) { var n = e.nextSibling; while (n && !txt) { txt = n.textContent; n = n.nextSibling; } }
      if (!txt && e.parentElement) txt = e.parentElement.textContent;
      if (cmp(txt) === want || (cmp(txt) && want.indexOf(cmp(txt)) === 0 && cmp(txt).length > 6)) {
        e.click(); e.checked = true; e.dispatchEvent(new Event("change", { bubbles: true })); return true;
      }
    }
    var sels = document.querySelectorAll("select");
    for (i = 0; i < sels.length; i++) {
      for (var j = 0; j < sels[i].options.length; j++) {
        if (cmp(sels[i].options[j].text) === want) { sels[i].value = sels[i].options[j].value; sels[i].dispatchEvent(new Event("change", { bubbles: true })); return true; }
      }
    }
    return false;
  }

  /* วันที่: ดูรูปแบบเดิมในช่อง (ถ้ามี) แล้วกรอกให้ตรงรูปแบบ; รองรับ input[type=date], ข้อความ และรายการเลือก วัน/เดือน/ปี */
  var THM = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  var THS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  function fmtDate(el, iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3], be = y + 543, cur = norm(el.value || ""), pad = function (n) { return (n < 10 ? "0" : "") + n; };
    if (el.type === "date") return iso;
    var mm = /^(\d{1,2})([\/\-.])(\d{1,2})\2(\d{4})$/.exec(cur);
    if (mm) { var yy = +mm[4] > 2400 ? be : y, z = mm[1].length === 2; return (z ? pad(d) : d) + mm[2] + (mm[3].length === 2 ? pad(mo) : mo) + mm[2] + yy; }
    var ph = (el.placeholder || "") + " " + cur;
    if (/[ก-ฮ]/.test(cur)) { return d + " " + (/\./.test(cur) ? THS[mo - 1] : THM[mo - 1]) + " " + (/(^|\s)(25|26)\d\d/.test(cur) || !/\b20\d\d\b/.test(cur) ? be : y); }
    if (/yyyy|dd\/mm|วว\/ดด/i.test(ph) && /-/.test(ph)) return pad(d) + "-" + pad(mo) + "-" + be;
    return pad(d) + "/" + pad(mo) + "/" + be;
  }
  /* วันที่แบบ วัน / เดือน / ปี อยู่แถวเดียวกับหัวข้อ "ลงวันที่" (ปีอาจเป็นช่องพิมพ์ และอาจเป็น ค.ศ.) */
  function putDateRow(f) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.dateISO || ""); if (!m) return null;
    var dd = +m[3], mo = +m[2], yy = +m[1], pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var lab = null, all = document.querySelectorAll("td,th,div,span,label,b,strong,font,p");
    for (var i = 0; i < all.length && !lab; i++) { var o = ownText(all[i]).replace(/[:：\s]/g, ""); if (o.length < 14 && /^(ลง)?วันที่$/.test(o)) lab = all[i]; }
    if (!lab) return null;
    var row = lab.closest("tr") || lab.parentElement, ctr = [];
    var els = row ? row.querySelectorAll("select,input") : [];
    for (var j = 0; j < els.length; j++) {
      var c = els[j], t = (c.type || "").toLowerCase();
      if (/hidden|file|checkbox|radio|button|submit|image/.test(t) || c.disabled) continue;
      if (lab.compareDocumentPosition(c) & 4) ctr.push(c);
    }
    var dS = null, mS = null, yC = null;
    ctr.forEach(function (c) {
      if (c.tagName === "SELECT") {
        var n = c.options.length, txt = [].map.call(c.options, function (o) { return norm(o.text); });
        if (!mS && txt.some(function (x) { return THM.indexOf(x) >= 0 || THS.indexOf(x) >= 0; })) mS = c;
        else if (!dS && txt.indexOf("31") >= 0 && txt.indexOf("1") >= 0 || (!dS && txt.indexOf("31") >= 0)) dS = c;
        else if (!mS && n >= 12 && n <= 14 && txt.indexOf("12") >= 0) mS = c;
        else if (!yC && txt.some(function (x) { return /^(19|20|25)\d\d$/.test(x); })) yC = c;
      } else if (!yC) yC = c;
    });
    var selVal = function (s, cands) {
      for (var k = 0; k < s.options.length; k++) {
        var t = norm(s.options[k].text), v = norm(s.options[k].value);
        if (cands.indexOf(t) >= 0 || cands.indexOf(v) >= 0) { s.selectedIndex = k; s.dispatchEvent(new Event("input", { bubbles: true })); s.dispatchEvent(new Event("change", { bubbles: true })); return true; }
      }
      return false;
    };
    var ok1 = dS && selVal(dS, [String(dd), pad(dd)]);
    var ok2 = mS && selVal(mS, [THM[mo - 1], THS[mo - 1], String(mo), pad(mo)]);
    var ok3 = false;
    if (yC && yC.tagName === "SELECT") ok3 = selVal(yC, [String(yy + 543), String(yy)]);
    else if (yC) {
      var cur = norm(yC.value || ""), yv = /^20\d\d$/.test(cur) ? yy : yy + 543;
      setVal(yC, String(yv)); yC.dispatchEvent(new Event("blur", { bubbles: true })); ok3 = true;
    }
    return (ok1 && ok2 && ok3) ? "✓ วันที่: " + f.dateTH : null;
  }
  function putDate(f, used) {
    var rr = putDateRow(f); if (rr) return rr;
    var el = findControl(/^วันที่/, "input[type=date],input[type=text],input:not([type])", used);
    if (el) { var v = fmtDate(el, f.dateISO); if (v) { used.push(el); setVal(el, v); return "✓ วันที่: " + v; } }
    /* แบบเลือก วัน / เดือน / ปี */
    var lab = null, cells = document.querySelectorAll("td,th,div,span,label,b,strong,font");
    for (var i = 0; i < cells.length && !lab; i++) { var own = ownText(cells[i]); if (own.length < 40 && /^วันที่/.test(own)) lab = cells[i]; }
    if (lab) {
      var box = lab.nextElementSibling || lab.parentElement, sels = box ? box.querySelectorAll("select") : [];
      if (sels.length >= 3) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.dateISO || "");
        if (m) {
          var dd = +m[3], mo = +m[2], yy = +m[1];
          var setSel = function (s, cands) { for (var k = 0; k < s.options.length; k++) { var t = norm(s.options[k].text), v = norm(s.options[k].value); if (cands.indexOf(t) >= 0 || cands.indexOf(v) >= 0) { s.value = s.options[k].value; s.dispatchEvent(new Event("change", { bubbles: true })); return true; } } return false; };
          var ok1 = setSel(sels[0], [String(dd), (dd < 10 ? "0" : "") + dd]);
          var ok2 = setSel(sels[1], [THM[mo - 1], THS[mo - 1], String(mo), (mo < 10 ? "0" : "") + mo]);
          var ok3 = setSel(sels[2], [String(yy + 543), String(yy)]);
          if (ok1 && ok2 && ok3) return "✓ วันที่: " + f.dateTH;
        }
      }
    }
    return null;
  }

  function fill(data) {
    var f = data.fields, rep = [], miss = 0, used = [];
    function put(label, re, val, sel) {
      var el = findControl(re, sel || TEXT, used);
      if (el) { used.push(el); setVal(el, val); rep.push("✓ " + label); } else { rep.push("✗ " + label + " (หาช่องไม่พบ)"); miss++; }
    }
    if (f.toGroup) {
      if (pickGroup(f.toGroup)) rep.push("✓ ถึง: " + f.toGroup); else { rep.push("✗ ถึง: " + f.toGroup + " (หาตัวเลือกไม่พบ)"); miss++; }
    }
    if (f.dateISO) {
      var dr = putDate(f, used);
      if (dr) rep.push(dr); else { rep.push("✗ วันที่ (หาช่องไม่พบ หรือรูปแบบต่างจากที่คาด)"); miss++; }
    }
    put("เลขที่หนังสือ", /เลขที่\s*หนังสือ|เลขที่/, f.no);
    put("เรื่อง", /^เรื่อง$|^เรื่อง\b/, f.subject);
    put("เนื้อหาโดยสรุป", /เนื้อหา\s*โดย\s*สรุป|เนื้อหา|สรุป/, f.summary, "textarea,input[type=text],input:not([type])");
    put("คำอธิบายไฟล์", /คำอธิบาย\s*ไฟล์|คำอธิบาย/, f.fileDesc);
    var fi = findControl(/ไฟล์\s*แนบ\s*1|ไฟล์แนบ|แนบไฟล์/, "input[type=file]") || document.querySelector("input[type=file]");
    if (fi && data.file) {
      try {
        var dt = new DataTransfer();
        dt.items.add(new File([data.file.buffer], data.file.name, { type: data.file.type || "application/pdf" }));
        fi.files = dt.files;
        fi.dispatchEvent(new Event("input", { bubbles: true }));
        fi.dispatchEvent(new Event("change", { bubbles: true }));
        rep.push("✓ ไฟล์แนบ 1: " + data.file.name);
      } catch (e) { rep.push("✗ ไฟล์แนบ 1 (แนบไม่สำเร็จ)"); miss++; }
    } else if (fi && !data.file) { rep.push("• ไฟล์แนบ 1: กรุณาแนบเอง" + (f.fileName ? " (ไฟล์ “" + f.fileName + "” ที่บันทึกไว้)" : "")); }
    else { rep.push("✗ ไฟล์แนบ 1 (หาช่องไม่พบ)"); miss++; }
    banner(miss > 0 ? "กรอกให้ได้บางช่อง กรุณาตรวจสอบ" : "กรอกข้อมูลให้แล้ว กรุณาตรวจสอบก่อนกดส่ง", rep, miss > 0);
    filled = true;
    try { if (op) op.postMessage({ type: "amss-done" }, "*"); } catch (e) {}
    try { T.sessionStorage.setItem("amssAutofillDone", "1"); T.sessionStorage.removeItem("amssFields"); } catch (e) {}   /* กรอกเสร็จแล้ว หยุดทำงานในแท็บนี้ จนกว่าจะกด "ส่ง" จากแอปใหม่ (เปิดแท็บใหม่) */
  }

  /* ทำงานเฉพาะหน้าที่ถูกเปิดจากปุ่ม "ส่ง" ในแอป และเพียงครั้งเดียวต่อแท็บ; หน้าอื่นของเว็บ (เปิดเอง) ไม่ทำอะไรเลย ไม่แสดงอะไร */
  /* ข้อมูลที่แนบมากับลิงก์ (#amss=...) จากแอป — ใช้เมื่อหน้าต่างเชื่อมกับแอปไม่ได้ (เช่น iPhone) กรอกข้อความได้ แต่แนบไฟล์เองต้องทำเอง */
  var SS = null; try { SS = T.sessionStorage; } catch (e) {}
  var hasHash = false;
  if (IS_TOP) {
    try {
      var hm = /[#&]amss=([A-Za-z0-9_\-]+)/.exec(location.hash || "");
      if (hm && SS) {
        var b64 = hm[1].replace(/-/g, "+").replace(/_/g, "/"); while (b64.length % 4) b64 += "=";
        var obj = JSON.parse(decodeURIComponent(escape(atob(b64))));
        SS.setItem("amssFields", JSON.stringify(obj)); SS.removeItem("amssAutofillDone"); hasHash = true;
        try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
      }
    } catch (e) {}
  }
  var DONE = false, stored = null;
  try { DONE = !!SS && SS.getItem("amssAutofillDone") === "1"; stored = SS && SS.getItem("amssFields"); } catch (e) {}
  if (DONE || (!op && !stored)) return;

  /* หน้าหลักสุดรับข้อมูลจากแอป เก็บไว้ให้ทุกเฟรมมาเอาไปใช้ */
  if (IS_TOP) {
    if (op) {
      window.addEventListener("message", function (e) {
        if (e.source !== op) return;
        var d = e.data;
        if (!d || d.type !== "amss-fill") return;
        T.__amssData = d;
        banner("ได้รับข้อมูลจากแอปแล้ว กำลังกรอก…", [], false);
      });
      /* ถามแอปซ้ำไปเรื่อย ๆ จนกว่าจะได้ข้อมูลและกรอกเสร็จ (ไม่ตัดเวลา เผื่อต้องล็อกอินหรือเปลี่ยนหน้าก่อน) */
      var pinger = setInterval(function () {
        if (T.__amssData || T.__amssFilled) { clearInterval(pinger); return; }
        try { op.postMessage({ type: "amss-ready" }, "*"); } catch (e) {}
      }, 1500);
    }
    /* สำรอง: ถ้าแอปไม่ตอบ (หรือไม่มีหน้าต่างแอป) ใช้ข้อมูลจากลิงก์ ไม่มีไฟล์แนบ */
    if (stored) {
      setTimeout(function () {
        if (T.__amssData || T.__amssFilled) return;
        try { T.__amssData = { fields: JSON.parse(stored), file: null, fromLink: true }; } catch (e) {}
      }, op ? 6000 : 300);
    }
  }

  /* ทุกเฟรม (รวมหน้าหลัก): พอมีข้อมูลและมีช่องแนบไฟล์ในเฟรมนี้ ก็กรอก */
  var iv = setInterval(function () {
    if (filled) { clearInterval(iv); return; }
    var d = T.__amssData;
    if (!d || T.__amssFilled) return;
    if (!document.querySelector("input[type=file]")) return;
    T.__amssFilled = true;
    try { fill(d); } catch (err) { banner("เกิดข้อผิดพลาด", [err.message], true); }
  }, 800);
})();
