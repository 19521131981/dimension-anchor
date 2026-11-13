/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 角色档案库 DA_ARCHIVE（共享数据层）
   ----------------------------------------------------------------------
   「档案室」的数据引擎：所有占卜（梦占）、实时传讯、星际来信都会
   流进这里，被自动整理成一个个「角色档案」——不需要用户填写任何字段。

     · 开放条件：占卜 + 传讯 + 来信 总次数 ≥ 3，档案室自动解锁
     · 角色聚合：以长期档案（profile）为锚；没有档案的按名字聚合；
       匿名连接归入「未确认的信号」
     · 常说的话：从 TA 的传讯消息与信件里自动摘取（重复出现的短句优先）
     · summary()：给 AI 用的紧凑档案，注入传讯与所有占卜解读的提示词

   页面只需读这个模块，不需要自己再去翻 DA_STORE 的各个库。
   ══════════════════════════════════════════════════════════════════════ */

window.DA_ARCHIVE = (function () {
  'use strict';

  var S = window.DA_STORE;
  var UNLOCK_AT = 3;

  if (!S) return { missing: true };

  /* ── 计数：占卜 + 传讯 + 来信 ─────────────────────────────── */
  function letterList() {
    try {
      var arr = S.letters.list().filter(function (l) {
        return l.direction === 'in' && l.status !== 'draft';
      });
      return arr;
    } catch (e) { return []; }
  }

  function counts() {
    var rs = S.readings.list();
    var ts = S.threads.list();
    var ls = letterList();
    var total = rs.length + ts.length + ls.length;
    return { readings: rs.length, threads: ts.length, letters: ls.length, total: total };
  }

  function unlocked() { return counts().total >= UNLOCK_AT; }
  function remain() {
    var n = UNLOCK_AT - counts().total;
    return n > 0 ? n : 0;
  }

  /* ── 名字归一：聚合不同来源的同一个角色 ──────────────────── */
  function normName(s) {
    return String(s == null ? '' : s).replace(/[\s《》「」『』·•]/g, '').toLowerCase();
  }

  function isBlank(s) { return !String(s == null ? '' : s).trim(); }

  /* ── 常说的话：TA 的传讯消息 + 信件的开场/署名 ───────────── */
  function catchFor(lines) {
    /* lines: TA 说过的句子数组（已按时间升序） */
    var freq = {}, order = [];
    (lines || []).forEach(function (raw) {
      var t = String(raw || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 26) return;
      if (!freq[t]) { freq[t] = 0; order.push(t); }
      freq[t]++;
    });
    /* 重复说过的句子优先；其次是最近的 */
    var scored = order.map(function (t, i) {
      return { t: t, n: freq[t], i: i };
    });
    scored.sort(function (a, b) {
      if (b.n !== a.n) return b.n - a.n;
      return b.i - a.i;
    });
    var out = [], seen = {};
    for (var k = 0; k < scored.length && out.length < 3; k++) {
      var s = scored[k].t;
      if (seen[s]) continue;
      seen[s] = 1;
      out.push(s);
    }
    return out;
  }

  function taLinesOf(char) {
    var lines = [];
    (char.threads || []).forEach(function (t) {
      (t.messages || []).forEach(function (m) {
        if (m.role === 'ta' && !m.initial) lines.push(m.text);
      });
    });
    (char.letters || []).forEach(function (l) {
      if (l.greeting) lines.push(l.greeting);
      if (l.signature) lines.push(l.signature);
    });
    return lines;
  }

  /* ── 角色聚合 ─────────────────────────────────────────────── */
  /* 返回 [{
     key, profileId, name, work, role, relation,
     traits, speech, values, history, relayFirst,
     origin: 'profile' | 'name' | 'unknown',
     readings:[], threads:[], letters:[],
     lastAt, times:{readings,threads,letters}
   }] */
  function dossiers() {
    var map = {};      /* key → dossier */
    var byName = {};    /* normName → key */
    var list = [];

    function ensure(key) {
      if (!map[key]) { map[key] = { key: key, readings: [], threads: [], letters: [] }; list.push(map[key]); }
      return map[key];
    }
    function linkName(name) {
      var n = normName(name);
      return byName[n] || null;
    }
    function claim(d, name) {
      if (isBlank(d.name)) d.name = name;
      var n = normName(name);
      if (n && !byName[n]) byName[n] = d.key;
    }

    /* ① 长期档案（用户手动保存的 + 传讯确认时自动建的） */
    S.profiles.list().forEach(function (p) {
      var d = ensure('p:' + p.id);
      d.profileId = p.id;
      d.profile = p;
      d.origin = d.origin === 'name' ? 'profile' : (d.origin || 'profile');
      claim(d, p.name);
      if (!isBlank(p.name)) d.name = p.name;
      d.work = p.work || d.work || '';
      d.role = p.role || d.role || '';
      d.relation = p.relation || d.relation || '';
      d.traits = p.traits || '';
      d.speech = p.speech || '';
      d.values = p.values || '';
      d.history = p.history || '';
      if (p.relayFirst) d.relayFirst = p.relayFirst;
    });

    /* ② 传讯会话 */
    S.threads.list().forEach(function (t) {
      var d = null;
      if (t.profileId && map['p:' + t.profileId]) d = map['p:' + t.profileId];
      var nm = t.link && t.link.subjectName;
      if (!d && !isBlank(nm)) d = map[linkName(nm)] || null;
      if (!d && !isBlank(nm)) {
        d = ensure('n:' + normName(nm));
        d.origin = d.origin || 'name';
        d.name = nm;
        claim(d, nm);
      }
      if (!d) {
        d = ensure('u:unknown');
        d.origin = 'unknown';
        if (isBlank(d.name)) d.name = '未确认的信号';
      }
      d.threads.push(t);
      var rel = t.link && t.link.relation;
      if (rel && isBlank(d.relation)) d.relation = rel;
      var ts = (t.updatedAt || t.at || 0);
      d.lastAt = Math.max(d.lastAt || 0, ts);
    });

    /* ③ 梦占记录 */
    S.readings.list().forEach(function (r) {
      var d = null;
      if (r.profileId && map['p:' + r.profileId]) d = map['p:' + r.profileId];
      var nm = r.link && r.link.subjectName;
      if (!d && !isBlank(nm)) d = map[linkName(nm)] || null;
      if (!d && !isBlank(nm)) {
        d = ensure('n:' + normName(nm));
        d.origin = d.origin || 'name';
        d.name = nm;
        claim(d, nm);
      }
      if (d) {
        d.readings.push(r);
        d.lastAt = Math.max(d.lastAt || 0, r.at || 0);
      }
    });

    /* ④ 来信 */
    letterList().forEach(function (l) {
      var d = null;
      if (l.charId && map['p:' + l.charId]) d = map['p:' + l.charId];
      if (!d && !isBlank(l.charName)) d = map[linkName(l.charName)] || null;
      if (!d && !isBlank(l.charName)) {
        d = ensure('n:' + normName(l.charName));
        d.origin = d.origin || 'name';
        d.name = l.charName;
        claim(d, l.charName);
      }
      if (!d) {
        d = ensure('u:unknown');
        d.origin = 'unknown';
        if (isBlank(d.name)) d.name = '未确认的信号';
      }
      d.letters.push(l);
      var rel = l.relationCn;
      if (rel && isBlank(d.relation)) d.relation = rel;
      d.lastAt = Math.max(d.lastAt || 0, l.at || 0);
    });

    /* ⑤ 派生字段 */
    list.forEach(function (d) {
      d.times = {
        readings: (d.readings || []).length,
        threads: (d.threads || []).length,
        letters: (d.letters || []).length
      };
      d.messages = 0;
      (d.threads || []).forEach(function (t) {
        d.messages += (t.messages || []).filter(function (m) { return !m.initial || true; }).length;
      });
      d.catch = catchFor(taLinesOf(d));
      d.firstAt = Math.min.apply(null, [(d.readings[0] && d.readings[0].at) || Infinity,
                                        (d.threads[0] && d.threads[0].at) || Infinity,
                                        (d.letters[0] && d.letters[0].at) || Infinity].concat(
        (d.readings || []).map(function (r) { return r.at || Infinity; }).concat(
        (d.threads || []).map(function (t) { return t.at || Infinity; })).concat(
        (d.letters || []).map(function (l) { return l.at || Infinity; }))));
      if (!isFinite(d.firstAt)) d.firstAt = d.lastAt || Date.now();
      if (!isBlank(d.relayFirst) && isBlank(d.traits)) d.traits = d.relayFirst;
    });

    list.sort(function (a, b) { return (b.lastAt || 0) - (a.lastAt || 0); });
    return list;
  }

  function byProfile(pid) {
    var all = dossiers();
    for (var i = 0; i < all.length; i++) if (all[i].profileId === pid) return all[i];
    return null;
  }

  /* ── 给 AI 的紧凑档案（注入所有占卜 / 传讯提示词） ─────────── */
  function summary(pid) {
    var d = pid ? byProfile(pid) : null;
    if (!d) {
      /* 找不到档案时退回 profiles.summary，保证旧链路可用 */
      return S.profiles.summary(pid);
    }
    var bits = [];
    if (d.name) bits.push('名称：' + d.name);
    if (d.work) bits.push('来源：' + d.work);
    if (d.role) bits.push('身份：' + d.role);
    if (d.traits) bits.push('性格：' + d.traits);
    if (d.values) bits.push('价值观：' + d.values);
    if (d.speech) bits.push('语言习惯：' + d.speech);
    if (d.relation) bits.push('关系：' + d.relation);
    if ((d.catch || []).length) bits.push('TA 常说的话（语气参考，不要照抄）：' + d.catch.join('；'));
    if (d.times) {
      var exp = [];
      if (d.times.readings) exp.push(d.times.readings + ' 次梦占');
      if (d.times.threads) exp.push(d.times.threads + ' 次传讯');
      if (d.times.letters) exp.push(d.times.letters + ' 封往来信件');
      if (exp.length) bits.push('你们已有的往来：' + exp.join('，'));
    }
    return bits.join('；');
  }

  return {
    UNLOCK_AT: UNLOCK_AT,
    counts: counts,
    unlocked: unlocked,
    remain: remain,
    dossiers: dossiers,
    byProfile: byProfile,
    summary: summary,
    catchFor: catchFor
  };
})();
