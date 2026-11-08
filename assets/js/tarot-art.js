/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR TAROT｜维度锚点塔罗
   视觉核心 — 卡牌比例 / 银金星轨边框 / 月环之门牌背 / 插画母版
   --------------------------------------------------------------------
   卡面 400 × 600（2:3）
     插画窗口   x 26  y 46  w 348  h 430   （场景坐标 0..348 × 0..430）
     牌号牌匾   y 32..60 居中
     牌名区     y 486..590
   ══════════════════════════════════════════════════════════════════════ */
window.DA_ART = (function () {
  'use strict';

  var AW = 348, AH = 430, W = 400, H = 600;

  /* ── 基础绘图指令 ───────────────────────────────────────────── */
  function F(d, f, o) { return '<path d="' + d + '" fill="' + f + '" opacity="' + (o == null ? 1 : o) + '"/>'; }
  function S(d, c, w, o) {
    return '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + (w == null ? 1 : w) +
      '" stroke-linecap="round" stroke-linejoin="round" opacity="' + (o == null ? 1 : o) + '"/>';
  }
  function CI(x, y, r, f, o) {
    return '<circle cx="' + r2(x) + '" cy="' + r2(y) + '" r="' + r2(r) + '" fill="' + f + '" opacity="' + (o == null ? 1 : o) + '"/>';
  }
  function EL(x, y, rx, ry, f, o, rot) {
    return '<ellipse cx="' + r2(x) + '" cy="' + r2(y) + '" rx="' + r2(rx) + '" ry="' + r2(ry) + '" fill="' + f +
      '" opacity="' + (o == null ? 1 : o) + '"' + (rot ? ' transform="rotate(' + rot + ' ' + r2(x) + ' ' + r2(y) + ')"' : '') + '/>';
  }
  function RC(x, y, w, h, rx, f, o) {
    return '<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) + '" rx="' + r2(rx || 0) +
      '" fill="' + f + '" opacity="' + (o == null ? 1 : o) + '"/>';
  }
  function r2(v) { return Math.round(v * 100) / 100; }

  /* ── 随机（可复现） ─────────────────────────────────────────── */
  function rng(seed) {
    var s = seed || 1;
    return function () { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  }

  /* ── 背景 ───────────────────────────────────────────────────── */
  function bg(u, c1, c2, c3, c4) {
    var g = '<defs><linearGradient id="' + u + 'sky" x1="0" y1="0" x2=".12" y2="1">' +
      '<stop offset="0" stop-color="' + c1 + '"/><stop offset=".52" stop-color="' + c2 + '"/>' +
      '<stop offset="1" stop-color="' + (c4 || c3) + '"/></linearGradient></defs>';
    return g + RC(0, 0, AW, AH, 0, 'url(#' + u + 'sky)');
  }

  function halo(u, x, y, r, c, op) {
    var id = u + 'h' + Math.round(x) + Math.round(y);
    return '<defs><radialGradient id="' + id + '"><stop offset="0" stop-color="' + c + '" stop-opacity="' + (op == null ? .9 : op) + '"/>' +
      '<stop offset=".45" stop-color="' + c + '" stop-opacity="' + (op == null ? .28 : op * .3) + '"/>' +
      '<stop offset="1" stop-color="' + c + '" stop-opacity="0"/></radialGradient></defs>' +
      '<circle cx="' + r2(x) + '" cy="' + r2(y) + '" r="' + r2(r) + '" fill="url(#' + id + ')"/>';
  }

  function vignette(u, c) {
    return '<defs><radialGradient id="' + u + 'vg" cx=".5" cy=".46" r=".78">' +
      '<stop offset=".42" stop-color="' + c + '" stop-opacity="0"/>' +
      '<stop offset="1" stop-color="' + c + '" stop-opacity=".85"/></radialGradient></defs>' +
      '<rect width="' + AW + '" height="' + AH + '" fill="url(#' + u + 'vg)"/>';
  }

  function stars(u, n, seed, c, area) {
    var r = rng(seed), out = '';
    var a = area || [0, 0, AW, AH * .72];
    for (var i = 0; i < n; i++) {
      var x = a[0] + r() * a[2], y = a[1] + r() * a[3];
      var s = .5 + r() * 1.4;
      out += CI(x, y, s, c, .25 + r() * .6);
    }
    return out;
  }

  function sparkle(x, y, r, c, o) {
    return '<path d="M' + r2(x) + ' ' + r2(y - r) + 'Q' + r2(x + r * .18) + ' ' + r2(y - r * .18) + ' ' + r2(x + r) + ' ' + r2(y) +
      'Q' + r2(x + r * .18) + ' ' + r2(y + r * .18) + ' ' + r2(x) + ' ' + r2(y + r) +
      'Q' + r2(x - r * .18) + ' ' + r2(y + r * .18) + ' ' + r2(x - r) + ' ' + r2(y) +
      'Q' + r2(x - r * .18) + ' ' + r2(y - r * .18) + ' ' + r2(x) + ' ' + r2(y - r) + 'Z" fill="' + c + '" opacity="' + (o == null ? .9 : o) + '"/>';
  }

  /* ── 天体 ───────────────────────────────────────────────────── */
  function moonFull(u, x, y, r, c) {
    var out = halo(u, x, y, r * 3.4, c, .55);
    out += CI(x, y, r, c, .96);
    out += EL(x - r * .3, y - r * .22, r * .22, r * .16, '#000', .05);
    out += EL(x + r * .26, y + r * .3, r * .17, r * .12, '#000', .05);
    out += S('M' + r2(x - r * .1) + ' ' + r2(y - r * .55) + 'a' + r2(r * .9) + ' ' + r2(r * .9) + ' 0 0 1 ' + r2(r * .3) + ' ' + r2(r * .1), c, .8, .5);
    return out;
  }

  function moonCrescent(u, x, y, r, c, flip) {
    var id = u + 'c' + Math.round(x) + Math.round(y);
    var off = flip ? -r * .5 : r * .5;
    return '<defs><mask id="' + id + '"><circle cx="' + r2(x) + '" cy="' + r2(y) + '" r="' + r2(r) + '" fill="#fff"/>' +
      '<circle cx="' + r2(x + off) + '" cy="' + r2(y - r * .1) + '" r="' + r2(r * .97) + '" fill="#000"/></mask></defs>' +
      halo(u, x, y, r * 3, c, .42) +
      '<circle cx="' + r2(x) + '" cy="' + r2(y) + '" r="' + r2(r) + '" fill="' + c + '" mask="url(#' + id + ')"/>';
  }

  function sun(u, x, y, r, c) {
    var out = halo(u, x, y, r * 4.2, c, .8) + CI(x, y, r, c, .95);
    for (var i = 0; i < 16; i++) {
      var a = (i / 16) * Math.PI * 2;
      var r1 = r * 1.25, r2v = r * (1.55 + (i % 2 ? .5 : .95));
      out += S('M' + r2(x + Math.cos(a) * r1) + ' ' + r2(y + Math.sin(a) * r1) + 'L' +
        r2(x + Math.cos(a) * r2v) + ' ' + r2(y + Math.sin(a) * r2v), c, .55, .55);
    }
    return out;
  }

  function rays(u, x, y, n, len, c, op) {
    var out = '';
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + .2;
      out += F('M' + r2(x) + ' ' + r2(y) + 'L' + r2(x + Math.cos(a) * len) + ' ' + r2(y + Math.sin(a) * len) +
        'L' + r2(x + Math.cos(a + .055) * len) + ' ' + r2(y + Math.sin(a + .055) * len) + 'Z', c, op == null ? .16 : op);
    }
    return out;
  }

  /* ── 地形 ───────────────────────────────────────────────────── */
  function mountains(y, c, o) {
    return F('M0 ' + (y + 46) + 'L44 ' + (y - 8) + 'L78 ' + (y + 26) + 'L124 ' + (y - 40) + 'L170 ' + (y + 18) +
      'L214 ' + (y - 22) + 'L258 ' + (y + 22) + 'L306 ' + (y - 14) + 'L348 ' + (y + 30) +
      'L348 ' + AH + 'L0 ' + AH + 'Z', c, o == null ? .9 : o);
  }
  function ridge(y, c, o) {
    return F('M0 ' + (y + 18) + 'Q58 ' + (y - 16) + '116 ' + (y + 10) + 'T232 ' + (y + 4) + 'T348 ' + (y + 16) +
      'L348 ' + AH + 'L0 ' + AH + 'Z', c, o == null ? .9 : o);
  }
  function sea(y, c, c2) {
    var out = RC(0, y, AW, AH - y, 0, c, 1);
    for (var i = 0; i < 9; i++) {
      var yy = y + 8 + i * ((AH - y) / 9);
      var w = 70 + (i % 3) * 40;
      out += S('M' + (30 + (i % 4) * 60) + ' ' + r2(yy) + 'h' + w, c2 || '#FFFFFF', .7, .18 + (i % 3) * .06);
    }
    return out;
  }
  function floorBand(y, c, o) {
    return F('M0 ' + y + 'L348 ' + y + 'L348 ' + AH + 'L0 ' + AH + 'Z', c, o == null ? .85 : o);
  }
  function road(y, c) {
    return F('M' + (AW / 2 - 12) + ' ' + y + 'L' + (AW / 2 + 12) + ' ' + y + 'L' + (AW * .82) + ' ' + AH + 'L' + (AW * .18) + ' ' + AH + 'Z', c, .55);
  }
  function mist(y, c, h) {
    return F('M0 ' + y + 'Q88 ' + (y - h) + '174 ' + (y - h * .2) + 'T348 ' + (y - h * .55) + 'L348 ' + AH + 'L0 ' + AH + 'Z', c, .5);
  }
  function cloud(x, y, w, c, o) {
    var h = w * .34;
    return EL(x, y, w * .5, h, c, o == null ? .5 : o) +
      EL(x - w * .28, y + h * .22, w * .3, h * .74, c, o == null ? .5 : o) +
      EL(x + w * .3, y + h * .18, w * .32, h * .7, c, o == null ? .5 : o) +
      EL(x + w * .06, y - h * .34, w * .26, h * .62, c, (o == null ? .5 : o) * 1.05);
  }

  /* ── 建筑 ───────────────────────────────────────────────────── */
  function arch(x, y, w, h, c, sw) {
    return S('M' + x + ' ' + (y + h) + 'L' + x + ' ' + (y + h * .34) + 'Q' + x + ' ' + y + ' ' + (x + w / 2) + ' ' + y +
      'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + h * .34) + 'L' + (x + w) + ' ' + (y + h), c, sw || 1.2, .55);
  }
  function colonnade(x, y, w, h, n, c) {
    var out = '', step = w / n;
    for (var i = 0; i <= n; i++) {
      var cx = x + i * step;
      out += S('M' + r2(cx) + ' ' + (y + 10) + 'L' + r2(cx) + ' ' + (y + h), c, 3.2, .18);
      out += S('M' + r2(cx) + ' ' + (y + 10) + 'L' + r2(cx) + ' ' + (y + h), c, .8, .5);
      out += RC(cx - 4.4, y + h, 8.8, 2.4, .6, c, .3);
    }
    return out;
  }
  function tower(x, y, w, h, c, c2) {
    var out = RC(x, y, w, h, 1, c, .92);
    out += F('M' + x + ' ' + y + 'l' + (w / 2) + ' ' + (-w * .95) + 'l' + (w / 2) + ' ' + (w * .95) + 'Z', c, .92);
    out += RC(x + w * .34, y + h * .32, w * .3, h * .13, 1, c2 || '#FFFFFF', .5);
    return out;
  }
  function castle(x, y, w, c) {
    var out = '';
    out += tower(x + w * .04, y + 22, w * .2, 58, c, c);
    out += tower(x + w * .76, y + 30, w * .18, 50, c, c);
    out += RC(x + w * .22, y + 46, w * .56, 42, 1, c, .9);
    out += F('M' + (x + w * .22) + ' ' + (y + 46) + 'l' + (w * .28) + ' ' + (-24) + 'l' + (w * .28) + ' 24Z', c, .9);
    return out;
  }
  function gate(x, y, w, h, c) {
    return S('M' + x + ' ' + (y + h) + 'L' + x + ' ' + (y + h * .3) + 'Q' + x + ' ' + y + ' ' + (x + w / 2) + ' ' + y +
      'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + h * .3) + 'L' + (x + w) + ' ' + (y + h), c, 2, .5) +
      S('M' + (x + 6) + ' ' + (y + h) + 'L' + (x + 6) + ' ' + (y + h * .34) + 'Q' + (x + 6) + ' ' + (y + 6) + ' ' + (x + w / 2) + ' ' + (y + 6) +
        'Q' + (x + w - 6) + ' ' + (y + 6) + ' ' + (x + w - 6) + ' ' + (y + h * .34) + 'L' + (x + w - 6) + ' ' + (y + h), c, .7, .3);
  }
  function throne(x, y, w, h, c, c2) {
    var out = RC(x, y, w, h, 4, c, .95);
    out += F('M' + x + ' ' + y + 'Q' + (x + w / 2) + ' ' + (y - h * .42) + ' ' + (x + w) + ' ' + y + 'Z', c, .95);
    out += RC(x - 5, y + h * .3, 5, h * .7, 2, c2 || c, .9);
    out += RC(x + w, y + h * .3, 5, h * .7, 2, c2 || c, .9);
    out += S('M' + (x + w / 2) + ' ' + (y + 6) + 'L' + (x + w / 2) + ' ' + (y + h - 6), c2 || '#FFF', .8, .25);
    return out;
  }
  function bridge(x, y, w, c) {
    return S('M' + x + ' ' + y + 'Q' + (x + w / 2) + ' ' + (y - 18) + ' ' + (x + w) + ' ' + y, c, 2, .6) +
      S('M' + x + ' ' + (y + 5) + 'Q' + (x + w / 2) + ' ' + (y - 13) + ' ' + (x + w) + ' ' + (y + 5), c, .8, .35);
  }
  function boat(x, y, w, c) {
    return F('M' + x + ' ' + y + 'q' + (w * .12) + ' ' + (w * .2) + ' ' + (w * .5) + ' ' + (w * .2) +
      'q' + (w * .38) + ' 0 ' + (w * .5) + ' ' + (-w * .2) + 'Z', c, .9) +
      S('M' + (x + w * .5) + ' ' + y + 'L' + (x + w * .5) + ' ' + (y - w * .62), c, 1.1, .7);
  }

  /* ── 人物 ───────────────────────────────────────────────────── */
  function fig(x, gy, h, robe, rim, opt) {
    opt = opt || {};
    var hr = h * .068;
    var cy = gy - h + hr * 1.05;
    var ny = cy + hr * .98;
    var sy = cy + hr * 2.02;
    var wy = gy - h * .40;
    var hem = gy;
    var sw = hr * 1.42, ww = hr * 1.08, hw = hr * 2.12;
    var out = '';

    /* 颈 */
    out += RC(x - hr * .3, ny - hr * .12, hr * .6, sy - ny + hr * .34, hr * .18, robe, .96);

    /* 躯干与长袍：收腰 + 下摆微张 */
    out += F('M' + r2(x - sw) + ' ' + r2(sy) +
      'C' + r2(x - sw * 1.06) + ' ' + r2(sy + h * .09) + ' ' + r2(x - ww) + ' ' + r2(wy - h * .07) + ' ' + r2(x - ww) + ' ' + r2(wy) +
      'C' + r2(x - ww * 1.18) + ' ' + r2(wy + h * .14) + ' ' + r2(x - hw) + ' ' + r2(hem - h * .05) + ' ' + r2(x - hw) + ' ' + r2(hem) +
      'L' + r2(x + hw) + ' ' + r2(hem) +
      'C' + r2(x + hw) + ' ' + r2(hem - h * .05) + ' ' + r2(x + ww * 1.18) + ' ' + r2(wy + h * .14) + ' ' + r2(x + ww) + ' ' + r2(wy) +
      'C' + r2(x + ww) + ' ' + r2(wy - h * .07) + ' ' + r2(x + sw * 1.06) + ' ' + r2(sy + h * .09) + ' ' + r2(x + sw) + ' ' + r2(sy) + 'Z', robe, .97);

    /* 内袍亮面，制造体积 */
    out += F('M' + r2(x - ww * .55) + ' ' + r2(wy) + 'L' + r2(x - hw * .62) + ' ' + r2(hem) + 'L' + r2(x + hw * .06) + ' ' + r2(hem) +
      'L' + r2(x + ww * .18) + ' ' + r2(wy) + 'Z', opt.light || rim, .1);

    /* 头 */
    out += CI(x, cy, hr, robe, .98);

    /* 发/兜帽 */
    out += F('M' + r2(x - hr) + ' ' + r2(cy + hr * .18) + 'Q' + r2(x) + ' ' + r2(cy - hr * 1.32) + ' ' + r2(x + hr) + ' ' + r2(cy + hr * .18) +
      'Q' + r2(x) + ' ' + r2(cy + hr * .96) + ' ' + r2(x - hr) + ' ' + r2(cy + hr * .18) + 'Z', opt.hood || robe, .97);

    /* 侧面轮廓光 */
    out += S('M' + r2(x + sw * .92) + ' ' + r2(sy + 1) + 'C' + r2(x + sw * 1.02) + ' ' + r2(wy - h * .08) + ' ' + r2(x + hw * .78) + ' ' + r2(hem - h * .18) +
      ' ' + r2(x + hw * .84) + ' ' + r2(hem - 1), rim, Math.max(.7, h * .011), .5);
    out += S('M' + r2(x + hr * .55) + ' ' + r2(cy - hr * .55) + 'a' + r2(hr * .92) + ' ' + r2(hr * .92) + ' 0 0 1 ' + r2(hr * .1) + ' ' + r2(hr * 1.2), rim, 1, .28);

    if (opt.arm === 'raise') {
      out += S('M' + r2(x + sw * .7) + ' ' + r2(sy + h * .05) + 'L' + r2(x + sw * 2.1) + ' ' + r2(sy - h * .12), opt.hood || robe, hr * .52, .95);
      out += S('M' + r2(x - sw * .7) + ' ' + r2(sy + h * .05) + 'L' + r2(x - sw * 1.7) + ' ' + r2(sy + h * .18), opt.hood || robe, hr * .52, .8);
    } else if (opt.arm === 'hold') {
      out += S('M' + r2(x + sw * .7) + ' ' + r2(sy + h * .06) + 'L' + r2(x + sw * 1.35) + ' ' + r2(wy + h * .02), opt.hood || robe, hr * .52, .95);
      out += S('M' + r2(x - sw * .7) + ' ' + r2(sy + h * .06) + 'L' + r2(x - sw * 1.35) + ' ' + r2(wy + h * .02), opt.hood || robe, hr * .52, .8);
    } else if (opt.arm === 'cross') {
      out += S('M' + r2(x - sw * .8) + ' ' + r2(sy + h * .06) + 'L' + r2(x + sw * 1.0) + ' ' + r2(wy - h * .02), opt.hood || robe, hr * .52, .9);
      out += S('M' + r2(x + sw * .8) + ' ' + r2(sy + h * .06) + 'L' + r2(x - sw * 1.0) + ' ' + r2(wy - h * .02), opt.hood || robe, hr * .52, .75);
    }
    return out;
  }

  function rider(x, gy, h, horse, robe, rim) {
    var out = '';
    var by = gy - h * .32;
    out += EL(x, by, h * .3, h * .15, horse, .95);
    out += F('M' + r2(x + h * .22) + ' ' + r2(by - h * .06) + 'L' + r2(x + h * .42) + ' ' + r2(by - h * .34) +
      'L' + r2(x + h * .5) + ' ' + r2(by - h * .3) + 'L' + r2(x + h * .3) + ' ' + r2(by + h * .02) + 'Z', horse, .95);
    out += EL(x + h * .47, by - h * .38, h * .1, h * .05, horse, .95, -24);
    out += S('M' + r2(x - h * .22) + ' ' + r2(by + h * .1) + 'L' + r2(x - h * .28) + ' ' + r2(gy), horse, h * .028, .95);
    out += S('M' + r2(x - h * .05) + ' ' + r2(by + h * .12) + 'L' + r2(x - h * .1) + ' ' + r2(gy), horse, h * .028, .95);
    out += S('M' + r2(x + h * .16) + ' ' + r2(by + h * .12) + 'L' + r2(x + h * .24) + ' ' + r2(gy), horse, h * .026, .9);
    out += S('M' + r2(x - h * .28) + ' ' + r2(by - h * .02) + 'q' + (-h * .1) + ' ' + (h * .1) + ' ' + (-h * .06) + ' ' + (h * .2), horse, h * .022, .7);
    out += fig(x - h * .04, by - h * .1, h * .52, robe, rim, { arm: 'raise' });
    return out;
  }

  function handCloud(x, y, s, c, cloudC) {
    var out = '';
    out += cloud(x - s * .05, y + s * .52, s * 1.5, cloudC, .55);
    out += RC(x - s * .17, y + s * .1, s * .34, s * .4, s * .12, c, .95);
    out += F('M' + r2(x - s * .17) + ' ' + r2(y + s * .18) + 'q' + (s * .17) + ' ' + (-s * .12) + ' ' + (s * .34) + ' 0' +
      'l0 ' + r2(s * .12) + 'q' + (-s * .17) + ' ' + (s * .1) + ' ' + (-s * .34) + ' 0Z', c, .95);
    for (var i = 0; i < 4; i++) {
      out += S('M' + r2(x - s * .12 + i * s * .08) + ' ' + r2(y + s * .16) + 'L' + r2(x - s * .12 + i * s * .08) + ' ' + r2(y - s * .02), c, s * .045, .9);
    }
    out += S('M' + r2(x - s * .16) + ' ' + r2(y + s * .06) + 'q' + (-s * .1) + ' ' + (-s * .06) + ' ' + (-s * .04) + ' ' + (-s * .16), c, s * .045, .9);
    return out;
  }

  function angel(x, gy, h, robe, rim, wingC) {
    var out = '';
    var wy = gy - h * .74;
    out += F('M' + r2(x) + ' ' + r2(wy) + 'q' + (-h * .4) + ' ' + (-h * .1) + ' ' + (-h * .5) + ' ' + (h * .18) +
      'q' + (h * .12) + ' ' + (h * .2) + ' ' + (h * .5) + ' ' + (h * .06) + 'Z', wingC, .5);
    out += F('M' + r2(x) + ' ' + r2(wy) + 'q' + (h * .4) + ' ' + (-h * .1) + ' ' + (h * .5) + ' ' + (h * .18) +
      'q' + (-h * .12) + ' ' + (h * .2) + ' ' + (-h * .5) + ' ' + (h * .06) + 'Z', wingC, .5);
    out += fig(x, gy, h, robe, rim, { arm: 'raise' });
    return out;
  }

  /* ── 器物 ───────────────────────────────────────────────────── */
  function chalice(x, y, s, c, gem, liq) {
    var out = '';
    out += F('M' + r2(x - s * .38) + ' ' + r2(y - s * .5) + 'C' + r2(x - s * .38) + ' ' + r2(y + s * .02) + ' ' + r2(x - s * .18) + ' ' + r2(y + s * .12) +
      ' ' + r2(x) + ' ' + r2(y + s * .12) + 'C' + r2(x + s * .18) + ' ' + r2(y + s * .12) + ' ' + r2(x + s * .38) + ' ' + r2(y + s * .02) +
      ' ' + r2(x + s * .38) + ' ' + r2(y - s * .5) + 'Z', c, .9);
    out += EL(x, y - s * .5, s * .38, s * .09, c, .95);
    out += EL(x, y + s * .06, s * .3, s * .07, liq || '#FFFFFF', .35);
    out += S('M' + r2(x) + ' ' + r2(y + s * .12) + 'L' + r2(x) + ' ' + r2(y + s * .34), c, s * .07, .95);
    out += EL(x, y + s * .37, s * .2, s * .055, c, .95);
    out += CI(x, y - s * .28, s * .07, gem || '#FFF6DA', .9);
    return out;
  }
  function wand(x, y, s, rot, c, flame) {
    var out = '<g transform="rotate(' + (rot || 0) + ' ' + r2(x) + ' ' + r2(y) + ')">';
    out += S('M' + r2(x) + ' ' + r2(y + s * .5) + 'L' + r2(x) + ' ' + r2(y - s * .5), c, s * .075, .95);
    for (var i = 0; i < 3; i++) {
      out += S('M' + r2(x - s * .05) + ' ' + r2(y - s * .34 + i * s * .34) + 'l' + r2(s * .1) + ' 0', c, s * .045, .7);
    }
    if (flame !== false) {
      out += F('M' + r2(x) + ' ' + r2(y - s * .5) + 'q' + (s * .1) + ' ' + (-s * .16) + ' 0 ' + (-s * .3) +
        'q' + (-s * .1) + ' ' + (s * .14) + ' 0 ' + (s * .3) + 'Z', flame || '#FFD9A0', .95);
    }
    out += '</g>';
    return out;
  }
  function sword(x, y, s, rot, c, glow) {
    var out = '<g transform="rotate(' + (rot || 0) + ' ' + r2(x) + ' ' + r2(y) + ')">';
    if (glow) out += S('M' + r2(x) + ' ' + r2(y - s * .62) + 'L' + r2(x) + ' ' + r2(y + s * .3), glow, s * .09, .28);
    out += F('M' + r2(x) + ' ' + r2(y - s * .62) + 'L' + r2(x + s * .055) + ' ' + r2(y - s * .5) + 'L' + r2(x + s * .055) + ' ' + r2(y + s * .1) +
      'L' + r2(x - s * .055) + ' ' + r2(y + s * .1) + 'L' + r2(x - s * .055) + ' ' + r2(y - s * .5) + 'Z', c, .95);
    out += RC(x - s * .2, y + s * .1, s * .4, s * .05, s * .02, c, .95);
    out += S('M' + r2(x) + ' ' + r2(y + s * .15) + 'L' + r2(x) + ' ' + r2(y + s * .3), c, s * .05, .9);
    out += CI(x, y + s * .33, s * .05, c, .95);
    out += '</g>';
    return out;
  }
  function pent(x, y, s, c, c2) {
    var out = CI(x, y, s * .5, 'none', 0);
    out += '<circle cx="' + r2(x) + '" cy="' + r2(y) + '" r="' + r2(s * .5) + '" fill="none" stroke="' + c + '" stroke-width="' + r2(s * .045) + '" opacity=".95"/>';
    out += '<circle cx="' + r2(x) + '" cy="' + r2(y) + '" r="' + r2(s * .38) + '" fill="none" stroke="' + c + '" stroke-width="' + r2(s * .022) + '" opacity=".5"/>';
    var d = '', pts = [];
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + i * Math.PI * 4 / 5;
      pts.push([x + Math.cos(a) * s * .3, y + Math.sin(a) * s * .3]);
    }
    for (var k = 0; k < 5; k++) d += (k ? 'L' : 'M') + r2(pts[k][0]) + ' ' + r2(pts[k][1]);
    out += S(d + 'Z', c2 || c, s * .026, .85);
    return out;
  }

  /* ── 装饰 ───────────────────────────────────────────────────── */
  function tree(x, gy, h, c, c2) {
    var out = S('M' + r2(x) + ' ' + r2(gy) + 'L' + r2(x) + ' ' + r2(gy - h * .55), c2 || c, h * .035, .9);
    out += EL(x, gy - h * .62, h * .17, h * .14, c, .8);
    out += EL(x - h * .1, gy - h * .5, h * .13, h * .11, c, .7);
    out += EL(x + h * .11, gy - h * .52, h * .14, h * .11, c, .7);
    return out;
  }
  function flower(x, y, s, c, c2) {
    return S('M' + r2(x) + ' ' + r2(y) + 'L' + r2(x) + ' ' + r2(y - s), c2 || c, .8, .6) +
      CI(x, y - s, s * .16, c, .85) + CI(x - s * .16, y - s + s * .1, s * .12, c, .7) +
      CI(x + s * .16, y - s + s * .1, s * .12, c, .7);
  }
  function flowers(y, c, c2, n, seed) {
    var r = rng(seed || 7), out = '';
    for (var i = 0; i < n; i++) out += flower(16 + r() * (AW - 32), y + r() * 26, 8 + r() * 10, c, c2);
    return out;
  }
  function wreath(x, y, r, c, c2) {
    var out = '<circle cx="' + r2(x) + '" cy="' + r2(y) + '" r="' + r2(r) + '" fill="none" stroke="' + c + '" stroke-width="' + r2(r * .09) + '" opacity=".55"/>';
    for (var i = 0; i < 18; i++) {
      var a = i / 18 * Math.PI * 2;
      out += EL(x + Math.cos(a) * r, y + Math.sin(a) * r, r * .1, r * .05, c2 || c, .6, a * 57.3);
    }
    return out;
  }
  function crown(x, y, s, c) {
    return F('M' + r2(x - s * .5) + ' ' + r2(y) + 'l' + r2(s * .1) + ' ' + r2(-s * .42) + 'l' + r2(s * .16) + ' ' + r2(s * .2) +
      'l' + r2(s * .14) + ' ' + r2(-s * .42) + 'l' + r2(s * .14) + ' ' + r2(s * .42) + 'l' + r2(s * .16) + ' ' + r2(-s * .2) +
      'l' + r2(s * .1) + ' ' + r2(s * .42) + 'Z', c, .9);
  }
  function chain(x, y, w, c) {
    var out = '';
    for (var i = 0; i < 6; i++) {
      out += EL(x + i * (w / 6) + w / 12, y + Math.sin(i * 1.1) * 4, w / 15, w / 26, 'none', 1);
      out += '<ellipse cx="' + r2(x + i * (w / 6) + w / 12) + '" cy="' + r2(y + Math.sin(i * 1.1) * 4) + '" rx="' + r2(w / 16) + '" ry="' + r2(w / 26) +
        '" fill="none" stroke="' + c + '" stroke-width="1.2" opacity=".7"/>';
    }
    return out;
  }
  function scales(x, y, s, c) {
    var out = S('M' + r2(x) + ' ' + r2(y - s * .5) + 'L' + r2(x) + ' ' + r2(y + s * .42), c, s * .03, .9);
    out += S('M' + r2(x - s * .38) + ' ' + r2(y - s * .4) + 'L' + r2(x + s * .38) + ' ' + r2(y - s * .4), c, s * .03, .9);
    out += S('M' + r2(x - s * .38) + ' ' + r2(y - s * .4) + 'l' + r2(s * .06) + ' ' + r2(s * .22), c, .7, .5);
    out += S('M' + r2(x - s * .44) + ' ' + r2(y - s * .18) + 'q' + r2(s * .06) + ' ' + r2(s * .1) + ' ' + r2(s * .12) + ' 0', c, 1.1, .8);
    out += S('M' + r2(x + s * .38) + ' ' + r2(y - s * .4) + 'l' + r2(-s * .06) + ' ' + r2(s * .22), c, .7, .5);
    out += S('M' + r2(x + s * .32) + ' ' + r2(y - s * .18) + 'q' + r2(s * .06) + ' ' + r2(s * .1) + ' ' + r2(s * .12) + ' 0', c, 1.1, .8);
    out += EL(x, y + s * .46, s * .12, s * .04, c, .8);
    return out;
  }
  function wheel(x, y, r, c, c2) {
    var out = '<circle cx="' + r2(x) + '" cy="' + r2(y) + '" r="' + r2(r) + '" fill="none" stroke="' + c + '" stroke-width="' + r2(r * .05) + '" opacity=".85"/>';
    out += '<circle cx="' + r2(x) + '" cy="' + r2(y) + '" r="' + r2(r * .78) + '" fill="none" stroke="' + c + '" stroke-width="1" opacity=".4"/>';
    for (var i = 0; i < 8; i++) {
      var a = i / 8 * Math.PI * 2;
      out += S('M' + r2(x) + ' ' + r2(y) + 'L' + r2(x + Math.cos(a) * r) + ' ' + r2(y + Math.sin(a) * r), c, r * .022, .55);
    }
    out += CI(x, y, r * .12, c2 || c, .9);
    return out;
  }
  function mirror(x, y, w, h, c) {
    return '<ellipse cx="' + r2(x) + '" cy="' + r2(y) + '" rx="' + r2(w) + '" ry="' + r2(h) + '" fill="none" stroke="' + c + '" stroke-width="2" opacity=".85"/>' +
      '<ellipse cx="' + r2(x) + '" cy="' + r2(y) + '" rx="' + r2(w * .86) + '" ry="' + r2(h * .88) + '" fill="' + c + '" opacity=".12"/>';
  }
  function lamp(x, y, s, c, flame) {
    var out = S('M' + r2(x) + ' ' + r2(y - s * .1) + 'l0 ' + r2(s * .1), c, 1, .5);
    out += F('M' + r2(x - s * .2) + ' ' + r2(y - s * .1) + 'l' + r2(s * .2) + ' ' + r2(-s * .2) + 'l' + r2(s * .2) + ' ' + r2(s * .2) + 'Z', c, .8);
    out += F('M' + r2(x - s * .2) + ' ' + r2(y - s * .1) + 'l' + r2(s * .2) + ' ' + r2(s * .26) + 'l' + r2(s * .2) + ' ' + r2(-s * .26) + 'Z', c, .8);
    out += CI(x, y + s * .04, s * .06, flame || '#FFE6B0', .95);
    out += S('M' + r2(x) + ' ' + r2(y - s * .3) + 'q' + r2(s * .1) + ' ' + r2(-s * .1) + ' 0 ' + r2(-s * .2), c, .8, .5);
    return out;
  }
  function heart(x, y, s, c) {
    return F('M' + r2(x) + ' ' + r2(y + s * .45) + 'C' + r2(x - s * .9) + ' ' + r2(y - s * .05) + ' ' + r2(x - s * .42) + ' ' + r2(y - s * .62) +
      ' ' + r2(x) + ' ' + r2(y - s * .2) + 'C' + r2(x + s * .42) + ' ' + r2(y - s * .62) + ' ' + r2(x + s * .9) + ' ' + r2(y - s * .05) +
      ' ' + r2(x) + ' ' + r2(y + s * .45) + 'Z', c, .9);
  }
  function eye(x, y, w, c) {
    return S('M' + r2(x - w) + ' ' + r2(y) + 'q' + r2(w) + ' ' + r2(-w * .62) + ' ' + r2(w * 2) + ' 0' +
      'q' + r2(-w) + ' ' + r2(w * .62) + ' ' + r2(-w * 2) + ' 0Z', c, 1.1, .7) +
      CI(x, y, w * .24, c, .75);
  }
  function book(x, y, w, h, c) {
    return S('M' + r2(x) + ' ' + r2(y) + 'q' + r2(w * .25) + ' ' + r2(-h * .12) + ' ' + r2(w * .5) + ' 0' +
      'q' + r2(w * .25) + ' ' + r2(h * .12) + ' ' + r2(w * .5) + ' 0', c, 1, .7) +
      S('M' + r2(x + w * .5) + ' ' + r2(y) + 'l0 ' + r2(h * .5), c, .8, .5);
  }
  function hourglass(x, y, s, c) {
    return S('M' + r2(x - s * .3) + ' ' + r2(y - s * .5) + 'L' + r2(x + s * .3) + ' ' + r2(y - s * .5) +
      'L' + r2(x) + ' ' + r2(y) + 'L' + r2(x + s * .3) + ' ' + r2(y + s * .5) + 'L' + r2(x - s * .3) + ' ' + r2(y + s * .5) +
      'L' + r2(x) + ' ' + r2(y) + 'Z', c, 1, .7);
  }

  /* ══ 边框：银金藤蔓 + 四角星晶 + 顶部圆章 + 底部铭牌 ═══════════ */

  /* 四角：四芒星 + 菱形框 + 沿边藤蔓 */
  function cornerFlourish(c, c2, c3) {
    var o = '';
    /* 藤蔓沿两条边伸出去 */
    o += S('M12 30C12 46 24 56 40 56', c, .9, .55);
    o += S('M30 12C46 12 56 24 56 40', c, .9, .55);
    o += S('M18 34C20 46 30 54 42 52', c2, .5, .35);
    o += S('M34 18C46 20 54 30 52 42', c2, .5, .35);
    /* 叶片 */
    o += EL(20, 46, 4.6, 2.1, c2, .5, 52);
    o += EL(46, 20, 4.6, 2.1, c2, .5, -38);
    o += EL(30, 54, 3.4, 1.6, c2, .38, 8);
    o += EL(54, 30, 3.4, 1.6, c2, .38, 82);
    /* 菱形框 */
    o += '<path d="M12 4L20 12L12 20L4 12Z" fill="none" stroke="' + c + '" stroke-width=".8" opacity=".7"/>';
    /* 四芒星 */
    o += '<path d="M12 2C13 8 16 11 22 12C16 13 13 16 12 22C11 16 8 13 2 12C8 11 11 8 12 2Z" fill="' + c3 + '" opacity=".9"/>';
    /* 小点 */
    o += CI(26, 30, 1.1, c, .6);
    o += CI(30, 26, 1.1, c, .6);
    return o;
  }

  /* 顶部圆章：罗马数字 + 上方星晶 + 两侧新月 */
  function topMedallion(metal, num, size) {
    var o = '';
    /* 放射细线 */
    for (var i = 0; i < 7; i++) {
      var x = 200 + (i - 3) * 9;
      var len = 10 - Math.abs(i - 3) * 1.6;
      o += S('M' + x + ' ' + (24 - len) + 'L' + x + ' 24', metal, .45, .35);
    }
    /* 上方星晶 */
    o += '<path d="M200 6C201.4 15 205 18.6 214 20C205 21.4 201.4 25 200 34C198.6 25 195 21.4 186 20C195 18.6 198.6 15 200 6Z" fill="' + metal + '" opacity=".9"/>';
    /* 圆章 */
    o += '<circle cx="200" cy="42" r="18.5" fill="#100B24" opacity=".9"/>';
    o += '<circle cx="200" cy="42" r="18.5" fill="none" stroke="' + metal + '" stroke-width="1.15"/>';
    o += '<circle cx="200" cy="42" r="14.6" fill="none" stroke="' + metal + '" stroke-width=".45" opacity=".6"/>';
    o += '<circle cx="200" cy="42" r="21.8" fill="none" stroke="' + metal + '" stroke-width=".45" opacity=".35" stroke-dasharray="1 5"/>';
    o += '<text x="200" y="' + (42 + size * .36) + '" text-anchor="middle" font-size="' + size + '" letter-spacing="1" fill="#F7EAD0" font-family="Cormorant Garamond, Songti SC, serif">' + num + '</text>';
    /* 两侧新月 */
    o += '<path d="M154 42a11 11 0 1 0 8-10.6a8.6 8.6 0 1 1-8 10.6Z" fill="none" stroke="' + metal + '" stroke-width=".9" opacity=".62"/>';
    o += '<path d="M246 42a11 11 0 1 1-8-10.6a8.6 8.6 0 1 0 8 10.6Z" fill="none" stroke="' + metal + '" stroke-width=".9" opacity=".62"/>';
    o += S('M166 42h14M220 42h14', metal, .5, .3);
    return o;
  }

  /* 边框上的星点 */
  function borderSparkles(metal) {
    var pts = [[200, 24], [74, 22], [326, 22], [16, 150], [16, 300], [16, 418], [384, 150], [384, 300], [384, 418], [200, 586], [120, 588], [280, 588]];
    var o = '';
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], r = i % 3 === 0 ? 4.6 : 3.2;
      o += '<path d="M' + p[0] + ' ' + (p[1] - r) + 'Q' + (p[0] + r * .16) + ' ' + (p[1] - r * .16) + ' ' + (p[0] + r) + ' ' + p[1] +
        'Q' + (p[0] + r * .16) + ' ' + (p[1] + r * .16) + ' ' + p[0] + ' ' + (p[1] + r) +
        'Q' + (p[0] - r * .16) + ' ' + (p[1] + r * .16) + ' ' + (p[0] - r) + ' ' + p[1] +
        'Q' + (p[0] - r * .16) + ' ' + (p[1] - r * .16) + ' ' + p[0] + ' ' + (p[1] - r) + 'Z" fill="' + metal + '" opacity="' + (i % 2 ? .5 : .8) + '"/>';
    }
    return o;
  }

  function frameShell(inner, u, num, numSize) {
    var metal = 'mt' + u, plate = 'pl' + u, sheen = 'sn' + u, clip = 'cp' + u;
    var m = 'url(#' + metal + ')';
    return '<defs>' +
      '<linearGradient id="' + metal + '" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#FFF6E0"/><stop offset=".20" stop-color="#E8CC9A"/>' +
        '<stop offset=".42" stop-color="#C9A268"/><stop offset=".58" stop-color="#F4E0B8"/>' +
        '<stop offset=".78" stop-color="#A9863F"/><stop offset="1" stop-color="#EBD4A6"/></linearGradient>' +
      '<linearGradient id="' + plate + '" x1=".2" y1="0" x2=".8" y2="1">' +
        '<stop offset="0" stop-color="#2E2356"/><stop offset=".42" stop-color="#160F2E"/>' +
        '<stop offset="1" stop-color="#251B45"/></linearGradient>' +
      '<radialGradient id="' + sheen + '" cx=".5" cy=".05" r=".85">' +
        '<stop offset="0" stop-color="#BCA6E4" stop-opacity=".3"/><stop offset="1" stop-color="#BCA6E4" stop-opacity="0"/></radialGradient>' +
      '<clipPath id="' + clip + '"><rect x="0" y="0" width="348" height="430" rx="5"/></clipPath>' +
      '</defs>' +

      '<rect width="400" height="600" rx="22" fill="url(#' + plate + ')"/>' +
      '<rect width="400" height="600" rx="22" fill="url(#' + sheen + ')"/>' +
      /* 外双线 */
      '<rect x="8.5" y="8.5" width="383" height="583" rx="18" fill="none" stroke="' + m + '" stroke-width="1.25" opacity=".95"/>' +
      '<rect x="13" y="13" width="374" height="574" rx="15" fill="none" stroke="' + m + '" stroke-width=".45" opacity=".4"/>' +
      /* 四角藤蔓 */
      '<g opacity=".92">' +
        '<g transform="translate(3,3)">' + cornerFlourish(m, '#F0E1BE', '#FFF9E8') + '</g>' +
        '<g transform="translate(400,0) scale(-1,1) translate(3,3)">' + cornerFlourish(m, '#F0E1BE', '#FFF9E8') + '</g>' +
        '<g transform="translate(0,600) scale(1,-1) translate(3,3)">' + cornerFlourish(m, '#F0E1BE', '#FFF9E8') + '</g>' +
        '<g transform="translate(400,600) scale(-1,-1) translate(3,3)">' + cornerFlourish(m, '#F0E1BE', '#FFF9E8') + '</g>' +
      '</g>' +
      /* 侧边细轨 */
      '<g opacity=".3">' +
        '<line x1="17" y1="86" x2="17" y2="440" stroke="' + m + '" stroke-width=".5"/>' +
        '<line x1="383" y1="86" x2="383" y2="440" stroke="' + m + '" stroke-width=".5"/>' +
        '<path d="M17 200l3 3-3 3-3-3z" fill="' + m + '"/><path d="M17 320l3 3-3 3-3-3z" fill="' + m + '"/>' +
        '<path d="M383 200l3 3-3 3-3-3z" fill="' + m + '"/><path d="M383 320l3 3-3 3-3-3z" fill="' + m + '"/>' +
      '</g>' +

      /* 插画 */
      '<g>' + inner + '</g>' +

      /* 插画窗口双框 */
      '<rect x="26" y="42" width="348" height="430" rx="5" fill="none" stroke="' + m + '" stroke-width="1" opacity=".85"/>' +
      '<rect x="21.5" y="37.5" width="357" height="439" rx="7" fill="none" stroke="' + m + '" stroke-width=".45" opacity=".35"/>' +

      /* 顶部圆章与星点 */
      topMedallion(m, num, numSize) +
      borderSparkles(m);
  }

  /* ── 底部铭牌 ───────────────────────────────────────────────── */
  function cartouche(card, m) {
    var enSize = card.en.length > 17 ? 12.2 : card.en.length > 13 ? 13.6 : 15.2;
    var kw = card.ku.join('   |   ');
    var meta = card.s === 'major'
      ? 'MAJOR ARCANA · ' + card.pip
      : (card.s === 'wands' ? 'WANDS · FIRE' : card.s === 'cups' ? 'CUPS · WATER'
        : card.s === 'swords' ? 'SWORDS · AIR' : 'PENTACLES · EARTH');

    var o = '';
    /* 铭牌外形：圆角牌匾 + 左右尖角 */
    var d = 'M116 472H284Q306 472 306 494V566Q306 588 284 588H116Q94 588 94 566V494Q94 472 116 472Z';
    o += '<path d="' + d + '" fill="#100B24" opacity=".55"/>';
    o += '<path d="' + d + '" fill="none" stroke="' + m + '" stroke-width="1.15" opacity=".95"/>';
    o += '<path d="M114 479H286Q300 479 300 495V563Q300 579 286 579H114Q100 579 100 563V495Q100 479 114 479Z" fill="none" stroke="' + m + '" stroke-width=".45" opacity=".34"/>';
    /* 两端尖角装饰 */
    o += '<path d="M94 530l-11 5l11 5z" fill="' + m + '" opacity=".65"/>';
    o += '<path d="M306 530l11 5l-11 5z" fill="' + m + '" opacity=".65"/>';

    /* 英文名 */
    o += '<text x="200" y="507" text-anchor="middle" font-size="' + enSize + '" letter-spacing="3.3" fill="#FBF3E4" font-family="Cormorant Garamond, Times New Roman, serif">' + card.en.toUpperCase() + '</text>';
    /* 细线 + 菱形 */
    o += '<line x1="118" y1="519" x2="188" y2="522" stroke="' + m + '" stroke-width=".55" opacity=".55"/>';
    o += '<line x1="212" y1="519" x2="282" y2="522" stroke="' + m + '" stroke-width=".55" opacity=".55"/>';
    o += '<path d="M200 515.6l3.4 3.4-3.4 3.4-3.4-3.4z" fill="' + m + '" opacity=".9"/>';
    /* 中文名 */
    o += '<text x="200" y="544" text-anchor="middle" font-size="16.5" letter-spacing="5" fill="#F0DCAE" font-family="Songti SC, STSong, serif">' + card.cn + '</text>';
    /* 关键词 */
    o += '<text x="200" y="564" text-anchor="middle" font-size="8.3" letter-spacing="1.1" fill="#E6D8F4" opacity=".72" font-family="PingFang SC, sans-serif">' + kw + '</text>';
    /* 花色 / 元素 */
    o += '<text x="200" y="573" text-anchor="middle" font-size="6.2" letter-spacing="2.4" fill="#CDBBE4" opacity=".45" font-family="Cormorant Garamond, serif">' + meta + '</text>';
    return o;
  }

  /* ── 牌背 · 月环之门 ────────────────────────────────────────── */
  function back() {
    var u = 'bk', metal = 'mtb', clip = 'cpb';
    var m = 'url(#' + metal + ')';
    var s = '<defs>' +
      '<linearGradient id="' + metal + '" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#FFF6E0"/><stop offset=".20" stop-color="#E8CC9A"/>' +
        '<stop offset=".42" stop-color="#C9A268"/><stop offset=".58" stop-color="#F4E0B8"/>' +
        '<stop offset=".78" stop-color="#A9863F"/><stop offset="1" stop-color="#EBD4A6"/></linearGradient>' +
      '<linearGradient id="bkBody" x1=".22" y1="0" x2=".78" y2="1">' +
        '<stop offset="0" stop-color="#3B2F72"/><stop offset=".32" stop-color="#2A2158"/>' +
        '<stop offset=".64" stop-color="#1B1440"/><stop offset="1" stop-color="#2E2463"/></linearGradient>' +
      '<radialGradient id="bkCore" cx=".5" cy=".5" r=".5">' +
        '<stop offset="0" stop-color="#FFFDF4" stop-opacity=".98"/><stop offset=".4" stop-color="#F6E6C4" stop-opacity=".66"/>' +
        '<stop offset="1" stop-color="#C8B4E8" stop-opacity="0"/></radialGradient>' +
      '<clipPath id="' + clip + '"><rect x="0" y="0" width="348" height="430" rx="5"/></clipPath>' +
      '</defs>' +
      '<rect width="400" height="600" rx="22" fill="url(#bkBody)"/>' +
      '<rect x="8.5" y="8.5" width="383" height="583" rx="18" fill="none" stroke="' + m + '" stroke-width="1.25" opacity=".95"/>' +
      '<rect x="13" y="13" width="374" height="574" rx="15" fill="none" stroke="' + m + '" stroke-width=".45" opacity=".4"/>';

    s += '<g clip-path="url(#' + clip + ')">';
    s += '<g opacity=".12">' + moonCrescent(u, 200, 257, 152, '#EFE2FF', false) + '</g>';
    /* 菱形格 */
    s += '<g opacity=".13" stroke="#D9C8F0" fill="none" stroke-width=".7">';
    for (var i = 0; i < 7; i++) {
      var d = 44 + i * 26;
      s += '<path d="M' + r2(200 - d / 2) + ' ' + r2(257 - d / 2) + 'L' + r2(200 + d / 2) + ' ' + r2(257 - d / 2) +
        'L' + r2(200 + d / 2) + ' ' + r2(257 + d / 2) + 'L' + r2(200 - d / 2) + ' ' + r2(257 + d / 2) + 'Z"/>';
    }
    s += '</g>';
    /* 放射 */
    s += '<g opacity=".18" stroke="#E6D8F8" fill="none" stroke-width=".6">';
    for (var k = 0; k < 28; k++) {
      var a = k / 28 * Math.PI * 2;
      s += '<line x1="' + r2(200 + Math.cos(a) * 70) + '" y1="' + r2(257 + Math.sin(a) * 70) +
        '" x2="' + r2(200 + Math.cos(a) * 196) + '" y2="' + r2(257 + Math.sin(a) * 196) + '"/>';
    }
    s += '</g>';
    /* 交错轨道 */
    s += '<g fill="none" stroke="' + m + '" stroke-width="1.5" opacity=".74">' +
      '<ellipse cx="200" cy="257" rx="130" ry="53" transform="rotate(-26 200 257)"/>' +
      '<ellipse cx="200" cy="257" rx="130" ry="53" transform="rotate(26 200 257)"/></g>';
    s += '<g fill="none" stroke="#F3E6C6" stroke-width=".5" opacity=".38">' +
      '<ellipse cx="200" cy="257" rx="139" ry="59" transform="rotate(-26 200 257)"/>' +
      '<ellipse cx="200" cy="257" rx="139" ry="59" transform="rotate(26 200 257)"/></g>';
    for (var n = 0; n < 10; n++) {
      var b = n / 10 * Math.PI * 2;
      s += CI(200 + Math.cos(b) * 130, 257 + Math.sin(b) * 53, 1.3, '#FFF6DE', .6);
    }
    /* 核心 */
    s += '<circle cx="200" cy="257" r="94" fill="url(#bkCore)" opacity=".48"/>';
    s += '<circle cx="200" cy="257" r="55" fill="none" stroke="' + m + '" stroke-width="1" opacity=".66"/>';
    s += '<circle cx="200" cy="257" r="45" fill="none" stroke="#F6E7C8" stroke-width=".5" opacity=".36" stroke-dasharray="1 6"/>';
    s += '<path d="M200 201L220 239L258 257L220 275L200 313L180 275L142 257L180 239Z" fill="' + m + '" opacity=".2"/>';
    s += '<path d="M200 201L220 239L200 257L180 239Z" fill="#FFFDF2" opacity=".68"/>';
    s += '<path d="M200 313L220 275L200 257L180 275Z" fill="#EFDFF8" opacity=".4"/>';
    s += sparkle(200, 257, 15, '#FFFDF4', .95);
    s += sparkle(200, 257, 34, '#EFE2FF', .3);
    s += moonCrescent(u, 200, 146, 15, '#FFF6DE', true);
    s += CI(108, 318, 1.6, '#FFF6DE', .5);
    s += CI(266, 320, 1.6, '#FFF6DE', .5);
    s += '</g>';

    /* 上下纹章 */
    s += '<g opacity=".7">' +
      '<path d="M200 60l6.5 11h-13z" fill="' + m + '"/>' +
      '<path d="M200 468l6.5-11h-13z" fill="' + m + '"/>' +
      '<line x1="154" y1="60" x2="185" y2="60" stroke="' + m + '" stroke-width=".7"/>' +
      '<line x1="215" y1="60" x2="246" y2="60" stroke="' + m + '" stroke-width=".7"/>' +
      '<line x1="154" y1="468" x2="185" y2="468" stroke="' + m + '" stroke-width=".7"/>' +
      '<line x1="215" y1="468" x2="246" y2="468" stroke="' + m + '" stroke-width=".7"/>' +
      '</g>';
    s += '<rect x="26" y="42" width="348" height="430" rx="5" fill="none" stroke="' + m + '" stroke-width="1" opacity=".85"/>';
    s += '<rect x="21.5" y="37.5" width="357" height="439" rx="7" fill="none" stroke="' + m + '" stroke-width=".45" opacity=".35"/>';
    s += '<text x="200" y="514" text-anchor="middle" font-size="10" letter-spacing="7" fill="#E4D3F2" opacity=".55" font-family="Cormorant Garamond, Songti SC, serif">DIMENSION ANCHOR</text>';
    s += '<text x="200" y="546" text-anchor="middle" font-size="13" letter-spacing="6" fill="#EFDDB4" opacity=".85" font-family="Songti SC, serif">维度锚点塔罗</text>';
    s += borderSparkles(m);
    return s;
  }

  /* AI 插画层：填满窗口 + 一层月光调色，保证 78 张色调统一 */
  function imageScene(u, src) {
    return '<image href="' + src + '" x="0" y="0" width="348" height="430" preserveAspectRatio="xMidYMid slice"/>' +
      '<defs><linearGradient id="' + u + 'gr" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#2A2050" stop-opacity=".18"/>' +
        '<stop offset=".45" stop-color="#2A2050" stop-opacity="0"/>' +
        '<stop offset="1" stop-color="#140E2C" stop-opacity=".34"/></linearGradient>' +
      '<radialGradient id="' + u + 'vg" cx=".5" cy=".46" r=".74">' +
        '<stop offset=".55" stop-color="#140E2C" stop-opacity="0"/>' +
        '<stop offset="1" stop-color="#140E2C" stop-opacity=".55"/></radialGradient></defs>' +
      '<rect width="348" height="430" fill="url(#' + u + 'gr)"/>' +
      '<rect width="348" height="430" fill="url(#' + u + 'vg)"/>';
  }

  /* 底部区域的星云延续，避免铭牌悬在空黑块上 */
  function footerWash(u, m) {
    var g = 'fw' + u;
    return '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#2A2048" stop-opacity=".95"/>' +
      '<stop offset=".35" stop-color="#1C1436" stop-opacity=".98"/>' +
      '<stop offset="1" stop-color="#120C26"/></linearGradient>' +
      '<radialGradient id="' + g + 'r" cx=".5" cy="0" r=".9">' +
      '<stop offset="0" stop-color="#8F76C8" stop-opacity=".22"/>' +
      '<stop offset="1" stop-color="#8F76C8" stop-opacity="0"/></radialGradient></defs>' +
      '<rect x="20" y="468" width="360" height="122" rx="7" fill="url(#' + g + ')"/>' +
      '<rect x="20" y="468" width="360" height="122" rx="7" fill="url(#' + g + 'r)"/>' +
      '<line x1="34" y1="470" x2="366" y2="470" stroke="' + m + '" stroke-width=".6" opacity=".35"/>' +
      CI(52, 498, .9, '#FFF6DE', .5) + CI(348, 512, .9, '#FFF6DE', .45) +
      CI(64, 556, .8, '#FFF6DE', .35) + CI(334, 562, .8, '#FFF6DE', .35);
  }

  /* ── 卡面组装 ───────────────────────────────────────────────── */
  function face(card) {
    var pu = 'k' + card.i;
    var m = 'url(#mt' + pu + ')';
    var sceneFn = (window.DA_SCENES && window.DA_SCENES[card.i]) || null;
    var imgMap = window.DA_TAROT_IMG || {};
    var src = imgMap[card.i];
    var scene = src ? imageScene(pu, src)
      : (sceneFn ? sceneFn(pu + 's', card)
        : (bg(pu + 's', '#2C2150', '#1A1332', '#0F0B20') + stars(pu + 's', 40, 3, '#FFF6DE')));

    var body = '<g transform="translate(26,42)" clip-path="url(#cp' + pu + ')">' + scene + '</g>';
    body += footerWash(pu, m);
    body += cartouche(card, m);

    var numSize = card.pip.length > 2 ? 10 : 13;
    return '<svg viewBox="0 0 400 600" xmlns="http://www.w3.org/2000/svg" class="da-card-svg" role="img" aria-label="' +
      card.cn + ' ' + card.en + '">' + frameShell(body, pu, card.pip, numSize) + '</svg>';
  }

  var _backCache = null;
  function backSVG() {
    if (!_backCache) _backCache = '<svg viewBox="0 0 400 600" xmlns="http://www.w3.org/2000/svg" class="da-card-svg da-back-svg" role="img" aria-label="牌背">' + back() + '</svg>';
    return _backCache;
  }

  return {
    face: face, back: backSVG, W: W, H: H,
    lib: {
      AW: AW, AH: AH, F: F, S: S, CI: CI, EL: EL, RC: RC, r2: r2, rng: rng,
      bg: bg, halo: halo, vignette: vignette, stars: stars, sparkle: sparkle,
      moonFull: moonFull, moonCrescent: moonCrescent, sun: sun, rays: rays,
      mountains: mountains, ridge: ridge, sea: sea, floorBand: floorBand, road: road,
      mist: mist, cloud: cloud, arch: arch, colonnade: colonnade, tower: tower,
      castle: castle, gate: gate, throne: throne, bridge: bridge, boat: boat,
      fig: fig, rider: rider, handCloud: handCloud, angel: angel,
      chalice: chalice, wand: wand, sword: sword, pent: pent,
      tree: tree, flower: flower, flowers: flowers, wreath: wreath, crown: crown,
      chain: chain, scales: scales, wheel: wheel, mirror: mirror, lamp: lamp,
      heart: heart, eye: eye, book: book, hourglass: hourglass
    }
  };
})();
