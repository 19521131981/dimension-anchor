/* 背景视频延迟加载：首屏先把静态图与文字渲染出来，空闲后再補上光层视频。
   窄屏与「减少动态」用户只保留静态图，不下载 MB 级视频。 */
(function () {
  'use strict';

  function init() {
    var videos = [].slice.call(document.querySelectorAll('video[data-src], video[data-video-src]'));
    if (!videos.length) return;

    var reduced = document.documentElement.getAttribute('data-motion') === 'reduced' ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    var frugal = conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''));
    if (reduced || frugal || window.innerWidth <= 900) return;

    function start() {
      videos.forEach(function (v) {
        var src = v.getAttribute('data-src') || v.getAttribute('data-video-src');
        if (!src || v.getAttribute('src')) return;
        v.setAttribute('src', src);
        v.removeAttribute('data-src');
        v.removeAttribute('data-video-src');
        v.load();
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      });
    }

    if (window.requestIdleCallback) window.requestIdleCallback(start, { timeout: 2000 });
    else window.setTimeout(start, 350);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
