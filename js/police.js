'use strict';
/* =========================================================
   police —— 警察兵种系统、移动射击与星级压制
   ========================================================= */

const policeUnits = [];
let policeSpawnTimer = 5.0;

const POLICE_TYPES = {
  cop:     { hp: 1, speed: 3.5, fireRate: 1.5, range: 8,  color: 0x1a2a4a, damage: 1, name: '警察' },
  swat:    { hp: 3, speed: 4.2, fireRate: 1.0, range: 12, color: 0x111111, damage: 1, name: '特警' },
  sniper:  { hp: 1, speed: 2.5, fireRate: 4.5, range: 30, color: 0x2a3a2a, damage: 2, name: '狙击手' },
  army:    { hp: 3, speed: 2.8, fireRate: 0.9, range: 12, color: 0x4a5a3a, damage: 1, name: '军队' }
};

function addWantedKill() {
  if (!state.cityMode) return;
  state.cityMode.killCount = (state.cityMode.killCount || 0) + 1;
  const k = state.cityMode.killCount;
  
  let newLevel = 1;
  if (k >= 15) newLevel = 2;
  if (k >= 30) newLevel = 3;
  if (k >= 45) newLevel = 4;
  if (k >= 60) newLevel = 5;
  
  if (newLevel > state.cityMode.wantedLevel) {
    state.cityMode.wantedLevel = newLevel;
    document.getElementById('wantedHud').textContent = '★'.repeat(newLevel);
    toast(`🚨 通缉等级提升：${newLevel} 星！`, 3000);
    audio.beep(440, 0.2, 0.08, 'sawtooth');
    setTimeout(() => audio.beep(660, 0.3, 0.08, 'sawtooth'), 200);
    policeSpawnTimer = 1.0;
  } else {
    const nextThresh = newLevel * 15;
    toast(`击杀: ${k} / ${nextThresh}`, 1500);
  }
}

function updatePoliceSpawner(dt) {
  if (state.ended || state.cityMode.wantedLevel <= 0) return;
  policeSpawnTimer -= dt;
  
  if (policeSpawnTimer <= 0) {
    const level = state.cityMode.wantedLevel;
    const intervals = [0, 12, 8, 6, 4, 4];
    policeSpawnTimer = intervals[level] || 12;
    
    const alivePolice = policeUnits.filter(p => p.userData.state !== 'down').length;
    const maxPolice = Math.min(level * 2, 8);

    if (alivePolice < maxPolice) {
      spawnPolice(level);
    }
  }
}

function spawnPolice(level) {
  const px = state.pos.x;
  let spawnX, spawnZ, safe = false, tries = 0;
  
  while (!safe && tries < 20) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 30;
    spawnX = state.pos.x + Math.cos(angle) * dist;
    spawnZ = state.pos.z + Math.sin(angle) * dist;
    
    // 修正边界
    if (spawnX < -30 || spawnX > 180 || spawnZ < -50 || spawnZ > 50) {
      tries++;
      continue;
    }
    if (!collides(spawnX, spawnZ, 0.5)) safe = true;
    tries++;
  }

  let typeKey = 'cop';
  if (level === 1 || level === 2) typeKey = 'cop'; 
  else if (level === 3) typeKey = Math.random() < 0.3 ? 'sniper' : 'cop';
  else if (level === 4) typeKey = Math.random() < 0.6 ? 'swat' : 'sniper';
  else if (level >= 5) {
    const r = Math.random();
    if (r < 0.4) typeKey = 'army';
    else if (r < 0.8) typeKey = 'swat';
    else typeKey = 'sniper';
  }

  const cfg = POLICE_TYPES[typeKey];
  
  if (typeKey === 'sniper') {
    safe = false; tries = 0;
    while (!safe && tries < 20) {
      const angle = Math.random() * Math.PI * 2;
      spawnX = px + Math.cos(angle) * 35;
      spawnZ = state.pos.z + Math.sin(angle) * 35;
      if (spawnX > -10 && spawnX < 120 && spawnZ > -50 && spawnZ < 50 && !collides(spawnX, spawnZ, 0.5)) {
        safe = true;
      }
      tries++;
    }
  }

  const p = buildPerson(spawnX, spawnZ, cfg.color, Math.random() * Math.PI * 2, 'stand');
  
  if (typeKey === 'swat') {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.8 }));
    helmet.position.set(0, 1.55, 0.02); p.group.add(helmet);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.1), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    visor.position.set(0, 1.52, 0.12); p.group.add(visor);
  } else if (typeKey === 'sniper') {
    const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1, 4), new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.6 }));
    p.group.add(laser); p.userData.laser = laser;
  } else if (typeKey === 'army') {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 8), new THREE.MeshBasicMaterial({ color: 0x334422 }));
    helmet.position.set(0, 1.55, 0.02); p.group.add(helmet);
  }

  const siren = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
  siren.position.set(0, 1.75, 0); p.group.add(siren);

  p.userData = {
    isPolice: true, type: typeKey, cfg: cfg, hp: cfg.hp,
    state: 'chase', speed: cfg.speed, fireTimer: 1.0 + Math.random(),
    phase: Math.random() * Math.PI * 2, siren: siren,
    path: [], pathIndex: 0, repathTimer: 0
  };
  
  policeUnits.push(p);
  scene.add(p.group);
  
  if (typeKey === 'sniper') toast('🎯 警告：狙击手已就位！', 3000);
  else if (typeKey === 'army') toast('🚨 警告：军队已介入！', 3000);
  else if (typeKey === 'swat') toast('🚨 警告：特警已抵达现场！', 2500);
  else toast('⚠️ 警察来了！', 1500);
  
  audio.beep(600, 0.2, 0.1, 'sawtooth');
}

function policeHasLOS(x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0, dist = Math.hypot(dx, dz);
  if (dist < 0.5) return true; 

  const steps = Math.ceil(dist / 0.1);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (collides(x0 + dx * t, z0 + dz * t, 0.05)) return false;
  }
  return true;
}

function updatePolice(dt, t) {
  if (state.ended) return;
  const px = state.pos.x, pz = state.pos.z;

  for (const p of policeUnits) {
    if (p.userData.siren) p.userData.siren.material.color.setHex(Math.sin(t * 15) > 0 ? 0xff0000 : 0x0000ff);
  }

  for (let i = policeUnits.length - 1; i >= 0; i--) {
    const p = policeUnits[i], ud = p.userData;
    if (ud.state === 'down') continue;

    const dx = px - p.group.position.x, dz = pz - p.group.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    p.group.rotation.y = Math.atan2(dx, dz);

    if (ud.laser) {
      if (policeHasLOS(p.group.position.x, p.group.position.z, px, pz) && dist < 30) {
        ud.laser.visible = true;
        ud.laser.scale.y = dist;
        ud.laser.position.set(0, 1.2, dist / 2);
        ud.laser.rotation.x = Math.PI / 2;
      } else {
        ud.laser.visible = false;
      }
    }

    const canSee = policeHasLOS(p.group.position.x, p.group.position.z, px, pz);
    const shouldMove = (dist > ud.cfg.range || !canSee) && (ud.type !== 'sniper' || dist < 5);

    if (shouldMove) {
      ud.repathTimer -= dt;
      
      if (!canSee || ud.repathTimer <= 0 || !ud.path || ud.pathIndex >= ud.path.length) {
        ud.repathTimer = 0.8;
        const newPath = findPath(p.group.position.x, p.group.position.z, px, pz);
        if (newPath && newPath.length > 0) {
          ud.path = newPath;
          ud.pathIndex = 0;
        } else {
          // 【核心修复】如果算不出路，直接清空路径，逼迫他走下面的“盲目突进”逻辑
          ud.path = [];
        }
      }

      const step = ud.speed * dt;
      
      if (ud.path && ud.pathIndex < ud.path.length) {
        // 走 A* 路径
        for (let lookAhead = Math.min(ud.pathIndex + 4, ud.path.length - 1); lookAhead > ud.pathIndex; lookAhead--) {
          const node = ud.path[lookAhead];
          if (policeHasLOS(p.group.position.x, p.group.position.z, node.x, node.z)) {
            ud.pathIndex = lookAhead;
            break;
          }
        }
        const targetNode = ud.path[ud.pathIndex];
        const ndx = targetNode.x - p.group.position.x, ndz = targetNode.z - p.group.position.z;
        const ndist = Math.hypot(ndx, ndz);

        if (ndist < 0.3) {
          ud.pathIndex++; 
        } else {
          const nx = p.group.position.x + (ndx / ndist) * step;
          const nz = p.group.position.z + (ndz / ndist) * step;
          if (!collides(nx, p.group.position.z, 0.2)) p.group.position.x = nx;
          if (!collides(p.group.position.x, nz, 0.2)) p.group.position.z = nz;
        }
      } else {
        // 【核心修复】如果 A* 失败（比如目标点不可达），不罚站，直接朝玩家盲冲！
        const dxNorm = dx / dist;
        const dzNorm = dz / dist;
        
        const nx = p.group.position.x + dxNorm * step;
        const nz = p.group.position.z + dzNorm * step;
        if (!collides(nx, p.group.position.z, 0.2)) p.group.position.x = nx;
        if (!collides(p.group.position.x, nz, 0.2)) p.group.position.z = nz;
      }
      
      p.group.position.x = clamp(p.group.position.x, -25, 185);
      p.group.position.z = clamp(p.group.position.z, -105, 105);
      
      p.armL.rotation.x = Math.sin(t * 12) * 0.5;
      p.armR.rotation.x = -Math.sin(t * 12) * 0.5;
    } else {
      p.armL.rotation.x = -1.57;
      p.armR.rotation.x = -1.57;
      
      ud.fireTimer -= dt;
      if (ud.fireTimer <= 0) {
        ud.fireTimer = ud.cfg.fireRate * (0.8 + Math.random() * 0.4);
        if (ud.type === 'sniper') {
          audio.beep(1200, 0.1, 0.05, 'square');
          setTimeout(() => fireAtPlayer(p, dist), 300);
        } else {
          fireAtPlayer(p, dist);
        }
      }
    }
  }
}

function fireAtPlayer(p, dist) {
  audio.gun();
  const flash = new THREE.PointLight(0xffaa00, 2, 5);
  flash.position.copy(p.group.position); flash.position.y += 1.4;
  scene.add(flash); setTimeout(() => scene.remove(flash), 50);

  let hitChance = 0.4;
  if (p.userData.type === 'sniper') hitChance = 0.8;
  if (p.userData.type === 'army') hitChance = 0.5;

  if (Math.random() < hitChance) {
    if (state.hp > 0) {
      state.hp -= p.userData.cfg.damage;
      renderHp();
      
      const rf = document.getElementById('redFlash');
      if (rf) {
        rf.style.opacity = p.userData.cfg.damage > 1 ? '0.9' : '0.6';
        setTimeout(() => rf.style.opacity = '0', 150);
      }
      
      audio.beep(150, 0.2, 0.1, 'sawtooth');
      toast(p.userData.type === 'sniper' ? '你被狙击手击中了！' : '你中枪了！', 1000);
      
      if (state.hp <= 0) {
        state.ended = true;
        releaseLock();
        showEnding(0, '你在街头与警方的交火中倒下了……\n\n警笛声是你听到的最后声音。\n\nGAT 行动，到此为止。');
      }
    }
  }
}