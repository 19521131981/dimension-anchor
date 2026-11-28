/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — DA_COTTAGE（我们的小屋 · 回忆宝藏之地）
   ----------------------------------------------------------------------
   · 定位：纪念日 / 特殊日子 / 生日的惊喜空间，美好瞬间的收藏处。
   · 数据：小屋自己的 DA_COTTAGE_DATA（照片墙/关系追踪/日期/话语）；
     信件入口仍复用 DA_MAIL。关系追踪与档案室完全分开，互不读取。
   · 不伪造数据：云端/本地都取不到时如实显示空态。
   ══════════════════════════════════════════════════════════════════════ */
window.DA_COTTAGE = (function () {
  'use strict';

  var D = window.DA_COTTAGE_DATA;
  function $(s) { return document.querySelector(s); }
  function fmtDay(at) {
    var d = new Date(at || Date.now());
    var M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()];
    return M + ' ' + d.getDate();
  }
  function esc(s) { return D ? D.esc(s) : String(s == null ? '' : s); }
  function excerpt(body, n) {
    var t = String(body || '').replace(/\s+/g, ' ').trim();
    return t.length > (n || 66) ? t.slice(0, n || 66) + '……' : t;
  }

  function toast(msg, ms) {
    var t = $('#cotToast'); if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.hidden = true; }, ms || 2600);
  }

  /* ══ 弹窗骨架（复用 post.css .dialog）═════════════════════════════ */
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
  function open(html) {
    var b = build();
    b.body.innerHTML = html;
    b.dlg.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function close() {
    if (!els) return;
    els.dlg.hidden = true;
    document.body.style.overflow = '';
  }
  function paper(title, kicker, inner) {
    return '<article class="paper">' +
      '<i class="paper__corner paper__corner--tl"></i><i class="paper__corner paper__corner--tr"></i>' +
      '<i class="paper__corner paper__corner--bl"></i><i class="paper__corner paper__corner--br"></i>' +
      '<p class="paper__kind">' + esc(kicker) + '</p>' +
      '<h2 class="paper__title">' + esc(title) + '</h2>' +
      '<div class="paper__body">' + inner + '</div></article>';
  }

  /* ══ 信件入口（保留原有：最近的信 / 未读 / 印记）═════════════════ */
  function openLetter(rec) {
    if (!rec) return;
    open('<article class="paper">' +
      '<i class="paper__corner paper__corner--tl"></i><i class="paper__corner paper__corner--tr"></i>' +
      '<i class="paper__corner paper__corner--bl"></i><i class="paper__corner paper__corner--br"></i>' +
      '<p class="paper__kind">' + esc(rec.charName || '来自星际') + (rec.relationCn ? ' · ' + esc(rec.relationCn) : '') + '</p>' +
      '<h2 class="paper__title">' + esc(rec.title || '一封没有题目的信') + '</h2>' +
      (rec.greeting ? '<p class="paper__greet">' + esc(rec.greeting) + '</p>' : '') +
      '<div class="paper__body">' + String(rec.body || '').split(/\n+/).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>' +
      (rec.signature ? '<p class="paper__sign">' + esc(rec.signature) + '</p>' : '') +
      '<p class="paper__meta">' + esc(fmtDay(rec.at)) + (rec.mood ? ' · ' + esc(rec.mood) : '') + '</p>' +
      '</article>');
    if (rec.direction === 'in' && rec.status === 'unread' && window.DA_MAIL) DA_MAIL.markRead(rec.id).catch(function () {});
  }
  function openStats(s, mode) {
    open(paper('时光印记', 'SHELF OF MOMENTS',
      '<p>收到的信：<b>' + (s ? s.incoming : 0) + '</b> 封</p>' +
      '<p>寄出的信：<b>' + (s ? s.outgoing : 0) + '</b> 封</p>' +
      '<p>未寄出的草稿：<b>' + (s ? s.drafts : 0) + '</b> 封</p>' +
      '<p>收藏在册：<b>' + (s ? s.faved : 0) + '</b> 封</p>' +
      '<p>' + esc(mode || '') + '</p>'));
  }

  /* ══ 惊喜话语：实时飘落 ═══════════════════════════════════════════ */
  var fallTimer = null;
  function dropLine(text) {
    var layer = $('#cotFalling');
    if (!layer || !D) return;
    var lines = D.allLines();
    var t = text || lines[Math.floor(Math.random() * lines.length)] || '炉火还热着。';
    var el = document.createElement('span');
    el.className = 'fall-line';
    el.textContent = t;
    el.style.left = (8 + Math.random() * 78) + '%';
    el.style.setProperty('--dur', (11 + Math.random() * 6).toFixed(1) + 's');
    el.style.setProperty('--drift', (Math.random() * 120 - 60).toFixed(0) + 'px');
    el.style.animationDelay = '0s';
    layer.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 18000);
    /* 最多同时 14 条，多了清最旧的 */
    var kids = layer.children;
    while (kids.length > 14) layer.removeChild(kids[0]);
  }
  function startFalling() {
    if (!D) return;
    dropLine();
    clearInterval(fallTimer);
    fallTimer = setInterval(function () {
      if (document.hidden) return;
      dropLine();
    }, 5200);
  }

  function openWriteLine() {
    var list = D ? D.lines() : [];
    var mine = list.length
      ? '<div class="cot-line-list">' + list.slice().reverse().map(function (l) {
          return '<div class="cot-line-item"><span>' + esc(l.text) + '</span>' +
            '<button type="button" data-del-line="' + esc(l.id) + '" aria-label="删除">✕</button></div>';
        }).join('') + '</div>'
      : '<p class="cot-empty-sm">还没有写下自己的话。</p>';
    open(paper('写一句悄悄话', 'WHISPER',
      '<p class="paper__hint">写下的话会加入飘落的话语里，也会一直留在这里。</p>' +
      '<textarea class="cot-input" id="cotLineText" maxlength="60" rows="2" placeholder="想对 TA 说的一句话……"></textarea>' +
      '<button class="cot-submit" type="button" id="cotLineSave">收进小屋</button>' +
      '<p class="cot-sub-t">我写的话</p>' + mine));
    $('#cotLineSave').onclick = function () {
      var v = $('#cotLineText').value;
      var r = D.addLine(v);
      if (!r.ok) { toast(r.msg); return; }
      close(); toast('已经收进小屋了'); dropLine(String(v).trim().slice(0, 60));
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-del-line]'), function (b) {
      b.onclick = function () { D.removeLine(b.getAttribute('data-del-line')); openWriteLine(); };
    });
  }

  /* ══ 照片墙 ═══════════════════════════════════════════════════════ */
  function renderPhotos() {
    var box = $('#photoWall'); if (!box || !D) return;
    var list = D.photos();
    if (!list.length) {
      box.innerHTML = '<div class="photo-empty"><span>✦</span><p>相框还空着</p><small>把约的稿子、纪念的瞬间放进来</small></div>';
      return;
    }
    box.innerHTML = list.map(function (p, i) {
      return '<figure class="photo-item" style="--i:' + i + '">' +
        '<img src="' + p.src + '" alt="' + esc(p.title) + '" decoding="async">' +
        '<figcaption><span>' + esc(p.title) + '</span>' +
        '<button type="button" data-del-photo="' + esc(p.id) + '" aria-label="移除照片">✕</button></figcaption>' +
        '</figure>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('[data-del-photo]'), function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        if (!window.confirm('把这张照片从小屋里拿走？')) return;
        D.removePhoto(b.getAttribute('data-del-photo'));
        renderPhotos(); toast('已移走');
      };
    });
  }
  function openAddPhoto() {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
    input.onchange = function () {
      var files = Array.prototype.slice.call(input.files || []);
      if (!files.length) return;
      toast('正在收进小屋…');
      var chain = Promise.resolve(), ok = 0;
      files.forEach(function (f) {
        chain = chain.then(function () {
          return D.addPhoto(f, f.name.replace(/\.[^.]+$/, '')).then(function () { ok++; }).catch(function (e) {
            toast(e && e.message ? e.message : '有张图没放进去');
          });
        });
      });
      chain.then(function () { renderPhotos(); if (ok) toast('收好了 ' + ok + ' 张'); });
    };
    input.click();
  }

  /* ══ 关系追踪（小屋独立，不读档案）════════════════════════════════ */
  function renderRel() {
    var box = $('#relTrack'); if (!box || !D) return;
    var list = D.rel();
    if (!list.length) {
      box.innerHTML = '<div class="rel-empty">这里还没有记下里程碑。<small>只属于这间小屋的记录，和塔罗档案分开存放。</small></div>';
      return;
    }
    box.innerHTML = '<ol class="rel-list">' + list.map(function (r) {
      return '<li class="rel-item"><i class="rel-dot"></i>' +
        '<div class="rel-body"><b>' + esc(r.title) + '</b>' +
        (r.note ? '<p>' + esc(r.note) + '</p>' : '') +
        '<time>' + esc(fmtDay(r.at)) + '</time></div>' +
        '<button type="button" data-del-rel="' + esc(r.id) + '" aria-label="删除">✕</button></li>';
    }).join('') + '</ol>';
    Array.prototype.forEach.call(box.querySelectorAll('[data-del-rel]'), function (b) {
      b.onclick = function () { D.removeRel(b.getAttribute('data-del-rel')); renderRel(); };
    });
  }
  function openAddRel() {
    open(paper('记一个里程碑', 'OUR MOMENTS',
      '<p class="paper__hint">这里记的是你们之间的小事，只存在小屋里，和塔罗档案是两回事。</p>' +
      '<label class="cot-lb">这一刻叫什么</label>' +
      '<input class="cot-input" id="relTitle" maxlength="30" placeholder="比如：第一次连上信号">' +
      '<label class="cot-lb">想记下的一句话（可不填）</label>' +
      '<textarea class="cot-input" id="relNote" maxlength="120" rows="3" placeholder="那天发生了什么……"></textarea>' +
      '<button class="cot-submit" type="button" id="relSave">记下来</button>'));
    $('#relSave').onclick = function () {
      var r = D.addRel($('#relTitle').value, $('#relNote').value, Date.now());
      if (!r.ok) { toast(r.msg); return; }
      close(); renderRel(); toast('记下来了'); dropLine('又多了一个值得记住的日子。');
    };
  }

  /* ══ 特殊日期 ═════════════════════════════════════════════════════ */
  function renderDays() {
    var box = $('#daysRow'); if (!box || !D) return;
    var list = D.days();
    if (!list.length) {
      box.innerHTML = '<div class="day-empty">还没有特别的日子。<small>纪念日、生日，都可以在这里等着。</small></div>';
      return;
    }
    box.innerHTML = list.map(function (d) {
      var left = D.daysUntil(d.date);
      var typeName = d.type === 'birthday' ? '生日' : (d.type === 'anniversary' ? '纪念日' : '特别的日子');
      var label = left === 0 ? '就是今天' : ('还有 ' + left + ' 天');
      return '<div class="day-card' + (left === 0 ? ' is-today' : '') + '">' +
        '<span class="day-type">' + esc(typeName) + '</span>' +
        '<b class="day-name">' + esc(d.title) + '</b>' +
        '<span class="day-left">' + label + '</span>' +
        '<time>' + esc(d.date) + '</time>' +
        '<button type="button" data-del-day="' + esc(d.id) + '" aria-label="删除">✕</button>' +
        '</div>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('[data-del-day]'), function (b) {
      b.onclick = function () { D.removeDay(b.getAttribute('data-del-day')); renderDays(); renderNextDay(); };
    });
  }
  function openAddDay() {
    var today = new Date();
    var iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    open(paper('记一个特别的日子', 'SPECIAL DAY',
      '<p class="paper__hint">到了那天，小屋会亮起来。</p>' +
      '<label class="cot-lb">叫什么</label>' +
      '<input class="cot-input" id="dayTitle" maxlength="24" placeholder="比如：TA 的生日">' +
      '<label class="cot-lb">是哪一天</label>' +
      '<input class="cot-input" id="dayDate" type="date" value="' + iso + '">' +
      '<label class="cot-lb">属于哪种</label>' +
      '<div class="cot-types" id="dayTypes">' +
      '<button type="button" data-t="birthday" class="is-on">生日</button>' +
      '<button type="button" data-t="anniversary">纪念日</button>' +
      '<button type="button" data-t="custom">特别的日子</button></div>' +
      '<button class="cot-submit" type="button" id="daySave">记下来</button>'));
    var type = 'birthday';
    Array.prototype.forEach.call(document.querySelectorAll('#dayTypes button'), function (b) {
      b.onclick = function () {
        type = b.getAttribute('data-t');
        Array.prototype.forEach.call(document.querySelectorAll('#dayTypes button'), function (x) { x.classList.toggle('is-on', x === b); });
      };
    });
    $('#daySave').onclick = function () {
      var r = D.addDay($('#dayTitle').value, $('#dayDate').value, type);
      if (!r.ok) { toast(r.msg); return; }
      close(); renderDays(); renderNextDay(); toast('记下来了，到时候小屋会告诉你');
    };
  }

  /* ══ 顶部最近的日子 ═══════════════════════════════════════════════ */
  function renderNextDay() {
    var box = $('#nextDay'); if (!box || !D) return;
    var list = D.days();
    if (!list.length) { box.innerHTML = ''; box.hidden = true; return; }
    var next = null, min = Infinity;
    list.forEach(function (d) {
      var n = D.daysUntil(d.date);
      if (n != null && n < min) { min = n; next = d; }
    });
    if (!next) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<span class="nd-kicker">下一个特别的日子</span>' +
      '<b class="nd-name">' + esc(next.title) + '</b>' +
      '<span class="nd-count">' + (min === 0 ? '就是今天 ✦' : '还有 ' + min + ' 天') + '</span>';
  }

  /* ══ 时光架（信件入口）════════════════════════════════════════════ */
  function cardRecent(rec) {
    return rec
      ? '<p class="mem__no">I · RECENT LETTER</p>' +
        '<h3 class="mem__title">' + esc(rec.title || '一封没有题目的信') + '</h3>' +
        '<p class="mem__sub">' + esc(excerpt(rec.body || rec.greeting)) + '</p>' +
        '<p class="mem__meta">' + esc((rec.charName || '星际') + ' · ' + fmtDay(rec.at)) + '</p>'
      : '<p class="mem__no">I · RECENT LETTER</p><h3 class="mem__title">信匣还空着</h3>' +
        '<p class="mem__sub">第一封信还在星海路上。写下一句晚安，它就会更快抵达。</p>';
  }
  function cardUnread(n) {
    return '<p class="mem__no">II · UNREAD</p>' +
      '<h3 class="mem__title">' + (n > 0 ? n + ' 封信还没有拆' : '都读过了') + '</h3>' +
      '<p class="mem__sub">' + (n > 0 ? '壁炉替你留着光。去收信站，把今天读完。' : '信匣安安静静，炉火轻轻响。想 TA 的时候，就写一封吧。') + '</p>' +
      '<p class="mem__meta">点击前往收信站</p>';
  }
  function cardStats(s) {
    return '<p class="mem__no">III · KEEPSAKES</p><h3 class="mem__title">时光印记</h3>' +
      '<p class="mem__sub">来信 ' + (s ? s.incoming : 0) + ' · 寄出 ' + (s ? s.outgoing : 0) +
      ' · 草稿 ' + (s ? s.drafts : 0) + ' · 收藏 ' + (s ? s.faved : 0) + '</p>' +
      '<p class="mem__meta">点击查看完整印记</p>';
  }
  function paintLetters() {
    var recentEl = $('#memRecent'), unreadEl = $('#memUnread'), statEl = $('#memStats');
    if (!recentEl || !window.DA_MAIL) return;
    DA_MAIL.list({}).then(function (all) {
      all = (all || []).slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      var latest = null, unread = 0;
      all.forEach(function (l) {
        if (l.direction === 'in' && l.status === 'unread') unread++;
        if (!latest && l.direction === 'in' && l.status !== 'draft') latest = l;
      });
      recentEl.innerHTML = cardRecent(latest); recentEl._rec = latest;
      unreadEl.innerHTML = cardUnread(unread);
      return DA_MAIL.stats().then(function (s) {
        statEl.innerHTML = cardStats(s);
        return DA_MAIL.modeLabel();
      }).then(function (mode) {
        var chip = $('#modeText'); if (chip) chip.textContent = mode;
        var wrap = $('#modeChip'); if (wrap) wrap.hidden = false;
      });
    }).catch(function () {
      recentEl.innerHTML = cardRecent(null); recentEl._rec = null;
      unreadEl.innerHTML = cardUnread(0); statEl.innerHTML = cardStats(null);
    });
  }

  /* ══ 启动 ═════════════════════════════════════════════════════════ */
  function init() {
    var recentEl = $('#memRecent');
    if (recentEl) recentEl.addEventListener('click', function () { openLetter(this._rec || null); });
    var unreadEl = $('#memUnread');
    if (unreadEl) unreadEl.addEventListener('click', function () {
      location.href = (window.DA_LINK ? DA_LINK.fix('incoming.html') : 'incoming.html');
    });
    var statEl = $('#memStats');
    if (statEl) statEl.addEventListener('click', function () {
      DA_MAIL.stats().then(function (s) { return DA_MAIL.modeLabel().then(function (m) { openStats(s, m); }); })
        .catch(function () { openStats(null, ''); });
    });

    var addPhoto = $('#addPhoto'); if (addPhoto) addPhoto.addEventListener('click', openAddPhoto);
    var addRel = $('#addRel'); if (addRel) addRel.addEventListener('click', openAddRel);
    var addDay = $('#addDay'); if (addDay) addDay.addEventListener('click', openAddDay);
    var writeLine = $('#writeLine'); if (writeLine) writeLine.addEventListener('click', openWriteLine);
    var hearth = $('#hearthBtn'); if (hearth) hearth.addEventListener('click', function () {
      dropLine(); hearth.classList.remove('is-poke'); void hearth.offsetWidth; hearth.classList.add('is-poke');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && els && !els.dlg.hidden) close();
    });

    renderPhotos(); renderRel(); renderDays(); renderNextDay();
    startFalling();
    paintLetters();
    if (window.DA_AUTH) DA_AUTH.onChange(function () { paintLetters(); });
  }

  return {
    init: init, openLetter: openLetter, paint: paintLetters, close: close,
    dropLine: dropLine, renderPhotos: renderPhotos, renderRel: renderRel, renderDays: renderDays
  };
})();
