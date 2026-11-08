/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — PORTAL SYSTEM
   ----------------------------------------------------------------------
   五个入口的交互壳。视觉（星空、信封、暖窗、书脊、星子）都在
   hall-portals.css 里，这里只负责：

     · 点击 / 回车时的收束反馈（每个入口一套 keyframes）
     · 每日主题更新时，每日探索入口拱沿的一次掠过
     · 未读来信：通讯局入口上的小提示（有未读才亮，看过即灭）
     · 把「进入了哪个空间」广播给其它系统（隐藏星、档案馆）

   入口本身的跳转仍由 hall.js 的 hash 路由负责，这里不改地址、不改文案。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var M = window.DA_MOTION;
  if (!M) return;

  var portals = Array.prototype.slice.call(document.querySelectorAll('.portal'));
  if (!portals.length) return;

  function ensure(p, cls) {
    var el = p.querySelector('.' + cls);
    if (!el) {
      el = document.createElement('span');
      el.className = cls;
      el.setAttribute('aria-hidden', 'true');
      p.appendChild(el);
    }
    return el;
  }

  function charge(p) {
    p.classList.remove('is-charging');
    void p.offsetWidth;
    p.classList.add('is-charging');
    window.setTimeout(function () { p.classList.remove('is-charging'); }, 960);
  }

  portals.forEach(function (p) {
    ensure(p, 'portal__flash');
    ensure(p, 'portal__sweep');

    p.addEventListener('pointerdown', function () { charge(p); });
    p.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') charge(p);
    });
    p.addEventListener('click', function () {
      M.emit('portal', p.getAttribute('data-space'));
    });
  });

  /* ══ 每日主题更新：入口拱沿掠过一次（一天一次） ══════════════════ */
  (function dailyNew() {
    var p = document.querySelector('.portal[data-space="daily"]');
    if (!p) return;
    var KEY = 'DA2_THEME_DAY';
    var today = M.dayKey();
    var last = '';
    try { last = localStorage.getItem(KEY) || ''; } catch (e) { return; }
    if (last === today) return;
    try { localStorage.setItem(KEY, today); } catch (e) {}

    window.setTimeout(function () {
      p.classList.add('is-daily-new');
      window.setTimeout(function () { p.classList.remove('is-daily-new'); }, 3600);
    }, 1600);
  })();

  /* ══ 未读来信：只有真的有未读才亮 ════════════════════════════════
     读取 DA2_MAIL_UNREAD（由通讯局页面写入）；没有这个键就完全不亮，
     不制造假的提示。 */
  (function mailBadge() {
    var p = document.querySelector('.portal[data-space="post"]');
    if (!p) return;
    var n = 0;
    try { n = parseInt(localStorage.getItem('DA2_MAIL_UNREAD') || '0', 10) || 0; } catch (e) { n = 0; }
    if (n <= 0) return;
    var b = document.createElement('span');
    b.className = 'ps-badge is-on';
    b.setAttribute('aria-hidden', 'true');
    p.querySelector('.portal__scene').appendChild(b);
    p.setAttribute('aria-label', p.getAttribute('aria-label') + '（有 ' + n + ' 封未读来信）');
  })();

  /* 供其它页面 / 调试使用 */
  window.DA_PORTALS = {
    chargeAll: function () { portals.forEach(charge); }
  };
})();
