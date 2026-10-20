'use strict';
/* =========================================================
   city-story —— 46届痕迹收集与真相揭秘
   ========================================================= */

if (!state.cityMode) state.cityMode = {};
if (!state.cityMode.tracesSeen) state.cityMode.tracesSeen = [];

let truthPending = false; // 标记是否正在等待安全时机弹窗

function discoverTrace(id) {
  if (state.cityMode.tracesSeen.includes(id)) return;
  
  state.cityMode.tracesSeen.push(id);
  const count = state.cityMode.tracesSeen.length;
  
  toast(`📜 发现第 46 届痕迹 (${count}/2)`, 3000);
  audio.beep(880, 0.15, 0.05);
  
  if (count >= 2) {
    unlockAch('trace_complete');
    truthPending = true; // 触发等待弹窗
  }
}

// 在 main.js 的 animate 里调用，确保环境安全时再弹窗
function updateCityStory() {
  if (!truthPending) return;
  
  // 如果有活着的警察，先别弹，免得玩家被打死
  const hasPolice = typeof policeUnits !== 'undefined' && policeUnits.some(p => p.userData.state !== 'down');
  if (hasPolice) return;

  // 如果当前有别的弹窗（比如保安警告），也等一等
  if (typeof hasDialog === 'function' && hasDialog()) return;

  // 安全！弹窗！
  truthPending = false;
  
  // 稍微给点悬疑感的声音
  audio.beep(220, 0.5, 0.05, 'sawtooth');
  setTimeout(() => audio.beep(160, 0.6, 0.05, 'sawtooth'), 250);

  openDialog({
    title: '\u26A0 档案解密 · 第 46 届考生',
    text: '你把监控残影和墙上的涂鸦拼凑在一起，一个冰冷的事实浮出水面。\n\n' +
          '“别惹写代码的人”。\n\n' +
          '第 46 届，第 7 号考生。他和现在的你一样，在考场里大开杀戒，打满了 200 个保安，推开了那扇白光门。\n\n' +
          '但他没有成为 GAT。这座城市吞没了他，考场销毁了所有关于他的录像，封死了那扇门。他们甚至修改了记录，当做什么都没发生。\n\n' +
          '这就是为什么那扇门在你身后消失了，也是为什么这座城市看起来如此空洞。\n\n' +
          '考场不需要第二名。考场需要的是记录。\n\n' +
          '而你，正在成为新的记录。',
    options: [{
      label: '原来如此……',
      cb: dlg => {
        closeDialog(dlg);
        toast('你已经彻底解开了这座城市的秘密。', 4000);
      }
    }]
  });
}