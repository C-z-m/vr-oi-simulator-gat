'use strict';
/* =========================================================
   city-npc —— 城市路人系统与通缉反应（适配大地图版）
   ========================================================= */

const cityNpcs = [];
let npcSpawnTimer = 10.0; // 初始 10 秒后开始第一次刷新
const MAX_CITY_NPCS = 20; // 地图变大，路人上限提高到 20

function spawnCityNpc(x, z) {
  const colors = [0xd8a878, 0x6b8e23, 0x4682b4, 0xcd5c5c, 0x9370db];
  const shirtColor = colors[Math.floor(Math.random() * colors.length)];
  
  const p = buildPerson(x, z, shirtColor, Math.random() * Math.PI * 2, 'stand');
  
  p.userData = {
    isCityNpc: true,
    state: 'wander',       
    speed: 1.2 + Math.random() * 0.8, 
    wanderTimer: Math.random() * 2,
    dirX: (Math.random() - 0.5) * 2,
    dirZ: (Math.random() - 0.5) * 2,
    panicTimer: 0,
    hasFled: false         
  };
  
  cityNpcs.push(p);
  return p;
}

function initCityNpcs() {
  for (let npc of cityNpcs) {
    scene.remove(npc.group);
  }
  cityNpcs.length = 0;
  
  // 初始生成 10 个路人，分散在地图各处
  for (let i = 0; i < 10; i++) {
    const x = -20 + Math.random() * 180; 
    const z = -90 + Math.random() * 180; 
    spawnCityNpc(x, z);
  }
}

// 新增：路人低频刷新逻辑
function updateCityNpcSpawner(dt) {
  if (state.ended) return;
  
  npcSpawnTimer -= dt;
  if (npcSpawnTimer <= 0) {
    npcSpawnTimer = 15.0; // 每 15 秒刷新一个
    
    const aliveNpcs = cityNpcs.filter(n => n.userData.state !== 'down');
    if (aliveNpcs.length < MAX_CITY_NPCS) {
      const px = state.pos.x;
      let spawnX = -20 + Math.random() * 180;
      
      // 如果随机点离玩家太近（小于20米），强制挪远
      if (Math.abs(spawnX - px) < 20) {
        spawnX = px > 80 ? -10 : 170;
      }
      const spawnZ = -90 + Math.random() * 180;
      
      // 确保生成点不卡在墙里
      if (!collides(spawnX, spawnZ, 0.5)) {
        spawnCityNpc(spawnX, spawnZ);
      }
    }
  }
}

function updateCityNpcs(dt, t) {
  if (state.ended) return;

  const px = state.pos.x;
  const pz = state.pos.z;
  const wanted = state.cityMode.wantedLevel || 0;

  for (const n of cityNpcs) {
    const ud = n.userData;
    if (!n.group.parent || ud.state === 'down') continue;

    const dx = n.group.position.x - px;
    const dz = n.group.position.z - pz;
    const dist = Math.hypot(dx, dz);

    // 1. 判定是否要逃跑
    if (wanted > 0 && dist < 8 && ud.state !== 'flee') {
      ud.state = 'flee';
      ud.panicTimer = 4.0; 
      if (!ud.hasFled) {
        ud.hasFled = true;
        toast('“就是他！快跑！”', 1500);
      }
    }

    // 2. 状态机
    if (ud.state === 'wander') {
      ud.wanderTimer -= dt;
      if (ud.wanderTimer <= 0) {
        ud.wanderTimer = 1.5 + Math.random() * 2;
        ud.dirX = (Math.random() - 0.5) * 2;
        ud.dirZ = (Math.random() - 0.5) * 2;
      }
      
      const step = ud.speed * 0.4 * dt;
      const nx = n.group.position.x + ud.dirX * step;
      const nz = n.group.position.z + ud.dirZ * step;
      
      // 应用新边界 [-25, 185] 和 [-105, 105]，并检测碰撞
      if (!collides(nx, n.group.position.z, 0.3)) {
        n.group.position.x = clamp(nx, -25, 185);
      } else {
        ud.dirX = -ud.dirX;
      }
      if (!collides(n.group.position.x, nz, 0.3)) {
        n.group.position.z = clamp(nz, -105, 105);
      } else {
        ud.dirZ = -ud.dirZ;
      }
      
      if (Math.abs(ud.dirX) > 0.1 || Math.abs(ud.dirZ) > 0.1) {
        n.group.rotation.y = Math.atan2(ud.dirX, ud.dirZ);
      }
      
      n.armL.rotation.x = Math.sin(t * 8 + n.phase) * 0.3;
      n.armR.rotation.x = -Math.sin(t * 8 + n.phase) * 0.3;

    } else if (ud.state === 'flee') {
      ud.panicTimer -= dt;
      if (ud.panicTimer <= 0) {
        ud.state = 'wander';
        ud.wanderTimer = 1;
      }
      
      const len = dist || 1;
      let fleeX = (dx / len) + (Math.random() - 0.5) * 0.5;
      let fleeZ = (dz / len) + (Math.random() - 0.5) * 0.5;
      
      const fl = Math.hypot(fleeX, fleeZ) || 1;
      fleeX /= fl;
      fleeZ /= fl;
      
      const step = ud.speed * 1.2 * dt;
      const nx = n.group.position.x + fleeX * step;
      const nz = n.group.position.z + fleeZ * step;
      
      // 应用新边界，并检测碰撞
      if (!collides(nx, n.group.position.z, 0.3)) {
        n.group.position.x = clamp(nx, -25, 185);
      }
      if (!collides(n.group.position.x, nz, 0.3)) {
        n.group.position.z = clamp(nz, -105, 105);
      }
      
      n.group.rotation.y = Math.atan2(fleeX, fleeZ);
      
      n.armL.rotation.x = Math.sin(t * 18 + n.phase) * 0.8;
      n.armR.rotation.x = -Math.sin(t * 18 + n.phase) * 0.8;
    }
  }
}