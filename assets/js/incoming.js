/* ══════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 收信站 · 来自星际的来信
   数据流：DA_MAIL（server / cloud / local）→ 阅读器
   AI 生成失败显示真实错误，不伪造信件。
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var M = window.DA_MAIL, L = window.DA_LETTER, S = window.DA_STORE;

  var els = {
    modeChip: $('#modeChip'), modeText: $('#modeText'),
    chips: $('#chips'), fChar: $('#fChar'), fType: $('#fType'), grid: $('#grid'),
    dailyTheme: $('#dailyTheme'), dailySub: $('#dailySub'), dailyActs: $('#dailyActs'),
    reader: $('#reader'), readerActs: $('#readerActs'),
    pKind: $('#pKind'), pTitle: $('#pTitle'), pGreet: $('#pGreet'),
    pBody: $('#pBody'), pSign: $('#pSign'), pMeta: $('#pMeta'),
    actFav: $('#actFav'), actReply: $('#actReply'), actDel: $('#actDel'),
    deck: $('#deck'), deckBar: $('#deckBar'), deckHint: $('#deckHint'),
    deckBody: $('#deckBody'), deckRow: $('#deckRow'),
    dlg: $('#dlg'), dlgBody: $('#dlgBody'), dlgGo: $('#dlgGo'),
    dlgTitle: $('#dlgTitle'), dlgStep: $('#dlgStep'), dlgFoot: $('#dlgFoot'),
    toast: $('#toast'), btnDaily: $('#btnDaily'), btnDailyText: $('#btnDailyText')
  };

  var filter = { kind: 'all', char: '', type: '' };
  var cur = null;      /* 当前阅读的信件 */
  var cache = [];      /* 收信箱缓存 */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function toast(msg, ms) {
    els.toast.textContent = msg; els.toast.hidden = false;
    clearTimeout(els.toast._t);
    els.toast._t = setTimeout(function () { els.toast.hidden = true; }, ms || 2600);
  }
  function dateCn(at) {
    var d = new Date(at);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  /* ══ 信匣 ══════════════════════════════════════════════════ */
  function load() {
    return M.list({ direction: 'in' }).then(function (all) {
      cache = all;
      renderFilters();
      renderGrid();
      renderDaily();
    });
  }

  function renderFilters() {
    var chars = [], types = [];
    cache.forEach(function (l) {
      var c = l.charName || '星辰';
      if (chars.indexOf(c) < 0) chars.push(c);
      if (l.letterType && types.indexOf(l.letterType) < 0) types.push(l.letterType);
    });
    els.fChar.innerHTML = '<option value="">全部角色</option>' + chars.map(function (c) {
      return '<option' + (filter.char === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    els.fType.innerHTML = '<option value="">全部类型</option>' + types.map(function (t) {
      return '<option' + (filter.type === t ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('');
  }

  function renderGrid() {
    var list = cache.filter(function (l) {
      if (filter.kind === 'unread' && l.status === 'read') return false;
      if (filter.kind === 'faved' && !l.faved) return false;
      if (filter.char && (l.charName || '星辰') !== filter.char) return false;
      if (filter.type && l.letterType !== filter.type) return false;
      return true;
    });
    els.grid.innerHTML = list.length ? list.map(cardHtml).join('')
      : '<div class="empty" style="grid-column:1/-1">信匣里还没有信<small>领取今日星笺，或请角色再写一封</small></div>';
  }

  function cardHtml(l) {
    var unread = l.status === 'unread';
    return '<button class="lt-card" type="button" data-id="' + esc(l.id) + '">' +
      '<div class="lt-card__meta">' + (unread ? '<i class="lt-card__unread" aria-hidden="true"></i>' : '') +
      esc(l.charName || '星辰') + ' · ' + esc(l.letterType || '来信') + '</div>' +
      '<h3>' + esc(l.title || '一封信') + '</h3>' +
      '<p class="lt-card__sub">' + esc(String(l.body || '').replace(/\s+/g, ' ').slice(0, 46)) + '…</p>' +
      '<div class="lt-card__foot">' +
      '<span class="lt-card__time">' + dateCn(l.at) + (unread ? ' · 未读' : '') + '</span>' +
      '<span class="lt-card__fav' + (l.faved ? ' is-on' : '') + '" data-fav="' + esc(l.id) + '">' + (l.faved ? '✦ 已珍藏' : '✧ 珍藏') + '</span>' +
      '</div></button>';
  }

  els.chips.addEventListener('click', function (e) {
    var b = e.target.closest('[data-f]');
    if (!b) return;
    filter.kind = b.getAttribute('data-f');
    els.chips.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-on', x === b); });
    renderGrid();
  });
  els.fChar.addEventListener('change', function () { filter.char = els.fChar.value; renderGrid(); });
  els.fType.addEventListener('change', function () { filter.type = els.fType.value; renderGrid(); });

  els.grid.addEventListener('click', function (e) {
    var fav = e.target.closest('[data-fav]');
    if (fav) {
      e.stopPropagation();
      var id = fav.getAttribute('data-fav');
      var on = !fav.classList.contains('is-on');
      M.setFaved(id, on).then(function () {
        fav.classList.toggle('is-on', on);
        fav.textContent = on ? '✦ 已珍藏' : '✧ 珍藏';
        toast(on ? '已收进珍藏架' : '已取消珍藏');
        var hit = null; cache.forEach(function (l) { if (l.id === id) hit = l; });
        if (hit) hit.faved = on;
      }).catch(function (e2) { toast(e2.message || '操作失败'); });
      return;
    }
    var card = e.target.closest('.lt-card');
    if (card) openReader(card.getAttribute('data-id'));
  });

  /* ══ 今日星笺卡 ════════════════════════════════════════════ */
  var todayRec = null;
  function renderDaily() {
    M.getDaily().then(function (rec) {
      todayRec = rec;
      var theme = L.DAILY_THEMES[L.dayIdx() % L.DAILY_THEMES.length];
      els.dailyTheme.textContent = '「' + theme + '」';
      if (rec) {
        els.dailySub.textContent = '《' + (rec.title || '一封信') + '》 已于今日送达 · 来自 ' + (rec.charName || '星辰');
        els.dailyActs.hidden = false;
        els.btnDailyText.textContent = '今日星笺已送达';
        $('#dailyOpen').onclick = function () { openReader(rec.id); };
        $('#dailyFresh').onclick = function () { openDialog({ kind: 'letter' }); };
      } else {
        els.dailySub.textContent = '今天还没有你的信。';
        els.dailyActs.hidden = true;
        els.btnDailyText.textContent = '领取今日来信';
      }
    }).catch(function () {
      els.dailyTheme.textContent = '—';
      els.dailySub.textContent = '信件档案暂时读不到。';
    });
  }

  /* ══ 领取来信对话框 ════════════════════════════════════════ */
  var dlgForm = { kind: 'daily' };
  function openDialog(opts) {
    dlgForm = { kind: (opts && opts.kind) || 'daily', profileId: '', length: 'short', note: '' };
    els.dlgTitle.textContent = dlgForm.kind === 'daily' ? '领取今日来信' : '请 TA 再写一封';
    els.dlgStep.textContent = dlgForm.kind === 'daily' ? 'TODAY · STELLAR MAIL' : 'ANOTHER LETTER';
    var profiles = S ? S.profiles.list() : [];
    var theme = L.DAILY_THEMES[L.dayIdx() % L.DAILY_THEMES.length];
    els.dlgBody.innerHTML =
      '<div class="field"><label>谁来写这封信</label><span class="sel"><select id="dChar">' +
      '<option value="">星辰（通用幻想信）</option>' +
      profiles.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join('') +
      '</select><img class="sel__arrow" src="assets/media/post/select-arrow.webp" alt=""></span><p class="hint">' + (profiles.length ? '读取已保存的角色档案，语气会贴合 TA 的性格。' : '还没有角色档案——在塔罗观测站的连接仪式里保存过角色后，TA 会出现在这里。') + '</p></div>' +
      '<div class="field"><label>信的主题</label><input id="dTheme" maxlength="20" value="' + esc(dlgForm.kind === 'daily' ? theme : '') + '" placeholder="' + esc(theme) + '"><p class="hint">留空即用今日主题「' + esc(theme) + '」。</p></div>' +
      '<div class="field"><label>信的长度</label><div class="opt-grid" id="dLen">' +
      L.LENGTHS.map(function (o) {
        var on = o.k === 'short' ? ' is-on' : '';
        var parts = o.cn.split('·');
        var head = (parts[0] || '').trim(), sub = (parts[1] || '').trim();
        return '<button class="opt' + on + '" type="button" data-k="' + o.k + '">' +
          '<img class="opt__icon" src="assets/media/post/icon-' + o.k + '.webp" alt="">' +
          '<span class="opt__txt">' + esc(head) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' +
          '</button>';
      }).join('') + '</div></div>' +
      '<div class="field"><label>想让 TA 知道的事（可跳过）</label><textarea id="dNote" maxlength="200" placeholder="最近的心情、想分享的一件事……"></textarea></div>' +
      '<p class="hint" style="margin-top:10px">由 AI 创作的角色幻想信件，生成约需 5–20 秒。</p>';
    els.dlgBody.querySelector('#dLen').addEventListener('click', function (e) {
      var b = e.target.closest('.opt'); if (!b) return;
      dlgForm.length = b.getAttribute('data-k');
      els.dlgBody.querySelectorAll('.opt').forEach(function (x) { x.classList.toggle('is-on', x === b); });
    });
    els.dlgFoot.style.display = '';
    els.dlg.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeDialog() { els.dlg.hidden = true; document.body.style.overflow = ''; }

  els.btnDaily.addEventListener('click', function () {
    if (M.state.mode === 'local') {
      toast('本机模式没有 AI 通道：请用 node server.js 启动本地服务，或访问线上站点', 4200);
      return;
    }
    openDialog({ kind: todayRec ? 'letter' : 'daily' });
  });

  function setBusy(b, line) {
    els.dlgGo.disabled = b;
    els.dlgGo.textContent = b ? '信笺飞行中…' : '请 TA 落笔';
    var box = $('#dGenBox');
    if (box) { box.querySelector('.gen__line').textContent = line || box.querySelector('.gen__line').textContent; }
  }

  /* ══ 抽牌：真实洗牌 → 逐张翻开 → 读牌 → 落笔 ══════════════ */
  function faceOf(id) {
    var D = window.DA_TAROT, A = window.DA_ART;
    var c = D && D.byId(id);
    return (c && A) ? A.face(c) : '';
  }
  function backOf() {
    var A = window.DA_ART;
    return A ? A.back() : '';
  }

  function drawStage(cards) {
    var view = L.cardView(cards);
    els.dlgBody.innerHTML =
      '<div class="draw">' +
      '<p class="draw__lead" id="dLead">洗牌中……</p>' +
      '<div class="draw__row" id="dRow">' +
      view.map(function (c, i) {
        return '<div class="draw__card" data-i="' + i + '" style="animation-delay:' + (i * 90) + 'ms">' +
          backOf() + '</div>';
      }).join('') +
      '</div>' +
      '<div class="gen__bar"><i></i></div></div>';
    els.dlgFoot.style.display = 'none';

    /* 逐张翻开：牌面替换 + 翻转动效 + 报牌位 */
    view.forEach(function (c, i) {
      setTimeout(function () {
        var el = document.querySelector('#dRow .draw__card[data-i="' + i + '"]');
        if (!el) return;
        el.innerHTML = faceOf(c.id);
        if (c.reversed) el.classList.add('is-rev');
        el.classList.add('is-flip');
        var lead = document.querySelector('#dLead');
        if (lead) lead.textContent = '第 ' + (i + 1) + ' 张 · ' + c.pos;
      }, 620 + i * 260);
    });
    setTimeout(function () {
      var lead = document.querySelector('#dLead');
      if (lead) lead.textContent = '正在把牌意写进信里……';
    }, 620 + view.length * 260 + 200);
  }

  els.dlgGo.addEventListener('click', function () {
    var profileId = (els.dlgBody.querySelector('#dChar') || {}).value || '';
    var themeCn = (els.dlgBody.querySelector('#dTheme') || {}).value || '';
    var note = (els.dlgBody.querySelector('#dNote') || {}).value || '';
    var theme = themeCn.trim() || L.DAILY_THEMES[L.dayIdx() % L.DAILY_THEMES.length];
    var form = { profileId: profileId, charMode: profileId ? 'saved' : 'none', length: dlgForm.length, themeCn: theme, note: note, theme: '' };

    /* 先真抽牌（3 / 5 / 6 张，取决于长度），再交给服务端读牌与落笔 */
    var cards = L.drawCards(form.length);
    if (!cards.length) {
      els.dlgBody.innerHTML = '<div class="err"><p>牌组没有载入</p><small>请刷新页面后重试。</small></div>';
      els.dlgFoot.style.display = '';
      return;
    }
    drawStage(cards);

    var t0 = Date.now();
    M.generateIncoming(form, { kind: dlgForm.kind, cards: cards }).then(function (rec) {
      if (dlgForm.kind === 'daily') M.setDailyPointer(rec);
      closeDialog();
      todayRec = null;
      return load().then(function () { openReader(rec.id, true); });
    }).catch(function (e) {
      els.dlgBody.innerHTML =
        '<div class="err"><p>这封信没能送达</p><small>' + esc(e.message || '未知错误') + '</small>' +
        '<button class="btn" type="button" id="dRetry">再抽一次</button></div>';
      els.dlgFoot.style.display = '';
      els.dlgGo.textContent = '请 TA 落笔';
      els.dlgGo.disabled = false;
      $('#dRetry').addEventListener('click', function () { openDialog({ kind: dlgForm.kind }); });
    });
  });

  /* ══ 阅读器 ════════════════════════════════════════════════ */
  function openReader(id, justArrived) {
    var p = justArrived ? Promise.resolve() : M.get(id);
    (p || Promise.resolve()).then(function () {
      var rec = justArrived ? M.list({ direction: 'in' }).then(function (all) {
        var hit = null; all.forEach(function (l) { if (l.id === id) hit = l; }); return hit;
      }) : M.get(id);
      return rec;
    }).then(function (rec) {
      if (!rec) { toast('信件不存在'); return; }
      cur = rec;
      fillPaper(rec);
      els.reader.hidden = false;
      document.body.style.overflow = 'hidden';
      M.markRead(id).then(function () {
        var hit = null; cache.forEach(function (l) { if (l.id === id) hit = l; });
        if (hit && hit.status === 'unread') { hit.status = 'read'; renderGrid(); }
      }).catch(function () {});
    }).catch(function (e) { toast(e.message || '打不开这封信'); });
  }

  function fillPaper(rec) {
    els.pKind.textContent = (rec.source === 'ai' ? '来自星际 · ' : '') + (rec.letterType || '来信') + (rec.mood ? ' · ' + rec.mood : '');
    els.pTitle.textContent = rec.title || '一封信';
    els.pGreet.textContent = rec.greeting || '';
    els.pBody.innerHTML = String(rec.body || '').split(/\n{2,}/).map(function (p) {
      return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>';
    }).join('');
    els.pSign.textContent = rec.signature || '';
    var meta = [rec.charName || '星辰'];
    if (rec.relationCn) meta.push(rec.relationCn);
    meta.push(dateCn(rec.at));
    els.pMeta.textContent = meta.join(' · ');
    els.actFav.classList.toggle('is-on', !!rec.faved);
    els.actFav.textContent = rec.faved ? '✦ 已珍藏' : '珍藏这封信';
    els.actReply.style.display = '';
    renderDeck(rec);
  }

  /* ══ 底牌抽屉（默认收起，点开才看牌）═══════════════════════ */
  function deckCardsHtml(cards) {
    return (cards || []).map(function (c, i) {
      var rev = /逆/.test(c.orient || '');
      return '<div class="deck__card' + (rev ? ' is-rev' : '') + '" style="animation-delay:' + (i * 70) + 'ms">' +
        (faceOf(c.id) || '') +
        '<span class="deck__pos">' + esc(c.pos || '') + '</span>' +
        '<span class="deck__nm">' + esc(c.cn || '') + ' <em>' + (rev ? '逆' : '正') + '</em></span>' +
        '</div>';
    }).join('');
  }

  function collapseDeck() {
    els.deck.classList.remove('is-open');
    els.deckBar.setAttribute('aria-expanded', 'false');
    els.deckBody.setAttribute('aria-hidden', 'true');
    els.deckBody.style.maxHeight = '0px';
  }

  function renderDeck(rec) {
    var cards = rec.cards || (rec.payload && rec.payload.cards) || [];
    if (!cards.length) { els.deck.hidden = true; return; }
    els.deck.hidden = false;
    els.deckHint.innerHTML = '这封信由 <i>' + cards.length + '</i> 张牌写成 · 点开看看底牌';
    els.deckRow.innerHTML = deckCardsHtml(cards);
    collapseDeck();
  }

  els.deckBar.addEventListener('click', function () {
    var open = !els.deck.classList.contains('is-open');
    if (open) {
      els.deckRow.innerHTML = deckCardsHtml(cur && (cur.cards || (cur.payload && cur.payload.cards)) || []);
      els.deckBody.hidden = false;
      els.deckBody.setAttribute('aria-hidden', 'false');
      els.deck.classList.add('is-open');
      els.deckBar.setAttribute('aria-expanded', 'true');
      els.deckBody.style.maxHeight = (els.deckBody.scrollHeight + 26) + 'px';
    } else {
      collapseDeck();
    }
  });

  function closeReader() {
    els.reader.hidden = true;
    document.body.style.overflow = '';
    cur = null;
    if (els.deck) collapseDeck();
  }

  els.actFav.addEventListener('click', function () {
    if (!cur) return;
    var on = !cur.faved;
    M.setFaved(cur.id, on).then(function () {
      cur.faved = on;
      els.actFav.classList.toggle('is-on', on);
      els.actFav.textContent = on ? '✦ 已珍藏' : '珍藏这封信';
      renderGrid();
      toast(on ? '已收进珍藏架' : '已取消珍藏');
    }).catch(function (e) { toast(e.message || '操作失败'); });
  });
  els.actReply.addEventListener('click', function () {
    if (!cur) return;
    var url = 'outgoing.html?reply=' + encodeURIComponent(cur.id) +
      '&char=' + encodeURIComponent(cur.charId || '') +
      '&name=' + encodeURIComponent(cur.charName || '星辰');
    location.href = window.DA_LINK ? DA_LINK.fix(url) : url;
  });
  els.actDel.addEventListener('click', function () {
    if (!cur) return;
    if (!window.confirm('删除《' + (cur.title || '这封信') + '》？删除后无法恢复。')) return;
    M.remove(cur.id).then(function () {
      closeReader();
      toast('已删除');
      return load();
    }).catch(function (e) { toast(e.message || '删除失败'); });
  });

  /* ══ 全局 ══════════════════════════════════════════════════ */
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) {
      if (!els.dlg.hidden) closeDialog();
      if (!els.reader.hidden) closeReader();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!els.dlg.hidden) closeDialog();
    else if (!els.reader.hidden) closeReader();
  });

  /* ══ 启动 ══════════════════════════════════════════════════ */
  if (S) S.migrate();
  M.init().then(function () {
    els.modeText.textContent = M.modeLabel();
    els.modeChip.hidden = false;
    if (M.state.mode === 'local') els.modeChip.classList.add('is-local');
    return load();
  }).then(function () {
    var openId = new URLSearchParams(location.search).get('open');
    if (openId) openReader(openId);
  }).catch(function (e) {
    els.grid.innerHTML = '<div class="empty" style="grid-column:1/-1">信件档案暂时读不到<small>' + esc(e.message || '') + '</small></div>';
  });

  /* 登录 / 退出后就地换档案：不刷新页面，读者不会被弹回列表顶部再走一遍 */
  var refreshing = false;
  function reloadForAuth() {
    if (refreshing) return;
    refreshing = true;
    els.modeText.textContent = M.modeLabel();
    load().catch(function () {}).then(function () {
      refreshing = false;
      if (!els.reader.hidden && cur) {
        return M.get(cur.id).then(function (fresh) {
          if (fresh) { cur = fresh; fillPaper(fresh); }
        }).catch(function () {});
      }
    });
  }
  document.addEventListener('da:authchange', reloadForAuth);
})();
