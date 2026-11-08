/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — MOTION CONTROLLER
   ----------------------------------------------------------------------
   全场唯一的动画调度中心。所有会动的模块都从这里拿三样东西：

     level    当前动态档位：full / soft / reduced
     tick     统一的 rAF 时钟（页面隐藏、离屏、减少动态时停摆）
     bus      on / emit 事件（月亮脉冲、入口进入、隐藏星触发……）

   设计原则：
     · 只用一个 rAF，不各自 setInterval
     · 页面隐藏 / 离屏 → 加 .mx-paused，CSS 动画整体暂停
     · 用户选择存 localStorage；没有选择时跟随系统 prefers-reduced-motion
   ══════════════════════════════════════════════════════════════════════ */
window.DA_MOTION = (function () {
  'use strict';

  var KEY = 'DA2_MOTION';
  var LEVELS = ['full', 'soft', 'reduced'];
  var root = document.documentElement;

  var listeners = {};
  var ticks = [];
  var rafId = 0;
  var lastT = 0;

  var state = {
    level: 'full',
    paused: false,
    visible: true
  };

  function readPref() {
    try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  }
  function writePref(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* 隐身模式下忽略 */ }
  }
  function sysReduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  var saved = readPref();
  /* 站主定案：环境动效是本站的核心体验。系统开了"减少动态"时
     默认降到"柔和"而不是全关；只有用户在开关里明确选了"减少"才全关。 */
  state.level = LEVELS.indexOf(saved) >= 0 ? saved : (sysReduced() ? 'soft' : 'full');

  /* ── 事件 ─────────────────────────────────────────────────── */
  function on(name, fn) {
    (listeners[name] || (listeners[name] = [])).push(fn);
    return function () {
      var a = listeners[name] || [];
      var i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    };
  }
  function emit(name, data) {
    var a = listeners[name];
    if (!a) return;
    for (var i = 0; i < a.length; i++) {
      try { a[i](data); } catch (e) { /* 单个订阅出错不能拖垮整场 */ }
    }
  }

  /* ── 档位 ─────────────────────────────────────────────────── */
  function syncUI() {
    var btns = document.querySelectorAll('.motion-switch button');
    Array.prototype.forEach.call(btns, function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-level') === state.level ? 'true' : 'false');
      b.tabIndex = b.getAttribute('data-level') === state.level ? 0 : -1;
    });
  }

  function apply() {
    root.setAttribute('data-motion', state.level);
    syncUI();
    emit('level', state.level);
  }

  function setLevel(v, byUser) {
    if (LEVELS.indexOf(v) < 0) return;
    if (state.level === v) { if (byUser) writePref(v); return; }
    state.level = v;
    if (byUser) writePref(v);
    apply();
  }

  function bindUI() {
    var wrap = document.querySelector('.motion-switch');
    if (!wrap) return;
    Array.prototype.forEach.call(wrap.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        setLevel(b.getAttribute('data-level'), true);
      });
      b.addEventListener('keydown', function (e) {
        var dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
                : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        var i = LEVELS.indexOf(b.getAttribute('data-level'));
        var next = LEVELS[(i + dir + LEVELS.length) % LEVELS.length];
        setLevel(next, true);
        var t = wrap.querySelector('[data-level="' + next + '"]');
        if (t) t.focus();
      });
    });
    syncUI();
  }

  /* ── 暂停 ─────────────────────────────────────────────────── */
  function setPaused(v) {
    v = !!v;
    if (state.paused === v) return;
    state.paused = v;
    var plate = document.querySelector('.plate');
    if (plate) plate.classList.toggle('mx-paused', v);
    emit('paused', v);
  }

  function bindVisibility() {
    document.addEventListener('visibilitychange', function () {
      state.visible = !document.hidden;
      setPaused(document.hidden);
      emit('visibility', state.visible);
    });
    if ('IntersectionObserver' in window) {
      var plate = document.querySelector('.plate');
      if (plate) {
        new IntersectionObserver(function (entries) {
          entries.forEach(function (e) { setPaused(!e.isIntersecting); });
        }, { threshold: 0.02 }).observe(plate);
      }
    }
  }

  /* ── rAF 时钟 ─────────────────────────────────────────────── */
  function loop(t) {
    rafId = requestAnimationFrame(loop);
    var dt = lastT ? Math.min(64, t - lastT) : 16;
    lastT = t;
    if (state.paused || state.level === 'reduced') return;
    for (var i = 0; i < ticks.length; i++) {
      try { ticks[i](t, dt); } catch (e) { /* 同上 */ }
    }
  }

  function onTick(fn) {
    ticks.push(fn);
    return function () {
      var i = ticks.indexOf(fn);
      if (i >= 0) ticks.splice(i, 1);
    };
  }

  /* ── 工具 ─────────────────────────────────────────────────── */
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* 本地日期键：用设备本地时区，跨时区旅行会以当地日期为准（见验收说明） */
  function dayKey(d) {
    d = d || new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  function boot() {
    bindUI();
    bindVisibility();
    apply();
    if (!rafId) rafId = requestAnimationFrame(loop);
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      var handler = function () {
        /* 用户已经手动选过，就以用户的选择为准 */
        if (readPref()) return;
        setLevel(mq.matches ? 'reduced' : 'full', false);
      };
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return {
    state: state,
    on: on,
    emit: emit,
    onTick: onTick,
    setLevel: setLevel,
    setPaused: setPaused,
    isReduced: function () { return state.level === 'reduced'; },
    isSoft: function () { return state.level === 'soft'; },
    isFull: function () { return state.level === 'full'; },
    rand: rand,
    randInt: randInt,
    pick: pick,
    clamp: clamp,
    dayKey: dayKey
  };
})();
