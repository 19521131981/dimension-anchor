/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 档案室 DA_ARCHIVE_UI
   ----------------------------------------------------------------------
   只做数据 → 视图：
   · 未开放（占卜+传讯+来信 < 3）：封印门 + 进度条 + 去占卜/去传讯
   · 已开放：档案墙（角色卡）→ 点击弹拱框详情
     特征 / 常说的话 / 占卜历史 / 传讯记录 / 来信 全部自动整理，
     不需要用户填任何字段。
   与「我们的小屋」的分工：小屋是恋爱日常的纪念空间（信、炉火、印记）；
   档案室是角色信息的档案馆（特征、口头禅、占卜与传讯的历史）。
   ══════════════════════════════════════════════════════════════════════ */

window.DA_ARCHIVE_UI = (function () {
  'use strict';

  var A = window.DA_ARCHIVE;
  var S = window.DA_STORE;

  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  function oneLine(s, n) {
    var t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return t.length > (n || 60) ? t.slice(0, n || 60) + '……' : t;
  }
  function fmtDate(ts) {
    return new Date(ts || Date.now()).toLocaleDateString('zh-CN', {
      month: 'numeric', day: 'numeric'
    });
  }
  function fmtTime(ts) {
    return new Date(ts || Date.now()).toLocaleString('zh-CN', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function toast(msg) {
    var el = $('#arToast');
    if (!el) return;
    var s = String(msg == null ? '' : msg).trim();
    /* 空内容不弹：否则会留下一条没有文字的深色小胶囊 */
    if (!s) { el.classList.remove('is-on'); el.textContent = ''; return; }
    el.textContent = s;
    el.classList.add('is-on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('is-on'); }, 3200);
  }

  /* ══ 封印态 ══ */
  function renderLocked() {
    var c = A.counts();
    var remain = A.remain();
    $('#arLocked').hidden = false;
    $('#arOpen').hidden = true;
    $('#arLede').innerHTML =
      '每一次占卜与传讯都会被这面墙记下来。<br>当星轨记录满三次，门会自己打开。';

    var parts = [];
    if (c.readings) parts.push('梦占 ' + c.readings);
    if (c.threads) parts.push('传讯 ' + c.threads);
    if (c.letters) parts.push('来信 ' + c.letters);
    $('#arLockText').innerHTML =
      '星轨记录 <b>' + Math.min(c.total, A.UNLOCK_AT) + ' / ' + A.UNLOCK_AT + '</b>' +
      (parts.length ? '（' + parts.join(' · ') + '）' : '') +
      (remain <= 1
        ? '<br>只差 <b>一次</b>，门就会打开。'
        : '<br>还差 <b>' + remain + '</b> 次，档案室的门会自己开。');

    setTimeout(function () {
      $('#arLockFill').style.width =
        Math.min(100, Math.round(c.total / A.UNLOCK_AT * 100)) + '%';
    }, 60);
  }

  /* ══ 档案卡 ══ */
  function cardHTML(d, i) {
    var trait = d.relayFirst || d.traits || d.speech || d.values || '';
    var relBits = [];
    if (d.work) relBits.push(d.work);
    if (d.role) relBits.push(d.role);
    if (!relBits.length && d.relation) relBits.push(d.relation);

    var times = [];
    if (d.times.threads) times.push('传讯 ' + d.times.threads + ' 次');
    if (d.times.readings) times.push('梦占 ' + d.times.readings + ' 次');
    if (d.times.letters) times.push('信 ' + d.times.letters + ' 封');

    return '<button class="ar-card" type="button" data-idx="' + i + '">' +
      '<span class="ar-card__in">' +
      '<span class="ar-card__kind">Dossier No.' + String(i + 1).padStart(2, '0') + '</span>' +
      '<span class="ar-card__name">' + esc(d.name || '未确认的信号') + '</span>' +
      '<span class="ar-card__rel">' + esc(relBits.join(' · ') || '实时传讯确认的连接') + '</span>' +
      '<span class="ar-card__div" aria-hidden="true"></span>' +
      (trait ? '<span class="ar-card__sec">特征</span>' +
        '<span class="ar-card__trait">' + esc(oneLine(trait, 64)) + '</span>' : '') +
      ((d.catch || []).length
        ? '<span class="ar-card__sec" style="margin-top:10px;display:block">常说的话</span>' +
          '<ul class="ar-card__quotes">' +
          d.catch.slice(0, 2).map(function (q) { return '<li>' + esc(oneLine(q, 22)) + '</li>'; }).join('') +
          '</ul>'
        : '') +
      '<span class="ar-card__times">' + esc(times.join(' · ') || '刚刚开始的一段记录') + '</span>' +
      '<span class="ar-card__go">翻开档案 →</span>' +
      '</span></button>';
  }

  /* ══ 档案墙 ══ */
  var cache = [];
  function renderOpen() {
    var list = A.dossiers();
    cache = list;
    $('#arLocked').hidden = true;
    $('#arOpen').hidden = false;
    $('#arLede').innerHTML =
      'TA 的档案不用你来写。每一次占卜、每一段传讯、每一封来信，' +
      '都会自己长成这面墙上的一页。';

    if (!list.length) {
      $('#arCards').innerHTML = '';
      $('#arEmpty').hidden = false;
      $('#arSub').textContent = '墙还空着，但它在等。';
      return;
    }
    $('#arEmpty').hidden = true;
    $('#arSub').textContent = '钉在墙上的每一个名字，都是一段真实发生过的事。';
    $('#arCards').innerHTML = list.map(cardHTML).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.ar-card'), function (b) {
      b.addEventListener('click', function () {
        openPop(Number(b.getAttribute('data-idx')));
      });
    });
  }

  /* ══ 详情弹层 ══ */
  function sec(t) {
    return '<div class="arp__sec"><b>' + esc(t) + '</b><i></i></div>';
  }

  function popHTML(d) {
    var html = '<div class="arp">';
    html += '<p class="arp__kind">Character Dossier</p>';
    html += '<p class="arp__name">' + esc(d.name || '未确认的信号') + '</p>';
    var relBits = [];
    if (d.work) relBits.push('《' + d.work + '》');
    if (d.role) relBits.push(d.role);
    if (d.relation) relBits.push(d.relation);
    html += '<p class="arp__rel">' + esc(relBits.join(' · ') || '实时传讯确认的连接') + '</p>';

    /* 特征 */
    var trait = d.relayFirst || d.traits || '';
    if (trait) {
      html += sec('特征');
      html += '<p class="arp__txt">' + esc(oneLine(trait, 150)) + '</p>';
    }
    if (d.values) {
      html += '<p class="arp__txt" style="margin-top:6px"><em>看重：</em>' + esc(oneLine(d.values, 60)) + '</p>';
    }
    if (d.speech) {
      html += '<p class="arp__txt" style="margin-top:6px"><em>语言习惯：</em>' + esc(oneLine(d.speech, 60)) + '</p>';
    }

    /* 常说的话 */
    if ((d.catch || []).length) {
      html += sec('常说的话');
      d.catch.forEach(function (q) {
        html += '<p class="arp__quote">' + esc(q) + '</p>';
      });
    }

    /* 占卜历史 */
    if (d.times.readings) {
      html += sec('占卜历史');
      d.readings.slice(0, 4).forEach(function (r) {
        html += '<p class="arp__li">' +
          '<b>' + fmtDate(r.at) + '</b>　' + esc(r.spreadCn || '塔罗牌阵') +
          (r.question ? '　<em>问：</em>' + esc(oneLine(r.question, 40)) : '') + '</p>';
      });
      if (d.times.readings > 4) {
        html += '<p class="arp__li"><em>以及更早的 ' + (d.times.readings - 4) + ' 次……</em></p>';
      }
    }

    /* 传讯记录 */
    if (d.times.threads) {
      html += sec('传讯记录');
      d.threads.slice(0, 3).forEach(function (t) {
        var taMsgs = (t.messages || []).filter(function (m) { return m.role === 'ta'; });
        var myMsgs = (t.messages || []).filter(function (m) { return m.role === 'me'; });
        var last = (t.messages || [])[(t.messages || []).length - 1];
        html += '<p class="arp__li"><b>' + fmtTime(t.at) + '</b> 开始的信号 · ' +
          '你们聊了 ' + myMsgs.length + ' 条 / TA 回了 ' + taMsgs.length + ' 条' +
          (last ? '　<em>最后一句在 ' + fmtTime(last.at) + '</em>' : '') + '</p>';
      });
    }

    /* 来信 */
    if (d.times.letters) {
      html += sec('往来信件');
      d.letters.slice(0, 3).forEach(function (l) {
        html += '<p class="arp__li"><b>' + fmtDate(l.at) + '</b>　' +
          esc(oneLine(l.title, 30)) + (l.mood ? '　<em>' + esc(l.mood) + '</em>' : '') + '</p>';
      });
      if (d.times.letters > 3) {
        html += '<p class="arp__li"><em>以及另外 ' + (d.times.letters - 3) + ' 封，收信站里都留着。</em></p>';
      }
    }

    /* 起源 */
    var origin = (d.profile && d.profile.origin) || d.origin || '';
    var firstLine = [];
    if (origin === 'relay') firstLine.push('这段档案从一次「像，是 TA」的确认开始。');
    else if (d.origin === 'profile') firstLine.push('这段档案从连接仪式的长期档案里生长出来。');
    else if (d.origin === 'name') firstLine.push('这段档案由 TA 的名字自己聚拢起来。');
    else firstLine.push('还没有名字，但墙已经记住了 TA 的声音。');
    if (d.firstAt && isFinite(d.firstAt)) {
      firstLine.push('最早的一笔在 ' + fmtDate(d.firstAt) + '。');
    }
    html += sec('档案说明');
    html += '<p class="arp__txt"><em>' + firstLine.join('') + '</em></p>';

    html += '<div class="arp__acts">';
    html += '<a class="ar-btn" href="' + (window.DA_LINK ? DA_LINK.fix('relay.html') : 'relay.html') +
      '"><span>去和 TA 传讯</span></a>';
    if (d.relation || d.name) {
      html += '<a class="ar-btn ar-btn--ghost" href="' +
        (window.DA_LINK ? DA_LINK.fix('reading.html?step=ritual') : 'reading.html?step=ritual') +
        '"><span>带着 TA 去占卜</span></a>';
    }
    html += '</div></div>';
    return html;
  }

  function openPop(idx) {
    var d = cache[idx];
    if (!d) return;
    $('#arPopBody').innerHTML = popHTML(d);
    $('#arPop').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closePop() {
    $('#arPop').hidden = true;
    document.body.style.overflow = '';
  }

  /* ══ 启动 ══ */
  function boot() {
    $('#arPop').addEventListener('click', function (e) {
      if (e.target.closest('[data-ar-close]')) closePop();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePop();
    });

    if (!A || A.missing) {
      toast('本地档案层不可用');
      return;
    }
    try { S.migrate(); } catch (e) {}

    if (A.unlocked()) renderOpen();
    else renderLocked();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return { refresh: function () { A.unlocked() ? renderOpen() : renderLocked(); } };
})();
