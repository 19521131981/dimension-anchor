/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — SCENE SYSTEM
   ----------------------------------------------------------------------
   环境层的「行为」（样式与形状都在 CSS / SVG 里）：

     Parallax     鼠标视差：只作用于光层（云雾 / 花枝光 / 花瓣），
                  原画本身不动 —— 远景小、近景略大、月亮与入口固定
     Petals       偶发花瓣：左侧与右侧各自调度，飘出画面即销毁
     Ripple       地面水波：随机间隔，只作用在反射层
     Energy       月亮 → 星盘的能量呼应：60–120 秒随机一次
     MoonTap      轻点月亮：月面脉冲 + 双轨道错峰 + 星盘回应

   所有定时器都尊重 DA_MOTION 的暂停状态，页面隐藏时不触发。
   ══════════════════════════════════════════════════════════════════════ */
window.DA_SCENE = (function () {
  'use strict';

  var M = window.DA_MOTION;
  var plate = document.querySelector('.plate');
  if (!plate || !M) return { energy: function () {}, moon: function () {} };

  var field = null;

  /* ══ 视差 ══════════════════════════════════════════════════════
     只写两个 CSS 变量，元素自己的 animation 用 transform，
     视差用独立的 translate 属性叠加 —— 互不覆盖。 */
  (function parallax() {
    if (!window.matchMedia) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    var tx = 0, ty = 0, cx = 0, cy = 0;

    window.addEventListener('pointermove', function (e) {
      if (M.isReduced()) return;
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });

    M.onTick(function () {
      if (M.isReduced()) {
        if (cx || cy) { cx = 0; cy = 0; plate.style.setProperty('--px', '0'); plate.style.setProperty('--py', '0'); }
        return;
      }
      var dx = tx - cx, dy = ty - cy;
      if (Math.abs(dx) < 0.0005 && Math.abs(dy) < 0.0005) return;
      cx += dx * 0.055;
      cy += dy * 0.055;
      plate.style.setProperty('--px', cx.toFixed(3));
      plate.style.setProperty('--py', cy.toFixed(3));
    });
  })();

  /* ══ 花瓣 ══════════════════════════════════════════════════════ */
  var PETAL = '<svg viewBox="0 0 12 10" aria-hidden="true">' +
    '<path d="M6 .6C8.9 1.6 10.9 3.9 10.6 6.2c-.3 2.2-2.5 3.5-4.8 3.1C3.5 8.9 1.6 7 1.6 4.7 1.6 2.6 3.5 1 6 .6Z" ' +
    'fill="url(#petalGrad)" opacity=".92"/>' +
    '<path d="M6 .9c1.9.9 3.2 2.4 3.4 3.9" fill="none" stroke="#FFFDF6" stroke-width=".35" opacity=".55"/>' +
    '</svg>';

  function spawnPetal() {
    if (!field || M.isReduced() || M.state.paused) return;
    var side = Math.random() < 0.5 ? 'l' : 'r';
    var cap = M.isSoft() ? 2 : 3;
    if (field.querySelectorAll('.petal[data-side="' + side + '"]').length >= cap) return;

    var w = plate.clientWidth || 1;
    var h = plate.clientHeight || 1;
    var el = document.createElement('div');
    el.className = 'petal';
    el.setAttribute('data-side', side);
    el.innerHTML = PETAL;

    var px = side === 'l' ? M.rand(0.02, 0.135) : M.rand(0.865, 0.975);
    el.style.left = (px * 100).toFixed(2) + '%';
    el.style.top = (M.rand(0.4, 0.62) * 100).toFixed(2) + '%';
    el.style.setProperty('--dx', M.rand(-40, 70).toFixed(0) + 'px');
    el.style.setProperty('--dy', (h * M.rand(0.26, 0.44)).toFixed(0) + 'px');
    el.style.setProperty('--rot', M.rand(140, 340).toFixed(0) + 'deg');
    el.style.setProperty('--dur', (M.rand(15, 22) * (M.isSoft() ? 1.6 : 1)).toFixed(1) + 's');

    var sz = M.rand(6, 10);
    el.style.width = sz.toFixed(1) + 'px';
    el.style.height = (sz * 0.8).toFixed(1) + 'px';

    el.addEventListener('animationend', function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    field.appendChild(el);
  }

  /* ══ 地面水波 ══════════════════════════════════════════════════ */
  function ripple() {
    if (M.isReduced()) return;
    var a = document.querySelector('.scene__ripple');
    var b = document.querySelector('.scene__ripple--2');
    [a, b].forEach(function (el) {
      if (!el) return;
      el.classList.remove('is-on');
      void el.offsetWidth;
      el.classList.add('is-on');
    });
    window.setTimeout(function () {
      [a, b].forEach(function (el) { if (el) el.classList.remove('is-on'); });
    }, 7200);
  }

  /* ══ 月亮 → 星盘 ══════════════════════════════════════════════ */
  var beamBusy = false;
  function energy() {
    if (M.isReduced() || beamBusy) return;
    var beam = document.querySelector('.scene__beam');
    var sp = document.querySelector('.starplate');
    if (!beam) return;
    beamBusy = true;
    beam.classList.remove('is-on');
    void beam.offsetWidth;
    beam.classList.add('is-on');
    if (sp) {
      sp.classList.remove('is-pulsing');
      void sp.getBoundingClientRect();
      sp.classList.add('is-pulsing');
    }
    window.setTimeout(function () {
      beam.classList.remove('is-on');
      if (sp) sp.classList.remove('is-pulsing');
      beamBusy = false;
    }, 8700);
  }

  /* ══ 轻点月亮 ═════════════════════════════════════════════════ */
  var tapBusy = false;
  function moonTap() {
    if (tapBusy) return;
    tapBusy = true;
    plate.classList.add('is-moon-tap');
    var sp = document.querySelector('.starplate');
    if (sp) {
      sp.classList.remove('is-pulsing');
      void sp.getBoundingClientRect();
      sp.classList.add('is-pulsing');
    }
    M.emit('moon');
    window.setTimeout(function () {
      plate.classList.remove('is-moon-tap');
      tapBusy = false;
    }, 2600);
    window.setTimeout(function () {
      if (sp) sp.classList.remove('is-pulsing');
    }, 3000);
  }

  /* ══ 定时器：可暂停的自调度 ════════════════════════════════════ */
  function every(fn, minS, maxS) {
    function step() {
      var wait = M.rand(minS, maxS) * 1000;
      window.setTimeout(function () {
        if (M.state.paused) { step(); return; }
        try { fn(); } catch (e) { /* 不打断其它系统 */ }
        step();
      }, wait);
    }
    step();
  }

  function boot() {
    field = document.querySelector('.petals');
    plate.style.setProperty('--px', '0');
    plate.style.setProperty('--py', '0');

    var hit = document.querySelector('.moon-hit');
    if (hit) {
      hit.addEventListener('click', function (e) { e.preventDefault(); moonTap(); });
      hit.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault(); moonTap();
        }
      });
    }

    window.setTimeout(function () { if (!M.state.paused) spawnPetal(); }, M.rand(3, 5) * 1000);
    every(spawnPetal, 6, 11);
    every(ripple, 10, 20);
    every(energy, 35, 70);

    /* 减少动态时停止花瓣与视差 */
    M.on('level', function (lv) {
      if (lv === 'reduced') {
        var ps = document.querySelectorAll('.petal');
        Array.prototype.forEach.call(ps, function (p) { p.remove(); });
        plate.style.setProperty('--px', '0');
        plate.style.setProperty('--py', '0');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return {
    energy: energy,
    moon: moonTap,
    ripple: ripple,
    petal: spawnPetal
  };
})();
