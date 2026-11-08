/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 星际通讯局 · 页面逻辑
   Letter UI → DA_LETTER（引擎）→ DA_AI（服务层）→ /api/letter（服务端）
   所有按钮都连接真实业务逻辑；生成失败显示错误态，不伪造信件。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var L = window.DA_LETTER, S = window.DA_STORE, AI = window.DA_AI;

  var el = {
    themeGrid: $('#themeGrid'), btnWrite: $('#btnWrite'), heroEnv: $('#heroEnv'),
    wiz: $('#wiz'), wizStep: $('#wizStep'), wizTitle: $('#wizTitle'),
    wizBody: $('#wizBody'), wizPrev: $('#wizPrev'), wizNext: $('#wizNext'),
    reader: $('#reader'), paper: $('#paper'), readerEnv: $('#readerEnv'),
    paperKind: $('#paperKind'), paperTitle: $('#paperTitle'), paperGreet: $('#paperGreet'),
    paperBody: $('#paperBody'), paperSign: $('#paperSign'), paperMeta: $('#paperMeta'),
    readerActs: $('#readerActs'),
    actFav: $('#actFav'), actRegen: $('#actRegen'), actTheme: $('#actTheme'),
    actShare: $('#actShare'), actBack: $('#actBack'),
    panel: $('#panel'), panelTitle: $('#panelTitle'),
    panelFilters: $('#panelFilters'), panelList: $('#panelList'),
    toast: $('#toast')
  };

  /* ── 状态 ─────────────────────────────────────────────────── */
  var wiz = { open: false, step: 0, form: {}, fromReader: false };
  var cur = null;            /* 当前阅读的信件记录 */
  var curForm = null;        /* 生成当前信件时的表单（重生成用） */
  var genTimer = null;

  function toast(msg, ms) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(el.toast._t);
    el.toast._t = setTimeout(function () { el.toast.hidden = true; }, ms || 2400);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ══ 首页：主题区 ══════════════════════════════════════════ */
  function renderThemes() {
    var html = L.THEMES.map(function (t) {
      return '<button class="theme-card" type="button" data-theme="' + t.k + '">' +
             esc(t.cn) + '<small>WRITE A LETTER</small></button>';
    }).join('');
    el.themeGrid.innerHTML = html;
    el.themeGrid.addEventListener('click', function (e) {
      var b = e.target.closest('[data-theme]');
      if (b) openWizard({ theme: b.getAttribute('data-theme') });
    });
  }

  /* ══ 写信向导 ══════════════════════════════════════════════ */
  var STEPS = ['选择角色', '选择关系背景', '选择信件主题', '选择情绪氛围', '补充你想说的话', '寄出我的心意'];
  var STEP_NO = ['第一步 · 共六步', '第二步 · 共六步', '第三步 · 共六步', '第四步 · 共六步', '第五步 · 共六步', '最后一步'];

  function openWizard(pre) {
    wiz.open = true; wiz.step = 0; wiz.fromReader = false;
    wiz.form = Object.assign({ profileId: '', charMode: '', charName: '', charDesc: '',
      relation: '', background: '', theme: '', themeCn: '', mood: '',
      note: '', length: 'standard' }, pre || {});
    el.wiz.hidden = false;
    document.body.style.overflow = 'hidden';
    renderStep();
  }
  function closeWizard() {
    if (genTimer) { clearInterval(genTimer); genTimer = null; }
    wiz.open = false;
    el.wiz.hidden = true;
    document.body.style.overflow = '';
  }

  function optHtml(list, cur, smallOf) {
    return list.map(function (o) {
      var on = cur === o.k ? ' is-on' : '';
      var sm = smallOf && smallOf[o.k] ? '<small>' + esc(smallOf[o.k]) + '</small>' : '';
      return '<button class="opt' + on + '" type="button" data-k="' + o.k + '" data-cn="' + esc(o.cn) + '">' + esc(o.cn) + sm + '</button>';
    }).join('');
  }
  function bindOpts(sel, key, cb) {
    el.wizBody.querySelectorAll(sel + ' .opt').forEach(function (b) {
      b.addEventListener('click', function () {
        wiz.form[key] = b.getAttribute('data-k');
        if (key !== 'profileId' && key !== 'charMode') wiz.form[key + 'Cn'] = b.getAttribute('data-cn') || '';
        el.wizBody.querySelectorAll(sel + ' .opt').forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
        if (cb) cb();
      });
    });
  }

  function renderStep() {
    var f = wiz.form;
    el.wizBody.onclick = null;                 /* 清掉上一步的点击委托，避免跨步残留 */
    el.wizBody.oninput = null;
    el.wizStep.textContent = STEP_NO[wiz.step];
    el.wizTitle.textContent = STEPS[wiz.step];
    el.wizPrev.style.visibility = wiz.step === 0 ? 'hidden' : 'visible';
    el.wizNext.hidden = wiz.step === 5;

    if (wiz.step === 0) { /* ── 选择角色 ── */
      var list = S.profiles.list();
      var small = {};
      list.forEach(function (p) {
        small[p.id] = [p.work ? '《' + p.work + '》' : '', p.traits].filter(Boolean).join(' · ').slice(0, 40);
      });
      var opts = list.map(function (p) {
        var on = f.profileId === p.id && f.charMode === 'saved' ? ' is-on' : '';
        return '<button class="opt' + on + '" type="button" data-k="' + p.id + '">' + esc(p.name) +
               '<small>' + esc(small[p.id] || '长期角色档案') + '</small></button>';
      }).join('');
      el.wizBody.innerHTML =
        '<div class="opt-grid">' + opts +
        '<button class="opt' + (f.charMode === 'temp' ? ' is-on' : '') + '" type="button" data-k="__temp">创建临时角色<small>只为这封信临时设定</small></button>' +
        '<button class="opt' + (f.charMode === 'none' ? ' is-on' : '') + '" type="button" data-k="__none">不选择角色<small>收一封来自星辰的通用幻想信</small></button>' +
        '</div>' +
        '<div id="tempFields" hidden>' +
        '<div class="field"><label>角色名称</label><input id="fCharName" maxlength="40" placeholder="他叫什么，或你怎么称呼他" value="' + esc(f.charName) + '"></div>' +
        '<div class="field"><label>角色设定（可简短）</label><textarea id="fCharDesc" maxlength="300" placeholder="性格、说话方式、你们之间的一两件事…">' + esc(f.charDesc) + '</textarea></div>' +
        '</div>' +
        '<p class="skip-note">已有档案会直接读取，不会要求你重复输入；角色资料只保存在这台设备上。</p>';

      el.wizBody.onclick = function (e) {              /* onclick：重渲染时自动替换，不累积 */
        var b = e.target.closest('.opt');
        if (!b) return;
        var k = b.getAttribute('data-k');
        el.wizBody.querySelectorAll('.opt').forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
        if (k === '__temp') { f.charMode = 'temp'; f.profileId = ''; }
        else if (k === '__none') { f.charMode = 'none'; f.profileId = ''; f.charName = ''; f.charDesc = ''; }
        else { f.charMode = 'saved'; f.profileId = k; }
        var tf = $('#tempFields');
        if (tf) tf.hidden = f.charMode !== 'temp';
      };
      el.wizBody.oninput = function (e) {
        if (e.target.id === 'fCharName') f.charName = e.target.value;
        if (e.target.id === 'fCharDesc') f.charDesc = e.target.value;
      };
      var tf0 = $('#tempFields');
      if (tf0) tf0.hidden = f.charMode !== 'temp';
    }

    if (wiz.step === 1) { /* ── 关系背景 ── */
      el.wizBody.innerHTML =
        '<div class="opt-grid" id="gRel">' + optHtml(L.RELATIONS, f.relation) + '</div>' +
        '<div class="field"><label>补充关系背景（可选）</label>' +
        '<textarea id="fBg" maxlength="500" placeholder="你们怎么认识、正在经历什么、有什么想让 TA 知道的处境…">' + esc(f.background) + '</textarea></div>';
      bindOpts('#gRel', 'relation');
      $('#fBg').addEventListener('input', function (e) { f.background = e.target.value; });
    }

    if (wiz.step === 2) { /* ── 信件主题 ── */
      el.wizBody.innerHTML =
        '<div class="opt-grid opt-grid--3" id="gTheme">' + optHtml(L.THEMES, f.theme) + '</div>' +
        '<div class="field" id="themeCustom" hidden><label>你的自定义主题</label>' +
        '<input id="fThemeCn" maxlength="30" placeholder="例如：考试前夜的鼓励" value="' + esc(f.themeCn || '') + '"></div>';
      bindOpts('#gTheme', 'theme', function () {
        $('#themeCustom').hidden = f.theme !== 'custom';
      });
      $('#fThemeCn').addEventListener('input', function (e) { f.themeCn = e.target.value; });
      if (f.theme === 'custom') $('#themeCustom').hidden = false;
    }

    if (wiz.step === 3) { /* ── 情绪氛围 ── */
      el.wizBody.innerHTML =
        '<div class="opt-grid opt-grid--3" id="gMood">' + optHtml(L.MOODS, f.mood) + '</div>' +
        '<div class="field" id="moodCustom" hidden><label>自定义氛围</label>' +
        '<input id="fMoodCn" maxlength="20" placeholder="例如：夜深了，有点想家" value="' + esc(f.moodCn || '') + '"></div>' +
        '<p class="skip-note">情绪氛围只是底色，不会覆盖角色本身的性格。</p>';
      bindOpts('#gMood', 'mood', function () {
        $('#moodCustom').hidden = f.mood !== 'custom';
      });
      $('#fMoodCn').addEventListener('input', function (e) { f.moodCn = e.target.value; });
      if (f.mood === 'custom') $('#moodCustom').hidden = false;
    }

    if (wiz.step === 4) { /* ── 补充 + 长度 ── */
      el.wizBody.innerHTML =
        '<div class="field"><label>今天，有什么特别想让 TA 知道的吗？（可跳过）</label>' +
        '<textarea id="fNote" maxlength="400" placeholder="最近的心情、想分享的事、想让 TA 回应的一句话…">' + esc(f.note) + '</textarea>' +
        '<p class="hint" id="noteHint">0 / 400</p></div>' +
        '<div class="field"><label>信件长度</label><div class="opt-grid" id="gLen">' +
        optHtml(L.LENGTHS, f.length) + '</div></div>';
      var note = $('#fNote');
      note.addEventListener('input', function () {
        f.note = note.value;
        $('#noteHint').textContent = note.value.length + ' / 400';
      });
      $('#noteHint').textContent = note.value.length + ' / 400';
      bindOpts('#gLen', 'length');
    }

    if (wiz.step === 5) { /* ── 确认 + 寄出 ── */
      var p = L.resolveCharacter(f);
      var who = p.profile ? (p.charName || '已选档案') : (f.charMode === 'temp' ? (f.charName || '临时角色') : '星辰（通用幻想信）');
      var rel = f.relation ? L.cnOf(L.RELATIONS, f.relation) : '未指定';
      var theme = f.theme === 'custom' ? (f.themeCn || '自定义') : L.cnOf(L.THEMES, f.theme);
      el.wizBody.innerHTML =
        '<div class="gen" id="genBox">' +
        '<div class="gen__env"><i></i><i></i></div>' +
        '<p class="gen__line" id="genLine">正在整理你们的故事……</p>' +
        '<div class="gen__bar"><i></i></div>' +
        '<p class="skip-note">' + esc(who) + ' · ' + esc(rel) + ' · 《' + esc(theme) + '》</p>' +
        '</div>';
      sendLetter();
    }
  }

  var GEN_LINES = ['正在整理你们的故事……', '正在寻找合适的表达……', '正在让字句贴合 TA 的语气……',
                   '正在把想念折进信纸……', '正在为这封信写下最后一句话……'];

  function sendLetter() {
    var f = wiz.form;
    var btn = $('#wizNext');
    var send = $('#wizSend') || el.wizNext;
    send.disabled = true; send.classList.add('is-busy');
    var i = 0;
    genTimer = setInterval(function () {
      var line = $('#genLine');
      if (line) line.textContent = GEN_LINES[(++i) % GEN_LINES.length];
    }, 2600);

    L.generate(f).then(function (r) {
      clearInterval(genTimer); genTimer = null;
      var rec = L.saveRecord(L.toRecord(r, f));
      curForm = JSON.parse(JSON.stringify(f));
      closeWizard();
      openReader(rec, true);
    }).catch(function (e) {
      clearInterval(genTimer); genTimer = null;
      send.disabled = false; send.classList.remove('is-busy');
      el.wizBody.innerHTML =
        '<div class="err">' +
        '<p>这封信没能寄出去</p>' +
        '<small>' + esc(e.message || '未知错误') + '</small>' +
        '<button type="button" id="errRetry">再试一次</button>' +
        '<p class="skip-note">你的角色与关系背景都已保留，不会丢失。</p>' +
        '</div>';
      $('#errRetry').addEventListener('click', renderStep);
    });
  }

  /* ══ 信件阅读器 ════════════════════════════════════════════ */
  function fillPaper(rec) {
    cur = rec;
    el.paperKind.textContent = (rec.kind === 'daily' ? '今日星际来信 · ' : '') +
      (rec.letterType || '') + (rec.mood ? ' · ' + rec.mood : '');
    el.paperTitle.textContent = rec.title || '一封信';
    el.paperGreet.textContent = rec.greeting || '';
    el.paperBody.innerHTML = String(rec.body || '').split(/\n{2,}/).map(function (p) {
      return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>';
    }).join('');
    el.paperSign.textContent = rec.signature || '';
    var meta = [];
    if (rec.charName) meta.push(rec.charName);
    if (rec.relationCn) meta.push(rec.relationCn);
    if (rec.at) meta.push(S.dateCn(rec.at) + ' ' + S.timeCn(rec.at));
    el.paperMeta.textContent = meta.join(' · ');
    el.actFav.classList.toggle('is-on', !!rec.faved);
    el.actFav.textContent = rec.faved ? '已收藏 ✦' : '收藏这封信';
  }

  function openReader(rec, withEnvelope) {
    fillPaper(rec);
    el.reader.hidden = false;
    document.body.style.overflow = 'hidden';
    el.paper.hidden = true;
    el.readerActs.hidden = true;
    el.readerEnv.style.display = '';

    if (!withEnvelope) { /* 从档案打开：直接呈现信纸 */
      el.readerEnv.style.display = 'none';
      el.paper.hidden = false;
      el.readerActs.hidden = false;
      return;
    }
    /* 新信：信封发光 → 打开 → 信纸展开 → 署名淡入（不强制长延迟） */
    setTimeout(function () {
      el.reader.classList.add('is-open');
      setTimeout(function () {
        el.readerEnv.style.display = 'none';
        el.paper.hidden = false;
        el.readerActs.hidden = false;
      }, 950);
    }, 700);
  }
  function closeReader() {
    el.reader.hidden = true;
    el.reader.classList.remove('is-open');
    el.paper.hidden = true;          /* 复位，避免下次打开前闪现上一封 */
    el.readerActs.hidden = true;
    document.body.style.overflow = '';
  }

  /* ══ 面板：档案 / 收藏 / 今日 / 角色档案 ═══════════════════ */
  var panelMode = 'archive';
  var filter = { faved: false, char: '', theme: '' };

  function openPanel(mode) {
    panelMode = mode;
    filter = { faved: mode === 'favs', char: '', theme: '' };
    el.panel.hidden = false;
    document.body.style.overflow = 'hidden';
    renderPanel();
  }
  function closePanel() {
    el.panel.hidden = true;
    document.body.style.overflow = '';
  }

  function renderPanel() {
    el.panelFilters.hidden = !(panelMode === 'archive');
    if (panelMode === 'archive') { el.panelTitle.textContent = '我的信件档案'; renderArchive(); }
    else if (panelMode === 'favs') { el.panelTitle.textContent = '收藏的信件'; renderFavs(); }
    else if (panelMode === 'daily') { el.panelTitle.textContent = '今日星际来信'; renderDaily(); }
    else if (panelMode === 'profiles') { el.panelTitle.textContent = '角色档案'; renderProfiles(); }
  }

  function cardHtml(l, showDel) {
    var mark = l.kind === 'daily' ? ' is-daily' : '';
    return '<div class="lt-card' + mark + '" data-id="' + l.id + '" role="button" tabindex="0">' +
      '<h3>' + esc(l.title) + '</h3>' +
      '<p>' + esc([l.charName || '星辰', l.letterType].filter(Boolean).join(' · ')) + '</p>' +
      '<time>' + esc(S.dateCn(l.at)) + '</time>' +
      (l.faved ? '<span class="lt-fav">✦ 已收藏</span>' : '') +
      (showDel ? '<button class="lt-del" type="button" data-del="' + l.id + '" aria-label="删除这封信">删除</button>' : '') +
      '</div>';
  }

  function renderArchive() {
    var all = S.letters.list();
    /* 筛选条：全部 / 只看收藏 / 角色 / 主题 */
    var chars = [], themes = [];
    all.forEach(function (l) {
      var c = l.charName || '星辰';
      if (chars.indexOf(c) < 0) chars.push(c);
      if (l.letterType && themes.indexOf(l.letterType) < 0) themes.push(l.letterType);
    });
    el.panelFilters.innerHTML =
      '<button type="button" data-f="all" class="' + (!filter.faved ? 'is-on' : '') + '">全部</button>' +
      '<button type="button" data-f="faved" class="' + (filter.faved ? 'is-on' : '') + '">只看收藏</button>' +
      '<select id="fChar" aria-label="按角色筛选"><option value="">全部角色</option>' +
      chars.map(function (c) { return '<option' + (filter.char === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') +
      '</select>' +
      '<select id="fTheme" aria-label="按主题筛选"><option value="">全部主题</option>' +
      themes.map(function (t) { return '<option' + (filter.theme === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') +
      '</select>';

    var list = all.filter(function (l) {
      if (filter.faved && !l.faved) return false;
      if (filter.char && (l.charName || '星辰') !== filter.char) return false;
      if (filter.theme && l.letterType !== filter.theme) return false;
      return true;
    });

    el.panelList.innerHTML = list.length
      ? list.map(function (l) { return cardHtml(l, true); }).join('')
      : '<div class="empty">还没有信件落在这里<small>回到大厅，写第一封属于你们的信</small></div>';

    el.panelFilters.onclick = function (e) {
      var b = e.target.closest('[data-f]');
      if (!b) return;
      filter.faved = b.getAttribute('data-f') === 'faved';
      renderPanel();
    };
    var fc = $('#fChar'), ft = $('#fTheme');
    if (fc) fc.onchange = function () { filter.char = fc.value; renderArchive(); };
    if (ft) ft.onchange = function () { filter.theme = ft.value; renderArchive(); };

    el.panelList.onclick = function (e) {
      var d = e.target.closest('[data-del]');
      if (d) {
        var id = d.getAttribute('data-del');
        var rec = S.letters.get(id);
        if (rec && window.confirm('删除《' + (rec.title || '这封信') + '》？删除后无法恢复。')) {
          S.letters.setFaved(id, false);
          S.letters.remove(id);
          toast('已删除');
          renderPanel();
        }
        return;
      }
      var c = e.target.closest('.lt-card');
      if (c) {
        var l = S.letters.get(c.getAttribute('data-id'));
        if (l) { closePanel(); openReader(l, false); }
      }
    };
    el.panelList.onkeydown = function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var c = e.target.closest('.lt-card');
      if (c) { e.preventDefault(); c.click(); }
    };
  }

  function renderFavs() {
    var list = S.letters.list().filter(function (l) { return l.faved; });
    el.panelList.innerHTML = list.length
      ? list.map(function (l) { return cardHtml(l, false); }).join('')
      : '<div class="empty">还没有收藏的信<small>在信件底端点亮「收藏这封信」</small></div>';
    el.panelList.onclick = function (e) {
      var c = e.target.closest('.lt-card');
      if (c) {
        var l = S.letters.get(c.getAttribute('data-id'));
        if (l) { closePanel(); openReader(l, false); }
      }
    };
  }

  /* ── 今日星际来信 ────────────────────────────────────────── */
  function dailyPtr() {
    try { return JSON.parse(localStorage.getItem('DA2_DAILY_LETTER') || 'null'); }
    catch (e) { return null; }
  }

  function renderDaily() {
    var ptr = dailyPtr();
    var today = ptr && ptr.date === L.dayKey() ? S.letters.get(ptr.id) : null;
    var profiles = S.profiles.list();
    var pick = profiles.length
      ? '<div class="field" style="max-width:280px;margin:14px auto 0;text-align:left"><label>选择角色（可选）</label>' +
        '<select id="dailyChar"><option value="">星辰（通用幻想信）</option>' +
        profiles.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('') +
        '</select></div>'
      : '';

    el.panelList.innerHTML =
      '<div class="daily-hero">' +
      '<p class="dt">' + esc(L.DAILY_THEMES[L.dayIdx() % L.DAILY_THEMES.length]) + '</p>' +
      (today
        ? '<p>今天的星笺已经送达。</p>' +
          '<button type="button" id="dailyOpen">重新读这封信</button>' +
          '<button type="button" id="dailyNew" style="margin-left:8px">再抽一张星笺</button>' +
          '<p class="daily-note">「再抽一张」是一封全新的 AI 创作信件，与刚才那封不同。</p>'
        : '<p>今天还没有你的信。</p>' + pick +
          '<button type="button" id="dailyGo" style="margin-top:14px">领取今日来信</button>' +
          '<p class="daily-note">每天一张星笺，由 AI 依当日主题即时创作。</p>') +
      '</div>';

    var go = $('#dailyGo');
    if (go) go.addEventListener('click', function () {
      go.disabled = true; go.textContent = '星笺飞行中……';
      genDaily($('#dailyChar') ? $('#dailyChar').value : '', go);
    });
    var open = $('#dailyOpen');
    if (open) open.addEventListener('click', function () { closePanel(); openReader(today, false); });
    var fresh = $('#dailyNew');
    if (fresh) fresh.addEventListener('click', function () {
      fresh.disabled = true; fresh.textContent = '新的星笺书写中……';
      genDaily(ptr && ptr.profileId || '', fresh);
    });
  }

  function genDaily(profileId, btn) {
    var form = {
      profileId: profileId || '', length: 'short',
      theme: '', themeCn: L.DAILY_THEMES[L.dayIdx() % L.DAILY_THEMES.length],
      relation: '', background: '', mood: '', note: ''
    };
    L.generate(form, 'daily').then(function (r) {
      var rec = L.saveRecord(L.toRecord(r, form, { kind: 'daily' }));
      try { localStorage.setItem('DA2_DAILY_LETTER', JSON.stringify({ date: L.dayKey(), id: rec.id, profileId: profileId || '' })); } catch (e) {}
      closePanel();
      openReader(rec, true);
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = '再试一次';
      toast(e.message || '星笺没能送达');
    });
  }

  /* ── 角色档案（只读 + 指引） ─────────────────────────────── */
  function renderProfiles() {
    var list = S.profiles.list();
    el.panelList.innerHTML = list.length
      ? list.map(function (p) {
          return '<div class="lt-card"><h3>' + esc(p.name) + '</h3>' +
            '<p>' + esc([p.work ? '《' + p.work + '》' : '', p.traits, p.speech].filter(Boolean).join(' · ').slice(0, 60) || '长期角色档案') + '</p></div>';
        }).join('')
      : '<div class="empty">还没有角色档案<small>在塔罗观测站的连接仪式里保存过角色后，会出现在这里</small></div>';
  }

  /* ══ 阅读器操作 ════════════════════════════════════════════ */
  el.actFav.addEventListener('click', function () {
    if (!cur) return;
    var on = !cur.faved;
    S.letters.setFaved(cur.id, on);
    cur.faved = on;
    el.actFav.classList.toggle('is-on', on);
    el.actFav.textContent = on ? '已收藏 ✦' : '收藏这封信';
    toast(on ? '已收进信件档案的收藏架' : '已取消收藏');
  });
  el.actRegen.addEventListener('click', function () {
    if (!curForm) { toast('这封信来自档案，无法直接重写'); return; }
    closeReader();
    openWizard(curForm);
    wiz.step = 5; renderStep();
  });
  el.actTheme.addEventListener('click', function () {
    if (!curForm) { toast('这封信来自档案，无法直接重写'); return; }
    closeReader();
    openWizard(curForm);
    wiz.step = 2; renderStep();
  });
  el.actShare.addEventListener('click', function () {
    if (!cur) return;
    var text = '《' + cur.title + '》\n' + (cur.greeting ? cur.greeting + '\n\n' : '') +
               cur.body + '\n\n—— ' + (cur.signature || '') + '\n\n· DIMENSION ANCHOR 星际通讯局';
    if (navigator.share) {
      navigator.share({ title: cur.title || '一封来自星辰的信', text: text }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { toast('信已复制，可粘贴给想给的人'); },
                                              function () { toast('复制未成功'); });
    } else { toast('当前环境不支持分享'); }
  });
  el.actBack.addEventListener('click', closeReader);

  /* ══ 全局绑定 ══════════════════════════════════════════════ */
  el.btnWrite.addEventListener('click', function () { openWizard(); });
  el.heroEnv.addEventListener('click', function () { openWizard(); });
  $('#btnArchive').addEventListener('click', function () { openPanel('archive'); });
  $('#btnProfiles').addEventListener('click', function () { openPanel('profiles'); });
  document.querySelectorAll('[data-open]').forEach(function (b) {
    b.addEventListener('click', function () { openPanel(b.getAttribute('data-open')); });
  });

  el.wizPrev.addEventListener('click', function () {
    if (wiz.step > 0) { wiz.step--; renderStep(); }
  });
  el.wizNext.addEventListener('click', function () {
    /* 第 0 步要求一个明确选择；其余步骤均可跳过 */
    if (wiz.step === 0 && !wiz.form.profileId && !wiz.form.charMode) { toast('选一位角色，或选择「不选择角色」'); return; }
    if (wiz.step === 0 && wiz.form.charMode === 'temp' && !wiz.form.charName.trim()) { toast('给临时角色起个名字吧'); return; }
    if (wiz.step < 5) { wiz.step++; renderStep(); }
  });
  /* 第 6 步「寄出」由 renderStep 自动触发；next 按钮在该步隐藏 */

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-wiz-close]')) closeWizard();
    if (e.target.closest('[data-reader-close]')) closeReader();
    if (e.target.closest('[data-panel-close]')) closePanel();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!el.wiz.hidden) closeWizard();
    else if (!el.reader.hidden) closeReader();
    else if (!el.panel.hidden) closePanel();
  });
  window.addEventListener('beforeunload', function () {
    if (genTimer) clearInterval(genTimer);
  });

  /* ══ 启动 ══════════════════════════════════════════════════ */
  if (S) S.migrate();
  L.markRead();
  renderThemes();
  AI.probe();   /* 提前探活，寄信时少一次等待 */
})();
