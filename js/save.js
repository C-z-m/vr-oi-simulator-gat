'use strict';
/* =========================================================
   save —— 进度存档读写（定时自动保存 + 驾驶兼容版）
   ========================================================= */

const SAVE_KEY = 'oi_save_v8';
let autoSaveTimer = null;

// 【新增】开启定时自动存档（每 15 秒存一次）
function startAutoSave() {
  setInterval(() => {
    if (state.started && !state.ended) {
      persistSave();
    }
  }, 15000);
}

function scheduleAutoSave(){
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(persistSave, 1200);
}

function persistSave(){
  if (!state.started || state.ended) return;
  try {
    // 【修复】如果在车里，不再强制下车！直接保存当前坐标
    let saveX = state.pos.x;
    let saveZ = state.pos.z;
    
    if (typeof drivingState !== 'undefined' && drivingState.isDriving && drivingState.car) {
      saveX = drivingState.car.position.x + 8; // 局部转全局
      saveZ = drivingState.car.position.z;
    }

    const blob = {
      code: state.code, score: state.score,
      curProb: state.curProb, elapsed: state.elapsed,
      warnCount: state.warnCount,
      achievements: Array.from(state.achievements),
      
      doorOpen: state.doorOpen,
      gun: state.gun ? {
        owned: state.gun.owned, equipped: state.gun.equipped,
        mag: state.gun.mag, reserve: state.gun.reserve
      } : null,
      
      zone: currentZoneId,
      pos: { x: saveX, y: state.pos.y, z: saveZ },
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
    // console.log("游戏已自动保存:", blob.zone);
  } catch(e){ console.error("保存失败", e); }
}

function tryLoadSave(){
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return false;
    
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
    
    // 【核心修复】读档时绝对不恢复考场门的白光，防止城市里出现时空错乱
    if (typeof o.doorOpen === 'boolean' && o.doorOpen && currentZoneId === 'classroom') {
      state.doorOpen = true;
      if (typeof openTheDoor === 'function') openTheDoor();
      if (typeof updateDoorLight === 'function') {
         for(let i=0; i<100; i++) updateDoorLight(0.05);
      }
    } else {
      state.doorOpen = false; // 如果在城市，门必须是关的
    }

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

    if (typeof o.zone === 'string') setCurrentZone(o.zone);
    
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

    if (currentZoneId === 'street') {
      if (!streetGroup && typeof buildStreet === 'function') {
        buildStreet();
        if (typeof initPathfinding === 'function') initPathfinding();
      }
      
      if (scene) {
        scene.background.setHex(0x9bb2c7);
        scene.fog.color.setHex(0x9bb2c7);
        scene.fog.density = 0.02;
      }
      
      const hideEls = ['hudTimer', 'hudScore', 'hudProbs'];
      hideEls.forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
      
      const wantedHud = document.getElementById('wantedHud');
      if (wantedHud) {
        if (state.cityMode.wantedLevel > 0) {
          wantedHud.textContent = '★'.repeat(state.cityMode.wantedLevel);
          wantedHud.classList.remove('hidden');
        } else {
          wantedHud.classList.add('hidden');
        }
      }
      
      if (typeof initCityNpcs === 'function') initCityNpcs();
      
    } else {
      const hideEls = ['hudTimer', 'hudScore', 'hudProbs'];
      hideEls.forEach(id => { const e = document.getElementById(id); if (e) e.style.display = ''; });
    }

    if (o.pos) {
      let px = o.pos.x;
      let pz = o.pos.z;
      
      // 【核心修复】如果刷车把你卡在里面了，或者你正好存了车里的档，自动把你挪到旁边
      if (typeof collides === 'function' && collides(px, pz, 0.5)) {
        // 找周围空地
        let safe = false;
        for (let r = 1; r <= 5; r++) {
          if (!collides(px + r, pz, 0.5)) { px += r; safe = true; break; }
          if (!collides(px - r, pz, 0.5)) { px -= r; safe = true; break; }
          if (!collides(px, pz + r, 0.5)) { pz += r; safe = true; break; }
          if (!collides(px, pz - r, 0.5)) { pz -= r; safe = true; break; }
        }
        if (!safe) {
          const b = getZoneBounds();
          px = (b.minX + b.maxX) / 2;
          pz = (b.minZ + b.maxZ) / 2;
        }
        toast('⚠️ 当前位置被占用，已移至安全区域。', 3000);
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

// 初始化时启动自动保存
startAutoSave();