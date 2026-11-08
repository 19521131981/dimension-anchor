/* ══════════════════════════════════════════════════════════════════════
   DIMENSION ANCHOR TAROT｜维度锚点塔罗
   牌面场景 — 78 张独立构图
   每张牌的场景函数只负责插画窗口（348 × 430）内的内容
   ══════════════════════════════════════════════════════════════════════ */
window.DA_SCENES = (function () {
  'use strict';
  var A = window.DA_ART.lib;
  var F = A.F, S = A.S, CI = A.CI, EL = A.EL, RC = A.RC;
  var bg = A.bg, halo = A.halo, vig = A.vignette, stars = A.stars, sp = A.sparkle;
  var moonF = A.moonFull, moonC = A.moonCrescent, sun = A.sun, rays = A.rays;
  var mts = A.mountains, ridge = A.ridge, sea = A.sea, band = A.floorBand, road = A.road;
  var mist = A.mist, cloud = A.cloud, arch = A.arch, colon = A.colonnade, tower = A.tower;
  var castle = A.castle, gate = A.gate, throne = A.throne, bridge = A.bridge, boat = A.boat;
  var fig = A.fig, rider = A.rider, hand = A.handCloud, angel = A.angel;
  var cup = A.chalice, wand = A.wand, sword = A.sword, pent = A.pent;
  var tree = A.tree, flower = A.flower, flowers = A.flowers, wreath = A.wreath, crown = A.crown;
  var chain = A.chain, scales = A.scales, wheel = A.wheel, mirror = A.mirror, lamp = A.lamp;
  var heart = A.heart, eye = A.eye, book = A.book, hourglass = A.hourglass;

  var S_ = {};

  /* ══ 大阿尔卡那 ══════════════════════════════════════════════════ */

  /* 0 · 愚者 — 崖边启程 */
  S_.m00 = function (u) {
    return [
      bg(u, '#FDF3DE', '#F0DDE4', '#D6C4E2'),
      sun(u, 262, 132, 34, '#FFF9E6'),
      mts(250, '#B7A3D0', .32),
      ridge(292, '#9C86BE', .5),
      F('M0 286L126 286L164 318L186 430L0 430Z', '#6B5A88', .92),
      S('M126 286L164 318L186 430', '#E4D2F0', 1.1, .35),
      road(300, '#EFE0F2'),
      '<g class="an-float">' + fig(118, 286, 116, '#4A3E6E', '#F6E7C8', { arm: 'raise' }) + '</g>',
      /* 小狗 */
      EL(168, 284, 9, 5.5, '#FFFDF4', .9),
      CI(177, 279, 4.4, '#FFFDF4', .9),
      S('M174 282l-2 8M180 282l2 8', '#FFFDF4', 1.6, .8),
      S('M168 279q-3-6 1-8', '#FFFDF4', 1.4, .7),
      /* 行囊 */
      EL(96, 282, 9, 7, '#8A6E58', .9),
      /* 白玫瑰 */
      flower(84, 322, 14, '#FFFDF6', '#C9B6D8'),
      flower(212, 330, 12, '#F7DCE8', '#B9A2CE'),
      stars(u, 22, 11, '#FFFDF6', [0, 0, 348, 150]),
      vig(u, '#6B5A88')
    ].join('');
  };

  /* I · 魔术师 — 四元素贯通 */
  S_.m01 = function (u) {
    return [
      bg(u, '#2E2A60', '#221C48', '#141030'),
      '<defs><linearGradient id="' + u + 'col" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#FFF6DE" stop-opacity=".55"/>' +
        '<stop offset="1" stop-color="#FFF6DE" stop-opacity="0"/></linearGradient></defs>',
      RC(150, 30, 48, 300, 0, 'url(#' + u + 'col)', 1),
      halo(u, 174, 132, 96, '#FFF1CF', .5),
      stars(u, 30, 5, '#FFF6DE', [0, 0, 348, 210]),
      /* 无限符号 */
      '<g class="an-glow">' +
        S('M156 112q-18-16-34 0t34 18t34-18t34 0t-34 18', '#F6E7C8', 2, .9) + '</g>',
      /* 桌 */
      RC(58, 300, 232, 9, 2, '#3B2F62', .95),
      S('M58 300h232', '#EFD9A8', .8, .5),
      /* 人物 */
      fig(174, 300, 158, '#3A2E66', '#F6E7C8', { arm: 'hold' }),
      /* 四元素 */
      '<g class="an-float">' + wand(84, 276, 44, -8, '#E8B778', '#FFD9A0') + '</g>',
      cup(126, 282, 34, '#BFD8E8', '#FFF6DE', '#CFE6F4'),
      sword(216, 270, 52, 4, '#DCE6F2', '#CFE0F0'),
      pent(262, 282, 36, '#E8C87E', '#FFF3D4'),
      /* 地面 */
      band(330, '#1B1438', .9),
      S('M40 330h268', '#EFD9A8', .6, .2),
      vig(u, '#100B22')
    ].join('');
  };

  /* II · 女祭司 — 帷幕之后 */
  S_.m02 = function (u) {
    return [
      bg(u, '#2C2C58', '#3E3669', '#1A1538'),
      moonF(u, 174, 136, 46, '#F7EFE0'),
      stars(u, 26, 9, '#FFF6DE', [0, 0, 348, 210]),
      RC(46, 74, 24, 270, 2, '#241C46', .95),
      RC(278, 74, 24, 270, 2, '#241C46', .95),
      S('M40 74h36M272 74h36', '#EFD9A8', 1.4, .6),
      S('M58 344h8M282 344h8', '#EFD9A8', 1, .5),
      RC(58, 74, 6, 270, 0, '#EFD9A8', .18),
      RC(284, 74, 6, 270, 0, '#EFD9A8', .18),
      /* 帷幕 */
      '<g class="an-sway">' +
        F('M90 76q40 30 0 60t0 60t0 60t0 60l0 -240Z', '#EFE2F8', .18) +
        F('M258 76q-40 30 0 60t0 60t0 60t0 60l0 -240Z', '#EFE2F8', .18) +
        F('M120 76h108v10q-54 18-108 0Z', '#EFE2F8', .12) + '</g>',
      /* 石榴纹 */
      CI(150, 108, 4, '#B4506E', .5), CI(198, 108, 4, '#B4506E', .5),
      /* 人物 */
      fig(174, 344, 154, '#3E3468', '#F6E7C8', { arm: 'hold' }),
      /* 月冠 */
      moonC(u, 174, 172, 12, '#FFF6DE', true),
      /* 卷轴 */
      '<g class="an-glow">' + RC(146, 300, 56, 22, 3, '#EFE2C8', .55) + '</g>',
      S('M152 306h44M152 312h36', '#3B2F62', .8, .5),
      /* 水面 */
      band(352, '#1A1438', .92),
      S('M40 352h268', '#BFD8E8', .7, .2),
      /* 脚下的新月 */
      moonC(u, 174, 366, 22, '#EFE2F8', false),
      vig(u, '#120D28')
    ].join('');
  };

  /* III · 皇后 — 繁花王座 */
  S_.m03 = function (u) {
    return [
      bg(u, '#FBEED2', '#EAD3DC', '#C4ADCE'),
      sun(u, 174, 118, 46, '#FFF6DC'),
      rays(u, 174, 118, 18, 250, '#FFF3D0', .1),
      mts(268, '#B7A0C2', .3),
      /* 拱形花枝 */
      '<g class="an-sway">' +
        S('M8 60q80 -50 166 -50t166 50', '#8FA37A', 3, .5) +
        flower(40, 74, 16, '#F7C6D8', '#8FA37A') +
        flower(96, 52, 14, '#FFF1F6', '#8FA37A') +
        flower(174, 44, 18, '#F7C6D8', '#8FA37A') +
        flower(252, 52, 14, '#FFF1F6', '#8FA37A') +
        flower(310, 74, 16, '#F7C6D8', '#8FA37A') + '</g>',
      /* 王座 */
      throne(126, 208, 96, 118, '#6E5A80', '#8A7498'),
      tree(36, 344, 120, '#7E9670', '#5E6E56'),
      tree(314, 344, 110, '#7E9670', '#5E6E56'),
      /* 人物 */
      '<g class="an-float">' + fig(174, 330, 142, '#F3E4EE', '#C08AA6', { arm: 'hold' }) + '</g>',
      crown(174, 202, 30, '#EFD9A8'),
      /* 麦田与溪流 */
      band(330, '#8FA37A', .5),
      sea(374, '#9FC6DC', '#EAF4FA'),
      '<g class="an-sway">' +
        S('M24 340q6-26 2-40M40 342q8-24 4-38M56 340q6-22 2-36', '#C8A96A', 1.4, .55) +
        S('M292 342q8-24 4-38M308 340q6-22 2-36M324 342q6-24 2-38', '#C8A96A', 1.4, .55) + '</g>',
      flowers(392, '#F7C6D8', '#8FA37A', 8, 4),
      vig(u, '#8A7498')
    ].join('');
  };

  /* IV · 皇帝 — 石之秩序 */
  S_.m04 = function (u) {
    return [
      bg(u, '#DDE2EE', '#A8B0C8', '#43486A'),
      mts(246, '#7C86A8', .55),
      castle(196, 150, 132, '#5E6688'),
      /* 石座 */
      RC(112, 178, 124, 152, 3, '#5A6080', .95),
      F('M112 178q62-34 124 0Z', '#5A6080', .95),
      S('M118 186h112', '#E4DCC8', .9, .3),
      /* 公羊首 */
      S('M112 196q-16-6-18 8t14 14', '#C9B78E', 2.4, .8),
      S('M236 196q16-6 18 8t-14 14', '#C9B78E', 2.4, .8),
      /* 人物 */
      fig(174, 330, 148, '#3A3E60', '#E4DCC8', { arm: 'hold' }),
      crown(174, 196, 32, '#D8C08A'),
      /* 权杖与宝球 */
      '<g class="an-glow">' + CI(266, 268, 13, '#EFD9A8', .85) + '</g>' +
      S('M266 254v-14M254 254h24', '#EFD9A8', 1.1, .6),
      S('M92 250v56', '#C9B78E', 3, .9),
      CI(92, 246, 6, '#EFD9A8', .9),
      /* 地面 */
      band(330, '#2E3350', .9),
      S('M48 342h252', '#9AA3BC', .7, .2),
      vig(u, '#232842')
    ].join('');
  };

  /* V · 教皇 — 仪式与传承 */
  S_.m05 = function (u) {
    return [
      bg(u, '#3C3260', '#2A2148', '#161030'),
      arch(58, 70, 232, 300, '#EFD9A8', 2),
      arch(86, 104, 176, 266, '#EFD9A8', 1.1),
      colon(66, 120, 30, 240, 2, '#B9A6D6'),
      colon(252, 120, 30, 240, 2, '#B9A6D6'),
      halo(u, 174, 168, 78, '#FFF1CF', .35),
      /* 三重冠 */
      crown(174, 148, 40, '#EFD9A8'),
      crown(174, 160, 48, '#E4D0A0'),
      /* 人物 */
      fig(174, 344, 156, '#4A3A70', '#F6E7C8', { arm: 'raise' }),
      /* 双钥 */
      '<g class="an-glow" opacity=".8">' +
        S('M140 356l30 -30M208 356l-30 -30', '#EFD9A8', 1.6, .8) +
        CI(140, 358, 5, '#EFD9A8', .8) + CI(208, 358, 5, '#EFD9A8', .8) + '</g>',
      /* 侍者 */
      fig(92, 344, 88, '#3A2F5E', '#C9B6D8', { arm: 'hold' }),
      fig(256, 344, 88, '#3A2F5E', '#C9B6D8', { arm: 'hold' }),
      band(344, '#1C1436', .95),
      S('M30 344h288', '#EFD9A8', .6, .18),
      vig(u, '#120C28')
    ].join('');
  };

  /* VI · 恋人 — 光与选择 */
  S_.m06 = function (u) {
    return [
      bg(u, '#FCEBE4', '#EFD8E8', '#C0A6D2'),
      sun(u, 174, 108, 30, '#FFF8E4'),
      rays(u, 174, 108, 14, 240, '#FFF4DC', .13),
      /* 守护之翼 */
      '<g class="an-glow">' +
        F('M174 96q-52-26-70 4q30 26 70 14Z', '#FFF9EC', .5) +
        F('M174 96q52-26 70 4q-30 26-70 14Z', '#FFF9EC', .5) + '</g>',
      tree(46, 330, 116, '#8FA37A', '#63705A'),
      tree(302, 330, 116, '#8FA37A', '#63705A'),
      /* 两人 */
      fig(130, 340, 128, '#F2E6F0', '#B08AB0', { arm: 'raise' }),
      fig(218, 340, 128, '#E8DCF2', '#9C86BE', { arm: 'raise' }),
      '<g class="an-glow">' + CI(174, 236, 15, '#FFF3D4', .8) + '</g>',
      S('M162 236h24M174 224v24', '#EFD9A8', 1.2, .7),
      /* 花园 */
      band(340, '#7E9670', .45),
      '<g class="an-sway">' +
        flower(96, 372, 18, '#F7C6D8', '#8FA37A') +
        flower(150, 380, 16, '#FFF1F6', '#8FA37A') +
        flower(206, 378, 16, '#F7C6D8', '#8FA37A') +
        flower(258, 372, 18, '#FFF1F6', '#8FA37A') + '</g>',
      vig(u, '#8A7498')
    ].join('');
  };

  /* VII · 战车 — 双力同驱 */
  S_.m07 = function (u) {
    return [
      bg(u, '#CFD8EA', '#8E98BE', '#3A3C64'),
      castle(20, 168, 120, '#5C6488'),
      castle(212, 176, 116, '#5C6488'),
      stars(u, 18, 21, '#FFF6DE', [0, 40, 348, 120]),
      /* 星幕 */
      '<g class="an-glow">' +
        RC(96, 118, 156, 3, 1.5, '#EFD9A8', .5) +
        stars(u, 10, 33, '#FFF6DE', [100, 124, 148, 16]) + '</g>',
      /* 车体 */
      F('M112 296h124l-10 44h-104Z', '#4A4470', .95),
      S('M112 296h124', '#EFD9A8', 1.4, .7),
      CI(106, 340, 22, 'none', 1),
      '<circle cx="106" cy="340" r="22" fill="none" stroke="#DCD2B8" stroke-width="2.4" opacity=".8"/>',
      '<circle cx="242" cy="340" r="22" fill="none" stroke="#DCD2B8" stroke-width="2.4" opacity=".8"/>',
      /* 驾车者 */
      fig(174, 296, 132, '#3A3468', '#F6E7C8', { arm: 'raise' }),
      crown(174, 154, 26, '#EFD9A8'),
      /* 双兽 */
      '<g class="an-float">' +
        EL(88, 360, 30, 14, '#8C86AC', .9) + CI(60, 352, 11, '#8C86AC', .9) +
        EL(260, 360, 30, 14, '#8C86AC', .9) + CI(288, 352, 11, '#8C86AC', .9) + '</g>',
      band(386, '#22203E', .95),
      vig(u, '#1C1C36')
    ].join('');
  };

  /* VIII · 力量 — 驯服 */
  S_.m08 = function (u) {
    return [
      bg(u, '#FBEFD8', '#EDD8C8', '#C3A8BE'),
      sun(u, 174, 96, 34, '#FFF7E2'),
      rays(u, 174, 96, 18, 230, '#FFF3D4', .12),
      /* 花环 */
      '<g class="an-sway">' + S('M22 300q70 -70 152 -70t152 70', '#8FA37A', 3, .45) + '</g>',
      mts(282, '#B49FC0', .28),
      /* 狮子 */
      '<g class="an-float">' +
        EL(232, 322, 46, 30, '#C8A878', .92) +
        CI(196, 296, 24, '#D8B98A', .95) +
        S('M196 274q-26-4-22 22M196 274q26-4 22 22', '#E8CFA8', 3, .7) +
        CI(190, 292, 2.4, '#5C4A38', .8) + CI(204, 292, 2.4, '#5C4A38', .8) +
        S('M262 330q14 8 22 0', '#C8A878', 4, .9) + '</g>',
      /* 人物 */
      fig(140, 348, 150, '#F6EADA', '#C08AA6', { arm: 'hold' }),
      S('M148 268q30-12 46-4', '#E8CFA8', 1.4, .45),
      /* 无限 */
      '<g class="an-glow">' + S('M160 148q-16-14-30 0t30 16t30-16t30 0t-30 16', '#C9A87A', 2, .8) + '</g>',
      band(348, '#8FA37A', .4),
      flowers(386, '#F7C6D8', '#8FA37A', 6, 12),
      vig(u, '#8A7498')
    ].join('');
  };

  /* IX · 隐士 — 独自的灯 */
  S_.m09 = function (u) {
    return [
      bg(u, '#1C2248', '#28325E', '#0B1024'),
      stars(u, 54, 7, '#FFF6DE', [0, 0, 348, 260]),
      sp(70, 74, 9, '#FFF6DE', .9),
      mts(268, '#2C3760', .85),
      ridge(320, '#1A2140', .95),
      S('M0 344q60-16 116 0t116-6', '#3A4774', 1.2, .5),
      /* 人物与灯 */
      '<g class="an-float">' +
        fig(174, 344, 136, '#151B38', '#C9D6F0', { arm: 'raise' }) +
        '<g class="an-glow">' + lamp(214, 236, 30, '#E8D9B4', '#FFE6B0') + '</g>' +
        halo(u, 214, 240, 54, '#FFE6B0', .5) + '</g>',
      S('M164 348q14 10 26 0', '#2C3760', .8, .4),
      band(392, '#0A0E1E', .9),
      vig(u, '#080B18')
    ].join('');
  };

  /* X · 命运之轮 — 循环 */
  S_.m10 = function (u) {
    return [
      bg(u, '#2C2452', '#463A72', '#150F30'),
      stars(u, 46, 13, '#FFF6DE', [0, 0, 348, 300]),
      cloud(70, 120, 110, '#5E4E8C', .35),
      cloud(288, 300, 100, '#5E4E8C', .3),
      '<g class="an-orbit">' + wheel(174, 208, 88, '#EFD9A8', '#FFF6DE') + '</g>',
      '<g class="an-glow">' +
        CI(174, 208, 12, '#FFF6DE', .8) +
        sp(174, 208, 26, '#FFF6DE', .6) + '</g>',
      /* 四角守护 */
      CI(66, 316, 9, '#8C7CB4', .8),
      CI(282, 316, 9, '#8C7CB4', .8),
      CI(66, 106, 7, '#8C7CB4', .6),
      CI(282, 106, 7, '#8C7CB4', .6),
      S('M60 310l12 12M72 310l-12 12', '#E4D6F0', 1.2, .5),
      S('M276 310l12 12M288 310l-12 12', '#E4D6F0', 1.2, .5),
      band(348, '#150F30', .85),
      vig(u, '#0F0A22')
    ].join('');
  };

  /* XI · 正义 — 天平与剑 */
  S_.m11 = function (u) {
    return [
      bg(u, '#E0E6F2', '#B0B8D0', '#4A4F72'),
      arch(40, 66, 268, 300, '#EFD9A8', 1.4),
      colon(52, 96, 26, 262, 2, '#9AA3BC'),
      colon(270, 96, 26, 262, 2, '#9AA3BC'),
      /* 棋盘地面 */
      band(340, '#3C4160', .9),
      '<g opacity=".18" stroke="#E4DCC8" stroke-width=".6">' +
        'M30 340h288M30 360h288M30 380h288M30 400h288</g>',
      /* 人物 */
      fig(174, 340, 152, '#4A4E70', '#F6E7C8', { arm: 'hold' }),
      crown(174, 178, 28, '#EFD9A8'),
      /* 天平（左） */
      '<g class="an-float">' + scales(112, 262, 62, '#EFD9A8') + '</g>',
      /* 剑（右） */
      '<g class="an-glow">' + sword(240, 250, 96, 0, '#E8EEF8', '#DCE8F8') + '</g>',
      band(392, '#2A2E48', .9),
      vig(u, '#232842')
    ].join('');
  };

  /* XII · 倒吊人 — 换一个方向 */
  S_.m12 = function (u) {
    return [
      bg(u, '#93AABF', '#6E80A2', '#2C3350'),
      halo(u, 174, 92, 110, '#FFE9C8', .32),
      /* T 形枝 */
      S('M174 30v46', '#6B5A48', 5, .95),
      S('M96 76h156', '#6B5A48', 6, .95),
      S('M96 76q-10 8-4 18M252 76q10 8 4 18', '#6B5A48', 3, .7),
      /* 绳 */
      S('M174 76v40', '#D8C8A8', 1.6, .8),
      /* 倒悬人物 */
      '<g class="an-float">' +
        F('M174 116q-14 18-10 40l-16 76q22 10 52 0l-16-76q4-22-10-40Z', '#3E4A6C', .95) +
        CI(174, 152, 11, '#3E4A6C', .95) +
        S('M164 196l-26 34M184 196l26 34', '#3E4A6C', 6, .95) +
        S('M166 232l-4 56M182 232l4 56', '#3E4A6C', 6, .95) + '</g>',
      /* 头光 */
      '<g class="an-glow">' + CI(174, 264, 17, 'none', 0) +
        '<circle cx="174" cy="264" r="17" fill="none" stroke="#FFF3D4" stroke-width="1.4" opacity=".7"/>' + '</g>',
      /* 水面 */
      sea(376, '#4E6A86', '#CFE6F4'),
      '<g class="an-flow">' + S('M40 392h44M120 400h60M220 388h70', '#DCF0FA', 1, .35) + '</g>',
      vig(u, '#1E2438')
    ].join('');
  };

  /* XIII · 死神 — 结束与晨光 */
  S_.m13 = function (u) {
    return [
      bg(u, '#2E283C', '#4A3E52', '#191320'),
      sun(u, 234, 246, 34, '#F6C98B'),
      halo(u, 234, 250, 120, '#F6C98B', .34),
      mts(276, '#241E32', .9),
      /* 双塔 */
      tower(28, 196, 34, 96, '#1C1626'),
      tower(288, 204, 32, 88, '#1C1626'),
      /* 白马 */
      '<g class="an-float">' +
        EL(174, 306, 54, 26, '#E8E4EE', .95) +
        F('M214 288l18-26l10 8l-14 26Z', '#E8E4EE', .95) +
        EL(238, 258, 12, 6, '#E8E4EE', .95, -20) +
        S('M132 320l-12 44M156 324l-4 40M196 324l6 40M218 318l14 44', '#E8E4EE', 5, .95) +
        S('M120 302q-16 10-10 30', '#D8D4E2', 4, .8) + '</g>',
      /* 黑骑士 */
      fig(174, 288, 100, '#141020', '#C9C4D8', { arm: 'raise' }),
      /* 白玫瑰旗 */
      S('M220 176v96', '#C9C4D8', 2, .8),
      F('M220 178h44v28h-44Z', '#F2EFF6', .9),
      CI(242, 192, 5, '#B4506E', .8),
      /* 倒下的冠 */
      crown(66, 350, 22, '#8C7A5E'),
      /* 晨光 */
      '<g class="an-glow">' + S('M26 276h296', '#F6C98B', 1, .35) + '</g>',
      band(376, '#100C16', .9),
      vig(u, '#0C0812')
    ].join('');
  };

  /* XIV · 节制 — 中道 */
  S_.m14 = function (u) {
    return [
      bg(u, '#D3E6E8', '#AECBDA', '#5E7E9E'),
      sun(u, 174, 86, 26, '#FFFBEC'),
      mts(238, '#8FA8BE', .4),
      ridge(284, '#7E97B2', .55),
      /* 水塘 */
      sea(352, '#7FA6C4', '#E6F4FA'),
      /* 天使 */
      '<g class="an-float">' +
        F('M174 178q-44-30-64-4q26 30 64 16Z', '#FFFDF4', .55) +
        F('M174 178q44-30 64-4q-26 30-64 16Z', '#FFFDF4', .55) +
        fig(174, 348, 152, '#F4F8F8', '#9FB8C8', { arm: 'raise' }) + '</g>',
      /* 双杯与水流 */
      cup(136, 226, 34, '#F2F6F2', '#FFF6DE', '#DCF0F8'),
      cup(212, 268, 34, '#F2F6F2', '#FFF6DE', '#DCF0F8'),
      '<g class="an-flow">' +
        S('M150 232q16 6 26 24t30 12', '#EAF8FF', 3.2, .75) +
        S('M150 236q16 6 26 24t30 12', '#FFFFFF', 1.2, .6) + '</g>',
      /* 一脚入水 */
      S('M162 348q-10 14-2 26', '#F4F8F8', 7, .9),
      /* 鸢尾 */
      '<g class="an-sway">' +
        flower(78, 372, 20, '#C9A6D8', '#7E97B2') +
        flower(262, 366, 18, '#C9A6D8', '#7E97B2') + '</g>',
      vig(u, '#4A6684')
    ].join('');
  };

  /* XV · 恶魔 — 自愿的锁链 */
  S_.m15 = function (u) {
    return [
      bg(u, '#2C1434', '#411E40', '#110710'),
      /* 洞窟壁 */
      F('M0 0h348v82q-60 26-174 26T0 82Z', '#160A18', .95),
      F('M0 430V296q72 24 174 24t174-24v134Z', '#160A18', .95),
      /* 倒五芒 */
      '<g class="an-glow">' + CI(174, 176, 44, '#2A1028', .8) +
        '<circle cx="174" cy="176" r="44" fill="none" stroke="#C08A6A" stroke-width="1.2" opacity=".7"/>' +
        '<path d="M174 142L216 206H132Z" fill="none" stroke="#C08A6A" stroke-width="1.1" opacity=".75"/>' +
        '<path d="M174 206V142" stroke="#C08A6A" stroke-width=".8" opacity=".4"/>' + '</g>',
      /* 火炬 */
      lamp(58, 214, 26, '#8C6A4A', '#FFB86A'),
      /* 镜 */
      mirror(292, 210, 20, 34, '#C08A6A'),
      /* 两人 */
      fig(126, 356, 108, '#2A1230', '#C08A6A', { arm: 'cross' }),
      fig(222, 356, 108, '#2A1230', '#C08A6A', { arm: 'cross' }),
      /* 锁链 */
      '<g class="an-sway">' + chain(126, 308, 96, '#C08A6A') + '</g>',
      band(376, '#0E0610', .9),
      vig(u, '#0A040C')
    ].join('');
  };

  /* XVI · 高塔 — 结构瓦解 */
  S_.m16 = function (u) {
    return [
      bg(u, '#4E4E64', '#2E2C42', '#12101E'),
      cloud(80, 96, 150, '#6A6A82', .45),
      cloud(268, 140, 130, '#6A6A82', .4),
      /* 闪电 */
      '<g class="an-flicker">' +
        F('M118 40L150 138L126 142L166 236L138 226L172 300L120 210L146 206L104 116L128 112Z', '#FFF3C4', .95) + '</g>',
      halo(u, 150, 200, 130, '#FFF3C4', .3),
      /* 斜塔 */
      '<g transform="rotate(4 190 330)">' +
        RC(152, 168, 76, 190, 2, '#3A3550', .98) +
        F('M152 168l38-40l38 40Z', '#3A3550', .98) +
        RC(170, 200, 14, 22, 2, '#F6C98B', .5) +
        RC(196, 250, 14, 22, 2, '#F6C98B', .35) +
        RC(170, 296, 14, 22, 2, '#F6C98B', .25) + '</g>',
      /* 坠落的王冠 */
      '<g class="an-float">' + crown(262, 152, 26, '#C9A86A') + '</g>',
      S('M248 168l-8 14M266 172l6 16', '#C9A86A', 1.2, .4),
      /* 碎石 */
      F('M116 330l10-8l6 12Z', '#3A3550', .8),
      F('M240 344l12-6l2 12Z', '#3A3550', .8),
      band(358, '#100E1A', .92),
      vig(u, '#0A0812')
    ].join('');
  };

  /* XVII · 星星 — 疗愈之水 */
  S_.m17 = function (u) {
    return [
      bg(u, '#1E2E60', '#2C4278', '#0C1530'),
      stars(u, 60, 17, '#FFF6DE', [0, 0, 348, 280]),
      sp(174, 86, 26, '#FFF9E4', .95),
      sp(174, 86, 44, '#E6F0FF', .28),
      sp(96, 132, 8, '#FFF9E4', .8),
      sp(252, 148, 7, '#FFF9E4', .75),
      sp(66, 196, 5, '#FFF9E4', .6),
      sp(286, 214, 6, '#FFF9E4', .6),
      sp(130, 44, 5, '#FFF9E4', .6),
      sp(228, 40, 5, '#FFF9E4', .6),
      mts(272, '#25355E', .8),
      /* 湖 */
      sea(340, '#1E3660', '#9FC6DC'),
      /* 人物跪地倾水 */
      '<g class="an-float">' +
        F('M168 296q-16 10-12 34l-14 30h56l-14-30q4-24-16-34Z', '#DCE6F8', .9) +
        CI(168, 288, 9, '#DCE6F8', .9) +
        S('M156 310l-24 10M180 310l22 12', '#DCE6F8', 4.4, .85) + '</g>',
      cup(128, 320, 26, '#CFE0F0', '#FFF6DE', '#EAF4FF'),
      cup(212, 316, 26, '#CFE0F0', '#FFF6DE', '#EAF4FF'),
      '<g class="an-flow">' +
        S('M128 332q-4 26 14 40', '#CFE8F8', 2.6, .7) +
        S('M212 330q6 24-8 40', '#CFE8F8', 2.6, .7) + '</g>',
      '<g class="an-wave">' + S('M96 384h48M156 392h56M232 384h44', '#CFE8F8', 1, .3) + '</g>',
      vig(u, '#081020')
    ].join('');
  };

  /* XVIII · 月亮 — 夜的歧路 */
  S_.m18 = function (u) {
    return [
      bg(u, '#24325E', '#3A4272', '#0E1430'),
      stars(u, 40, 23, '#FFF6DE', [0, 0, 348, 220]),
      '<g class="an-glow">' + moonF(u, 174, 116, 52, '#F7F0E0') + '</g>',
      /* 双塔 */
      tower(56, 178, 30, 110, '#2A2E52'),
      tower(262, 178, 30, 110, '#2A2E52'),
      /* 小径 */
      F('M164 288q-10 30-26 60t-34 82h140q-18-46-32-82t-22-60Z', '#C8C4D4', .3),
      /* 水面 */
      sea(340, '#1C2A52', '#9FC6DC'),
      /* 水中生物 */
      S('M150 384q10-10 22 0t22 0', '#C8D8EC', 1.6, .55),
      S('M186 384l10-6v12Z', '#C8D8EC', 1.4, .5),
      /* 犬与狼 */
      EL(64, 332, 16, 9, '#1A2040', .9) + CI(78, 324, 6, '#1A2040', .9) +
        S('M52 340l-4 14M72 340l4 14', '#1A2040', 2.4, .9),
      EL(280, 330, 16, 9, '#1A2040', .9) + CI(266, 322, 6, '#1A2040', .9) +
        S('M270 340l-4 14M290 340l4 14', '#1A2040', 2.4, .9),
      /* 雾 */
      mist(300, '#8FA0C8', 26),
      '<g class="an-drift">' + cloud(90, 264, 120, '#8FA0C8', .18) + '</g>',
      vig(u, '#0A1024')
    ].join('');
  };

  /* XIX · 太阳 — 毫无保留 */
  S_.m19 = function (u) {
    return [
      bg(u, '#FFEDC0', '#F8CD90', '#D79A6A'),
      '<g class="an-glow">' + sun(u, 174, 104, 54, '#FFFBEA') + '</g>',
      mts(268, '#D8A878', .35),
      /* 花园墙 */
      RC(0, 300, 348, 6, 0, '#C98E62', .5),
      /* 白马 */
      '<g class="an-float">' +
        EL(140, 306, 46, 22, '#FFFDF4', .95) +
        F('M178 292l16-22l8 6l-12 22Z', '#FFFDF4', .95) +
        EL(198, 268, 10, 5, '#FFFDF4', .95, -18) +
        S('M104 318l-10 36M124 320l-2 34M158 320l6 34M176 316l12 38', '#FFFDF4', 4.4, .95) + '</g>',
      /* 孩童 */
      fig(186, 300, 74, '#FFF6E2', '#D79A6A', { arm: 'raise' }),
      /* 旗 */
      S('M222 216v84', '#C98E62', 2, .8),
      F('M222 218h48v30h-48Z', '#F2603C', .85),
      /* 向日葵 */
      '<g class="an-sway">' +
        flower(52, 372, 26, '#F2B23C', '#7E9670') +
        flower(96, 384, 22, '#F2B23C', '#7E9670') +
        flower(286, 376, 24, '#F2B23C', '#7E9670') +
        flower(322, 362, 18, '#F2B23C', '#7E9670') + '</g>',
      band(392, '#C98E62', .35),
      vig(u, '#B87E4E')
    ].join('');
  };

  /* XX · 审判 — 号角 */
  S_.m20 = function (u) {
    return [
      bg(u, '#CFE2EA', '#A4BECE', '#4E6272'),
      sun(u, 174, 70, 22, '#FFFBEC'),
      cloud(80, 118, 130, '#E8F2F8', .5),
      cloud(272, 128, 120, '#E8F2F8', .45),
      /* 天使与号角 */
      '<g class="an-float">' +
        F('M174 130q-40-28-58-6q24 26 58 14Z', '#FFFDF4', .55) +
        F('M174 130q40-28 58-6q-24 26-58 14Z', '#FFFDF4', .55) +
        fig(174, 214, 92, '#F6FAFC', '#8FA8BE', { arm: 'raise' }) +
        S('M196 156l58-30', '#EFD9A8', 4, .9) +
        F('M254 126l22-12l-4 16Z', '#EFD9A8', .9) + '</g>',
      /* 冰山 */
      mts(286, '#7E96AC', .7),
      ridge(322, '#5E7690', .8),
      /* 复起的人群 */
      '<g class="an-rise">' +
        fig(92, 372, 86, '#4E6272', '#DCE8F0', { arm: 'raise' }) +
        fig(174, 380, 94, '#43566A', '#DCE8F0', { arm: 'raise' }) +
        fig(256, 372, 86, '#4E6272', '#DCE8F0', { arm: 'raise' }) + '</g>',
      band(392, '#3C4A58', .85),
      vig(u, '#33424E')
    ].join('');
  };

  /* XXI · 世界 — 环合 */
  S_.m21 = function (u) {
    return [
      bg(u, '#DCEFE2', '#B0D0C0', '#4E7C68'),
      stars(u, 26, 31, '#FFFDF4', [0, 0, 348, 200]),
      /* 花环 */
      '<g class="an-orbit">' + wreath(174, 216, 116, '#8FBFA0', '#D8EBDC') + '</g>',
      '<g class="an-glow">' +
        '<ellipse cx="174" cy="216" rx="112" ry="150" fill="none" stroke="#EFD9A8" stroke-width="1.1" opacity=".35"/></g>',
      /* 舞者 */
      '<g class="an-float">' +
        F('M174 168q-12 14-9 32l-12 66q21 8 42 0l-12-66q3-18-9-32Z', '#F6FBF7', .95) +
        CI(174, 158, 10, '#F6FBF7', .95) +
        S('M166 200l-26 32M182 200l26 32', '#F6FBF7', 4.6, .9) + '</g>',
      /* 双杖 */
      S('M56 130v186M292 130v186', '#C9B78E', 3, .8),
      CI(56, 126, 7, '#EFD9A8', .8), CI(292, 126, 7, '#EFD9A8', .8),
      /* 四角守护 */
      '<g opacity=".55">' +
        CI(52, 76, 10, '#FFFDF4', .8) + CI(296, 76, 10, '#FFFDF4', .8) +
        CI(52, 368, 10, '#FFFDF4', .8) + CI(296, 368, 10, '#FFFDF4', .8) + '</g>',
      band(404, '#3E6A58', .8),
      vig(u, '#2E5244')
    ].join('');
  };

  /* @MINOR@ */

  return S_;
})();
