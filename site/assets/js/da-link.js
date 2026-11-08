/*
 * da-link.js — 站内跨页导航的授权参数跟随
 * 静态托管（workbuddy 应用发布）要求所有页面访问都带 ?sharecode=…；
 * 页面内的相对链接（a[href]、location.href）不会自动带上它，
 * 裸地址会命中「链接不完整」403 拦截页。
 * 本脚本在所有页面最先加载：提供 DA_LINK.go/fix，并在点击瞬间兜底补参。
 */
(function () {
  'use strict';

  function search() { return window.location.search || ''; }

  function isInternal(u) {
    if (!/^\.?\/?[\w.-]+\.html?($|[?#])/i.test(u)) return false; /* 站内相对 .html */
    if (/^(https?:)?\/\//i.test(u)) {
      try { return new URL(u, location.href).host === location.host; }
      catch (e) { return false; }
    }
    return true;
  }

  /* 把当前 query（sharecode 等）补到站内 .html 链接上，hash 保持在最后 */
  function fix(u) {
    var s = search();
    if (!u || !s || !isInternal(u)) return u;
    if (u.indexOf('?') >= 0) return u;            /* 已有自己的参数，不动 */
    if (u.indexOf('sharecode=') >= 0) return u;
    return u.replace(/(#.*)?$/, function (m) { return s + (m || ''); });
  }

  function go(u) { window.location.href = fix(u); }

  function rewrite(root) {
    var list = (root || document).querySelectorAll('a[href]');
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var h = a.getAttribute('href');
      var f = fix(h);
      if (f !== h) a.setAttribute('href', f);
    }
  }

  /* 捕获阶段兜底：JS 动态插入的链接、改写过的 href 都在点击瞬间补参 */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var a = t.closest('a[href]');
    if (!a) return;
    var h = a.getAttribute('href');
    var f = fix(h);
    if (f !== h) a.setAttribute('href', f);
  }, true);

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  ready(function () { rewrite(document); });

  window.DA_LINK = { fix: fix, go: go, rewrite: rewrite };
})();
