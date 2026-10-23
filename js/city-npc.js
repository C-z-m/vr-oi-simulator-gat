'use strict';
/* =========================================================
   city-npc —— 城市路人系统与通缉反应（区域边界统一版）
   ========================================================= */

const cityNpcs = [];
let npcSpawnTimer = 10.0;
const MAX_CITY_NPCS = 20;

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
  for (let npc of cityNpcs) scene.remove(npc.group);
  cityNpcs.length = 0;
  
  for (let i = 0; i < 10; i++) {
    const x = -20 + Math.random() * 180; 
    const z = -90 + Math.random() * 180; 
    spawnCityNpc(x, z);
  }
}

function updateCityNpcSpawner(dt) {
  if (state.ended) return;
  
  npcSpawnTimer -= dt;
  if (npcSpawnTimer <= 0) {
    npcSpawnTimer = 15.0; 
    
    const aliveNpcs = cityNpcs.filter(n => n.userData.state !== 'down');
    if (aliveNpcs.length < MAX_CITY_NPCS) {
      const px = state.pos.x;
      const bnds = getZoneBounds(); // 【核心修改】获取当前地图边界
      
      // 在边界内随机生成 X 坐标
      let spawnX = bnds.minX + Math.random() * (bnds.maxX - bnds.minX);
      
      // 防止在玩家脸上刷新（距离小于 20 米就挪到地图最左或最右）
      if (Math.abs(spawnX - px) < 20) {
        spawnX = px > (bnds.minX + bnds.maxX) / 2 ? bnds.minX + 10 : bnds.maxX - 10;
      }
      
      // 在边界内随机生成 Z 坐标
      const spawnZ = bnds.minZ + Math.random() * (bnds.maxZ - bnds.minZ);
      
      // 确保不卡在墙里
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

    if (wanted > 0 && dist < 8 && ud.state !== 'flee') {
      ud.state = 'flee';
      ud.panicTimer = 4.0; 
      if (!ud.hasFled) {
        ud.hasFled = true;
        toast('“就是他！快跑！”', 1500);
      }
    }

    if (ud.state === 'wander') {
      ud.wanderTimer -= dt;
      if (ud.wanderTimer <= 0) {
        ud.wanderTimer = 1.5 + Math.random() * 2;
        ud.dirX = (Math.random() - 0.5) * 2;
        ud.dirZ = (Math.random() - 0.5) * 2;
      }
      
      const step = ud.speed * 0.4 * dt;
      const rawX = n.group.position.x + ud.dirX * step;
      const rawZ = n.group.position.z + ud.dirZ * step;
      
      const clamped = clampToZone(rawX, rawZ);
      
      if (!collides(clamped.x, n.group.position.z, 0.3)) {
        n.group.position.x = clamped.x;
      } else {
        ud.dirX = -ud.dirX;
      }
      
      if (!collides(n.group.position.x, clamped.z, 0.3)) {
        n.group.position.z = clamped.z;
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
      const rawX = n.group.position.x + fleeX * step;
      const rawZ = n.group.position.z + fleeZ * step;
      
      const clampedFlee = clampToZone(rawX, rawZ);
      
      if (!collides(clampedFlee.x, n.group.position.z, 0.3)) {
        n.group.position.x = clampedFlee.x;
      }
      if (!collides(n.group.position.x, clampedFlee.z, 0.3)) {
        n.group.position.z = clampedFlee.z;
      }
      
      n.group.rotation.y = Math.atan2(fleeX, fleeZ);
      
      n.armL.rotation.x = Math.sin(t * 18 + n.phase) * 0.8;
      n.armR.rotation.x = -Math.sin(t * 18 + n.phase) * 0.8;
    }
  }
}