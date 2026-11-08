/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 本地档案层（第二阶段）
   ----------------------------------------------------------------------
   一个入口管全部本地数据，全部存在浏览器 localStorage 里，不上传：

     profiles  长期角色档案（用户主动保存的性格 / 语言习惯 / 经历 …）
     session   本次连接（对象、关系、问题、背景、临时设定，含 profileId）
     readings  梦占记录（完整牌阵 + 六章解读 + 补充牌 + 追问 + 版本）
     threads   实时传讯会话（独立会话 ID、消息流、关联梦占）
     favs      收藏夹（单牌 / 解读片段 / TA想对你说 / 补充牌 / 整条记录）
     notes     私人手记

   规则：长期档案只在用户明确保存时更新；历史记录一旦落盘就不随档案变化。
   ══════════════════════════════════════════════════════════════════════ */

window.DA_STORE = (function () {
  'use strict';

  var K = {
    profiles: 'DA2_PROFILES',
    readings: 'DA2_READINGS',
    threads:  'DA2_THREADS',
    favs:     'DA2_FAVS',
    notes:    'DA2_NOTES',
    session:  'DA2_SESSION',
    letters:  'DA2_LETTERS',   /* 星际通讯局 · 信件档案 */
    /* 第一阶段留下的键，只读兼容 */
    v1Link:    'DA_LINK_SESSION',
    v1Reading: 'DA_LAST_READING',
    v1Fav:     'DA_FAV_READINGS'
  };

  var MAX = { readings: 200, threads: 60, favs: 300, notes: 300, profiles: 40, letters: 300 };

  /* ── 基础 ────────────────────────────────────────────────── */
  function nid(p) {
    return (p || 'x') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  function get(k, dflt) {
    try {
      var raw = localStorage.getItem(k);
      if (!raw) return dflt;
      var v = JSON.parse(raw);
      return v == null ? dflt : v;
    } catch (e) { return dflt; }
  }
  function set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  }
  function list(k) { var v = get(k, []); return Array.isArray(v) ? v : []; }
  function push(k, rec, cap) {
    var arr = list(k);
    arr.unshift(rec);
    if (cap && arr.length > cap) arr.length = cap;
    set(k, arr);
    return rec;
  }
  function drop(k, id) {
    var arr = list(k).filter(function (r) { return r.id !== id; });
    set(k, arr);
    return arr;
  }
  function find(k, id) {
    var arr = list(k);
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }
  function update(k, id, patch) {
    var arr = list(k), hit = null;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) {
        arr[i] = Object.assign({}, arr[i], patch, { updatedAt: Date.now() });
        hit = arr[i];
      }
    }
    if (hit) set(k, arr);
    return hit;
  }

  function now() { return Date.now(); }
  function dateCn(ts) {
    return new Date(ts || now()).toLocaleDateString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
  }
  function timeCn(ts) {
    return new Date(ts || now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  /* ══ 一 · 长期角色档案 Profile ═══════════════════════════ */
  var PROFILE_FIELDS = [
    { k: 'name',     cn: '角色名称',   ph: '他叫什么，或者你怎么称呼他' },
    { k: 'work',     cn: '作品来源',   ph: '来自哪本书 / 哪部剧 / 哪段真实生活' },
    { k: 'role',     cn: '角色身份',   ph: '他在那个世界里的位置' },
    { k: 'traits',   cn: '性格特征',   ph: '外冷内热、说话很慢、总先听完再说……' },
    { k: 'values',   cn: '价值观',     ph: '他最看重什么，最不能忍什么' },
    { k: 'speech',   cn: '语言习惯',   ph: '句子短、爱用反问、从不说软话……' },
    { k: 'habits',   cn: '行为习惯',   ph: '紧张时会做什么，习惯怎么表达关心' },
    { k: 'history',  cn: '角色经历',   ph: '你们之间发生过什么，或他经历过什么' },
    { k: 'relation', cn: '关系背景',   ph: '你和他是什么关系' }
  ];

  var profiles = {
    fields: PROFILE_FIELDS,
    list: function () { return list(K.profiles); },
    get: function (id) { return find(K.profiles, id); },
    save: function (p) {
      var rec = clone(p || {});
      if (!rec.name) rec.name = '未命名角色';
      if (rec.id && find(K.profiles, rec.id)) {
        return update(K.profiles, rec.id, rec);
      }
      rec.id = rec.id || nid('pf');
      rec.createdAt = now();
      rec.updatedAt = now();
      return push(K.profiles, rec, MAX.profiles);
    },
    remove: function (id) { return drop(K.profiles, id); },
    /* 给 AI 用的压缩摘要：只留与说话方式有关的字段 */
    summary: function (id) {
      var p = id ? find(K.profiles, id) : null;
      if (!p) return '';
      var bits = [];
      if (p.name) bits.push('名称：' + p.name);
      if (p.work) bits.push('来源：' + p.work);
      if (p.role) bits.push('身份：' + p.role);
      if (p.traits) bits.push('性格：' + p.traits);
      if (p.values) bits.push('价值观：' + p.values);
      if (p.speech) bits.push('语言习惯：' + p.speech);
      if (p.habits) bits.push('行为习惯：' + p.habits);
      if (p.history) bits.push('经历：' + p.history);
      if (p.relation) bits.push('关系：' + p.relation);
      return bits.join('；');
    }
  };

  /* ══ 二 · 本次连接 Session ═══════════════════════════════ */
  var session = {
    /* 连接仪式写入；字段与第一阶段一致，多了 question / profileId / tempOnly */
    get: function () {
      var s = get(K.session, null);
      if (s) return s;
      var legacy = get(K.v1Link, null);
      return legacy || null;
    },
    save: function (o) {
      var rec = clone(o || {});
      rec.savedAt = now();
      set(K.session, rec);
      try { localStorage.setItem(K.v1Link, JSON.stringify(rec)); } catch (e) {}
      return rec;
    },
    clear: function () {
      try { localStorage.removeItem(K.session); localStorage.removeItem(K.v1Link); } catch (e) {}
    },
    /* 展示用的一句话情境 */
    brief: function (s) {
      s = s || session.get() || {};
      var bits = [];
      if (s.subjectName) bits.push(s.subjectName);
      if (s.workName) bits.push('《' + s.workName + '》');
      if (s.relation) bits.push(s.relation);
      return bits.join(' · ');
    }
  };

  /* ══ 三 · 梦占记录 Readings ══════════════════════════════ */
  function recordFromSession(sess, link, result, extra) {
    extra = extra || {};
    var cards = (sess.cards || []).filter(function (c) { return c.placed; });
    return {
      id: sess.id || nid('rd'),
      at: sess.createdAt || sess.at || now(),
      updatedAt: now(),
      title: extra.title ||
        ((link && link.subjectName ? link.subjectName + ' · ' : '') + (sess.spreadCn || '塔罗牌阵')),
      question: (link && link.question) || '',
      deckMode: sess.deckMode || 78,
      spreadKey: sess.spreadKey || (sess.spread && sess.spread.key) || '',
      spreadCn: sess.spreadCn || '',
      link: clone(link || {}),
      profileId: (link && link.profileId) || '',
      cards: cards.map(function (c) {
        return {
          slot: c.slot, id: c.id, cn: c.cn, en: c.en,
          reversed: !!c.reversed, positionCn: c.positionCn,
          positionDesc: c.positionDesc || '', supp: !!c.supp
        };
      }),
      flipOrder: cards.filter(function (c) { return c.revealOrder; })
        .sort(function (a, b) { return a.revealOrder - b.revealOrder; })
        .map(function (c) { return c.slot; }),
      chapters: clone((result && result.chapters) || []),
      supp: extra.supp || [],
      thread: extra.thread || [],
      version: extra.version || 'local-v1',
      source: extra.source || 'local',
      note: ''
    };
  }

  var readings = {
    list: function () {
      return list(K.readings).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    },
    get: function (id) { return find(K.readings, id); },
    /* 同一个会话反复保存时是更新，不是新增 */
    save: function (rec) {
      var arr = list(K.readings);
      var idx = -1;
      for (var i = 0; i < arr.length; i++) if (arr[i].id === rec.id) { idx = i; break; }
      rec.updatedAt = now();
      if (idx >= 0) arr[idx] = Object.assign({}, arr[idx], rec);
      else arr.unshift(rec);
      arr.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      if (arr.length > MAX.readings) arr.length = MAX.readings;
      set(K.readings, arr);
      return rec;
    },
    fromSession: recordFromSession,
    patch: function (id, patch) { return update(K.readings, id, patch); },
    remove: function (id) { return drop(K.readings, id); },
    /* 导出成纯文本，落盘由页面负责 */
    toText: function (rec) {
      var L = rec.link || {};
      var out = [];
      out.push('DIMENSION ANCHOR · 观测档案');
      out.push('记录标题：' + (rec.title || '未命名'));
      out.push('日期：' + new Date(rec.at || now()).toLocaleString('zh-CN'));
      if (rec.question) out.push('本次问题：' + rec.question);
      if (L.subjectName) out.push('连接对象：' + L.subjectName + (L.relation ? '（' + L.relation + '）' : ''));
      if (L.workName) out.push('作品来源：《' + L.workName + '》');
      if (L.background) out.push('连接背景：' + L.background);
      out.push('牌组：' + (rec.deckMode === 22 ? '22 张大阿尔卡那' : '完整 78 张'));
      out.push('牌阵：' + (rec.spreadCn || ''));
      out.push('');
      out.push('—— 牌阵 ——');
      (rec.cards || []).forEach(function (c) {
        out.push(c.slot + '. ' + c.positionCn + '：《' + c.cn + '》' + (c.reversed ? '逆位' : '正位'));
      });
      (rec.chapters || []).forEach(function (ch) {
        out.push('');
        out.push('—— ' + (ch.no || '') + ' ' + ch.title + ' ——');
        (ch.blocks || []).forEach(function (b) {
          if (b.t === 'p' || b.t === 'note') out.push(String(b.x || '').replace(/<br>/g, '\n'));
          else if (b.t === 'h') out.push('· ' + b.x);
          else if (b.t === 'quote' || b.t === 'quote6') out.push(String(b.x || '').replace(/<br>/g, '\n'));
          else if (b.t === 'ul') (b.items || []).forEach(function (i) { out.push('· ' + i); });
          else if (b.t === 'li2') out.push('· ' + b.k + '：' + b.v);
          else if (b.t === 'kv') (b.items || []).forEach(function (i) { out.push('  ' + i.k + '：' + i.v); });
          else if (b.t === 'chips') out.push('  关键词：' + (b.items || []).map(function (i) { return i.x; }).join(' / '));
        });
      });
      if ((rec.supp || []).length) {
        out.push('');
        out.push('—— 星轨延伸 · 补充牌 ——');
        rec.supp.forEach(function (s) {
          out.push('· ' + (s.slot || '') + ' 「' + (s.positionCn || '补充牌') + '」：' + (s.cn || '') +
            (s.reversed ? ' 逆位' : ' 正位') + (s.question ? '　追问：' + s.question : ''));
        });
      }
      if ((rec.thread || []).length) {
        out.push('');
        out.push('—— 追问记录 ——');
        rec.thread.forEach(function (t) {
          out.push((t.role === 'user' ? '你：' : '观测站：') + (t.text || ''));
        });
      }
      if (rec.note) { out.push(''); out.push('—— 私人备注 ——'); out.push(rec.note); }
      out.push('');
      out.push('—— 说明 ——');
      out.push(rec.source === 'ai'
        ? '本记录六章由外部 AI 依据本次真实牌面生成，牌面数据来自本地。'
        : '本记录六章由本地规则引擎依据本次真实牌面字段生成，未调用大模型。');
      return out.join('\n');
    }
  };

  /* ══ 四 · 实时传讯 Threads ═══════════════════════════════ */
  var threads = {
    list: function () {
      return list(K.threads).sort(function (a, b) { return (b.updatedAt || b.at || 0) - (a.updatedAt || a.at || 0); });
    },
    get: function (id) { return find(K.threads, id); },
    create: function (o) {
      o = o || {};
      var rec = {
        id: nid('th'),
        at: now(),
        updatedAt: now(),
        title: o.title || '未命名传讯',
        profileId: o.profileId || '',
        link: clone(o.link || session.get() || {}),
        readingId: o.readingId || '',
        messages: o.messages || [],
        note: ''
      };
      return push(K.threads, rec, MAX.threads);
    },
    patch: function (id, patch) { return update(K.threads, id, patch); },
    remove: function (id) { return drop(K.threads, id); },
    append: function (id, msg) {
      var t = find(K.threads, id);
      if (!t) return null;
      (t.messages || (t.messages = [])).push(Object.assign({ at: now() }, msg));
      return update(K.threads, id, { messages: t.messages });
    }
  };

  /* ══ 五 · 收藏夹 ════════════════════════════════════════ */
  var favs = {
    list: function () { return list(K.favs).sort(function (a, b) { return (b.at || 0) - (a.at || 0); }); },
    has: function (refId, type) {
      return list(K.favs).some(function (f) { return f.refId === refId && (!type || f.type === type); });
    },
    add: function (o) {
      o = clone(o || {});
      o.id = nid('fv');
      o.at = now();
      return push(K.favs, o, MAX.favs);
    },
    toggle: function (o) {
      var arr = list(K.favs);
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].refId === o.refId && arr[i].type === o.type) {
          arr.splice(i, 1);
          set(K.favs, arr);
          return { on: false };
        }
      }
      favs.add(o);
      return { on: true };
    },
    remove: function (id) { return drop(K.favs, id); }
  };

  /* ══ 六 · 私人手记 ══════════════════════════════════════ */
  var notes = {
    list: function () { return list(K.notes).sort(function (a, b) { return (b.at || 0) - (a.at || 0); }); },
    forReading: function (rid) { return list(K.notes).filter(function (n) { return n.readingId === rid; }); },
    add: function (o) {
      o = clone(o || {});
      o.id = nid('nt');
      o.at = now();
      return push(K.notes, o, MAX.notes);
    },
    patch: function (id, patch) { return update(K.notes, id, patch); },
    remove: function (id) { return drop(K.notes, id); }
  };

  /* ══ 六·五 星际通讯局 · 信件档案 Letters ════════════════ */
  var letters = {
    list: function () {
      return list(K.letters).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    },
    get: function (id) { return find(K.letters, id); },
    save: function (rec) {
      rec = clone(rec || {});
      if (!rec.id) {
        rec.id = nid('lt');
        rec.at = now();
        return push(K.letters, rec, MAX.letters);
      }
      /* 同 ID 重复保存 = 更新（防重复提交造成重复落盘） */
      var arr = list(K.letters);
      var idx = -1;
      for (var i = 0; i < arr.length; i++) if (arr[i].id === rec.id) { idx = i; break; }
      rec.updatedAt = now();
      if (idx >= 0) arr[idx] = Object.assign({}, arr[idx], rec);
      else { rec.at = now(); arr.unshift(rec); }
      if (arr.length > MAX.letters) arr.length = MAX.letters;
      set(K.letters, arr);
      return rec;
    },
    patch: function (id, patch) { return update(K.letters, id, patch); },
    remove: function (id) { return drop(K.letters, id); },
    /* 按角色 / 主题筛选 */
    filter: function (o) {
      o = o || {};
      return letters.list().filter(function (l) {
        if (o.profileId && l.profileId !== o.profileId) return false;
        if (o.theme && l.letterType !== o.theme) return false;
        if (o.faved && !letters.isFaved(l.id)) return false;
        return true;
      });
    },
    /* 收藏状态直接落在信件记录上，同时写进全局收藏夹（复用 favs 库） */
    isFaved: function (id) {
      return list(K.letters).some(function (l) { return l.id === id && !!l.faved; });
    },
    setFaved: function (id, on) {
      var l = find(K.letters, id);
      if (!l) return null;
      letters.patch(id, { faved: !!on });
      if (on) {
        window.DA_STORE.favs.add({
          type: 'letter', refId: id, source: 'post/letter',
          text: (l.title || '一封信') + '｜' + String(l.body || '').slice(0, 80),
          profile: l.charName || '', kind: l.letterType || ''
        });
      } else {
        var arr = list(K.favs).filter(function (f) { return !(f.type === 'letter' && f.refId === id); });
        set(K.favs, arr);
      }
      return on;
    }
  };

  /* ══ 七 · 兼容与数据管理 ════════════════════════════════ */
  /* 第一阶段的存档：只读入口，读的时候顺手补一条梦占记录 */
  function lastReading() {
    var rec = get(K.v1Reading, null);
    return rec && rec.cards && rec.cards.length ? rec : null;
  }

  function migrate() {
    var flag = 'DA2_MIGRATED';
    if (get(flag, false)) return false;
    var legacy = lastReading();
    if (legacy) {
      var exists = list(K.readings).some(function (r) { return r.id === legacy.id; });
      if (!exists) {
        var link = legacy.link || get(K.v1Link, null) || {};
        readings.save(recordFromSession(legacy, link, { chapters: legacy.chapters || [] }, {
          source: legacy.source || 'local'
        }));
      }
    }
    set(flag, true);
    return true;
  }

  function usage() {
    var bytes = 0;
    Object.keys(K).forEach(function (k) {
      try { var v = localStorage.getItem(K[k]); if (v) bytes += v.length; } catch (e) {}
    });
    return {
      bytes: bytes,
      kb: Math.round(bytes / 1024),
      readings: list(K.readings).length,
      threads: list(K.threads).length,
      favs: list(K.favs).length,
      notes: list(K.notes).length,
      profiles: list(K.profiles).length
    };
  }

  function clearAll() {
    Object.keys(K).forEach(function (k) {
      if (k === 'v1Link' || k === 'v1Reading' || k === 'v1Fav') return;
      try { localStorage.removeItem(K[k]); } catch (e) {}
    });
    try {
      localStorage.removeItem(K.v1Link);
      localStorage.removeItem(K.v1Reading);
      localStorage.removeItem(K.v1Fav);
      localStorage.removeItem('DA2_MIGRATED');
      localStorage.removeItem('DA2_PENDING_ASK');
    } catch (e) {}
  }

  /* 纯文本下载 */
  function download(name, text, mime) {
    try {
      var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
      return true;
    } catch (e) { return false; }
  }

  return {
    keys: K,
    nid: nid, clone: clone, dateCn: dateCn, timeCn: timeCn, download: download,
    profiles: profiles,
    session: session,
    readings: readings,
    threads: threads,
    favs: favs,
    notes: notes,
    letters: letters,
    lastReading: lastReading,
    migrate: migrate,
    usage: usage,
    clearAll: clearAll
  };
})();
