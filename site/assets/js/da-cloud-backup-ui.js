/* DIMENSION ANCHOR — 云端备份 UI（档案馆）
   依赖 da-auth.js + da-cloud-backup.js + da-store.js。
   登录状态由 DA_AUTH 决定；未登录只显示"点亮通行证"，不提供云操作。 */
(function () {
  'use strict';
  var CB = window.DA_CLOUD_BACKUP, A = window.DA_AUTH;
  if (!CB || !A) return;
  function $(id) { return document.getElementById(id); }
  var root = $('daCloud');
  if (!root) return;

  function toast(msg) {
    var box = $('arToast');
    if (box) {
      box.textContent = msg; box.classList.add('is-on');
      clearTimeout(box._t);
      box._t = setTimeout(function () { box.classList.remove('is-on'); }, 3600);
      return;
    }
    var t = $('daBackupToast');
    if (!t) {
      t = document.createElement('div'); t.id = 'daBackupToast';
      t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
      t.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:9999;' +
        'max-width:calc(100vw - 40px);padding:11px 20px;border-radius:999px;background:rgba(28,20,52,.94);' +
        'color:#FBF7FF;font-size:13px;opacity:0;transition:opacity .3s;';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(t._t2);
    t._t2 = setTimeout(function () { t.style.opacity = '0'; }, 3600);
  }

  function fmt(v) {
    if (!v) return '—';
    var d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  }
  function kb(n) { return (Number(n || 0) / 1024).toFixed(1) + ' KB'; }

  function signedView(on) {
    var st = $('daCloudState'), desc = $('daCloudDesc');
    var acts = $('daCloudActs'), sign = $('daCloudSign'), meta = $('daCloudMeta');
    st.textContent = on ? '已连接通行证' : '本机模式';
    st.classList.toggle('is-on', on);
    if (on) {
      desc.textContent = '备份只绑定你的通行证，换设备登录后即可取回。';
      acts.hidden = false; sign.hidden = true;
      refreshMeta();
    } else {
      desc.textContent = '登录星际通行证后，可把备份存到云端，换设备也能取回。备份只有你自己能读。';
      acts.hidden = true; sign.hidden = false; meta.hidden = true;
    }
  }

  function refreshMeta() {
    CB.list().then(function (rows) {
      var meta = $('daCloudMeta');
      if (!rows || !rows.length) { meta.hidden = false; meta.textContent = '云端还没有备份。'; return; }
      var r = rows[0];
      meta.hidden = false;
      meta.textContent = '最近备份：' + fmt(r.created_at) + ' · ' + kb(r.byte_size) +
        (rows.length > 1 ? ' · 共 ' + rows.length + ' 份' : '');
    }).catch(function (e) {
      var meta = $('daCloudMeta'); meta.hidden = false; meta.textContent = CB.message(e);
    });
  }

  function init() {
    A.init().then(function (s) {
      signedView(!!(s && s.user && s.user.id));
    }).catch(function () { signedView(false); });
    if (typeof A.onChange === 'function') {
      A.onChange(function () { signedView(CB.signedIn()); });
    }
  }

  function bind() {
    var sign = $('daCloudSign');
    if (sign) sign.addEventListener('click', function () { A.open(); });

    var put = $('daCloudPut');
    if (put) put.addEventListener('click', function () {
      if (!CB.signedIn()) { toast(CB.message({ code: 'SIGN_IN_REQUIRED' })); return; }
      put.disabled = true; toast('正在上传备份…');
      CB.putCurrent('main').then(function (r) {
        toast('已上传到云端 · ' + kb(r.size)); refreshMeta();
      }).catch(function (e) { toast(CB.message(e)); })
        .then(function () { put.disabled = false; });
    });

    var restore = $('daCloudRestore');
    if (restore) restore.addEventListener('click', function () {
      if (!CB.signedIn()) { toast(CB.message({ code: 'SIGN_IN_REQUIRED' })); return; }
      CB.get('main').then(function (row) {
        if (!row || !row.payload) { toast('云端还没有备份。'); return; }
        var when = fmt(row.created_at);
        if (!window.confirm('用云端备份（' + when + '）覆盖本机同名数据？当前本机数据会被同名项替换。')) return;
        return CB.restore('main', 'merge').then(function (r) {
          toast('已从云端恢复 ' + r.restored + ' 项数据');
          setTimeout(function () { location.reload(); }, 1200);
        });
      }).catch(function (e) { toast(CB.message(e)); });
    });

    var refresh = $('daCloudRefresh');
    if (refresh) refresh.addEventListener('click', function () { refreshMeta(); });
  }

  bind();
  init();
})();
