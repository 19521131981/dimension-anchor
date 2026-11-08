/* ══════════════════════════════════════════════════════════════
   DIMENSION ANCHOR TAROT — 牌库渲染 / 详情 / 单牌抽取
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DECK = window.DA_TAROT;
  var ART  = window.DA_ART;
  var IMG  = window.DA_TAROT_IMG || {};

  var grid   = document.getElementById('grid');
  var drawer = document.getElementById('drawer');
  var lastFocus = null;

  var SUIT_LABEL = {
    major: 'MAJOR ARCANA',
    cups: 'CUPS · 圣杯 · 水',
    wands: 'WANDS · 权杖 · 火',
    swords: 'SWORDS · 宝剑 · 风',
    pentacles: 'PENTACLES · 星币 · 土'
  };

  /* 已渲染过的卡面 SVG 缓存，避免重复构建 */
  var faceCache = {};
  function faceOf(card) {
    if (!faceCache[card.i]) faceCache[card.i] = ART.face(card);
    return faceCache[card.i];
  }

  /* ── 牌库 ─────────────────────────────────────────────── */
  function render(filter) {
    var list = DECK.all.filter(function (c) {
      return filter === 'all' || c.s === filter;
    });

    var frag = document.createDocumentFragment();
    list.forEach(function (card) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'card' + (IMG[card.i] ? '' : ' is-pending');
      el.setAttribute('aria-label', card.cn + ' ' + card.en + ' · 查看牌意');
      el.dataset.id = card.i;
      el.innerHTML = faceOf(card);
      if (window.DA_CARD) DA_CARD.decorate(el, { dense: true });
      el.addEventListener('click', function () { open(card.i, el); });
      frag.appendChild(el);
    });

    grid.innerHTML = '';
    grid.appendChild(frag);
    if (window.DA_CARD) DA_CARD.observe(grid);
  }

  /* ── 详情 ─────────────────────────────────────────────── */
  function open(id, from) {
    var c = DECK.byId(id);
    if (!c) return;

    document.getElementById('dCard').innerHTML = faceOf(c);
    if (window.DA_CARD) DA_CARD.decorate(document.getElementById('dCard'), { live: true });
    document.getElementById('dNum').textContent = SUIT_LABEL[c.s] + ' · ' + c.pip;
    document.getElementById('dTitle').textContent = c.cn;
    document.getElementById('dEn').textContent = c.en;
    document.getElementById('dKw').innerHTML = c.ku.map(function (k) {
      return '<span>' + k + '</span>';
    }).join('');
    document.getElementById('dUp').textContent = c.up;
    document.getElementById('dRev').textContent = c.rev;
    document.getElementById('dLove').textContent = c.love;
    document.getElementById('dKin').textContent = c.kin;
    document.getElementById('dMood').textContent = c.mood;
    document.getElementById('dAct').textContent = c.act;
    document.getElementById('dSym').textContent = c.sym;

    lastFocus = from || document.activeElement;
    drawer.hidden = false;
    requestAnimationFrame(function () { drawer.classList.add('is-open'); });
    document.body.style.overflow = 'hidden';

    var x = drawer.querySelector('.drawer__x');
    if (x) x.focus({ preventScroll: true });
  }

  function close() {
    if (drawer.hidden) return;
    drawer.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(function () { drawer.hidden = true; }, 380);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  /* ── 单牌抽取（真实随机） ─────────────────────────────── */
  function drawOne() {
    var all = DECK.all;
    var buf = new Uint32Array(1);
    var idx;
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(buf);
      idx = buf[0] % all.length;
    } else {
      idx = Math.floor(Math.random() * all.length);
    }
    open(all[idx].i, document.getElementById('drawOne'));
  }

  /* ── 绑定 ─────────────────────────────────────────────── */
  function bind() {
    Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (b) {
          b.classList.toggle('is-on', b === btn);
        });
        render(btn.dataset.filter);
      });
    });

    document.getElementById('drawOne').addEventListener('click', drawOne);

    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (el) {
      el.addEventListener('click', close);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !drawer.hidden) close();
      if (e.key !== 'Tab' || drawer.hidden) return;
      var items = drawer.querySelectorAll('button, a[href]');
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* 牌背展示：五套 AI 生成牌背，按花色列出 */
  function renderBacks() {
    var row = document.getElementById('backRow');
    if (!row || !window.DA_BACKS) return;
    row.innerHTML = DA_BACKS.order.map(function (k) {
      return '<li class="backs__item">' +
        '<div class="backs__ph"><img src="' + DA_BACKS.url(k) + '" alt="' +
        DA_BACKS.cn[k] + '牌背" loading="lazy" decoding="async"></div>' +
        '<p class="backs__n">' + DA_BACKS.cn[k] + '</p>' +
        '<span class="backs__c">' + (k === 'major' ? '22 张' : '14 张') + '</span>' +
        '</li>';
    }).join('');
  }

  render('all');
  renderBacks();
  bind();
})();
