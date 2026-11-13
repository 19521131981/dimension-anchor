/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 解读结果页（第二阶段）
   ----------------------------------------------------------------------
   数据链：DA_STORE 读上一次真实完成的牌阵 → DA_READING 本地规则引擎先出
   一份可读的六章 → DA_AI 探测到同源后端时，把同一组牌面交给 DeepSeek
   重写六章，成功后整体替换文本，牌面数据一个字都不动。

   所有章节引用同一组 session.cards，不存在「第二章的牌和第四章不一样」。
   ══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var D   = window.DA_TAROT;
  var ART = window.DA_ART;
  var RD  = window.DA_READING;
  var S   = window.DA_SOUND;
  var E   = window.DA_ENGINE;
  var ST  = window.DA_STORE;
  var AI  = window.DA_AI;

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function txt(s) {
    /* 渲染前的最后一道闸：任何来源（规则引擎 / AI 通道 / 旧记录）里
       漏出的 undefined / null 字面量都不允许出现在页面上。 */
    var raw = (s === undefined || s === null) ? '' : String(s);
    raw = raw.replace(/\bundefined\b/g, '').replace(/\bnull\b/g, '');
    return esc(raw).replace(/&lt;br&gt;/gi, '<br>');
  }
  function clone(o) { return JSON.parse(JSON.stringify(o || null)); }
  function attr(s) { return String(s == null ? '' : s).replace(/["\\]/g, '\\$&'); }

  var faceCache = {};
  function face(card) {
    if (!card) return '';
    if (faceCache[card.i] == null) faceCache[card.i] = ART.face(card);
    return faceCache[card.i];
  }

  var ICON = { overview: '✦', cards: '❖', links: '⁂', relation: '♡', deep: '☾', voice: '✧' };

  var state = {
    session: null,
    link: null,
    result: null,
    record: null,
    tab: 'overview',
    openRow: null,
    supp: [],
    suppLocked: false,
    source: 'local',
    model: '',
    thread: [],
    busy: false,
    /* 深度探索：只以云数据库返回的状态为准，不在本地存储付费标记 */
    premium: { tier: 'free', active: false, valid_until: null },
    askChapter: '',
    feedback: ''
  };

  /* ══ 数据准备 ══════════════════════════════════════════════ */
  function placed() {
    return ((state.session && state.session.cards) || []).filter(function (c) { return c.placed; });
  }
  function cardOf(entry) { return D.byId(entry && entry.id); }

  function ctxOf() {
    return {
      session: state.session,
      link: state.link || {},
      profileId: (state.link && state.link.profileId) || '',
      supp: state.supp.map(function (s) {
        return { slot: s.slot, name: s.cn, orient: s.reversed ? '逆位' : '正位', question: s.question || '' };
      }),
      history: state.thread.filter(function (t) { return t.role === 'user'; }).map(function (t, i) {
        var a = state.thread.filter(function (x) { return x.role === 'bot'; })[i];
        return { q: t.text, a: a ? a.text : '' };
      })
    };
  }

  /* ══ 深度探索（Premium）════════════════════════════════════
     付费状态只来自云数据库；这里只做界面与上下文组装，不做权限判断。
     ═══════════════════════════════════════════════════════ */
  function chapterText(ch) {
    return ((ch && ch.lead) ? ch.lead + '\n' : '') + ((ch && ch.blocks) || []).map(function (b) {
      if (b.t === 'ul') return (b.items || []).join('；');
      if (b.t === 'kv' || b.t === 'chips') {
        return (b.items || []).map(function (i) {
          return (i.k ? i.k + '：' : '') + (i.v || i.x || '');
        }).join('；');
      }
      if (b.t === 'li2') return b.k + '：' + b.v;
      if (b.t === 'rule') return '';
      return String(b.x || '').replace(/<br\s*\/?>/gi, '；');
    }).filter(Boolean).join('\n').slice(0, 1400);
  }

  /* 完整上下文：原始问题 + 全部牌面/正逆位/牌位 + 人物档案 + 六章 + 历史 */
  function fullContext(chapterKey, question, feedback) {
    var ses = state.session || {};
    var L = state.link || {};
    var chs = (state.result && state.result.chapters) || [];
    var pid = L.profileId || '';
    var profile = '';
    try { if (window.DA_ARCHIVE) profile = window.DA_ARCHIVE.summary(pid) || ''; } catch (e) {}
    if (!profile && L.subjectName) {
      profile = '对象：' + L.subjectName + (L.persona ? '；人物设定：' + L.persona : '');
    }

    var cards = placed().map(function (e) {
      var c = cardOf(e) || {};
      var kw = (e.reversed ? (c.kr || []) : (c.ku || [])).join('、');
      return {
        slot: e.slot, positionCn: e.positionCn, cn: e.cn,
        en: e.en || c.en || '', orientation: e.reversed ? '逆位' : '正位',
        keywords: kw
      };
    });

    return {
      readingId: String((state.record && state.record.id) || ses.id || ''),
      question: L.question || L.wish || ses.question || '',
      spreadCn: ses.spreadCn || '',
      relation: L.relation || '',
      background: L.background || '',
      profile: profile,
      cards: cards,
      supp: state.supp.map(function (s) {
        return { cn: s.cn, orientation: s.reversed ? '逆位' : '正位' };
      }),
      chapters: chs.map(function (ch, i) {
        return { no: '第 ' + (i + 1) + ' 章', title: ch.title, text: chapterText(ch) };
      }),
      history: ctxOf().history,
      chapterKey: chapterKey || '',
      chapterTitle: chapterKey ? ((chapterOf(chapterKey) || {}).title || '') : '',
      feedback: feedback || '',
      ask: question
    };
  }

  function exploreHTML(key, label) {
    return '<div class="pm-explore-wrap">' +
      '<button class="pm-explore" type="button" data-pm-explore="' + attr(key) + '">' +
      '<i>✧</i>' + esc(label || '继续探索这一章') + '</button>' +
      '<span class="pm-explore__note">带着本次牌阵、正逆位与六章解读继续问</span></div>';
  }

  function fmtDate(v) {
    if (!v) return '—';
    var d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }

  function paintPremium() {
    var on = state.premium.active === true;
    var badge = $('pmBadge');
    if (badge) {
      badge.classList.toggle('is-free', !on);
      badge.innerHTML = on ? '<i>✦</i> Premium' : '<i>✦</i> Free';
      badge.title = on ? ('深度探索有效至 ' + fmtDate(state.premium.valid_until)) : '点击解锁深度探索';
    }
    if ($('pmLockBar')) $('pmLockBar').classList.toggle('is-on', !on);
    var head = document.querySelector('.ask__src');
    if (head) {
      head.textContent = on
        ? '已解锁 · 每次都带上完整牌阵'
        : '基础解读已开放 · 追问需解锁';
    }
  }

  function refreshPremium() {
    var P = window.DA_PREMIUM;
    if (!P) { paintPremium(); return; }
    return P.status().then(function (s) {
      state.premium = {
        tier: (s && s.tier) || 'free',
        active: !!(s && s.active),
        valid_until: (s && s.valid_until) || null
      };
      paintPremium();
    }).catch(function () {
      state.premium = { tier: 'free', active: false, valid_until: null };
      paintPremium();
    });
  }

  function openGate() {
    var g = $('pmGate');
    if (!g) return;
    g.hidden = false;
    var st = $('pmState');
    st.textContent = '';
    st.className = 'pm-gate__state';
    setTimeout(function () { $('pmCode').focus(); }, 60);
  }
  function closeGate() { if ($('pmGate')) $('pmGate').hidden = true; }

  function doRedeem() {
    var P = window.DA_PREMIUM;
    var st = $('pmState'), btn = $('pmRedeem');
    if (!P || !st || !btn) return;
    st.className = 'pm-gate__state is-busy';
    st.textContent = '正在向服务端验证占卜码…';
    btn.disabled = true;
    P.redeem($('pmCode').value).then(function (r) {
      if (r && r.ok) {
        st.className = 'pm-gate__state is-ok';
        st.textContent = '解锁成功 · 深度探索有效至 ' + fmtDate(r.valid_until);
        S.flip();
        refreshPremium();
        setTimeout(closeGate, 1900);
      } else {
        st.className = 'pm-gate__state is-err';
        st.textContent = P.message({ code: (r && r.reason) || 'INVALID' });
      }
    }).catch(function (e) {
      st.className = 'pm-gate__state is-err';
      st.textContent = P.message(e);
    }).then(function () { btn.disabled = false; });
  }

  /* ══ 牌阵网格 ══════════════════════════════════════════════ */
  function colsFor(n) {
    if (n <= 1) return 1;
    if (n <= 5) return n;
    if (n <= 8) return 4;
    return 5;
  }

  function renderGrid() {
    var grid = $('cardGrid');
    var cards = placed();
    grid.style.setProperty('--cols', colsFor(cards.length));
    grid.innerHTML = '';

    cards.forEach(function (entry) {
      var c = cardOf(entry);
      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell' + (entry.reversed ? ' is-rev' : '') + (entry.supp ? ' is-supp' : '');
      cell.title = '第 ' + entry.slot + ' 位 · ' + entry.positionCn + '：' + entry.cn +
        ' · ' + (entry.reversed ? '逆位' : '正位') + '　点击定位到单牌解析';
      cell.innerHTML = '<span class="cell__art">' + (c ? face(c) : '') + '</span>' +
        (entry.reversed ? '<span class="cell__rev">逆</span>' : '') +
        '<span class="cell__look" role="button" tabindex="0" title="查看高清牌面与完整牌意">⤢</span>';

      cell.addEventListener('click', function (e) {
        if (e.target && e.target.classList && e.target.classList.contains('cell__look')) return;
        locateCard(entry);
      });

      var look = cell.querySelector('.cell__look');
      var open = function (e) {
        e.stopPropagation();
        openCard(entry);
      };
      look.addEventListener('click', open);
      look.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); }
      });

      grid.appendChild(cell);
      if (window.DA_CARD) DA_CARD.decorate(cell, { dense: true, live: true });
    });
  }

  function renderStats() {
    var cs = placed();
    var up = 0;
    cs.forEach(function (c) { if (!c.reversed) up++; });
    var rev = cs.length - up;
    var majors = 0;
    cs.forEach(function (c) { if ((c.suit || '') === 'major') majors++; });

    $('stats').innerHTML =
      '<span class="stat">牌组：<b>' + (state.session.deckMode === 22 ? '22 张大阿尔卡那' : '完整 78 张牌组') + '</b></span>' +
      '<span class="stat">牌阵：<b>' + esc(state.session.spreadCn) + '</b></span>' +
      '<span class="stat">正位：<em>' + up + '</em> 张　逆位：<i>' + rev + '</i> 张</span>' +
      (majors ? '<span class="stat">大牌：<b>' + majors + '</b> 张</span>' : '');
  }

  /* ══ 章节渲染 ══════════════════════════════════════════════ */
  function blockHTML(b) {
    switch (b.t) {
      case 'p':      return '<p>' + txt(b.x) + '</p>';
      case 'note':   return '<p class="note">' + txt(b.x) + '</p>';
      case 'h':      return '<div class="h"' + (b.card != null ? ' data-card="' + attr(b.card) + '"' : '') + '>' + txt(b.x) + '</div>';
      case 'ul':     return '<ul>' + (b.items || []).map(function (i) { return '<li>' + txt(i) + '</li>'; }).join('') + '</ul>';
      case 'li2':    return '<div class="li2"><b>' + txt(b.k) + '</b><span>' + txt(b.v) + '</span></div>';
      case 'kv':     return '<div class="kv">' + (b.items || []).map(function (i) {
                        return '<div><em>' + txt(i.k) + '</em><span>' + txt(i.v) + '</span></div>';
                      }).join('') + '</div>';
      case 'quote':  return '<div class="quote">' + txt(b.x) + '</div>';
      case 'quote6': return '<div class="quote6">' + txt(b.x) + '</div>';
      case 'chips':  return '<div class="chips">' + (b.items || []).map(function (i) {
                        var cls = i.tone === 'plain' ? 'plain' : (i.tone === 'rev' ? 'rev' : (i.tone === 'up' ? 'up' : ''));
                        return '<span' + (cls ? ' class="' + cls + '"' : '') + '>' + txt(i.x) + '</span>';
                      }).join('') + '</div>';
      case 'rule':   return '<div class="rule"></div>';
      default:       return '';
    }
  }

  /* 单牌解析按牌分组，点左侧牌才能精确高亮 */
  function blocksHTML(blocks, group) {
    var out = [], openCard = null;
    function close() { if (openCard != null) { out.push('</div>'); openCard = null; } }

    (blocks || []).forEach(function (b) {
      if (group && b.card != null) {
        if (openCard !== String(b.card)) {
          close();
          out.push('<div class="csec" data-card="' + attr(b.card) + '">');
          openCard = String(b.card);
        }
      } else if (openCard != null) {
        close();
      }
      out.push(blockHTML(b));
    });
    close();
    return out.join('');
  }

  function chapterOf(key) {
    var list = (state.result && state.result.chapters) || [];
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return list[0];
  }

  function chapterNo(ch) {
    var list = (state.result && state.result.chapters) || [];
    var i = list.indexOf(ch);
    return '第 ' + String(i + 1).padStart(2, '0') + ' 章 ·';
  }

  function renderTabs() {
    var box = $('tabs');
    box.innerHTML = '';
    state.result.chapters.forEach(function (ch) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab' + (ch.key === state.tab ? ' is-on' : '');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', ch.key === state.tab ? 'true' : 'false');
      b.dataset.k = ch.key;
      b.textContent = ch.title;
      b.addEventListener('click', function () {
        if (state.tab === ch.key) return;
        state.tab = ch.key;
        state.openRow = null;
        S.hover();
        renderTabs();
        renderHero();
        renderRows();
        renderTail();
        $('rbody').scrollTop = 0;
      });
      box.appendChild(b);
    });
  }

  function renderHero() {
    var ch = chapterOf(state.tab);
    var hero = $('hero');
    hero.innerHTML =
      '<div class="hero__head">' +
        '<span class="hero__rule"></span>' +
        '<h2 class="hero__t"><i>' + chapterNo(ch) + ' </i>' + esc(ch.title) + '</h2>' +
        '<span class="hero__rule hero__rule--r"></span>' +
      '</div>' +
      (ch.lead ? '<p class="hero__lead">' + txt(ch.lead) + '</p>' : '') +
      blocksHTML(ch.blocks, ch.key === 'cards') +
      exploreHTML(ch.key, ch.key === 'voice' ? '继续和 TA 聊下去' : '继续探索这一章');

    hero.style.animation = 'none';
    void hero.offsetHeight;
    hero.style.animation = '';
  }

  function renderRows() {
    var rows = $('rows');
    rows.innerHTML = '';
    state.result.chapters.forEach(function (ch) {
      if (ch.key === state.tab) return;
      var open = state.openRow === ch.key;

      var g = document.createElement('div');
      g.className = 'rgroup' + (open ? ' is-open' : '');

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'row';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.innerHTML =
        '<span class="row__ic">' + (ICON[ch.key] || '✦') + '</span>' +
        '<span class="row__t">' + chapterNo(ch) + ' ' + esc(ch.title) + '</span>' +
        '<span class="row__ch" aria-hidden="true">⌄</span>';

      var body = document.createElement('div');
      body.className = 'rowbody';
      body.innerHTML = '<div class="rowbody__in"><div class="rowbody__pad hero">' +
        blocksHTML(ch.blocks, ch.key === 'cards') +
        exploreHTML(ch.key, ch.key === 'voice' ? '继续和 TA 聊下去' : '继续探索这一章') +
        '</div></div>';

      btn.addEventListener('click', function () {
        state.openRow = open ? null : ch.key;
        S.hover();
        renderRows();
        if (!open) {
          var rb = $('rbody');
          var g2 = rb.querySelector('.rgroup.is-open');
          if (g2 && rb.scrollHeight > rb.clientHeight) {
            var gr = g2.getBoundingClientRect(), rr = rb.getBoundingClientRect();
            if (gr.bottom > rr.bottom - 12) rb.scrollTop += (gr.top - rr.top - 10);
          }
        }
      });

      g.appendChild(btn);
      g.appendChild(body);
      rows.appendChild(g);
    });
  }

  function renderTail() {
    var tail = $('tail');
    var v = chapterOf('voice');
    if (!v || state.tab === 'voice') {
      tail.hidden = true;
      tail.innerHTML = '';
      return;
    }
    var q = null;
    (v.blocks || []).forEach(function (b) {
      if (!q && b.t === 'quote6') q = b;
      if (!q && b.t === 'quote') q = b;
    });
    if (!q) (v.blocks || []).forEach(function (b) { if (!q && b.t === 'p') q = b; });

    tail.hidden = false;
    tail.innerHTML = '<div class="tail__cap">TA 想对你说</div><p>' + txt(q ? q.x : '') + '</p>' +
      exploreHTML('voice', '继续和 TA 聊下去');
  }

  function renderHead() {
    var L = state.link || {};
    var bits = [state.session.spreadCn];
    bits.push(state.session.deckMode === 22 ? '大阿尔卡那' : '完整 78 张');
    if (L.subjectName) bits.push('对象 · ' + L.subjectName);
    if (L.relation) bits.push(L.relation);
    $('lpSub').textContent = bits.join(' · ');
  }

  /* ══ 牌 → 单牌解析 联动 ═══════════════════════════════════ */
  function locateCard(entry) {
    S.hover();
    if (state.tab !== 'cards') {
      state.tab = 'cards';
      state.openRow = null;
      renderTabs();
      renderHero();
      renderRows();
      renderTail();
    }
    requestAnimationFrame(function () {
      var sec = document.querySelector('#hero .csec[data-card="' + attr(entry.id) + '"]');
      if (!sec) return;
      sec.scrollIntoView({ block: 'center', behavior: 'smooth' });
      sec.classList.add('is-hit');
      setTimeout(function () { sec.classList.remove('is-hit'); }, 2200);
    });
  }

  /* ══ 牌面详情 ══════════════════════════════════════════════ */
  function openCard(entry) {
    var c = cardOf(entry);
    if (!c) return;

    $('modal').querySelector('.modal__box').classList.remove('is-text');
    $('mArt').style.display = '';
    $('mArt').innerHTML = face(c);
    var svg = $('mArt').querySelector('svg');
    if (svg && entry.reversed) svg.style.transform = 'rotate(180deg)';

    var kw = entry.reversed ? (c.kr || []) : (c.ku || []);
    $('mBody').innerHTML =
      '<h3 class="m-title" id="mTitle">' + esc(c.cn) + '</h3>' +
      '<p class="m-sub">' + esc(c.en) + ' · ' + esc(c.pip || c.r) + ' · ' +
        (entry.reversed ? '逆位' : '正位') + '</p>' +
      '<div class="m-chips">' + kw.map(function (k) { return '<span>' + esc(k) + '</span>'; }).join('') + '</div>' +
      '<div class="m-pos"><b>第 ' + esc(entry.slot) + ' 位 · ' + esc(entry.positionCn) + '</b>' +
        (entry.positionDesc ? '<br>' + esc(entry.positionDesc) : '') + '</div>' +
      '<div class="m-sec"><h4>' + (entry.reversed ? '逆位读到的是' : '正位读到的是') + '</h4>' +
        '<p>' + txt(entry.reversed ? (c.rev || '') : (c.up || '')) + '</p></div>' +
      (c.love ? '<div class="m-sec"><h4>爱情与关系</h4><p>' + txt(c.love) + '</p></div>' : '') +
      (c.kin  ? '<div class="m-sec"><h4>友情与亲情</h4><p>' + txt(c.kin) + '</p></div>' : '') +
      (c.mood ? '<div class="m-sec"><h4>情绪与内在</h4><p>' + txt(c.mood) + '</p></div>' : '') +
      (c.act  ? '<div class="m-sec"><h4>现实建议</h4><p>' + txt(c.act) + '</p></div>' : '') +
      (c.sym  ? '<div class="m-sec"><h4>牌面象征</h4><p>' + txt(c.sym) + '</p></div>' : '') +
      '<div class="m-sec"><button class="m-loc" id="mLoc" type="button">在解读里定位这张牌 →</button></div>';

    $('modal').hidden = false;
    S.flip();

    var loc = $('mLoc');
    if (loc) loc.addEventListener('click', function () {
      closeCard();
      locateCard(entry);
    });
  }

  function closeCard() { $('modal').hidden = true; }

  /* ══ 来源说明 ══════════════════════════════════════════════ */
  function showSource() {
    var rows = AI.disclosure({ session: state.session, link: state.link, profileId: state.link.profileId });
    var ok = AI.available();

    var box = $('modal').querySelector('.modal__box');
    box.classList.add('is-text');
    $('mArt').style.display = 'none';
    $('mArt').innerHTML = '';

    $('mBody').innerHTML =
      '<h3 class="m-title" id="mTitle">这份解读是怎么来的</h3>' +
      '<p class="m-sub">' +
        (state.source === 'ai'
          ? '六章文本由 DeepSeek 生成，牌面数据由本地提供'
          : '六章文本由站内本地规则引擎生成，没有调用大模型') +
      '</p>' +
      '<div class="m-pos"><b>当前通道：' + (ok ? 'DeepSeek' + (state.model ? ' · ' + state.model : '') : '本地推演') + '</b>' +
        (ok ? '' : '<br>原因：' + esc(AI.state.lastError || '未接入后端')) + '</div>' +
      '<div class="m-sec"><h4>会发送给外部 AI 的内容（仅这些）</h4>' +
        '<div class="m-src">' + rows.map(function (r) {
          return '<div class="m-src__row"><em>' + esc(r.k) + '</em><span>' + esc(r.v) + '</span></div>';
        }).join('') + '</div></div>' +
      '<div class="m-sec"><h4>不会发送的内容</h4><p>你的浏览行为、其他档案、其他梦占记录、浏览器信息，都不会随请求发出。API Key 只存在服务端进程的环境变量里，前端代码里没有任何一处包含它。</p></div>' +
      '<div class="m-sec"><h4>数据管理</h4><p>所有记录都存在你这台设备的浏览器里。你可以到「我的观测档案」里修改标题、添加备注、删除单条记录、导出文本，或者一次性清空全部本地数据。</p></div>';

    $('modal').hidden = false;
  }

  /* ══ 备注 ══════════════════════════════════════════════════ */
  function renderNote() {
    var bar = $('noteBar');
    var body = (state.record && state.record.note) || '';

    bar.className = 'notebar';
    bar.innerHTML =
      '<button class="notebar__btn' + (body ? ' is-on' : '') + '" id="noteBtn" type="button">✎ ' +
        (body ? '私人备注' : '添加备注') + '</button>' +
      (body ? '<span class="notebar__txt">' + esc(body) + '</span>' : '') +
      '<div class="notebar__box"><textarea id="noteTa" placeholder="此刻的感受、对牌阵的理解、之后发生的事……这条只存在你自己的设备上。">' +
        esc(body) + '</textarea>' +
        '<div class="notebar__acts"><button type="button" id="noteCancel">取消</button>' +
        '<button type="button" class="is-primary" id="noteSave">保存备注</button></div></div>';

    var btn = $('noteBtn');
    var ta = $('noteTa');

    btn.addEventListener('click', function () {
      bar.classList.add('is-edit');
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
      S.page();
    });
    $('noteCancel').addEventListener('click', function () {
      bar.classList.remove('is-edit');
      ta.value = body;
    });
    $('noteSave').addEventListener('click', function () {
      var v = ta.value.trim();
      saveNote(v);
      S.complete();
    });
  }

  function saveNote(v) {
    if (!state.record) return;
    state.record = ST.readings.patch(state.record.id, { note: v }) || state.record;
    state.record.note = v;

    var exist = ST.notes.forReading(state.record.id)[0];
    if (exist) ST.notes.patch(exist.id, { body: v });
    else if (v) ST.notes.add({ readingId: state.record.id, title: state.record.title, body: v });

    renderNote();
    toast(v ? '备注已保存到本地档案。' : '备注已清空。');
  }

  /* ══ 收藏 / 复制 ═══════════════════════════════════════════ */
  function favRef() {
    return { type: 'reading', refId: state.record ? state.record.id : state.session.id };
  }

  function syncFavBtn() {
    var on = ST.favs.has(favRef().refId, 'reading');
    $('favBtn').classList.toggle('is-on', on);
    $('favTxt').textContent = on ? '已收藏' : '收藏本次解读';
  }

  function toggleFav() {
    var r = ST.favs.toggle({
      type: 'reading',
      refId: favRef().refId,
      title: (state.record && state.record.title) || state.session.spreadCn,
      text: RD.toText(state.result, state.session, state.link),
      meta: {
        dateCn: ST.dateCn(state.record && state.record.at),
        spreadCn: state.session.spreadCn,
        subject: (state.link && state.link.subjectName) || '',
        cards: placed().length
      }
    });
    syncFavBtn();
    toast(r.on ? '已收藏。整条梦占记录连同六章解读一起存档。' : '已从收藏夹移除。');
    S.complete();
  }

  function copyAll() {
    var text = RD.toText(state.result, state.session, state.link);
    var done = function () { toast('六章解读已复制到剪贴板。'); };
    var fail = function () { toast('浏览器拒绝了剪贴板访问，请手动选择文字复制。'); };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () {
        legacyCopy(text) ? done() : fail();
      });
    } else {
      legacyCopy(text) ? done() : fail();
    }
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  /* ══ 继续追问 ══════════════════════════════════════════════ */
  function openAsk(chapterKey, preset) {
    if (chapterKey && typeof chapterKey !== 'string') chapterKey = '';
    state.askChapter = chapterKey || '';
    $('ask').hidden = false;
    if (preset) $('askInput').value = preset;
    $('askInput').focus();
    S.page();
    if (!state.premium.active) {
      var hint = threadEl().querySelector('.ask__hint');
      if (hint) hint.textContent = '六章基础解读已经完整开放。想把这一问继续问下去，需要先输入占卜码解锁深度探索。';
      if ($('pmLockBar')) $('pmLockBar').classList.add('is-on');
    }
  }
  function closeAsk() { $('ask').hidden = true; }
  function threadEl() { return $('thread'); }

  function pushMe(q) {
    var d = document.createElement('div');
    d.className = 'th th--me';
    d.innerHTML = '<span class="th__who">你</span><div class="th__b">' + esc(q) + '</div>';
    threadEl().appendChild(d);
    threadEl().scrollTop = threadEl().scrollHeight;
  }

  function pushBot(text, who, withFeedback) {
    var d = document.createElement('div');
    d.className = 'th th--bot';
    d.innerHTML = '<span class="th__who">' + esc(who || '观测站') + '</span><div class="th__b">' +
      String(text || '').split(/\n{2,}/).map(function (p) {
        return '<p>' + txt(p.trim()) + '</p>';
      }).join('') + '</div>';
    threadEl().appendChild(d);
    if (withFeedback) attachFeedback();
    threadEl().scrollTop = threadEl().scrollHeight;
  }

  /* 反馈校准：用户补充的信息优先于原结论 */
  function attachFeedback() {
    var d = document.createElement('div');
    d.className = 'pm-fb';
    d.innerHTML = '<span class="pm-fb__cap">这段分析准吗？</span>' +
      '<button type="button" data-fb="符合">符合</button>' +
      '<button type="button" data-fb="部分符合">部分符合</button>' +
      '<button type="button" data-fb="不符合">不符合</button>';
    d.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-fb]') : null;
      if (!b) return;
      var v = b.getAttribute('data-fb');
      d.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-on', x === b); });
      if (v === '符合') {
        state.feedback = '';
        toast('记下了。想继续，直接问下一个问题就好。');
        return;
      }
      state.feedback = v;
      $('askInput').placeholder = '补充一下真实情况，我会据此重新分析…';
      $('askInput').focus();
      toast('已标记为「' + v + '」，写下补充后发送即可重新校准。');
    });
    threadEl().appendChild(d);
    threadEl().scrollTop = threadEl().scrollHeight;
  }

  function pushSupp(entry) {
    var c = cardOf(entry);
    var d = document.createElement('div');
    d.className = 'th__supp';
    d.innerHTML = '<i>' + face(c) + '</i><b>' + esc(entry.cn) + ' · ' +
      (entry.reversed ? '逆位' : '正位') +
      '<span>星轨延伸 · 已落到牌阵第 ' + esc(entry.slot) + ' 位</span></b>';
    threadEl().appendChild(d);
    threadEl().scrollTop = threadEl().scrollHeight;
  }

  function send() {
    var input = $('askInput');
    var q = String(input.value || '').trim();
    if (!q || state.busy) { input.focus(); return; }

    var hint = threadEl().querySelector('.ask__hint');
    if (hint) hint.remove();

    pushMe(q);
    input.value = '';
    input.placeholder = '例如：那我现在该先做什么？';
    state.thread.push({ role: 'user', text: q, at: Date.now() });
    persistThread();

    var chapterKey = state.askChapter || '';
    var feedback = state.feedback || '';
    state.feedback = '';

    state.busy = true;
    $('sendBtn').disabled = true;

    /* Free 身份：不发起任何追问调用，直接引导解锁 */
    if (!window.DA_PREMIUM || !state.premium.active) {
      pushBot('这一问属于深度探索。解锁之后，我会带着这次的完整牌阵、六章解读和刚才的对话，继续陪你往下看。', '观测站');
      openGate();
      finish();
      return;
    }

    window.DA_PREMIUM.ask(fullContext(chapterKey, q, feedback)).then(function (j) {
      pushBot(j.text, '观测站 · 深度探索', true);
      state.thread.push({ role: 'bot', text: j.text, at: Date.now() });
      state.source = 'ai';
      S.flip();
    }).catch(function (e) {
      if (e && e.code === 'PREMIUM_REQUIRED') {
        refreshPremium();
        pushBot('权益已经失效，请重新输入一张有效的占卜码。', '观测站');
        openGate();
      } else {
        toast(window.DA_PREMIUM.message(e));
        localAnswer(q);   /* 网络异常时才回落到本地推演，不冒充 AI 追问 */
      }
    }).then(finish);

    function finish() {
      state.busy = false;
      $('sendBtn').disabled = false;
      state.suppLocked = false;
      $('suppBtn').disabled = false;
      $('suppInfo').textContent = '每问一次只能抽一张，补充牌会真实落进牌阵。';
      persistThread();
    }
  }

  function localAnswer(q) {
    var lastSupp = state.supp.length ? state.supp[state.supp.length - 1] : null;
    var blocks = RD.answer(q, { cards: placed(), core: state.result.core, supp: lastSupp });
    var text = (blocks || []).map(function (b) { return b.x || ''; }).filter(Boolean).join('\n\n');
    pushBot(text, '观测站 · 本地推演');
    state.thread.push({ role: 'bot', text: text, at: Date.now() });
    S.flip();
  }

  /* 补充牌：一张，真实落进牌阵，不替换原牌 */
  function drawSupp() {
    if (state.suppLocked) return;

    var used = {};
    placed().forEach(function (c) { used[c.id] = 1; });

    var pool = (state.session.deckMode === 22 ? D.major : D.all).filter(function (c) { return !used[c.i]; });
    if (!pool.length) { toast('牌库里的牌已经抽完了。'); return; }

    var card = pool[E.randInt(pool.length)];
    var reversed = E.orientation() === 'rev';
    var lastSlot = 0;
    placed().forEach(function (c) { if (c.slot > lastSlot) lastSlot = c.slot; });

    var input = $('askInput');
    var q = String(input.value || '').trim() ||
      (state.thread.length ? state.thread[state.thread.length - 1].text : '');

    var entry = {
      order: lastSlot + 1,
      slot: lastSlot + 1,
      positionCn: '星轨延伸',
      positionEn: 'Clarifier',
      positionDesc: q ? '为了这次追问补抽的一张牌：' + q : '为了这次追问补抽的一张牌',
      id: card.i,
      cn: card.cn,
      en: card.en,
      suit: card.s,
      roman: card.pip,
      reversed: reversed,
      placed: true,
      revealed: true,
      revealOrder: 0,
      revealedAt: Date.now(),
      supp: true,
      question: q
    };

    state.session.cards.push(entry);
    state.supp.push(entry);

    var hint = threadEl().querySelector('.ask__hint');
    if (hint) hint.remove();

    pushSupp(entry);
    renderGrid();
    renderStats();
    persistSession();

    state.suppLocked = true;
    $('suppBtn').disabled = true;
    $('suppInfo').textContent = '这张已经落进牌阵。想再抽，先问下一个问题。';
    S.draw();

    if (state.record) {
      var supp = (state.record.supp || []).concat([{
        slot: entry.slot, id: entry.id, cn: entry.cn, reversed: entry.reversed, question: q, at: Date.now()
      }]);
      state.record = ST.readings.patch(state.record.id, {
        supp: supp,
        cards: ST.readings.fromSession(state.session, state.link, state.result).cards
      }) || state.record;
    }
  }

  function persistSession() {
    try {
      var rec = clone(state.session);
      rec.link = state.link;
      localStorage.setItem('DA_LAST_READING', JSON.stringify(rec));
    } catch (e) {}
  }

  function persistThread() {
    if (!state.record) return;
    state.record = ST.readings.patch(state.record.id, { thread: state.thread }) || state.record;
  }

  /* ══ 来源标签 ══════════════════════════════════════════════ */
  function setSrc(label, busy) {
    var b = $('srcBtn');
    b.innerHTML = '<span class="src__dot" aria-hidden="true"></span>' + esc(label);
    b.classList.toggle('is-busy', !!busy);
  }

  /* ══ AI 升级 ═══════════════════════════════════════════════ */
  function attachCards(ch) {
    if (!ch || ch.key !== 'cards') return;
    var cards = placed(), k = 0;
    (ch.blocks || []).forEach(function (b) {
      if (b.t !== 'h') return;
      var e = cards[k];
      if (e) { b.card = e.id; b.slot = e.slot; k++; }
    });
  }

  function mergeAI(list) {
    var map = {};
    (list || []).forEach(function (c) { map[c.key] = c; });
    var used = 0;
    state.result.chapters.forEach(function (ch) {
      var a = map[ch.key];
      if (!a || !a.blocks || !a.blocks.length) return;
      ch.blocks = a.blocks;
      if (a.lead) ch.lead = a.lead;
      attachCards(ch);
      used++;
    });
    return used;
  }

  function upgrade() {
    if (state.busy || state.source === 'ai') return;
    state.busy = true;
    setSrc('DeepSeek 正在解读', true);

    AI.interpret(ctxOf()).then(function (j) {
      var n = mergeAI(j.chapters);
      if (!n) throw new Error('没有可用章节');
      state.source = 'ai';
      state.model = j.model || AI.state.model;
      setSrc('DeepSeek 生成');

      if (state.record) {
        state.record = ST.readings.patch(state.record.id, {
          chapters: clone(state.result.chapters),
          source: 'ai',
          version: 'ai-' + (j.model || 'deepseek')
        }) || state.record;
      }

      renderTabs();
      renderHero();
      renderRows();
      renderTail();
      toast('六章已由 DeepSeek 重写。牌面、正逆位、牌位仍取自这一次真实抽出的牌。');
      S.complete();
    }).catch(function (e) {
      setSrc('本地推演');
      AI.state.source = 'local';
      if (e && e.message) AI.state.lastError = e.message;
    }).then(function () {
      state.busy = false;
    });
  }

  /* ══ toast ═════════════════════════════════════════════════ */
  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 3600);
  }

  /* ══ 启动 ══════════════════════════════════════════════════ */
  function boot() {
    ST.migrate();

    var rec = ST.lastReading();
    if (!rec || !rec.cards || !rec.cards.length) { showEmpty(); bindGlobal(); return; }

    var link = rec.link || ST.session.get() || {};
    var result = RD.build(rec, link);
    if (!result) { showEmpty(); bindGlobal(); return; }

    /* 补齐牌 → 章节的锚点，本地引擎与 AI 走同一套 */
    result.chapters.forEach(attachCards);

    state.session = rec;
    state.link = link;
    state.result = result;
    state.tab = 'overview';
    state.source = rec.source === 'ai' ? 'ai' : 'local';
    state.thread = (rec.thread || []).slice();
    state.supp = (rec.cards || []).filter(function (c) { return c.placed && c.supp; });

    state.record = ST.readings.save(
      ST.readings.fromSession(rec, link, result, {
        source: state.source,
        supp: state.supp.map(function (s) {
          return { slot: s.slot, id: s.id, cn: s.cn, reversed: s.reversed, question: s.question || '' };
        }),
        thread: state.thread
      })
    );

    $('empty').hidden = true;
    $('split').hidden = false;

    renderHead();
    renderGrid();
    renderStats();
    renderNote();
    renderTabs();
    renderHero();
    renderRows();
    renderTail();
    syncFavBtn();

    /* 回填历史追问 */
    if (state.thread.length) {
      var hint = $('thread').querySelector('.ask__hint');
      if (hint) hint.remove();
      state.thread.forEach(function (t) {
        if (t.role === 'user') pushMe(t.text);
        else pushBot(t.text, '观测站');
      });
    }

    bindGlobal();
    bind();

    setSrc(state.source === 'ai' ? 'DeepSeek 生成' : '本地推演');

    AI.probe().then(function (s) {
      if (!s.ok) { setSrc('本地推演'); return; }
      if (state.source === 'ai') { setSrc('DeepSeek 生成'); return; }
      upgrade();
    });
  }

  function showEmpty() {
    $('empty').hidden = false;
    $('split').hidden = true;
  }

  function bindGlobal() {
    ['pointerdown', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, function once() {
        S.unlock();
        window.removeEventListener(ev, once);
      }, { passive: true });
    });

    var muted = false;
    try { muted = localStorage.getItem('DA_TAROT_MUTE') === '1'; } catch (e) {}
    var sBtn = $('soundBtn');
    if (sBtn) {
      sBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
      S.setMuted(muted);
      sBtn.addEventListener('click', function () {
        muted = !muted;
        sBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
        S.setMuted(muted);
        try { localStorage.setItem('DA_TAROT_MUTE', muted ? '1' : '0'); } catch (e) {}
        if (!muted) { S.unlock(); S.hover(); }
      });
    }

    document.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { S.page(); });
    });

    /* 权益入口在任何状态下都可用（含空态） */
    var badge = $('pmBadge');
    if (badge) badge.addEventListener('click', function () {
      if (state.premium.active) toast('深度探索有效至 ' + fmtDate(state.premium.valid_until));
      else openGate();
    });
    if ($('unlockBtn')) $('unlockBtn').addEventListener('click', openGate);
    if ($('pmLockBtn')) $('pmLockBtn').addEventListener('click', openGate);
    if ($('pmGateX')) $('pmGateX').addEventListener('click', closeGate);
    if ($('pmGate')) $('pmGate').querySelectorAll('[data-pm-close]').forEach(function (el) {
      el.addEventListener('click', closeGate);
    });
    if ($('pmRedeem')) $('pmRedeem').addEventListener('click', doRedeem);
    if ($('pmCode')) $('pmCode').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); doRedeem(); }
    });
    refreshPremium();
  }

  function bind() {
    $('favBtn').addEventListener('click', toggleFav);
    $('copyBtn').addEventListener('click', copyAll);
    $('askBtn').addEventListener('click', openAsk);

    $('askClose').addEventListener('click', closeAsk);
    $('ask').querySelectorAll('[data-close]').forEach(function (el) {
      el.addEventListener('click', closeAsk);
    });
    $('sendBtn').addEventListener('click', send);
    $('askInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); send(); }
    });
    $('suppBtn').addEventListener('click', drawSupp);

    /* ── 章节「继续探索」与预设问题 ───────────────────────────── */
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target : null;
      if (!t || !t.closest) return;
      var ex = t.closest('[data-pm-explore]');
      if (ex) { openAsk(ex.getAttribute('data-pm-explore')); return; }
      var chip = t.closest('.pm-chip');
      if (chip) {
        $('askInput').value = chip.getAttribute('data-q') || '';
        $('askInput').focus();
        if (!state.premium.active) openGate();
      }
    });

    $('mClose').addEventListener('click', closeCard);
    $('modal').querySelectorAll('[data-close]').forEach(function (el) {
      el.addEventListener('click', closeCard);
    });

    $('srcBtn').addEventListener('click', showSource);

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('pmGate').hidden) { closeGate(); return; }
      if (!$('modal').hidden) { closeCard(); return; }
      if (!$('ask').hidden) closeAsk();
    });

    /* 权益状态每次进页面都重新向服务端查询 */
    refreshPremium();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
