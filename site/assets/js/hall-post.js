/* ══════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 星际通讯局 · 大厅（双门）
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var M = window.DA_MAIL, L = window.DA_LETTER, S = window.DA_STORE;

  function toast(msg, ms) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.hidden = true; }, ms || 2400);
  }

  function setModeChip() {
    var chip = $('#modeChip'), txt = $('#modeText');
    txt.textContent = M.modeLabel();
    chip.hidden = false;
    if (M.state.mode === 'local') chip.classList.add('is-local');
  }

  function renderStats() {
    M.stats().then(function (s) {
      $('#statIn').innerHTML = '<b>' + s.incoming + '</b> 封来信' + (s.unread ? ' · <b>' + s.unread + '</b> 封未读' : '');
      $('#statOut').innerHTML = '<b>' + s.outgoing + '</b> 封寄出 · <b>' + s.drafts + '</b> 份草稿';
    }).catch(function () {});
  }

  function renderToday() {
    M.getDaily().then(function (rec) {
      if (!rec) return;
      var strip = $('#todayStrip');
      $('#todayText').innerHTML = '《' + esc(rec.title) + '》 · ' + esc(rec.charName || '星辰') +
        ' 已于今日送达，还没读过也可以再读一遍。';
      strip.hidden = false;
      $('#todayOpen').onclick = function () {
        location.href = window.DA_LINK ? DA_LINK.fix('incoming.html?open=' + encodeURIComponent(rec.id)) : 'incoming.html?open=' + encodeURIComponent(rec.id);
      };
    }).catch(function () {});
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  if (S) S.migrate();
  M.init().then(function () {
    setModeChip();
    renderStats();
    renderToday();
  });
})();
