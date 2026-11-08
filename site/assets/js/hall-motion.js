/* ══════════════════════════════════════════════════════════════════════
   STARTRACK HALL · ORBIT DETAILS
   ----------------------------------------------------------------------
   轨道本体（两条独立 SVG 椭圆、前后遮挡、晶体段、流动高光）全部由
   hall-motion.html 里的矢量与 hall-motion.css 的动画完成。

   这里只剩两件必须用 JS 做的事：

     1. 光点的运动路径直接取自 SVG 里那条 path 的 d —— 光点与描边
        走在同一条线上，不会因为各写一份路径而在拐点处偏出去。
     2. 入场：先以 opacity 0 画过一帧，再撤掉 .mx-enter。

   暂停 / 离屏 / 减少动态统一由 DA_MOTION 管，这里不再重复监听。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var plate = document.querySelector('.plate');
  if (!plate) return;

  /* ── 光点沿轨道运行 ───────────────────────────────────────── */
  (function bindSparks() {
    [['orbPathA', '.orb__spark--a'], ['orbPathB', '.orb__spark--b']].forEach(function (pair) {
      var src = document.getElementById(pair[0]);
      if (!src) return;
      var d = src.getAttribute('d');
      if (!d) return;
      var css = 'path("' + d + '")';
      Array.prototype.forEach.call(document.querySelectorAll(pair[1]), function (el) {
        el.style.offsetPath = css;
        el.style.webkitOffsetPath = css;
      });
    });
  })();

  /* ── 入场：只动 opacity，不做整体缩放（避免与轨道动画互相覆盖） ── */
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      plate.classList.remove('mx-enter');
    });
  });
})();
