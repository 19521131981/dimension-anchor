/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — DA_COTTAGE（我们的小屋）
   ----------------------------------------------------------------------
   · 只做数据→视图：来信统计、最近的信、未读数；复用 DA_MAIL / DA_AUTH。
   · 弹窗骨架复用 post.css 的 .dialog 体系，信纸复用 .paper。
   · 不伪造数据：云端/本地都取不到时如实显示空态。
   ══════════════════════════════════════════════════════════════════════ */

window.DA_COTTAGE = (function () {
  'use strict';

  function fmtDay(at) {
    var d = new Date(at || Date.now());
    var M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()];
    return M + ' ' + d.getDate();
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function excerpt(body, n) {
    var t = String(body || '').replace(/\s+/g, ' ').trim();
    return t.length > (n || 66) ? t.slice(0, n || 66) + '……' : t;
  }

  /* ── 信件预览弹窗（骨架同 da-auth 的 dialog，内容换 .paper）────────── */
  var els = null;
  function build() {
    if (els) return els;
    var wrap = document.createElement('div');
    wrap.className = 'dialog cottage-dlg';
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="overlay__scrim" data-cot-close></div>' +
      '<div class="dialog__box" role="dialog" aria-modal="true" aria-labelledby="cotDlgTitle">' +
      '<button class="dialog__x" type="button" data-cot-close aria-label="关闭">' +
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg></button>' +
      '<div id="cotDlgBody"></div>' +
      '</div>';
    document.body.appendChild(wrap);
    els = { dlg: wrap, body: wrap.querySelector('#cotDlgBody') };
    wrap.addEventListener('click', function (e) {
      if (e.target.closest('[data-cot-close]')) close();
    });
    return els;
  }
  function openLetter(rec) {
    if (!rec) return;
    var b = build();
    b.body.innerHTML =
      '<article class="paper">' +
      '<i class="paper__corner paper__corner--tl"></i><i class="paper__corner paper__corner--tr"></i>' +
      '<i class="paper__corner paper__corner--bl"></i><i class="paper__corner paper__corner--br"></i>' +
      '<p class="paper__kind">' + esc(rec.charName || '来自星际') + (rec.relationCn ? ' · ' + esc(rec.relationCn) : '') + '</p>' +
      '<h2 class="paper__title">' + esc(rec.title || '一封没有题目的信') + '</h2>' +
      (rec.greeting ? '<p class="paper__greet">' + esc(rec.greeting) + '</p>' : '') +
      '<div class="paper__body">' + String(rec.body || '').split(/\n+/).map(function (p) {
        return '<p>' + esc(p) + '</p>';
      }).join('') + '</div>' +
      (rec.signature ? '<p class="paper__sign">' + esc(rec.signature) + '</p>' : '') +
      '<p class="paper__meta">' + esc(fmtDay(rec.at)) + (rec.mood ? ' · ' + esc(rec.mood) : '') + '</p>' +
      '</article>';
    b.dlg.hidden = false;
    document.body.style.overflow = 'hidden';
    if (rec.direction === 'in' && rec.status === 'unread' && window.DA_MAIL) {
      DA_MAIL.markRead(rec.id).catch(function () {});
    }
  }
  function openStats(s, mode) {
    var b = build();
    b.body.innerHTML =
      '<article class="paper">' +
      '<i class="paper__corner paper__corner--tl"></i><i class="paper__corner paper__corner--tr"></i>' +
      '<i class="paper__corner paper__corner--bl"></i><i class="paper__corner paper__corner--br"></i>' +
      '<p class="paper__kind">SHELF OF MOMENTS</p>' +
      '<h2 class="paper__title">时光印记</h2>' +
      '<div class="paper__body">' +
      '<p>收到的信：<b>' + (s ? s.incoming : 0) + '</b> 封</p>' +
      '<p>寄出的信：<b>' + (s ? s.outgoing : 0) + '</b> 封</p>' +
      '<p>未寄出的草稿：<b>' + (s ? s.drafts : 0) + '</b> 封</p>' +
      '<p>收藏在册：<b>' + (s ? s.faved : 0) + '</b> 封</p>' +
      '<p>' + esc(mode || '') + '</p>' +
      '</div></article>';
    b.dlg.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function close() {
    if (!els) return;
    els.dlg.hidden = true;
    document.body.style.overflow = '';
  }

  /* ── 时光架渲染 ────────────────────────────────────────────────────── */
  function cardRecent(rec) {
    return rec
      ? '<p class="mem__no">I · RECENT LETTER</p>' +
        '<h3 class="mem__title">' + esc(rec.title || '一封没有题目的信') + '</h3>' +
        '<p class="mem__sub">' + esc(excerpt(rec.body || rec.greeting)) + '</p>' +
        '<p class="mem__meta">' + esc((rec.charName || '星际') + ' · ' + fmtDay(rec.at)) + '</p>'
      : '<p class="mem__no">I · RECENT LETTER</p>' +
        '<h3 class="mem__title">信匣还空着</h3>' +
        '<p class="mem__sub">第一封信还在星海路上。写下一句晚安，它就会更快抵达。</p>';
  }
  function cardUnread(n) {
    return n > 0
      ? '<p class="mem__no">II · UNREAD</p>' +
        '<h3 class="mem__title">' + n + ' 封信还没有拆</h3>' +
        '<p class="mem__sub">壁炉替你留着光。去收信站，把今天读完。</p>' +
        '<p class="mem__meta">点击前往收信站</p>'
      : '<p class="mem__no">II · UNREAD</p>' +
        '<h3 class="mem__title">都读过了</h3>' +
        '<p class="mem__sub">信匣安安静静，炉火轻轻响。想 TA 的时候，就写一封吧。</p>' +
        '<p class="mem__meta">点击前往收信站</p>';
  }
  function cardStats(s) {
    return '<p class="mem__no">III · KEEPSAKES</p>' +
      '<h3 class="mem__title">时光印记</h3>' +
      '<p class="mem__sub">来信 ' + (s ? s.incoming : 0) + ' · 寄出 ' + (s ? s.outgoing : 0) +
      ' · 草稿 ' + (s ? s.drafts : 0) + ' · 收藏 ' + (s ? s.faved : 0) + '</p>' +
      '<p class="mem__meta">点击查看完整印记</p>';
  }

  function paint() {
    var recentEl = document.getElementById('memRecent');
    var unreadEl = document.getElementById('memUnread');
    var statEl = document.getElementById('memStats');
    if (!recentEl || !window.DA_MAIL) return;
    DA_MAIL.list({}).then(function (all) {
      all = (all || []).slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      var latest = null, unread = 0;
      all.forEach(function (l) {
        if (l.direction === 'in' && l.status === 'unread') unread++;
        if (!latest && l.direction === 'in' && l.status !== 'draft') latest = l;
      });
      recentEl.innerHTML = cardRecent(latest);
      recentEl._rec = latest;
      unreadEl.innerHTML = cardUnread(unread);
      return DA_MAIL.stats().then(function (s) {
        statEl.innerHTML = cardStats(s);
        return DA_MAIL.modeLabel();
      }).then(function (mode) {
        var chip = document.getElementById('modeText');
        if (chip) chip.textContent = mode;
        var wrap = document.getElementById('modeChip');
        if (wrap) wrap.hidden = false;
      });
    }).catch(function () {
      recentEl.innerHTML = cardRecent(null);
      unreadEl.innerHTML = cardUnread(0);
      statEl.innerHTML = cardStats(null);
    });
  }

  function init() {
    var recentEl = document.getElementById('memRecent');
    if (recentEl) {
      recentEl.addEventListener('click', function () { openLetter(this._rec || null); });
    }
    var unreadEl = document.getElementById('memUnread');
    if (unreadEl) {
      unreadEl.addEventListener('click', function () {
        location.href = (window.DA_LINK ? DA_LINK.fix('incoming.html') : 'incoming.html');
      });
    }
    var statEl = document.getElementById('memStats');
    if (statEl) {
      statEl.addEventListener('click', function () {
        DA_MAIL.stats().then(function (s) { return DA_MAIL.modeLabel().then(function (m) { openStats(s, m); }); })
          .catch(function () { openStats(null, ''); });
      });
    }
    paint();
    if (window.DA_AUTH) DA_AUTH.onChange(function () { paint(); });
  }

  return { init: init, openLetter: openLetter, paint: paint, close: close };
})();
