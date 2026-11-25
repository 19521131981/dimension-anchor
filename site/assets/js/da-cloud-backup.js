/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR — 云端备份 DA_CLOUD_BACKUP
   ----------------------------------------------------------------------
   把 DA_STORE.exportAll() 的备份 JSON 存到云数据库 da_backups 表。
   · 必须登录；未登录一律拒绝并提示，不做本地假保存。
   · owner_id 由服务端 auth.uid() 填，前端绝不传；RLS 仅本人可读写，
     跨账号读不到、也改不了别人的备份。
   · 一个账号一个 slot（默认 main），重复上传覆盖，避免堆积。
   · 本地备份(da-backup-ui.js)保留，云端是额外一层，互不替代。
   依赖：DA_AUTH（会话 + client）、DA_STORE（exportAll/importAll）。
   ══════════════════════════════════════════════════════════════════════ */
window.DA_CLOUD_BACKUP = (function () {
  'use strict';

  var TABLE = 'da_backups';

  function signedIn() {
    var au = window.DA_AUTH;
    return !!(au && typeof au.uid === 'function' && au.uid());
  }

  function client() {
    var au = window.DA_AUTH;
    if (!au || typeof au.client !== 'function') return null;
    return au.client();
  }

  function unwrap(res) {
    if (res && res.error) {
      var e = new Error(res.error.message || '云服务错误');
      e.code = res.error.code;
      throw e;
    }
    return res && res.data;
  }

  /* 返回 Error 对象（不抛），供 Promise.reject 使用，保证调用方拿到
     的是 rejected Promise 而不是同步异常。 */
  function needSignIn() {
    var e = new Error('先点亮星际通行证，才能把备份存到云端。');
    e.code = 'SIGN_IN_REQUIRED';
    return e;
  }

  /* 上传当前本地数据为云端备份（覆盖该 slot）。返回 {ok, ts, size} */
  function put(payloadText, slot) {
    if (!signedIn()) return Promise.reject(needSignIn());
    var c = client();
    if (!c || !c.database) return Promise.reject(new Error('云服务暂时没连上。'));
    var text = String(payloadText || '');
    if (!text) return Promise.reject(new Error('没有可备份的内容。'));
    /* 不传 owner_id：DEFAULT auth.uid() + RLS WITH CHECK 负责归属。 */
    var row = {
      slot: String(slot || 'main').slice(0, 32),
      payload: text,
      byte_size: text.length
    };
    return c.database.from(TABLE)
      .upsert(row, { onConflict: 'owner_id,slot' })
      .select('id, slot, byte_size, created_at')
      .then(function (res) {
        var rows = unwrap(res);
        if (!rows || !rows.length) throw new Error('没有权限保存，或备份未被写入。');
        return { ok: true, ts: rows[0].created_at, size: rows[0].byte_size, slot: rows[0].slot };
      });
  }

  /* 便捷：直接把 DA_STORE 的导出结果上传 */
  function putCurrent(slot) {
    var payload = window.DA_STORE && window.DA_STORE.exportAll
      ? window.DA_STORE.exportAll() : null;
    if (!payload) return Promise.reject(new Error('读取本地数据失败。'));
    return put(JSON.stringify(payload), slot);
  }

  /* 列出当前账号的云端备份（RLS 自动只返回本人的） */
  function list() {
    if (!signedIn()) return Promise.reject(needSignIn());
    var c = client();
    if (!c || !c.database) return Promise.reject(new Error('云服务暂时没连上。'));
    return c.database.from(TABLE)
      .select('id, slot, byte_size, created_at')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(function (res) { return unwrap(res) || []; });
  }

  /* 取回某 slot 的备份原文（供 DA_STORE.importAll 恢复） */
  function get(slot) {
    if (!signedIn()) return Promise.reject(needSignIn());
    var c = client();
    if (!c || !c.database) return Promise.reject(new Error('云服务暂时没连上。'));
    return c.database.from(TABLE)
      .select('payload, byte_size, created_at')
      .eq('slot', String(slot || 'main').slice(0, 32))
      .maybeSingle()
      .then(function (res) { return unwrap(res); });
  }

  /* 恢复某 slot：取回 → 校验 → 调 DA_STORE.importAll。
     mode: 'merge'（覆盖同名键）或 'replace'（先清空）。 */
  function restore(slot, mode) {
    return get(slot).then(function (row) {
      if (!row || !row.payload) throw new Error('云端还没有这个备份。');
      var S = window.DA_STORE;
      if (!S || !S.importAll) throw new Error('本地恢复功能不可用。');
      var res = S.importAll(String(row.payload), mode === 'replace' ? 'replace' : 'merge');
      if (!res || !res.ok) throw new Error((res && res.error) || '恢复失败。');
      return { ok: true, restored: res.restored, mode: mode, ts: row.created_at };
    });
  }

  /* 删除某 slot 备份 */
  function remove(slot) {
    if (!signedIn()) return Promise.reject(needSignIn());
    var c = client();
    if (!c || !c.database) return Promise.reject(new Error('云服务暂时没连上。'));
    return c.database.from(TABLE)
      .delete()
      .eq('slot', String(slot || 'main').slice(0, 32))
      .select('id')
      .then(function (res) {
        var rows = unwrap(res) || [];
        return { ok: true, removed: rows.length };
      });
  }

  function message(e) {
    var c = e && e.code;
    if (c === 'SIGN_IN_REQUIRED') return '先点亮星际通行证，才能使用云端备份。';
    if (c === '42501') return '没有权限访问这份备份。';
    return (e && e.message) || '云端备份暂时不可用，稍后再试。';
  }

  return {
    signedIn: signedIn, put: put, putCurrent: putCurrent,
    list: list, get: get, restore: restore, remove: remove, message: message
  };
})();
