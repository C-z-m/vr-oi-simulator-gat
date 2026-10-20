'use strict';
/* =========================================================
   gun —— 手枪：全自动射击 / 换弹 / 拾取 / 弹着点
   ========================================================= */

/* ---------- 数值（都在这里，方便手调） ---------- */
const GUN_MAG_SIZE          = 12;      // 弹匣容量
const GUN_RESERVE_MAX       = 72;      // 备弹上限
const GUN_START_RESERVE     = 36;      // 首次拿到枪时的备弹
const GUN_SPREAD            = 0.045;   // 散布半角（rad，约 2.6°）
const GUN_RANGE             = 14;      // 有效射程（m）
const GUN_HIT_RADIUS        = 0.42;    // 人体横向半径
const GUN_MIN_DIST          = 0.25;    // 比这还近不判命中
const GUN_BODY_Y_MIN        = 0.12;    
const GUN_BODY_Y_MAX        = 1.98;
const GUN_COOLDOWN          = 0.1;     // 射速间隔（s），0.1 = 全自动 10发/秒
const GUN_RELOAD_TIME       = 1.25;    // 换弹耗时（s）
const GUN_KILL_AMMO         = 3;       
const GUN_KILL_AMMO_CHANCE  = 0.25;
const GUN_PICKUP_AMMO       = 6;       
const GUN_CACHE_AMMO        = 24;      
const GUN_LOW_AMMO          = 3;       
const GUN_MASTER_KILLS      = 50;      
const GUN_RECOIL_PITCH      = 0.035;   
const GUN_MUZZLE_MS         = 45;      
const GUN_IMPACT_POOL       = 10;      
const GUN_IMPACT_LIFE       = 8;       
const GUN_IMPACT_FADE       = 2;       
const GUN_IMPACT_OPACITY    = 0.85;
const GUN_LOS_STEP          = 0.4;
const GUN_LOS_RADIUS        = 0.02;
const GUN_LOS_MARGIN        = 0.45;    
const GUN_TARGET_MARGIN     = 0.50;    
const GUN_VM_X = 0.20, GUN_VM_Y = -0.19, GUN_VM_Z = -0.42;
const GUN_VM_ROTY = -0.10;

/* ---------- 运行时状态 ---------- */
const gun = {
  owned: false, equipped: false,
  mag: 0, reserve: 0,
  reloading: false, reloadEnd: 0, nextShotAt: 0,
  shots: 0, kills: 0,
  kick: 0,              
  targetAhead: false    
};

let gunGroup = null, gunFlash = null, gunRay = null;
let gunFlashUntil = 0;
let gunImpacts = [], gunImpactIdx = 0;
let ammoHudEl = null, ammoHudKey = '';
let pistolDrop = null;      
let _gunVecA = null, _gunVecB = null, _gunVecC = null, _gunVecD = null;
let lastDryFireAt = 0; // 防止空枪提示刷屏

/* =========================================================
   纯函数与查询
   ========================================================= */
function gunSpreadOffset(){
  return {
    yaw:   (Math.random() * 2 - 1) * GUN_SPREAD,
    pitch: (Math.random() * 2 - 1) * GUN_SPREAD
  };
}

function gunForward(yaw, pitch, out){
  const cp = Math.cos(pitch);
  const x = -Math.sin(yaw) * cp;
  const y =  Math.sin(pitch);
  const z = -Math.cos(yaw) * cp;
  if (out){ out.set(x, y, z); return out; }
  return { x, y, z };
}

function gunRayHitsBody(dx, dz, fx, fz, slope, eyeY, radius){
  const dh = Math.hypot(dx, dz);
  if (dh < GUN_MIN_DIST || dh > GUN_RANGE) return 0;
  const cosA = (fx * dx + fz * dz) / dh;
  if (cosA < Math.cos(Math.atan2(radius, dh))) return 0;
  const yAt = eyeY + slope * dh;
  if (yAt < GUN_BODY_Y_MIN || yAt > GUN_BODY_Y_MAX) return 0;
  return dh;
}

function gunLossClear(x0, z0, x1, z1){
  const dx = x1 - x0, dz = z1 - z0;
  const d = Math.hypot(dx, dz);
  const from = GUN_LOS_MARGIN, to = d - GUN_TARGET_MARGIN;
  if (to <= from) return true;                 
  const steps = Math.max(1, Math.ceil((to - from) / GUN_LOS_STEP));
  for (let i = 0; i <= steps; i++){
    const t = (from + (to - from) * (i / steps)) / d;
    if (collides(x0 + dx * t, z0 + dz * t, GUN_LOS_RADIUS)) return false;
  }
  return true;
}

function gunPickTarget(origin, dir){
  const hl = Math.hypot(dir.x, dir.z);
  if (hl < 1e-5) return null;
  const fx = dir.x / hl, fz = dir.z / hl;
  const slope = dir.y / hl;

  let best = null, bestD = Infinity;
  const consider = (pos, kind, payload) => {
    if (!pos) return;
    const dx = pos.x - origin.x, dz = pos.z - origin.z;
    const d = gunRayHitsBody(dx, dz, fx, fz, slope, origin.y, GUN_HIT_RADIUS);
    if (!d || d >= bestD) return;
    if (!gunLossClear(origin.x, origin.z, pos.x, pos.z)) return;
    bestD = d;
    best = { kind, payload, dist: d };
  };

  // 1. 活物判定
  for (let i = 0; i < securityGuards.length; i++){
    const g = securityGuards[i];
    if (g.userData.alive) consider(g.group.position, 'guard', g);
  }
  if (teacher && !teacher.userData.leaving) consider(teacher.group.position, 'teacher', teacher);
  
  if (state.teacherDown){
    for (let i = 0; i < npcs.length; i++){
      const n = npcs[i], ud = n.userData;
      if (ud && ud.state !== 'down') consider(n.group.position, 'npc', n);
    }
  }

  if (typeof cityNpcs !== 'undefined') {
    for (let i = 0; i < cityNpcs.length; i++){
      const n = cityNpcs[i], ud = n.userData;
      if (ud && ud.state !== 'down') consider(n.group.position, 'cityNpc', n);
    }
  }

  if (typeof policeUnits !== 'undefined') {
    for (let i = 0; i < policeUnits.length; i++){
      const n = policeUnits[i], ud = n.userData;
      if (ud && ud.state !== 'down') consider(n.group.position, 'police', n);
    }
  }

  // 2. 车辆判定（直接用 THREE.Raycaster 物理检测，绝对不漏判）
  if (typeof cityCars !== 'undefined') {
    if (!gunRay) gunRay = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3(origin.x, origin.y, origin.z);
    const rayDir = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
    gunRay.set(rayOrigin, rayDir);
    gunRay.far = GUN_RANGE;
    gunRay.layers.set(0); 
    
    for (let i = 0; i < cityCars.length; i++) {
      const car = cityCars[i];
      if (car.userData.hp <= 0) continue;
      
      const intersects = gunRay.intersectObject(car, true);
      if (intersects.length > 0) {
        const dist = intersects[0].distance;
        if (dist < bestD) {
          bestD = dist;
          best = { kind: 'car', payload: car, dist: dist };
        }
      }
    }
  }

  return best;
}

function gunIsUp(){
  return !!(state.gun && state.gun.owned && state.gun.equipped);
}

function gunVisible(){
  return gunIsUp()
    && state.view === 'world'
    && state.started && !state.ended
    && !hasDialog();
}

function gunTargetAhead(){
  if (!gunIsUp()) return false;
  const dir = gunForward(state.yaw, state.pitch);
  return !!gunPickTarget({ x: state.pos.x, y: state.pos.y, z: state.pos.z }, dir);
}

/* =========================================================
   开火与命中
   ========================================================= */
function dryFire(){
  const now = performance.now();
  if (now - lastDryFireAt < 400) return; // 全自动模式下防止狂响
  lastDryFireAt = now;
  audio.beep(150, 0.04, 0.05, 'square');
  toast(gun.reserve > 0
    ? '\u{1F52B} 咔——弹匣空了（R 换弹）'
    : '\u{1F52B} 咔——一发子弹都没有了', 1300);
}

function fireGun(){
  if (state.view !== 'world' || !state.started || state.ended || state.frozen) return false;
  if (hasDialog()) return false;
  if (!gunIsUp()) return false;

  const now = performance.now();
  if (gun.reloading) return false;
  if (now < gun.nextShotAt) return false;
  if (gun.mag <= 0){ dryFire(); return false; }

  gun.nextShotAt = now + GUN_COOLDOWN * 1000;
  gun.mag--;
  gun.shots++;

  const sp = gunSpreadOffset();
  const dir = gunForward(state.yaw + sp.yaw,
                         clamp(state.pitch + sp.pitch, -1.45, 1.45));
  const origin = { x: state.pos.x, y: state.pos.y, z: state.pos.z };

  const hit = gunPickTarget(origin, dir);
  if (hit) resolveGunHit(hit);
  else     gunImpact(origin, dir);

  flashMuzzle();
  audio.gun();
  kickView(GUN_RECOIL_PITCH, (Math.random() - 0.5) * 0.03);
  gun.kick = 1;
  updateAmmoHud();
  return true;
}

function resolveGunHit(hit){
  if (hit.kind === 'guard'){
    gun.kills++;
    const survived = killGuard(hit.payload);   
    if (Math.random() < GUN_KILL_AMMO_CHANCE) addAmmo(GUN_KILL_AMMO);
    checkGuardKillMilestones(state.guardKills);
    maybeGuardWarning();
    if (gun.kills === 1) unlockAch('gun_first');
    if (gun.kills >= GUN_MASTER_KILLS) unlockAch('gun_master');
    if (survived && !state.ended){
      setTimeout(() => { if (!state.ended) spawnTwoGuards(); }, 900);
    }
  } else if (hit.kind === 'teacher'){
    downTeacher('gun');
  } else if (hit.kind === 'npc'){
    downNPC(hit.payload);
  } else if (hit.kind === 'cityNpc') {
    spawnBodyDebris(hit.payload.group, { speed: 4.0 });
    scene.remove(hit.payload.group);
    hit.payload.userData.state = 'down';
    toast('你开枪击倒了一名路人。', 1500);
    if (typeof addWantedKill === 'function') addWantedKill();
  } else if (hit.kind === 'police') {
    const police = hit.payload;
    police.userData.hp--; // 扣血
    
    if (police.userData.hp > 0) {
      // 没死，后退一步并提示
      audio.beep(400, 0.05, 0.05, 'square');
      toast(`${police.userData.cfg.name}挡住了子弹！`, 800);
      const dx = police.group.position.x - state.pos.x;
      const dz = police.group.position.z - state.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      police.group.position.x += (dx / d) * 0.3;
      police.group.position.z += (dz / d) * 0.3;
    } else {
      // 死了
      if (typeof spawnBodyDebris === 'function') spawnBodyDebris(police.group, { speed: 4.5 });
      if (police.group.parent) police.group.parent.remove(police.group);
      police.userData.state = 'down';
      toast(`你击毙了一名${police.userData.cfg.name}！`, 1500);
      if (typeof addWantedKill === 'function') addWantedKill();
    }
  } else if (hit.kind === 'car') {
    const car = hit.payload;
    car.userData.hp -= 25; // 4枪打爆
    audio.beep(300, 0.05, 0.05, 'square');
    if (car.userData.hp <= 0) {
      explodeCar(car);
    } else {
      toast('车身冒出火花！', 800);
      // 把车晃一下
      car.rotation.z = (Math.random() - 0.5) * 0.1;
      setTimeout(() => { car.rotation.z = 0; }, 100);
    }
  }
  updateAmmoHud();
}

function flashMuzzle(){
  if (!gunFlash) return;
  gunFlash.material.opacity = 0.95;
  gunFlash.rotation.z = Math.random() * Math.PI;
  gunFlash.scale.setScalar(0.8 + Math.random() * 0.5);
  gunFlashUntil = performance.now() + GUN_MUZZLE_MS;
}

function gunImpact(origin, dir){
  if (!gunRay || !gunImpacts.length) return;
  _gunVecA.set(origin.x, origin.y, origin.z);
  _gunVecB.set(dir.x, dir.y, dir.z).normalize();
  gunRay.set(_gunVecA, _gunVecB);
  const hits = gunRay.intersectObjects(scene.children, true);
  if (!hits.length || !hits[0].face) return;

  const h = hits[0];
  _gunVecC.copy(h.face.normal).transformDirection(h.object.matrixWorld).normalize();
  const slot = gunImpacts[gunImpactIdx = (gunImpactIdx + 1) % gunImpacts.length];
  slot.mesh.position.copy(h.point).addScaledVector(_gunVecC, 0.012);
  _gunVecD.copy(h.point).add(_gunVecC);
  slot.mesh.lookAt(_gunVecD);
  slot.mesh.visible = true;
  slot.mesh.material.opacity = GUN_IMPACT_OPACITY;
  slot.life = GUN_IMPACT_LIFE;
}

/* =========================================================
   弹药 / 换弹 / 切换
   ========================================================= */
function addAmmo(n){
  const before = gun.reserve;
  gun.reserve = Math.min(GUN_RESERVE_MAX, gun.reserve + n);
  ammoHudKey = '';
  updateAmmoHud();
  return gun.reserve - before;
}

function finishReload(){
  const take = Math.min(GUN_MAG_SIZE - gun.mag, gun.reserve);
  gun.mag += take;
  gun.reserve -= take;
  gun.reloading = false;
  ammoHudKey = '';
  audio.beep(520, 0.07, 0.045, 'square');
  updateAmmoHud();
}

function reloadGun(){
  if (state.ended || !gunIsUp() || gun.reloading) return false;
  if (gun.mag >= GUN_MAG_SIZE){ toast('弹匣是满的。', 1000); return false; }
  if (gun.reserve <= 0){ toast('没有备用子弹了。', 1400); return false; }
  gun.reloading = true;
  gun.reloadEnd = performance.now() + GUN_RELOAD_TIME * 1000;
  ammoHudKey = '';
  audio.beep(300, 0.06, 0.04, 'square');
  setTimeout(() => { if (gun.reloading) audio.beep(420, 0.06, 0.04, 'square'); }, 620);
  updateAmmoHud();
  return true;
}

function toggleWeapon(){
  if (state.view !== 'world' || state.ended || !state.started) return false;
  if (!gun.owned){ toast('你还没有枪。', 1200); return false; }
  gun.equipped = !gun.equipped;
  gun.reloading = false;
  ammoHudKey = '';
  audio.beep(gun.equipped ? 700 : 380, 0.06, 0.04, 'square');
  toast(gun.equipped ? '\u{1F52B} 你握紧了那把旧枪。' : '\u{1F52B} 你把枪收了起来。', 1200);
  updateAmmoHud();
  return true;
}

function acquirePistol(){
  const first = !gun.owned;
  gun.owned = true;
  gun.equipped = true;
  gun.reloading = false;
  if (first){
    gun.mag = GUN_MAG_SIZE;
    gun.reserve = GUN_START_RESERVE;
  }
  ammoHudKey = '';
  if (gunGroup) gunGroup.visible = true;
  audio.beep(300, 0.08, 0.05, 'square');
  setTimeout(() => audio.beep(520, 0.07, 0.05, 'square'), 110);
  updateAmmoHud();
  return first;
}

/* =========================================================
   HUD
   ========================================================= */
function updateAmmoHud(){
  if (!ammoHudEl) return;
  const show = gunVisible();
  ammoHudEl.classList.toggle('hidden', !show);
  if (!show){ ammoHudKey = ''; return; }
  const key = gun.reloading ? 'reload' : gun.mag + '/' + gun.reserve;
  if (key === ammoHudKey) return;
  ammoHudKey = key;
  ammoHudEl.innerHTML = gun.reloading
    ? '\u{1F52B} <b>换弹中…</b>'
    : `\u{1F52B} <b>${gun.mag}</b> / ${gun.reserve}`;
  ammoHudEl.classList.toggle('low', !gun.reloading && gun.mag <= GUN_LOW_AMMO);
}

/* =========================================================
   拾取与初始化
   ========================================================= */
function dropPistol(x, z){
  if (pistolDrop) return;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  scene.add(g);

  const body = new THREE.Mesh(
    getBoxGeo(0.26, 0.05, 0.06),
    mat(0x2a2e36, { roughness: 0.45, metalness: 0.45 })
  );
  body.position.set(0, 0.03, 0);
  body.rotation.y = 0.5;
  body.userData.interact = { label: '捡起手枪', action: pickUpPistol };
  g.add(body);

  const note = new THREE.Mesh(
    new THREE.PlaneGeometry(0.13, 0.17),
    mat(0xf2eee3, { roughness: 0.95, side: THREE.DoubleSide })
  );
  note.rotation.x = -Math.PI / 2;
  note.rotation.z = 0.3;
  note.position.set(0.16, 0.008, 0.06);
  g.add(note);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.30, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffcc57, transparent: true, opacity: 0.32,
      side: THREE.DoubleSide, depthWrite: false
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  ring.renderOrder = 2;
  g.add(ring);

  interactables.push(body);
  pistolDrop = { group: g, body, ring, t: 0 };
}

function pickUpPistol(){
  if (!pistolDrop) return;
  const d = pistolDrop;
  pistolDrop = null;
  scene.remove(d.group);
  const i = interactables.indexOf(d.body);
  if (i >= 0) interactables.splice(i, 1);

  if (!gun.owned){
    acquirePistol();
    storyBeat('gun_taken');
  } else {
    const got = addAmmo(GUN_PICKUP_AMMO);
    toast(got > 0
      ? `\u{1F9F0} 纸条下面还压着 ${got} 发子弹。`
      : '\u26A0 你已经有一把枪了。', 2200);
  }
}

function bathroomSecret(){
  if (!gun.owned){
    toast('\u{1F9F0} 镜子上方的检修口里塞着一个油纸包……', 2600);
    acquirePistol();
    storyBeat('gun_taken');
  } else {
    const got = addAmmo(GUN_CACHE_AMMO);
    toast(got > 0
      ? `\u{1F9F0} 检修口里还有一个油纸包——${got} 发子弹。`
      : '\u{1F9F0} 检修口里只剩一个空油纸包。', 2400);
    audio.beep(660, 0.08, 0.04);
  }
  bathroomStepIdx++;
  bathroomHold = 0;
  updateBathroomUI();
}

function gunPart(w, h, d, color, x, y, z, parent, opts){
  const m = new THREE.Mesh(getBoxGeo(w, h, d), mat(color, opts));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function buildGunViewModel(){
  const g = new THREE.Group();
  g.position.set(GUN_VM_X, GUN_VM_Y, GUN_VM_Z);
  g.rotation.set(0, GUN_VM_ROTY, 0);

  const dark = 0x2b2f38, darker = 0x1d2028;

  gunPart(0.052, 0.050, 0.200, dark, 0, 0, -0.045, g,
          { roughness: 0.42, metalness: 0.55 });
  for (let i = 0; i < 4; i++){
    gunPart(0.056, 0.010, 0.006, darker, 0, 0.012, 0.020 - i * 0.016, g,
            { roughness: 0.6 });
  }
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.011, 0.011, 0.055, 10),
    mat(0x14161c, { roughness: 0.35, metalness: 0.7 })
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, -0.168);
  g.add(barrel);
  
  const grip = gunPart(0.046, 0.135, 0.058, darker, 0, -0.088, 0.052, g,
                       { roughness: 0.7 });
  grip.rotation.x = 0.22;
  
  gunPart(0.030, 0.030, 0.020, dark, 0, -0.040, 0.018, g, { roughness: 0.6 });
  gunPart(0.030, 0.010, 0.010, darker, 0, 0.030, 0.040, g);
  gunPart(0.008, 0.012, 0.008, darker, 0, 0.030, -0.138, g);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.16),
    new THREE.MeshBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0,
      depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending
    })
  );
  flash.position.set(0, 0, -0.205);
  flash.renderOrder = 1001;
  g.add(flash);

  g.traverse(o => { o.layers.set(1); });
  camera.add(g);
  return { group: g, flash };
}

function initGunImpacts(){
  const geo = new THREE.PlaneGeometry(0.055, 0.055);
  for (let i = 0; i < GUN_IMPACT_POOL; i++){
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0x0d0f14, transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide
    }));
    m.visible = false;
    m.renderOrder = 2;
    m.raycast = function(){};   
    scene.add(m);
    gunImpacts.push({ mesh: m, life: 0 });
  }
}

function initGun(){
  state.gun = gun;
  ammoHudEl = document.getElementById('ammoHud');

  const vm = buildGunViewModel();
  gunGroup = vm.group;
  gunFlash = vm.flash;
  gunGroup.visible = false;

  _gunVecA = new THREE.Vector3();
  _gunVecB = new THREE.Vector3();
  _gunVecC = new THREE.Vector3();
  _gunVecD = new THREE.Vector3();

  gunRay = new THREE.Raycaster();
  gunRay.near = 0.05;
  gunRay.far = GUN_RANGE;
  gunRay.layers.set(0);

  initGunImpacts();
}

function updateGun(dt){
  if (!state.gun) return;

  if (gun.reloading && performance.now() >= gun.reloadEnd) finishReload();

  if (gunFlash && gunFlashUntil && performance.now() > gunFlashUntil){
    gunFlash.material.opacity = 0;
    gunFlashUntil = 0;
  }

  for (let i = 0; i < gunImpacts.length; i++){
    const im = gunImpacts[i];
    if (im.life <= 0) continue;
    im.life -= dt;
    if (im.life <= 0){
      im.mesh.visible = false;
      im.mesh.material.opacity = 0;
      continue;
    }
    im.mesh.material.opacity = GUN_IMPACT_OPACITY * Math.min(1, im.life / GUN_IMPACT_FADE);
  }

  if (pistolDrop){
    pistolDrop.t += dt;
    pistolDrop.ring.rotation.z += dt * 0.7;
    pistolDrop.ring.material.opacity = 0.22 + 0.20 * (0.5 + 0.5 * Math.sin(pistolDrop.t * 3));
  }

  if (gunGroup){
    gun.kick = Math.max(0, gun.kick - dt * 9);
    const swayX = Math.sin(state.bob) * 0.004;
    const swayY = Math.sin(state.bob * 2) * 0.003;
    gunGroup.position.set(GUN_VM_X + swayX,
                          GUN_VM_Y + swayY - gun.kick * 0.012,
                          GUN_VM_Z + gun.kick * 0.045);
    gunGroup.rotation.set(gun.kick * 0.30, GUN_VM_ROTY, gun.kick * 0.06);
    gunGroup.visible = gunVisible();
  }

  gun.targetAhead = gunTargetAhead();
  updateAmmoHud();
}