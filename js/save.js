'use strict';
/* =========================================================
   save —— 进度存档读写（完美城市与门状态版）
   ========================================================= */

const SAVE_KEY = 'oi_save_v8';
let autoSaveTimer = null;

function scheduleAutoSave(){
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(persistSave, 1200);
}

function persistSave(){
  if (!state.started || state.ended) return;
  try {
    // 如果玩家在车里，先滚下车，以免存档的时候车没了导致卡死
    if (typeof drivingState !== 'undefined' && drivingState.isDriving) {
      if (typeof exitCar === 'function') exitCar();
    }

    const blob = {
      code: state.code, score: state.score,
      curProb: state.curProb, elapsed: state.elapsed,
      warnCount: state.warnCount,
      achievements: Array.from(state.achievements),
      
      // 核心：全量保存玩家和枪械状态
      doorOpen: state.doorOpen, // 存门！
      gun: state.gun ? {
        owned: state.gun.owned, equipped: state.gun.equipped,
        mag: state.gun.mag, reserve: state.gun.reserve
      } : null,
      
      zone: currentZoneId,
      pos: { x: state.pos.x, y: state.pos.y, z: state.pos.z },
      yaw: state.yaw,
      pitch: state.pitch,
      hp: state.hp,
      hpVisible: state.hpVisible,
      cityEntryReason: state.cityEntryReason,
      cityMode: {
        nightmare: state.cityMode.nightmare,
        day: state.cityMode.day,
        wantedLevel: state.cityMode.wantedLevel,
        killCount: state.cityMode.killCount || 0,
        tracesSeen: state.cityMode.tracesSeen || []
      },
      
      savedAt: Date.now(),
      problems: state.problems.map(p => p.id)
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
    console.log("游戏已成功保存:", blob.zone);
  } catch(e){ console.error("保存失败", e); }
}

function tryLoadSave(){
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return false;
    
    // 恢复题目
    if (Array.isArray(o.problems) && o.problems.length === 4){
      const restored = o.problems.map(id => PROBLEM_BY_ID.get(id)).filter(Boolean);
      if (restored.length === 4){
        state.problems = restored;
        state.curProb = restored[0].id;
        state.npcProbId = restored[Math.floor(Math.random() * restored.length)].id;
        updateAllDeskScreens();
      }
    }
    
    if (o.code)   state.code = o.code;
    if (o.score)  state.score = o.score;
    if (o.curProb) state.curProb = o.curProb;
    if (typeof o.elapsed === 'number') state.elapsed = o.elapsed;
    if (typeof o.warnCount === 'number') state.warnCount = o.warnCount;
    if (Array.isArray(o.achievements)) state.achievements = new Set(o.achievements);
    
    // 【核心修复】彻底恢复门开状态
    if (typeof o.doorOpen === 'boolean') {
      state.doorOpen = o.doorOpen;
      if (state.doorOpen && typeof openTheDoor === 'function') {
        openTheDoor();
        // 直接把门推开并亮起白光（省略开门动画）
        if (typeof updateDoorLight === 'function') {
           for(let i=0; i<100; i++) updateDoorLight(0.05);
        }
      }
    }

    // 【核心修复】彻底恢复枪械状态
    if (o.gun && typeof o.gun === 'object' && state.gun){
      state.gun.owned    = !!o.gun.owned;
      state.gun.equipped = !!o.gun.equipped && state.gun.owned;
      state.gun.reloading = false;
      if (typeof o.gun.mag === 'number') state.gun.mag = clamp(Math.floor(o.gun.mag), 0, GUN_MAG_SIZE);
      if (typeof o.gun.reserve === 'number') state.gun.reserve = clamp(Math.floor(o.gun.reserve), 0, GUN_RESERVE_MAX);
      
      if (state.gun.owned) {
        if (gunGroup) gunGroup.visible = state.gun.equipped;
        if (typeof updateAmmoHud === 'function') updateAmmoHud();
      }
    }

    // 恢复区域
    if (typeof o.zone === 'string') setCurrentZone(o.zone);
    
    // 恢复血量和通缉
    if (typeof o.hp === 'number') state.hp = o.hp;
    if (typeof o.hpVisible === 'boolean') state.hpVisible = o.hpVisible;
    if (o.cityEntryReason) state.cityEntryReason = o.cityEntryReason;
    
    if (o.cityMode && typeof o.cityMode === 'object'){
      state.cityMode.nightmare   = !!o.cityMode.nightmare;
      state.cityMode.day         = !!o.cityMode.day;
      state.cityMode.wantedLevel = clamp(Math.floor(o.cityMode.wantedLevel || 0), 0, 5);
      state.cityMode.killCount   = o.cityMode.killCount || 0;
      if (Array.isArray(o.cityMode.tracesSeen)){
        state.cityMode.tracesSeen = o.cityMode.tracesSeen.slice();
      }
    }

    // 【核心修复】如果在城市里，彻底接管环境、UI和场景
    if (currentZoneId === 'street') {
      if (!streetGroup && typeof buildStreet === 'function') {
        buildStreet();
        if (typeof initPathfinding === 'function') initPathfinding();
      }
      
      // 1. 关掉考场的背景和雾，换成城市的
      if (scene) {
        scene.background.setHex(0x9bb2c7);
        scene.fog.color.setHex(0x9bb2c7);
        scene.fog.density = 0.02;
      }
      
      // 2. 隐藏所有考试 HUD
      const hideEls = ['hudTimer', 'hudScore', 'hudProbs'];
      hideEls.forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
      
      // 3. 恢复通缉星
      const wantedHud = document.getElementById('wantedHud');
      if (wantedHud) {
        if (state.cityMode.wantedLevel > 0) {
          wantedHud.textContent = '★'.repeat(state.cityMode.wantedLevel);
          wantedHud.classList.remove('hidden');
        } else {
          wantedHud.classList.add('hidden');
        }
      }
      
      // 4. 刷出路人
      if (typeof initCityNpcs === 'function') initCityNpcs();
      
    } else {
      // 在考场：确保考场 UI 正常
      const hideEls = ['hudTimer', 'hudScore', 'hudProbs'];
      hideEls.forEach(id => { const e = document.getElementById(id); if (e) e.style.display = ''; });
    }

    // 恢复坐标与视角
    if (o.pos) {
      let px = o.pos.x;
      let pz = o.pos.z;
      
      if (typeof collides === 'function' && collides(px, pz, 0.5)) {
        px = currentZoneId === 'street' ? 20 : 0;
        pz = currentZoneId === 'street' ? 0 : -1.72;
        toast('⚠️ 当前位置被障碍物卡住，已移至安全点。', 3000);
      }
      
      state.pos.set(px, o.pos.y, pz);
      if (typeof camera !== 'undefined' && camera) {
        camera.position.copy(state.pos);
      }
    }
    
    if (typeof o.yaw === 'number') {
      state.yaw = o.yaw;
      yawTarget = o.yaw; 
      if (typeof camera !== 'undefined' && camera) camera.rotation.y = o.yaw;
    }
    if (typeof o.pitch === 'number') {
      state.pitch = o.pitch;
      pitchTarget = o.pitch;
      if (typeof camera !== 'undefined' && camera) camera.rotation.x = o.pitch;
    }

    if (state.hpVisible) {
      renderHp();
      const hpBar = document.getElementById('hpBar');
      if (hpBar) hpBar.classList.add('show');
    }
    
    recalcScore();
    return true;
  } catch(e){ 
    console.error("读档失败", e);
    return false; 
  }
}

function clearSave(){
  try { localStorage.removeItem(SAVE_KEY); } catch(e){}
}