/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — DA_CARD / 统一塔罗卡牌组件
   ----------------------------------------------------------------------
   全站所有卡牌都从这里出：图鉴、扇形抽牌、洗牌切牌、未翻开牌背、
   逐张翻牌、完整牌阵、解读页左栏、详情弹窗。

   用法：
     DA_CARD.front(card, { w: 132, cls: 'x' })      正面（含金环）
     DA_CARD.backOnly({ w: 132 })                   只有牌背
     DA_CARD.flip(card, { w: 132 })                 双面 + 3D 翻转容器
     DA_CARD.el(html)                               字符串 → 元素
     DA_CARD.observe(container)                     离屏卡牌暂停动画

   依赖：tarot-art.js（DA_ART.face / DA_ART.back）、tarot-deck.js（DA_TAROT）
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ART = window.DA_ART;

  /* ── 全局渐变资源：只注入一次 ─────────────────────────────── */
  var DEFS_ID = 'daCardDefs';
  function defs() {
    if (document.getElementById(DEFS_ID)) return;
    var d = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    d.setAttribute('id', DEFS_ID);
    d.setAttribute('width', '0');
    d.setAttribute('height', '0');
    d.setAttribute('aria-hidden', 'true');
    d.setAttribute('focusable', 'false');
    d.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0;pointer-events:none';
    d.innerHTML =
      '<defs>' +
        /* 香槟金：亮金 → 深铜 → 亮金，避免平涂黄 */
        '<linearGradient id="daGold" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="#FFF4DC"/>' +
          '<stop offset=".16" stop-color="#E7CB99"/>' +
          '<stop offset=".32" stop-color="#C9A268"/>' +
          '<stop offset=".46" stop-color="#F5E1B9"/>' +
          '<stop offset=".60" stop-color="#A9863F"/>' +
          '<stop offset=".76" stop-color="#EED6A8"/>' +
          '<stop offset=".90" stop-color="#C9A268"/>' +
          '<stop offset="1" stop-color="#FFF0CE"/>' +
        '</linearGradient>' +
        /* 流动光轨：两端透明、中段炽白，形成一道移动的高光 */
        '<linearGradient id="daFlow" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="#FFE9BE" stop-opacity="0"/>' +
          '<stop offset=".30" stop-color="#FFF0CC" stop-opacity=".55"/>' +
          '<stop offset=".50" stop-color="#FFFFFF" stop-opacity="1"/>' +
          '<stop offset=".70" stop-color="#FFE7B8" stop-opacity=".6"/>' +
          '<stop offset="1" stop-color="#FFD99B" stop-opacity="0"/>' +
        '</linearGradient>' +
      '</defs>';
    document.body.appendChild(d);
  }

  /* ── 四角宝石 ─────────────────────────────────────────────── */
  function gem(x, y, delay) {
    return '<g class="dc-gem" transform="translate(' + x + ' ' + y + ')" style="animation-delay:' + delay + 's">' +
      '<circle class="dc-gem__halo" r="9"/>' +
      '<path class="dc-gem__ring" d="M0 -9.6L6.4 0L0 9.6L-6.4 0Z"/>' +
      '<path class="dc-gem__ring2" d="M0 -6L4 0L0 6L-4 0Z"/>' +
      '<path class="dc-gem__star" d="M0 -3.2C.66 -1.1 1.1 -.66 3.2 0C1.1 .66 .66 1.1 0 3.2C-.66 1.1 -1.1 .66 -3.2 0C-1.1 -.66 -.66 -1.1 0 -3.2Z"/>' +
      '<path class="dc-gem__ray" d="M0 -14.4V-11.4M0 14.4V11.4M-14.4 0H-11.4M14.4 0H11.4"/>' +
      '</g>';
  }

  /* ── 动态金环（完整四边） ─────────────────────────────────── */
  function ring() {
    var box = 'x="3.6" y="3.6" width="392.8" height="592.8" rx="20" pathLength="1000"';
    return '<svg class="dcard__ring" viewBox="0 0 400 600" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
      /* 第一层：香槟金细描边（完整外轮廓） */
      '<rect class="dc-rim" ' + box + '/>' +
      '<rect class="dc-bevel" x="6.4" y="6.4" width="387.2" height="587.2" rx="18.4"/>' +
      '<rect class="dc-rim--soft" x="9.5" y="9.5" width="381" height="581" rx="16.6" pathLength="1000"/>' +
      /* 第二 / 三层：流动光轨 + 拖尾 + 副轨 */
      '<rect class="dc-flow dc-flow--glow" ' + box + '/>' +
      '<rect class="dc-flow dc-flow--core" ' + box + '/>' +
      '<rect class="dc-flow dc-flow--b" x="8.5" y="8.5" width="383" height="583" rx="17" pathLength="1000"/>' +
      /* 第四层：四角宝石雕花 */
      gem(24, 24, 0) + gem(376, 24, -1.7) + gem(376, 576, -3.3) + gem(24, 576, -5) +
      '</svg>';
  }

  /* ── 牌面缓存 ─────────────────────────────────────────────── */
  var faceCache = {};
  function faceHTML(card) {
    if (!card) return '';
    if (!faceCache[card.i]) faceCache[card.i] = ART.face(card);
    return faceCache[card.i];
  }
  function backHTML(suit) {
    if (window.DA_BACKS) {
      return '<img class="dcard__backimg" src="' + DA_BACKS.url(suit) + '" alt="" draggable="false">';
    }
    return ART.back();
  }

  /* ── 组装 ─────────────────────────────────────────────────── */
  function shell(inner, opt) {
    opt = opt || {};
    var cls = 'dcard';
    if (opt.dense) cls += ' dcard--dense';
    if (opt.live) cls += ' dcard--live';
    if (opt.flip) cls += ' dcard--flip';
    if (opt.hover !== false) cls += ' dcard--hover';
    if (opt.rev) cls += ' is-rev';
    if (opt.on) cls += ' is-on';
    if (opt.cls) cls += ' ' + opt.cls;

    var sides = opt.flip
      ? '<div class="dcard__side dcard__side--front">' + inner + '</div>' +
        '<div class="dcard__side dcard__side--back" aria-hidden="true">' + backHTML(opt.suit) + '</div>'
      : '<div class="dcard__side dcard__side--front">' + inner + '</div>';

    return '<div class="' + cls + '" style="--dc-w:' + (opt.w || 132) + 'px"' +
      (opt.id ? ' data-da-id="' + opt.id + '"' : '') + '>' +
      '<div class="dcard__aura"></div>' +
      '<div class="dcard__inner">' + sides + '</div>' +
      ring() +
      '<span class="dcard__glint" aria-hidden="true"></span>' +
      '</div>';
  }

  /* ── 对外接口 ─────────────────────────────────────────────── */
  function front(card, opt) {
    defs();
    opt = opt || {};
    opt.id = card && card.i;
    return shell(faceHTML(card), opt);
  }

  function backOnly(opt) {
    defs();
    opt = opt || {};
    return shell(backHTML(opt.suit), opt);
  }

  function flip(card, opt) {
    defs();
    opt = opt || {};
    opt.flip = true;
    opt.id = card && card.i;
    return shell(faceHTML(card), opt);
  }

  function el(html) {
    var t = document.createElement('div');
    t.innerHTML = html.trim();
    return t.firstElementChild;
  }

  /* 离屏暂停：图鉴有 78 张，避免同时跑 78 条流光 */
  var io = null;
  function observe(root) {
    if (!('IntersectionObserver' in window)) return;
    if (!io) {
      io = new IntersectionObserver(function (rows) {
        rows.forEach(function (r) {
          r.target.classList.toggle('is-offscreen', !r.isIntersecting);
        });
      }, { rootMargin: '120px 0px', threshold: 0 });
    }
    (root || document).querySelectorAll('.dcard:not([data-io])').forEach(function (n) {
      n.setAttribute('data-io', '1');
      io.observe(n);
    });
  }

  /* ── 就地升级：给已有卡牌节点套上金环与柔光 ─────────────────
     用于 reading / interpretation / 图鉴这些自己管理 DOM 的页面，
     不需要重写它们的渲染逻辑，只补视觉层。 */
  function sync(host) {
    var w = host.getBoundingClientRect().width;
    if (w > 4) host.style.setProperty('--dc-w', w.toFixed(1) + 'px');
  }

  function decorate(host, opt) {
    if (!host || host.dataset.dcx === '1') return host;
    defs();
    host.dataset.dcx = '1';
    /* 金环是绝对定位的装饰层，需要有定位上下文；
       但绝不能覆盖宿主自己的 absolute / fixed —— 只给 static 的补 relative。 */
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.classList.add('dcx');
    if (opt && opt.dense) host.classList.add('dcx--dense');
    if (opt && opt.live) host.classList.add('dcx--live');
    var aura = document.createElement('div');
    aura.className = 'dcard__aura';
    host.insertBefore(aura, host.firstChild);
    host.insertAdjacentHTML('beforeend', ring());
    sync(host);
    return host;
  }

  var SELECTOR = '.fan__card, .pc, .guide__card, .card, .cell, .dcard';

  function decorateAll(root, opt) {
    var scope = root || document;
    Array.prototype.forEach.call(scope.querySelectorAll(SELECTOR), function (n) {
      decorate(n, opt);
    });
  }

  /* 尺寸变化时同步 --dc-w（金色外发光的半径是跟着牌宽走的） */
  var rz = null;
  window.addEventListener('resize', function () {
    clearTimeout(rz);
    rz = window.setTimeout(function () {
      Array.prototype.forEach.call(document.querySelectorAll('.dcx'), sync);
    }, 160);
  });

  /* 牌背 SVG，供各页面直接内联 */
  function backArt(suit) {
    defs();
    return window.DA_BACKS ? DA_BACKS.img(suit) : ART.back();
  }

  /* 翻牌：加 is-flipping 短暂收敛金环，翻完恢复常亮 */
  function setFlipped(node, on, cb) {
    if (!node) return;
    node.classList.add('is-flipping');
    node.classList.toggle('is-flipped', !!on);
    window.setTimeout(function () {
      node.classList.remove('is-flipping');
      if (cb) cb();
    }, 840);
  }

  window.DA_CARD = {
    front: front,
    backOnly: backOnly,
    flip: flip,
    el: el,
    observe: observe,
    decorate: decorate,
    decorateAll: decorateAll,
    backArt: backArt,
    sync: sync,
    setFlipped: setFlipped,
    ring: ring,
    defs: defs
  };
})();
