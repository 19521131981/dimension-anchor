/* DIMENSION ANCHOR — 数据备份 UI
   依赖 window.DA_STORE（da-store.js）。通过 data 属性自动绑定：
     [data-da-export]        点击导出全部本地数据为 JSON
     [data-da-import]        点击选择 JSON 文件并恢复
     [data-da-import-file]   可选的 <input type=file>；没有则动态创建
     [data-da-toast]         可选的提示容器 id（默认自建固定 toast）
   导入默认「合并」策略（同名键覆盖）；按住 Shift 点击＝完全替换（会先清空）。
   全程本地处理，文件不上传。 */
(function () {
  'use strict';
  var S = window.DA_STORE;
  if (!S || !S.exportAll) return;

  function toast(msg, box) {
    if (box) {
      box.textContent = msg;
      box.classList.add('is-on');
      setTimeout(function () { box.classList.remove('is-on'); }, 3200);
      return;
    }
    var t = document.getElementById('daBackupToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'daBackupToast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      t.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);' +
        'z-index:9999;max-width:calc(100vw - 40px);padding:11px 20px;border-radius:999px;' +
        'background:rgba(28,20,52,.94);color:#FBF7FF;font-size:13px;letter-spacing:.02em;' +
        'box-shadow:0 12px 30px -12px rgba(0,0,0,.8);opacity:0;transition:opacity .3s;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.style.opacity = '0'; }, 3200);
  }

  function boxOf(btn) {
    var id = btn.getAttribute('data-da-toast');
    return id ? document.getElementById(id) : null;
  }

  document.querySelectorAll('[data-da-export]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var payload = S.exportAll();
      toast(payload
        ? '备份已下载：' + Object.keys(payload.data).length + ' 项数据'
        : '导出失败，请检查浏览器是否允许下载', boxOf(btn));
    });
  });

  function doImport(file, btn, explicitMode) {
    var reader = new FileReader();
    reader.onload = function () {
      var mode = explicitMode ||
        (btn && btn.getAttribute('data-da-import-mode') === 'replace' ? 'replace' : 'merge');
      var res = S.importAll(String(reader.result || ''), mode);
      toast(res.ok
        ? '已恢复 ' + res.restored + ' 项数据' + (mode === 'replace' ? '（已替换）' : '')
        : ('恢复失败：' + (res.error || '文件无法读取')), boxOf(btn));
      if (res.ok) setTimeout(function () { location.reload(); }, 1200);
    };
    reader.onerror = function () { toast('文件读取失败', boxOf(btn)); };
    reader.readAsText(file);
  }

  document.querySelectorAll('[data-da-import]').forEach(function (btn) {
    var input = document.querySelector('[data-da-import-file]');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.setAttribute('data-da-import-file', '');
      input.style.display = 'none';
      document.body.appendChild(input);
    }
    btn.addEventListener('click', function (e) {
      // Shift+点击 = 完全替换，需二次确认
      var replace = (e && e.shiftKey) || btn.getAttribute('data-da-import-mode') === 'replace';
      if (replace && !window.confirm('完全替换会清空当前所有本地数据，确定继续吗？')) return;
      input._btn = btn;
      input._mode = replace ? 'replace' : 'merge';
      input.click();
    });
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (f) doImport(f, input._btn || btn, input._mode);
      input.value = '';
    });
  });
})();
