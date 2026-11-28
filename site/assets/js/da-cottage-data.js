/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 小屋专属数据（DA_COTTAGE_DATA）
   ----------------------------------------------------------------------
   · 独立于档案室：只用 DA_COTTAGE_HOME 这一个键，不碰 DA_STORE /
     DA_ARCHIVE / DA2_READINGS 等任何档案数据。关系追踪与档案是两套。
   · 照片墙：用户从相册选图 → canvas 压缩 → base64 存本机。
   · 特殊日期：纪念日 / 生日 / 特别的日子。
   · 关系追踪：小屋里自己记下的里程碑，与塔罗档案无关。
   · 惊喜话语：只存用户自己写的句子；飘落的话语由 da-cottage-voices.js
     从真实占卜/传讯/来信记录里摘取，不使用任何内置句子。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var KEY = 'DA_COTTAGE_HOME';
  var MAX_PHOTOS = 36;
  var MAX_REL = 60;
  var MAX_DAYS = 40;
  var MAX_LINES = 80;

  function blank() {
    return { v: 1, photos: [], rel: [], days: [], lines: [], updatedAt: 0 };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      var d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return blank();
      ['photos', 'rel', 'days', 'lines'].forEach(function (k) {
        if (!Array.isArray(d[k])) d[k] = [];
      });
      return d;
    } catch (e) { return blank(); }
  }

  function save(d) {
    d.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(d)); return true; }
    catch (e) { return false; } /* 容量满：调用方据此提示 */
  }

  function uid() {
    return 'x_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ── 照片墙 ─────────────────────────────────────────────────────── */
  function photos() {
    return load().photos.slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
  }
  /* file: File/Blob → 压缩后存 base64 */
  function addPhoto(file, title) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('请选择图片文件')); return; }
      var d = load();
      if (d.photos.length >= MAX_PHOTOS) { reject(new Error('照片墙最多放 ' + MAX_PHOTOS + ' 张，先删掉一些吧')); return; }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('读不出这张图')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('这张图打不开')); };
        img.onload = function () {
          /* 最长边压到 720px，控制体积 */
          var max = 720, w = img.width, h = img.height;
          var scale = Math.min(1, max / Math.max(w, h));
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          var ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          var src;
          try { src = cv.toDataURL('image/webp', 0.72); }
          catch (e) { src = cv.toDataURL('image/jpeg', 0.72); }
          if (src.indexOf('data:image/') !== 0) { reject(new Error('图片处理失败')); return; }
          d.photos.unshift({
            id: uid(), src: src,
            title: String(title || '').slice(0, 24) || '一张照片',
            at: Date.now()
          });
          if (!save(d)) { reject(new Error('本机空间不够了，先删掉几张旧照片')); return; }
          resolve(d.photos[0]);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function removePhoto(id) {
    var d = load();
    var n = d.photos.length;
    d.photos = d.photos.filter(function (p) { return p.id !== id; });
    if (d.photos.length === n) return false;
    return save(d);
  }
  function setPhotoTitle(id, title) {
    var d = load(), hit = false;
    d.photos.forEach(function (p) { if (p.id === id) { p.title = String(title || '').slice(0, 24) || '一张照片'; hit = true; } });
    return hit ? save(d) : false;
  }

  /* ── 关系追踪（小屋独立，与档案无关）────────────────────────────── */
  function rel() {
    return load().rel.slice().sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
  }
  function addRel(title, note, at) {
    var d = load();
    if (d.rel.length >= MAX_REL) return { ok: false, msg: '最多记 ' + MAX_REL + ' 条' };
    var t = String(title || '').trim().slice(0, 30);
    if (!t) return { ok: false, msg: '给它起个名字吧' };
    d.rel.push({ id: uid(), title: t, note: String(note || '').trim().slice(0, 120), at: Number(at) || Date.now() });
    if (!save(d)) return { ok: false, msg: '本机空间不够了' };
    return { ok: true };
  }
  function removeRel(id) {
    var d = load(), n = d.rel.length;
    d.rel = d.rel.filter(function (r) { return r.id !== id; });
    return d.rel.length !== n && save(d);
  }

  /* ── 特殊日期 ─────────────────────────────────────────────────────── */
  function days() {
    return load().days.slice().sort(function (a, b) {
      return String(a.date || '').localeCompare(String(b.date || ''));
    });
  }
  /* date: 'YYYY-MM-DD'；type: birthday | anniversary | custom */
  function addDay(title, date, type) {
    var d = load();
    if (d.days.length >= MAX_DAYS) return { ok: false, msg: '最多记 ' + MAX_DAYS + ' 个日子' };
    var t = String(title || '').trim().slice(0, 24);
    if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return { ok: false, msg: '名称和日期都要填' };
    d.days.push({ id: uid(), title: t, date: date, type: type || 'custom', at: Date.now() });
    if (!save(d)) return { ok: false, msg: '本机空间不够了' };
    return { ok: true };
  }
  function removeDay(id) {
    var d = load(), n = d.days.length;
    d.days = d.days.filter(function (x) { return x.id !== id; });
    return d.days.length !== n && save(d);
  }
  /* 距离下一次这个日子还有几天（0 = 就是今天） */
  function daysUntil(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return null;
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var parts = dateStr.split('-');
    var target = new Date(now.getFullYear(), Number(parts[1]) - 1, Number(parts[2]));
    if (target < now) target = new Date(now.getFullYear() + 1, Number(parts[1]) - 1, Number(parts[2]));
    return Math.round((target - now) / 86400000);
  }

  /* ── 惊喜话语 ─────────────────────────────────────────────────────── */
  function lines() { return load().lines.slice(); }
  /* 仅保留用户自己写下的句子；不再拼接任何内置句子 */
  function allLines() {
    return load().lines.map(function (l) { return l.text; });
  }
  function addLine(text) {
    var d = load();
    var t = String(text || '').trim().slice(0, 60);
    if (!t) return { ok: false, msg: '写一句话吧' };
    if (d.lines.length >= MAX_LINES) d.lines.shift();
    d.lines.push({ id: uid(), text: t, at: Date.now() });
    if (!save(d)) return { ok: false, msg: '本机空间不够了' };
    return { ok: true };
  }
  function removeLine(id) {
    var d = load(), n = d.lines.length;
    d.lines = d.lines.filter(function (l) { return l.id !== id; });
    return d.lines.length !== n && save(d);
  }

  window.DA_COTTAGE_DATA = {
    KEY: KEY, MAX_PHOTOS: MAX_PHOTOS,
    esc: esc,
    photos: photos, addPhoto: addPhoto, removePhoto: removePhoto, setPhotoTitle: setPhotoTitle,
    rel: rel, addRel: addRel, removeRel: removeRel,
    days: days, addDay: addDay, removeDay: removeDay, daysUntil: daysUntil,
    lines: lines, allLines: allLines, addLine: addLine, removeLine: removeLine
  };
})();
