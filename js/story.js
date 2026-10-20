'use strict';
/* =========================================================
   story —— 剧情线：广播 / 记录本 / 字条 / 里程碑通报
   ---------------------------------------------------------
   全部复用既有的 3D 悬浮弹窗（dialog3d.js）与 toast（feedback.js），
   不引入任何新 UI 体系。核心意象是"记录"——与 applyWanderPenalty() 里
   那句"监考老师低头在记录本上写了些什么"、以及隐藏结局的
   "只在记录里写"接成同一条线。

   防打扰（关键）：
   - 每个节点只触发一次（storySaid）；
   - 若当前已有弹窗（保安通报 / 老师警告 / 拾取提示），延迟重试，
     最多 STORY_MAX_RETRY 次，绝不把第二块 3D 面板叠上去；
   - 本局结束后待触发节点直接作废；
   - 剧情弹窗不触发慢放（beginSlowMo 只留给保安通报）。
   ========================================================= */

const STORY_RETRY_MS  = 1400;   // 有弹窗时的重试间隔
const STORY_MAX_RETRY = 8;
const STORY_FIRST_MS  = 900;    // 首次尝试前的延迟：给"刚要弹出的弹窗"让路
const STORY_OPEN_MS   = 28000;  // 开场广播的兜底触发时间

const storySaid = new Set();
const storyPending = new Set();

/* ---------- 节点表 ---------- */
const STORY_BEATS = {
  opening: {
    title: '\u{1F4E2} 考场广播',
    text: '第 47 届全国信息学奥林匹克竞赛，虚拟考场 07。\n' +
          '系统已启用行为记录：考生每一次起身、每一次发言、\n' +
          '每一次提交，都会被写入记录。\n\n' +
          '记录不可修改。\n\n' +
          '请考生专注答题。',
    ok: '（继续答题）'
  },

  first_warning: {
    title: '\u{1F4D6} 记录本',
    text: '监考老师低头写字。你看见他的笔在纸上划过，\n' +
          '那行字却没有留下墨迹。\n\n' +
          '他念出你刚才的行为，字句和上一次一字不差。\n\n' +
          '——像是把同一段录音，又放了一遍。',
    ok: '（装作没看见）'
  },

  gun_taken: {
    title: '\u{1F52B} 一把枪，和一张纸条',
    text: '枪很旧，握把上有一道很深的划痕。\n' +
          '纸上是铅笔字，写得很轻，像是怕被人听见：\n\n' +
          '“如果你看到这把枪，说明第 46 届的第 7 号考生\n' +
          '已经不在记录里了。\n\n' +
          '考场不需要第二名。考场需要的是记录。\n' +
          '枪里只有十二发。省着用。”',
    ok: '把手枪收好',
    after: () => toast('\u{1F52B} [ 左键 ] 射击　·　[ R ] 换弹　·　[ Q ] 收枪 / 拔枪', 3800)
  },

  record_anomaly: {
    title: '\u{1F4E2} 系统广播',
    text: '值班员请注意。\n\n' +
          '记录中出现了一个无法归档的对象。\n' +
          '编号：考生。状态：持续写入。\n' +
          '归档失败次数：50。\n\n' +
          '请立即处理。若无法处理，请允许其离开。',
    ok: '继续'
  }
};

/* =========================================================
   触发入口
   ========================================================= */

/* 带弹窗的节点：排队 + 去重 + 避让既有弹窗 */
function storyBeat(id){
  if (!state.started || state.ended) return false;
  if (storySaid.has(id) || storyPending.has(id)) return false;
  if (!STORY_BEATS[id]) return false;
  storyPending.add(id);
  setTimeout(() => tryShowStory(id, 0), STORY_FIRST_MS);
  return true;
}

function tryShowStory(id, attempt){
  if (state.ended || !state.started){ storyPending.delete(id); return; }
  /* 玩家在 IDE / 草稿纸 / 洗手间等视图时世界根本不渲染，
     弹窗会"隐形存在"——先等回到世界视图，且不消耗重试次数 */
  if (state.view !== 'world'){
    setTimeout(() => tryShowStory(id, 0), STORY_RETRY_MS);
    return;
  }
  if (hasDialog()){
    if (attempt >= STORY_MAX_RETRY){ storyPending.delete(id); return; }
    setTimeout(() => tryShowStory(id, attempt + 1), STORY_RETRY_MS);
    return;
  }
  storyPending.delete(id);
  storySaid.add(id);
  playStoryBeat(id);
}

function playStoryBeat(id){
  const b = STORY_BEATS[id];
  if (!b) return;
  openDialog({
    title: b.title,
    text: b.text,
    options: [{
      label: b.ok || '继续',
      cb: dlg => {
        closeDialog(dlg);
        if (b.after) b.after();
      }
    }]
  });
  audio.beep(id === 'opening' ? 880 : 520, 0.12, 0.045, 'sine');
  setTimeout(() => audio.beep(id === 'opening' ? 660 : 390, 0.16, 0.04, 'sine'), 130);
}

/* 纯 toast 节点：不需要避让弹窗，立即出 */
function storyToast(id, text, ms){
  if (state.ended || storySaid.has(id)) return false;
  storySaid.add(id);
  toast(text, ms || 2600);
  return true;
}

/* =========================================================
   初始化：开场广播
   ---------------------------------------------------------
   注意 initStory() 在页面加载时就跑，而玩家可能还停在开始界面，
   所以先轮询等 state.started，再开始计时 —— 否则"进考场慢于 28 秒"
   就永远看不到开场广播了。
   ========================================================= */
function initStory(){
  const arm = () => {
    if (state.ended) return;
    if (!state.started){ setTimeout(arm, 1000); return; }
    setTimeout(() => { if (state.started && !state.ended) storyBeat('opening'); },
               STORY_OPEN_MS);
  };
  setTimeout(arm, 1000);
}
