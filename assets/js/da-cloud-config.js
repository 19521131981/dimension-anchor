/* 云服务公开配置（publishableKey 本身不含权限，服务端按 Origin 校验）
   ------------------------------------------------------------------
   云服务只放行它自己的域名：跨域直连会拿到 403 access_denied。
   所以部署在别处（Vercel / 自有域名）时，请求要走同源路径：
   浏览器 → 本站 /.cloud/... → Vercel rewrite 转发到云服务。
   同源请求浏览器不会带 Origin 头，云服务即放行。

   SELF_HOSTS：走同源代理的站点域名（后缀匹配）。
   不在名单里的域名（例如 WorkBuddy 自己的托管站）仍直连原地址。 */
(function () {
  'use strict';

  var DIRECT = 'https://hall-of-constellations.app.workbuddy.host';
  var SELF_HOSTS = ['vercel.app', 'dimanchor.xyz'];

  function isSelf() {
    var h = String(location.hostname || '');
    if (!h) return false;
    for (var i = 0; i < SELF_HOSTS.length; i++) {
      var s = SELF_HOSTS[i];
      if (h === s || h.slice(-(s.length + 1)) === '.' + s) return true;
    }
    return false;
  }

  function endpoint() {
    /* 自有域名上走同源代理：/api/cloud/<path> 由站点自己的服务端转发，
       服务端带白名单内的 Origin，云服务才会放行。 */
    if (isSelf() && location.protocol === 'https:') return location.origin + '/api/cloud';
    return DIRECT;
  }

  window.DA_CLOUD_CONFIG = {
    endpoint: endpoint(),
    oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
    publishableKey: 'wbpk_gwulqLjj4p42vvyAlU0zBS_trGbctB22q1XHOu1O54SMyjL9w1PTrNa'
  };
})();
