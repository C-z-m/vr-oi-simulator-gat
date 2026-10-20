'use strict';
/* =========================================================
   city-ending —— 城市大结局
   ========================================================= */

function endByCityVictory() {
  if (state.ended) return;
  state.ended = true;
  
  releaseLock();
  
  // 隐藏 HUD
  ['hud', 'crosshair', 'wantedHud', 'hpBar', 'ammoHud'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  // 用原有的结算界面
  $('endTitle').textContent = 'G A T';
  $('endSub').textContent = 'Grand Assault Teacher! —— 通关';
  
  // 根据通缉星计算分数和评价
  const level = state.cityMode.wantedLevel;
  let text = '';
  if (level >= 4) {
    text = '你顶着满城的警笛声，走进了出城隧道。\n\n' +
           '身后是燃烧的汽车、满地的制服，还有几十个被你放倒的警察。\n' +
           '你不仅仅是一个考场暴徒了，你现在是这座城市的传说。\n\n' +
           '“别惹写代码的人。”你对着隧道里的回声笑了笑，消失在了黑暗中。';
    unlockAch('gat_legend'); // 可以自己加个成就
  } else {
    text = '你走进了出城隧道。\n\n' +
           '警笛声被厚重的墙壁隔绝在身后。\n' +
           '这一天的疯狂终于结束了。你活了下来，而且没人能拦住你。';
  }

  text += '\n\n—— 剧终 ——';
  
  // 如果你写了新的成就列表，可以在这里解锁
  if (typeof unlockAch === 'function') unlockAch('army'); // 无论如何保底解锁 GAT
  
  showEnding(state.totalScore, text);
  clearSave();
}