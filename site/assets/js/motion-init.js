/* DIMENSION ANCHOR — 全站动效偏好初始化
   策略与大厅一致：明确选「减少」才停；系统减少动态默认降到柔和。
   独立成文件，供没有引入 hall-motion-core.js 的页面复用。
   幂等：可重复加载，不覆盖用户已显式设定的 data-motion。 */
(function () {
  try {
    var root = document.documentElement;
    if (root.dataset.motion) return; // 已由其它脚本设定，尊重之
    var m = 'full';
    try { m = localStorage.getItem('DA2_MOTION') || m; } catch (e) {}
    if (m === 'full' && window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) m = 'soft';
    root.dataset.motion = m;
    if (m === 'reduced') {
      document.querySelectorAll('video').forEach(function (v) { v.pause(); });
    }
  } catch (e) {}
})();
