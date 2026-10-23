'use strict';
/* =========================================================
   city —— 城市入口与转场（P1 真实场景版）
   ========================================================= */

let rainAudioNode = null;

/* ---------- 音效辅助 ---------- */
function playHeartbeatBurst() {
  if (!audio.ctx) return;
  const t = audio.ctx.currentTime;
  for (let i = 0; i < 4; i++) {
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, t + i*0.15);
    osc.frequency.exponentialRampToValueAtTime(40, t + i*0.15 + 0.1);
    gain.gain.setValueAtTime(0.15, t + i*0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i*0.15 + 0.15);
    osc.connect(gain); gain.connect(audio.master);
    osc.start(t + i*0.15); osc.stop(t + i*0.15 + 0.2);
  }
}

function startRainAmbient() {
  if (!audio.ctx || rainAudioNode) return;
  const bufferSize = audio.ctx.sampleRate * 2;
  const buffer = audio.ctx.createBuffer(1, bufferSize, audio.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  
  const noise = audio.ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  
  const filter = audio.ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800;
  
  const gain = audio.ctx.createGain();
  gain.gain.setValueAtTime(0, audio.ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.15, audio.ctx.currentTime + 1.5);
  
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audio.master);
  noise.start();
  
  rainAudioNode = { noise, gain };
}

/* ---------- 核心：四段式转场 ---------- */
function startCityTransition() {
  if (state.ended) return;
  
  // ① 冻结世界，释放鼠标
  state.frozen = true;
  releaseLock();
  
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');
  
  // 创建全屏白层遮罩
  const whiteOverlay = document.createElement('div');
  whiteOverlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9995;
    background: #ffffff; opacity: 0; pointer-events: none;
    transition: opacity 0.6s ease-in;
  `;
  document.body.appendChild(whiteOverlay);

  playHeartbeatBurst();
  
  setTimeout(() => {
    whiteOverlay.style.opacity = '1';
    
    setTimeout(() => {
      startRainAmbient();
      
      // ③ 城市渐显：在幕后先生成场景
      if (!streetGroup) buildStreet();
      // 烘焙寻路网格
      if (typeof initPathfinding === 'function') initPathfinding();
      
      // 传送玩家
      state.pos.set(12, 1.65, 0);
      state.yaw = -Math.PI / 2; 
      state.pitch = 0;
      setCurrentZone('street');
      
      // 环境切换为白天
      scene.background.setHex(0x9bb2c7); // 浅灰蓝天空
      scene.fog.color.setHex(0x9bb2c7);
      scene.fog.density = 0.02;
      
      // 强制把相机拉过去
      camera.position.set(state.pos.x, 1.65, state.pos.z);
      camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
      
      // 开始径向扩散
      whiteOverlay.style.transition = 'clip-path 1.2s ease-out';
      whiteOverlay.style.clipPath = 'circle(0% at 50% 50%)';
      void whiteOverlay.offsetWidth;
      whiteOverlay.style.clipPath = 'circle(150% at 50% 50%)';
      
      setTimeout(() => {
        whiteOverlay.remove();
        
        // ④ 落地：解除冻结！
        state.frozen = false; 
        state.cityEntryReason = 'white_light';
        state.cityMode.nightmare = true;
        state.cityMode.wantedLevel = 1;
        state.cityMode.killCount = 0; // 新增这个
        
        // 【核心修复】彻底抹除考场的所有痕迹与视觉残留
        state.doorOpen = false; // 重置门的状态，防止再按 E
        if (typeof sealClassroomDoor === 'function') {
            sealClassroomDoor(); // 物理封死考场大门
        }
        
        // 彻底关掉白光的各个组件（防止城市里出现穿越过来的大白块）
        if (typeof doorLightMesh !== 'undefined' && doorLightMesh) doorLightMesh.visible = false;
        if (typeof doorGlowMesh !== 'undefined' && doorGlowMesh) doorGlowMesh.visible = false;
        if (typeof doorFloorMesh !== 'undefined' && doorFloorMesh) doorFloorMesh.visible = false;
        if (typeof doorPointLight !== 'undefined' && doorPointLight) doorPointLight.intensity = 0;

        unlockAch('army');
        
        // 强制刷新 HUD 上的通缉星为 1 颗
        document.getElementById('wantedHud').textContent = '★'.repeat(state.cityMode.wantedLevel);
        document.getElementById('wantedHud').classList.remove('hidden');
        
        // 封死考场大门！
        sealClassroomDoor();
        // 把门推向远处，关闭发光
        // 注意：这里因为是从里面出来，门洞在 x=8，玩家当前在 x=12，回头看就是墙。
        
        // 显示 HUD
        ['hud', 'crosshair', 'wantedHud'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.classList.remove('hidden');
        });
        if (state.hpVisible) document.getElementById('hpBar').classList.add('show');
        
        // 初始化城市路人 NPC
        if (typeof initCityNpcs === 'function') initCityNpcs();
        if (state.hpVisible) document.getElementById('hpBar').classList.add('show');
        
        document.getElementById('hudTimer').style.display = 'none';
        document.getElementById('hudScore').classList.add('hidden');
        document.getElementById('hudProbs').classList.add('hidden');
        
        requestLock();
        toast('🎮 GAT —— Grand Assault Teacher!', 4000);
        audio.beep(110, 1.0, 0.1, 'sine');
      }, 1200);
      
    }, 2000);
  }, 600);
}