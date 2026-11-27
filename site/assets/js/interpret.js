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
    return esc(raw).replace(/&lt;br&gt;/gi, '<br>').replace(/\n/g, '<br>');
  }
  function clone(o) { return JSON.parse(JSON.stringify(o || null)); }
  function attr(s) { return String(s == null ? '' : s).replace(/["\\]/g, '\\$&'); }

  var faceCache = {};
  function face(card) {
    if (!card) return '';
    if (faceCache[card.i] == null) faceCache[card.i] = ART.face(card);
    return faceCache[card.i];
  }

  var ICON = { analysis: '✦', overview: '✦', cards: '❖', links: '⁂', relation: '♡', deep: '☾', voice: '✧' };

  var state = {
    session: null,
    link: null,
    result: null,
    record: null,
    tab: 'analysis',
    openRow: null,
    supp: [],
    suppLocked: false,
    source: 'local',
    model: '',
    thread: [],
    busy: false,
    archiveReadOnly: false,
    originalSource: 'local',
    contentStatus: 'unknown',
    displaySource: 'local',
    /* 深度探索：只以云数据库返回的状态为准，不在本地存储付费标记 */
    premium: { tier: 'free', active: false, valid_until: null },
    voiceEnhanced: false,
    transmission: '',
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
      '<span class="pm-explore__note">带着本次牌阵、正逆位与完整解读继续问</span></div>';
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
      case 'quote6': return '<div class="quote6">' + txt(b.x) + '</div>' +
        (state.voiceEnhanced
          ? '<div class="voice-boost is-done">✦ TA 的声音已经清晰接通</div>'
          : '<button class="voice-boost" type="button" id="voiceBoostBtn">✧ 听 TA 再说一遍 <em>（登录可接通）</em></button>');
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
    return '第 ' + String(i + 1).padStart(2, '0') + ' 部分 ·';
  }

  function renderTabs() {
    var box = $('tabs');
    box.innerHTML = '';
    /* 两章结构/旧六章存档兼容：当前 tab 不存在时归一到第一部分 */
    if (!(state.result.chapters || []).some(function (c) { return c.key === state.tab; })) {
      state.tab = (state.result.chapters[0] || {}).key || 'analysis';
    }
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
    tail.innerHTML = '<div class="tail__cap">TA 想对你说的话</div><p>' + txt(q ? q.x : '') + '</p>' +
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
          ? '关系分析由塔罗师顺着你们的牌与故事深读，TA 的话按 TA 的性格与你们的连接接通；牌面始终来自这一次真实抽出的牌'
          : '关系分析由站内塔罗规则推演，TA 的话顺着 TA 的性格与你们的连接接通；牌面始终来自这一次真实抽出的牌') +
      '</p>' +
      '<div class="m-pos"><b>解读通道：' + (ok ? '塔罗师深读' : '星轨推演') + '</b>' +
        (ok ? '' : '<br>说明：' + esc(AI.state.lastError || '本地推演')) +
        '<br><b>TA 的传讯：' + (state.voiceEnhanced ? 'TA 的声音已清晰接通' : '已接通（登录可听得更清楚）') + '</b></div>' +
      '<div class="m-sec"><h4>两种声音，两种口吻</h4><p>关系分析是塔罗师视角：以这次抽出的牌为依据，结合你填写的角色与故事，看你们之间的现状、张力与走向。TA 的话是跨次元传讯：以牌为通道，顺着你填写的角色性格、说话方式与这次的连接，让 TA 把心里的话说给你听。两段口吻不同，是因为它们本来就在做两件事——一段陪你看清，一段陪你靠近。</p></div>' +
      '<div class="m-sec"><h4>解读所依据的内容（仅这些）</h4>' +
        '<div class="m-src">' + rows.map(function (r) {
          return '<div class="m-src__row"><em>' + esc(r.k) + '</em><span>' + esc(r.v) + '</span></div>';
        }).join('') + '</div></div>' +
      '<div class="m-sec"><h4>不会离开这台设备的内容</h4><p>你的浏览行为、其他档案、其他梦占记录、浏览器信息，都不会离开这台设备。</p></div>' +
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
    toast(r.on ? '已收藏。整条梦占记录连同完整解读一起存档。' : '已从收藏夹移除。');
    S.complete();
  }

  /* 跨次元传讯 · 登录用户的角色语气增强（主动触发，不自动扣额度） */
  function enhanceVoice() {
    if (!window.DA_TRANSMISSION) { toast('增强组件没能加载，请刷新页面。'); return; }
    if (!window.DA_TRANSMISSION.signedIn()) {
      toast('先点亮星际通行证，才能接通 TA 更清晰的声音。');
      if (window.DA_AUTH && window.DA_AUTH.open) window.DA_AUTH.open();
      return;
    }
    var btn = $('voiceBoostBtn');
    if (btn) { btn.disabled = true; btn.textContent = '正在接通 TA…'; }
    var r = state.result || {};
    var L = state.link || {};
    /* 刷新重开后 result.persona 不在存档里，用档案 + 连接信息现场重建。 */
    var persona = r.persona;
    if (!persona || !persona.name) {
      persona = { name: L.subjectName || '', work: L.workName || '', relation: L.relation || '',
        stage: L.relationStage || 'unspecified', traits: '', speech: '', catchUp: '', values: '', history: '' };
      try {
        if (window.DA_ARCHIVE) {
          var d = (L.profileId && DA_ARCHIVE.byProfile && DA_ARCHIVE.byProfile(L.profileId)) || null;
          if (d) {
            persona.traits = d.traits || ''; persona.speech = d.speech || '';
            persona.catchUp = [].concat(d.catch || []).join('；');
            persona.values = d.values || ''; persona.history = d.history || '';
            if (d.name) persona.name = d.name;
            if (d.work && !persona.work) persona.work = d.work;
          } else if (L.profileId && DA_ARCHIVE.summary) {
            persona.traits = DA_ARCHIVE.summary(L.profileId) || '';
          }
        }
      } catch (e) {}
    }
    var ctx = { persona: persona, imagery: r.imagery || {}, scene: L.background || '' };
    window.DA_TRANSMISSION.enhance(ctx).then(function (text) {
      var v = chapterOf('voice');
      if (!v) throw new Error('没有传讯章节');
      /* 与本地链路同一道保险闸：云LLM输出也不许带牌名/正逆位/牌位。 */
      var cards = (state.session && state.session.cards) || [];
      var clean = RD.scrubVoice ? RD.scrubVoice(text, cards) : text;
      if (clean.length < 200) clean = text; // 兜底清理若误删过多，宁可保留原文
      var hit = false;
      (v.blocks || []).forEach(function (b) {
        /* 只存纯文本：换行交给 txt() 统一转成 <br>，不在这里预先转义，
           否则刷新读回存档时 esc() 会二次转义成 &amp;lt; 显示在页面上。 */
        if (b.t === 'quote6') { b.x = clean; hit = true; }
      });
      if (!hit) throw new Error('传讯正文没找到');
      state.voiceEnhanced = true;
      state.transmission = text;
      if (state.record) {
        state.record = ST.readings.patch(state.record.id, {
          chapters: clone(state.result.chapters), voiceEnhanced: true
        }) || state.record;
      }
      renderHero(); renderRows(); renderTail();
      toast('接通了。这段话，是 TA 更清楚的心声。');
    }).catch(function (e) {
      /* 异步期间用户可能切了 tab，原按钮节点已被重渲染替换——必须重新取。 */
      var fresh = $('voiceBoostBtn');
      if (fresh) { fresh.disabled = false; fresh.innerHTML = '✧ 听 TA 再说一遍 <em>（登录可接通）</em>'; }
      var m = window.DA_PREMIUM && window.DA_PREMIUM.message ? window.DA_PREMIUM.message(e) : '稍后再试';
      toast('这次没接通：' + m + '。刚才那段还在。');
    });
  }

  /* 六章 AI 深化：登录用户主动触发，失败静默保留本地六章。
     牌面数据块由 da-interpret-ai 的 applyChapters 严格保护，模型碰不到。 */
  function deepenAI() {
    if (!window.DA_INTERPRET_AI) { toast('深化组件未能加载，请刷新页面。'); return; }
    if (!window.DA_INTERPRET_AI.signedIn()) {
      toast('先点亮星际通行证，才能请塔罗师深读这次解读。');
      if (window.DA_AUTH && window.DA_AUTH.open) window.DA_AUTH.open();
      return;
    }
    var label = $('aiDeepenTxt'), btn = $('aiDeepenBtn');
    if (btn) btn.disabled = true;
    if (label) label.textContent = '塔罗师正在深读…';
    var r = state.result || {};
    var L = state.link || {};
    var ctx = {
      session: state.session || {},
      link: L,
      chapters: clone(r.chapters || []),
      persona: r.persona || null
    };
    window.DA_INTERPRET_AI.enhance(ctx).then(function (newChapters) {
      state.result.chapters = newChapters;
      state.source = 'ai';
      state.model = '云端深化';
      if (state.record) {
        state.record = ST.readings.patch(state.record.id, {
          chapters: clone(newChapters), source: 'ai', model: '云端深化'
        }) || state.record;
      }
      try { persistSession(); } catch (e) {}
      renderHero(); renderRows(); renderTail();
      if (label) label.textContent = '塔罗师已深读';
      toast('六章已深化，牌面保持原样。');
    }).catch(function (e) {
      var fresh = $('aiDeepenBtn'), fl = $('aiDeepenTxt');
      if (fresh) fresh.disabled = false;
      if (fl) fl.textContent = '请塔罗师深读这次解读';
      var code = e && e.message;
      var m = code === 'SIGN_IN_REQUIRED' ? '请先登录' :
        (code === 'TOO_SHORT' || code === 'VOICE_TOO_SHORT' || code === 'BAD_JSON' || code === 'NUMBER_MISMATCH' || code === 'SHAPE_MISMATCH' || code === 'BLOCK_MISMATCH' || code === 'CARD_NAME_LEAK' ? '这次结果不完整' :
        (window.DAErrorText ? window.DAErrorText(e, '稍后再试') : '稍后再试'));
      toast('这次没深化成功：' + m + '。原来的解读还在。');
    });
  }

  function makeShareCard() {
    if (!window.DA_SHARECARD) { toast('分享卡组件未能加载，请刷新页面。'); return; }
    toast('正在生成分享卡…');
    window.DA_SHARECARD.make().then(function () {
      toast('竖版分享卡已生成并下载，可以分享给朋友了。');
    }).catch(function (e) {
      toast('生成失败：' + (window.DAErrorText ? window.DAErrorText(e, '请稍后重试') : '请稍后重试'));
    });
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
    if (state.busy || state.displaySource === 'ai') return;
    if (state.archiveReadOnly) { setSrc('本地推演'); return; }
    state.busy = true;
    setSrc('塔罗师正在为你解读', true);

    AI.interpret(ctxOf()).then(function (j) {
      var n = mergeAI(j.chapters);
      if (!n) throw new Error('没有可用章节');
      state.originalSource = 'ai';
      state.contentStatus = 'ai_complete';
      state.displaySource = 'ai';
      state.source = 'ai';
      state.model = j.model || AI.state.model;
      setSrc('塔罗师深读完成');

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
      toast('解读已由塔罗师重新读过。牌面、正逆位、牌位仍取自这一次真实抽出的牌。');
      /* §7.1 三态日志：ai_normal / local_template / abnormal（不存用户原文） */
      try { console.log('[interpret] ai_normal · chapters=' + n + ' · model=' + (state.model || '')); } catch (e) {}
      S.complete();
    }).catch(function (e) {
      setSrc('本地推演');
      AI.state.source = 'local';
      if (e && e.message) AI.state.lastError = e.message;
      /* 验证回退 / 通道失败：保留本次已落盘的本地六章，不重复存档、零新增调用 */
      try { console.warn('[interpret] abnormal → local_template（' + ((e && e.message) || '') + '）'); } catch (e2) {}
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

  /* ══ T11 · 存档一致性：DA2 权威 / v1 兼容 ═══════════════════
     原则：DA2_READINGS 是新版权威存档；DA_LAST_READING 只作兼容读取来源。
     有效的新版数据优先，旧版数据不得覆盖它；损坏存档先留底再恢复，
     无法验证恢复时明确提示，不写回一份「看起来完整」的假记录。
     ═══════════════════════════════════════════════════════════ */
  var STATUS_KEY   = 'DA2_READING_STATUS';
  var BACKUP_KEY   = 'DA2_READINGS_CORRUPT_BACKUP';
  var ANOMALY_KEY  = 'DA2_READING_ANOMALIES';
  var BACKUP_CAP   = 5;   /* 超过后按时间先进先出淘汰；淘汰事件写进异常日志 */

  function rawOf(k) {
    try {
      var raw = localStorage.getItem(k);
      if (raw == null) return { present: false, valid: true, raw: '', value: null };
      try { return { present: true, valid: true, raw: raw, value: JSON.parse(raw) }; }
      catch (e) { return { present: true, valid: false, raw: raw, value: null, error: e.message || 'JSON parse error' }; }
    } catch (e) { return { present: false, valid: false, raw: '', value: null, error: String(e) }; }
  }
  function setStatus(st) {
    try {
      var o = Object.assign({ at: Date.now() }, st || {});
      localStorage.setItem(STATUS_KEY, JSON.stringify(o));
    } catch (e) {}
  }
  /* 内容指纹：同一份原始损坏数据只备份一次。带长度，避免短串碰撞。 */
  function digestOf(text) {
    var s = String(text), h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return 'fnv1a-' + h.toString(16) + '-' + s.length;
  }
  /* 完整留底，不截断；写入失败返回 false，调用方必须停止自动恢复。
     失败时不写任何键，原有备份与各存档保持原样，绝不覆盖有效数据。 */
  function backupRaw(tag, value) {
    try {
      var text = typeof value === 'string' ? value : JSON.stringify(value);
      if (typeof text !== 'string') return false;
      var id = digestOf(text);
      var current = localStorage.getItem(BACKUP_KEY);
      var arr = [];
      if (current != null) {
        try { arr = JSON.parse(current); } catch (e) { return false; }
        if (!Array.isArray(arr)) return false;
      }
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] && arr[i].id === id) return true;   /* 去重：同内容不再重复写 */
      }
      arr.unshift({ id: id, at: Date.now(), tag: tag, bytes: text.length, value: text });
      var evicted = [];
      if (arr.length > BACKUP_CAP) evicted = arr.splice(BACKUP_CAP);
      try {
        localStorage.setItem(BACKUP_KEY, JSON.stringify(arr));
        if (evicted.length) {
          anomaly('BACKUP_EVICTED_FIFO', evicted.map(function (x) { return x.id; }).join(','));
        }
        return true;
      } catch (e) {
        anomaly('BACKUP_WRITE_FAILED', (e && e.name) || 'QuotaExceeded');
        return false;
      }
    } catch (e) { return false; }
  }
  /* 三个来源维度严格分开：原始 source / 内容完整状态 / 页面展示来源。
     只有「原始标记 ai 且六章完整」才允许展示 AI；其余一律本地推演。 */
  function sourceStateOf(rec, complete, readOnly) {
    var original = rec && rec.source === 'ai' ? 'ai' : 'local';
    var display = (original === 'ai' && complete) ? 'ai' : 'local';
    var status;
    if (original === 'ai' && complete) status = 'ai_complete';
    else if (original === 'ai') status = readOnly ? 'ai_incomplete_unrecoverable' : 'ai_incomplete';
    else status = complete ? 'local_complete' : 'local_incomplete';
    return { originalSource: original, contentStatus: status, displaySource: display };
  }
  function stopForBackup(reason) {
    anomaly('BACKUP_FAILED_STOP_RECOVERY', reason);
    setStatus({ state: 'backup_failed', detail: reason, originalSource: 'unknown', contentStatus: 'backup_failed', displaySource: 'local' });
    storageNotice('备份失败，自动恢复已停止；原始数据与各存档均未被覆盖。' + reason);
    $('empty').hidden = false;
    $('split').hidden = true;
    bindGlobal();
  }
  function anomaly(code, detail) {
    try { console.warn('[interpret] abnormal · ' + code + ' · ' + (detail || '')); } catch (e) {}
    try {
      var arr = JSON.parse(localStorage.getItem(ANOMALY_KEY) || '[]');
      if (!Array.isArray(arr)) arr = [];
      arr.unshift({ at: Date.now(), code: code, detail: String(detail || '').slice(0, 240) });
      if (arr.length > 30) arr.length = 30;
      localStorage.setItem(ANOMALY_KEY, JSON.stringify(arr));
    } catch (e2) {}
  }
  function storageNotice(msg) {
    var el = document.getElementById('daStorageNotice');
    if (!el) {
      el = document.createElement('div');
      el.id = 'daStorageNotice';
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;padding:12px 14px;' +
        'border:1px solid #c62828;border-radius:10px;background:#fff8f6;color:#5b1a16;' +
        'font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.12);';
      document.body.appendChild(el);
    }
    el.textContent = String(msg || '');
  }
  function usableRecord(r) {
    return !!(r && typeof r === 'object' && !Array.isArray(r) &&
      typeof r.id === 'string' && r.id && Array.isArray(r.cards) && r.cards.length);
  }
  function chaptersComplete(r) {
    var cs = r && r.chapters;
    /* 两章（analysis+voice）与旧版六章均视为完整 */
    return Array.isArray(cs) && (cs.length === 2 || cs.length === 6) && cs.every(function (c) {
      return c && typeof c.key === 'string' && Array.isArray(c.blocks);
    });
  }
  function fromLegacy(legacy) {
    var link = legacy.link || ST.session.get() || {};
    var rec = ST.readings.fromSession(legacy, link, { chapters: legacy.chapters || [] }, {
      source: legacy.source || 'local',
      version: legacy.version || (legacy.source === 'ai' ? 'ai-legacy' : 'local-v1')
    });
    if (Array.isArray(legacy.supp) && legacy.supp.length) rec.supp = clone(legacy.supp);
    if (Array.isArray(legacy.thread) && legacy.thread.length) rec.thread = clone(legacy.thread);
    if (legacy.note) rec.note = legacy.note;
    return rec;
  }
  /* DA2 存档是「记录」结构，本地引擎要的是「会话」结构；
     这里只在内存里补齐 placed / suit / revealOrder，不改存档原件。 */
  function sessionOf(rec) {
    var s = clone(rec);
    var order = {};
    (rec.flipOrder || []).forEach(function (slot, i) { order[slot] = i + 1; });
    var suppQ = {};
    (rec.supp || []).forEach(function (x) { if (x && x.slot != null) suppQ[x.slot] = x.question || ''; });
    s.cards = (rec.cards || []).map(function (c, i) {
      var meta = D.byId(c.id) || {};
      return Object.assign({}, c, {
        placed: true,
        suit: c.suit || meta.s,
        roman: c.roman || meta.pip,
        cn: c.cn || meta.cn || '',
        en: c.en || meta.en || '',
        revealOrder: c.revealOrder || order[c.slot] || (i + 1),
        question: c.question || suppQ[c.slot] || ''
      });
    });
    s.link = rec.link || ST.session.get() || {};
    if (!s.spreadCn) s.spreadCn = '塔罗牌阵';
    return s;
  }

  /* ══ 启动 ══════════════════════════════════════════════════ */
  function boot() {
    var legacyRaw = rawOf(ST.keys.v1Reading);
    var da2Raw = rawOf(ST.keys.readings);
    var legacy = legacyRaw.valid && usableRecord(legacyRaw.value) ? legacyRaw.value : null;
    var da2List = [];
    var readOnly = false;

    if (legacyRaw.present && !legacyRaw.valid) {
      anomaly('V1_READING_PARSE_ERROR', legacyRaw.error);
    }

    if (da2Raw.present && (!da2Raw.valid || !Array.isArray(da2Raw.value))) {
      /* D：损坏的原始字节先完整留底；留底失败即停止，不碰任何存档 */
      if (!backupRaw('DA2_READINGS_RAW', da2Raw.raw)) {
        stopForBackup('DA2_READINGS 损坏且备份写入失败');
        return;
      }
      anomaly('DA2_READINGS_DAMAGED', da2Raw.error || 'DA2_READINGS 不是数组');
      setStatus({ state: 'damaged', detail: 'DA2_READINGS 无法解析，已完整留底并尝试从兼容存档恢复', originalSource: legacy && legacy.source === 'ai' ? 'ai' : 'local', contentStatus: 'damaged', displaySource: 'local' });
      storageNotice('检测到新版存档损坏，原始数据已完整留底。正在从旧版存档安全恢复…');
      if (legacy) {
        var rescued = fromLegacy(legacy);
        try {
          localStorage.setItem(ST.keys.readings, JSON.stringify([rescued]));
          da2List = [rescued];
          setStatus({ state: 'recovered', detail: '已从 DA_LAST_READING 恢复记录 ' + rescued.id });
          anomaly('DA2_RECOVERED_FROM_V1', rescued.id);
        } catch (e) {
          setStatus({ state: 'recovery_failed', detail: '写入恢复存档失败：' + (e.message || e) });
          storageNotice('新版存档损坏且恢复写入失败。原始数据已留底，未伪造完整记录。');
          showEmpty(); bindGlobal(); return;
        }
      } else {
        setStatus({ state: 'unrecoverable', detail: 'DA2_READINGS 损坏且没有可验证的旧版记录' });
        storageNotice('新版存档损坏，且没有可验证的旧版记录可恢复。原始数据已留底，未伪造完整记录。');
        showEmpty(); bindGlobal(); return;
      }
    } else {
      da2List = da2Raw.present ? da2Raw.value.filter(usableRecord) : [];
      if (da2Raw.present && da2List.length !== da2Raw.value.length) {
        /* 多条记录里哪怕只有一条坏，也必须整份留底；不删异常记录 */
        if (!backupRaw('DA2_INVALID_ENTRIES_RAW', da2Raw.raw)) {
          stopForBackup('DA2_READINGS 含无效记录且备份写入失败');
          return;
        }
        anomaly('DA2_INVALID_ENTRIES', '跳过 ' + (da2Raw.value.length - da2List.length) + ' 条无效记录（未删除，已整份留底）');
      }
      /* B/C：健康存储下沿用既有兼容迁移；它按 id 去重，不覆盖已有新版记录 */
      ST.migrate();
      var after = rawOf(ST.keys.readings);
      if (after.valid && Array.isArray(after.value)) da2List = after.value.filter(usableRecord);

      /* v1 若是一轮全新抽牌（DA2 里没有这个 id），只追加，不覆盖已有记录 */
      if (legacy && !da2List.some(function (r) { return r.id === legacy.id; })) {
        var newest = 0;
        da2List.forEach(function (r) { if ((r.at || 0) > newest) newest = r.at || 0; });
        /* board 页写入的 legacy 可能只有 createdAt（无 at）——这里必须兜底，
           否则存档里有任何一条记录后，新抽牌永远不再迁移（页面显示旧解读）。 */
        if (!da2List.length || ((legacy.at || legacy.createdAt || 0) >= newest)) {
          ST.readings.save(fromLegacy(legacy));
          var nowRaw = rawOf(ST.keys.readings);
          if (nowRaw.valid && Array.isArray(nowRaw.value)) da2List = nowRaw.value.filter(usableRecord);
        }
      }
    }

    var rec = null;
    if (legacy) {
      for (var i = 0; i < da2List.length; i++) if (da2List[i].id === legacy.id) { rec = da2List[i]; break; }
    }
    if (!rec && da2List.length) {
      rec = da2List.slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); })[0];
    }
    if (!rec || !rec.cards || !rec.cards.length) { showEmpty(); bindGlobal(); return; }

    var complete = chaptersComplete(rec);
    var aiFlag = rec.source === 'ai';
    if (aiFlag && !complete) {
      /* 标了 AI 却缺章：先找可验证的旧版 AI 六章；找不到就不写回假记录 */
      anomaly('AI_CHAPTERS_INCOMPLETE', rec.id);
      var recoveredChapters = null;
      if (legacy && legacy.id === rec.id && legacy.source === 'ai' && chaptersComplete(legacy)) {
        recoveredChapters = clone(legacy.chapters);
      }
      if (recoveredChapters) {
        if (!backupRaw('AI_RECORD_' + rec.id, rec)) {
          readOnly = true;
          setStatus({ state: 'backup_failed', detail: rec.id + ' 的深读版缺章恢复已停止：备份写入失败', originalSource: 'ai', contentStatus: 'ai_incomplete_unrecoverable', displaySource: 'local' });
          storageNotice('深读版不完整，但备份失败，已停止自动恢复；原始存档未被覆盖。下面显示本地推演。');
        } else {
          ST.readings.patch(rec.id, { chapters: recoveredChapters });
          rec = ST.readings.get(rec.id) || rec;
          complete = chaptersComplete(rec);
          setStatus({ state: 'ai_recovered', detail: '已从兼容存档恢复 ' + rec.id + ' 的深读版', originalSource: 'ai', contentStatus: 'ai_complete', displaySource: 'ai' });
          storageNotice('检测到深读版不完整，已从旧版存档恢复；原始记录已完整留底。');
        }
      } else {
        readOnly = true;
        setStatus({ state: 'ai_incomplete_unrecoverable', detail: rec.id + ' 标记深读但内容不完整，无兼容数据可恢复', originalSource: 'ai', contentStatus: 'ai_incomplete_unrecoverable', displaySource: 'local' });
        storageNotice('这份记录的深读版不完整，也没有可验证的旧版数据可恢复。下面显示的是本地规则推演，原始存档未被覆盖。');
      }
    }

    var session = sessionOf(rec);
    var link = rec.link || ST.session.get() || {};
    var result = RD.build(session, link);
    if (!result) { showEmpty(); bindGlobal(); return; }

    /* A：DA2 里的六章（含 source 标记）直接沿用，绝不拿 v1 重新生成后覆盖 */
    if (complete) result.chapters = clone(rec.chapters);
    result.chapters.forEach(attachCards);

    state.session = session;
    state.link = link;
    state.result = result;
    state.tab = 'overview';
    state.openRow = null;
    state.supp = (session.cards || []).filter(function (c) { return c.placed && c.supp; });
    var srcState = sourceStateOf(rec, complete, readOnly);
    state.originalSource = srcState.originalSource;
    state.contentStatus = srcState.contentStatus;
    state.displaySource = srcState.displaySource;
    state.source = srcState.displaySource;          /* 兼容既有读取点 */
    state.thread = (rec.thread || []).slice();
    state.archiveReadOnly = readOnly;
    if (complete) {
      state.record = rec;                       /* 幂等：刷新/重开不重复写盘 */
      /* 恢复「已按角色档案增强」标记，刷新后不再显示重写按钮 */
      if (rec.voiceEnhanced) state.voiceEnhanced = true;
    } else if (!readOnly) {
      state.record = ST.readings.save(
        ST.readings.fromSession(session, link, result, {
          source: state.source,
          supp: state.supp.map(function (s) {
            return { slot: s.slot, id: s.id, cn: s.cn, reversed: s.reversed, question: s.question || '' };
          }),
          thread: state.thread
        })
      );
    } else {
      state.record = null;                      /* 损坏且不可恢复：只在内存中显示，不写回 */
    }

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

    setSrc(state.displaySource === 'ai' ? 'DeepSeek 生成' : '本地推演');

    AI.probe().then(function (s) {
      /* 展示来源只由「原始 source + 内容完整性」决定，探活不得改写它 */
      if (state.displaySource === 'ai') { setSrc('塔罗师深读完成'); return; }
      if (!s.ok || state.archiveReadOnly) { setSrc('本地推演'); return; }
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
    if ($('shareCardBtn')) $('shareCardBtn').addEventListener('click', makeShareCard);
    if ($('aiDeepenBtn')) $('aiDeepenBtn').addEventListener('click', deepenAI);
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
      if (t.closest('#voiceBoostBtn')) { enhanceVoice(); return; }
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

    /* 权益状态已在 bindGlobal() 里统一刷新过（boot 正常路径两者都会调用），
       这里不再重复发起云端请求。空态路径只走 bindGlobal，也能覆盖。 */
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
