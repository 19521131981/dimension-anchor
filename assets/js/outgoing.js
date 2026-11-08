/* ══════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 寄信站 · 寄往星际的信
   草稿 → 确认 → 寄出（真实落库）；失败保留正文；重复点击幂等。
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var M = window.DA_MAIL, S = window.DA_STORE;

  var els = {
    modeChip: $('#modeChip'), modeText: $('#modeText'),
    replyNote: $('#replyNote'), replyWho: $('#replyWho'), replyCancel: $('#replyCancel'),
    tabs: $('#outTabs'), sideTitle: $('#sideTitle'), outList: $('#outList'),
    toChar: $('#toChar'), toName: $('#toName'),
    cTitle: $('#cTitle'), cBody: $('#cBody'), cCount: $('#cCount'),
    cSave: $('#cSave'), cSend: $('#cSend'), cClear: $('#cClear'),
    dlg: $('#dlg'), dlgView: $('#dlgView'), dlgSend: $('#dlgSend'),
    reader: $('#reader'), pKind: $('#pKind'), pTitle: $('#pTitle'),
    pBody: $('#pBody'), pMeta: $('#pMeta'), actDel: $('#actDel'), actCopy: $('#actCopy'),
    toast: $('#toast')
  };

  var tab = 'draft';
  var editId = null;       /* 正在编辑的草稿 id；null = 新信 */
  var replyTo = null;      /* 回信关联的来信 id */
  var sending = false;     /* 防重复提交 */
  var dirty = false;

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

  /* ══ 收信人 ════════════════════════════════════════════════ */
  function renderToChar(prefName) {
    var profiles = S ? S.profiles.list() : [];
    if (profiles.length) {
      els.toChar.hidden = false; els.toName.hidden = true;
      els.toChar.innerHTML = profiles.map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (prefName && p.name === prefName ? ' selected' : '') + '>' + esc(p.name) + '</option>';
      }).join('') + '<option value="__custom">其他人…</option>';
    } else {
      els.toChar.hidden = true; els.toName.hidden = false;
      if (prefName) els.toName.value = prefName;
    }
  }
  function currentRecipient() {
    if (!els.toChar.hidden) {
      if (els.toChar.value === '__custom') return { charId: '', charName: els.toName.value.trim() };
      var opt = els.toChar.selectedOptions[0];
      return { charId: els.toChar.value, charName: opt ? opt.textContent.replace('其他人…', '').trim() : '' };
    }
    return { charId: '', charName: els.toName.value.trim() };
  }
  els.toChar.addEventListener('change', function () {
    els.toName.hidden = els.toChar.value !== '__custom';
    dirty = true;
  });

  /* ══ 编辑器 ════════════════════════════════════════════════ */
  function updateCount() {
    els.cCount.textContent = els.cBody.value.length + ' 字';
  }
  els.cBody.addEventListener('input', function () { updateCount(); dirty = true; });
  els.cTitle.addEventListener('input', function () { dirty = true; });

  function readEditor() {
    var r = currentRecipient();
    return {
      title: els.cTitle.value.trim(),
      body: els.cBody.value.trim(),
      charId: r.charId,
      charName: r.charName,
      replyTo: replyTo || ''
    };
  }

  function loadEditor(rec) {
    editId = rec ? rec.id : null;
    replyTo = rec ? (rec.replyTo || null) : replyTo;
    els.cTitle.value = rec ? (rec.title || '') : '';
    els.cBody.value = rec ? (rec.body || '') : '';
    if (rec) {
      if (rec.charId && !els.toChar.hidden) {
        els.toChar.value = rec.charId;
        if (els.toChar.selectedOptions[0] && els.toChar.selectedOptions[0].value !== rec.charId) {
          els.toChar.value = '__custom'; els.toName.hidden = false; els.toName.value = rec.charName || '';
        }
      } else if (!els.toChar.hidden && rec.charName) {
        var hit = Array.prototype.filter.call(els.toChar.options, function (o) { return o.textContent === rec.charName; })[0];
        if (hit) els.toChar.value = hit.value; else { els.toChar.value = '__custom'; els.toName.hidden = false; els.toName.value = rec.charName; }
      } else {
        els.toName.value = rec.charName || '';
      }
    }
    updateCount();
    dirty = false;
  }

  function resetEditor() {
    replyTo = null;
    els.replyNote.hidden = true;
    loadEditor(null);
    renderToChar();
  }

  function requireContent() {
    if (!els.cBody.value.trim()) { toast('信纸还是空的，写点什么再寄吧'); els.cBody.focus(); return false; }
    var r = currentRecipient();
    if (!r.charName && !r.charId) { toast('先挑一位收信的角色'); return false; }
    return true;
  }

  /* ══ 侧栏列表 ══════════════════════════════════════════════ */
  function loadSide() {
    return M.list({ direction: 'out' }).then(function (all) {
      var list = all.filter(function (l) { return tab === 'draft' ? l.status === 'draft' : l.status === 'sent'; });
      els.sideTitle.textContent = tab === 'draft' ? '草稿' : '已寄出';
      els.outList.innerHTML = list.length ? list.map(function (l) {
        return '<button class="lt-card' + (l.status === 'draft' ? ' lt-card--draft' : ' lt-card--out') + '" type="button" data-id="' + esc(l.id) + '">' +
          '<div class="lt-card__meta">' + esc(l.charName || '星辰') + '</div>' +
          '<h3>' + esc(l.title || '（无题）') + '</h3>' +
          '<p class="lt-card__sub">' + esc(String(l.body || '').replace(/\s+/g, ' ').slice(0, 42)) + '…</p>' +
          '<div class="lt-card__foot"><span class="lt-card__time">' + dateCn(l.updatedAt || l.at) +
          (l.status === 'draft' ? ' · 草稿' : ' · 已寄出') + '</span></div></button>';
      }).join('') : '<div class="empty">' + (tab === 'draft' ? '没有草稿' : '还没有寄出的信') +
        '<small>' + (tab === 'draft' ? '写完点「存为草稿」，它会落在这里' : '封印寄出的第一封信，会落在') + '</small></div>';
      return list;
    });
  }

  els.tabs.addEventListener('click', function (e) {
    var b = e.target.closest('[data-t]');
    if (!b) return;
    tab = b.getAttribute('data-t');
    els.tabs.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-on', x === b); });
    loadSide();
  });

  els.outList.addEventListener('click', function (e) {
    var card = e.target.closest('.lt-card');
    if (!card) return;
    var id = card.getAttribute('data-id');
    M.get(id).then(function (rec) {
      if (!rec) { toast('这封信不见了'); return loadSide(); }
      if (rec.status === 'draft') { loadEditor(rec); toast('草稿已铺开，可以继续写'); }
      else openReader(rec);
    });
  });

  /* ══ 保存草稿 ══════════════════════════════════════════════ */
  els.cSave.addEventListener('click', function () {
    if (!els.cBody.value.trim() && !els.cTitle.value.trim()) { toast('空信纸就不存了'); return; }
    var d = readEditor();
    var p = editId
      ? M.patch(editId, { title: d.title, body: d.body, letterType: '手写信' }).then(function (rec) {
          if (rec.charId !== d.charId || rec.charName !== d.charName) {
            return M.patch(editId, { charId: d.charId }).then(function () { return M.get(editId); });
          }
          return rec;
        })
      : M.createOutgoing(d);
    p.then(function (rec) {
      editId = rec.id;
      dirty = false;
      toast('草稿已保存 · 刷新页面也不会丢');
      if (tab !== 'draft') { tab = 'draft'; els.tabs.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-on', x.getAttribute('data-t') === 'draft'); }); }
      loadSide();
    }).catch(function (e) { toast('保存失败：' + (e.message || '未知错误')); });
  });

  els.cClear.addEventListener('click', function () {
    if (dirty && !window.confirm('清空当前信纸？未保存的内容会丢失。')) return;
    editId = null;
    els.cTitle.value = ''; els.cBody.value = ''; updateCount(); dirty = false;
  });

  /* ══ 寄出 ══════════════════════════════════════════════════ */
  els.cSend.addEventListener('click', function () {
    if (sending) return;
    if (!requireContent()) return;
    var d = readEditor();
    els.dlgView.innerHTML =
      '<h4>致 ' + esc(d.charName || '星辰') + ' ·《' + esc(d.title || '无题') + '》</h4>' +
      '<p>' + d.body.length + ' 字 · 寄出后进入「已寄出」，不再能修改正文。</p>' +
      '<div class="confirm-view__body">' + esc(d.body.slice(0, 400)) + (d.body.length > 400 ? '……' : '') + '</div>';
    els.dlg.hidden = false;
    document.body.style.overflow = 'hidden';
  });

  els.dlgSend.addEventListener('click', function () {
    if (sending) return;
    sending = true;
    els.dlgSend.disabled = true;
    els.dlgSend.textContent = '封印中…';
    var d = readEditor();
    var ensure = editId
      ? M.patch(editId, { title: d.title, body: d.body }).then(function () { return editId; })
      : M.createOutgoing(d).then(function (rec) { editId = rec.id; return rec.id; });

    ensure.then(function (id) { return M.sendLetter(id); })
      .then(function (rec) {
        sending = false;
        els.dlgSend.disabled = false;
        els.dlgSend.textContent = '封印寄出';
        els.dlg.hidden = true;
        document.body.style.overflow = '';
        dirty = false;
        replyTo = null;
        els.replyNote.hidden = true;
        loadEditor(null);
        tab = 'sent';
        els.tabs.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-on', x.getAttribute('data-t') === 'sent'); });
        loadSide();
        toast('已寄出 ·《' + (rec.title || '无题') + '》落进了已寄信匣', 3200);
      })
      .catch(function (e) {
        sending = false;
        els.dlgSend.disabled = false;
        els.dlgSend.textContent = '封印寄出';
        els.dlg.hidden = true;
        document.body.style.overflow = '';
        /* 失败：正文与标题都还在编辑器里，不丢 */
        toast('寄出失败：' + (e.message || '未知错误') + ' · 内容已保留', 4200);
      });
  });

  /* ══ 已寄出阅读 ════════════════════════════════════════════ */
  var cur = null;
  function openReader(rec) {
    cur = rec;
    els.pKind.textContent = '寄往星际 · 致 ' + (rec.charName || '星辰');
    els.pTitle.textContent = rec.title || '（无题）';
    els.pBody.innerHTML = String(rec.body || '').split(/\n{2,}/).map(function (p) {
      return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>';
    }).join('');
    els.pMeta.textContent = dateCn(rec.at) + ' · 已寄出';
    els.reader.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  els.actCopy.addEventListener('click', function () {
    if (!cur) return;
    var text = '《' + (cur.title || '无题') + '》\n致 ' + (cur.charName || '星辰') + '\n\n' + cur.body +
      '\n\n· DIMENSION ANCHOR 寄往星际的信';
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast('已复制全文'); },
      function () { toast('复制未成功'); });
    else toast('当前环境不支持复制');
  });
  els.actDel.addEventListener('click', function () {
    if (!cur) return;
    if (!window.confirm('删除《' + (cur.title || '这封信') + '》？删除后无法恢复。')) return;
    M.remove(cur.id).then(function () {
      els.reader.hidden = true;
      document.body.style.overflow = '';
      cur = null;
      toast('已删除');
      loadSide();
    }).catch(function (e) { toast(e.message || '删除失败'); });
  });

  /* ══ 全局 ══════════════════════════════════════════════════ */
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) {
      if (!els.dlg.hidden) { els.dlg.hidden = true; document.body.style.overflow = ''; }
      if (!els.reader.hidden) { els.reader.hidden = true; document.body.style.overflow = ''; }
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!els.dlg.hidden) { els.dlg.hidden = true; document.body.style.overflow = ''; }
    else if (!els.reader.hidden) { els.reader.hidden = true; document.body.style.overflow = ''; }
  });
  window.addEventListener('beforeunload', function (e) {
    if (dirty && els.cBody.value.trim()) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ══ 回信语境 ══════════════════════════════════════════════ */
  function setupReply() {
    var q = new URLSearchParams(location.search);
    var rid = q.get('reply');
    var name = q.get('name') || '';
    var charId = q.get('char') || '';
    if (!rid) return Promise.resolve();
    replyTo = rid;
    els.replyWho.textContent = name || '星辰';
    els.replyNote.hidden = false;
    renderToChar(name || null);
    if (charId && !els.toChar.hidden) els.toChar.value = charId;
    return M.get(rid).then(function (src) {
      if (src) {
        els.cTitle.value = src.title ? '回信 · ' + src.title : '回信';
        els.cBody.value = '读完你寄来的《' + (src.title || '那封信') + '》，我想对你说：\n\n';
        updateCount();
      }
    }).catch(function () {});
  }
  els.replyCancel.addEventListener('click', function () {
    if (!window.confirm('放弃回信语境，写一封新信？')) return;
    els.cTitle.value = ''; els.cBody.value = ''; updateCount(); editId = null; replyTo = null;
    els.replyNote.hidden = true;
    renderToChar();
  });

  /* ══ 启动 ══════════════════════════════════════════════════ */
  if (S) S.migrate();
  M.init().then(function () {
    els.modeText.textContent = M.modeLabel();
    els.modeChip.hidden = false;
    if (M.state.mode === 'local') els.modeChip.classList.add('is-local');
    renderToChar();
    updateCount();
    return setupReply().then(loadSide);
  }).catch(function (e) {
    els.outList.innerHTML = '<div class="empty">信件档案暂时读不到<small>' + esc(e.message || '') + '</small></div>';
  });

  /* 登录 / 退出后只换数据源，不刷新页面 */
  document.addEventListener('da:authchange', function () {
    els.modeText.textContent = M.modeLabel();
    loadSide().catch(function () {});
  });
})();
