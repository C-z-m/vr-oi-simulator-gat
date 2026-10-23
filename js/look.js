'use strict';
/* =========================================================
   look —— FPS 视角 / 指针锁定 / 玩家移动 / 小地图
   （自 index.html 内联脚本拆出）
   ========================================================= */
/* =========================================================
   视角 / 玩家
   ========================================================= */
function applyLook(dt){
  /* 出拳回弹衰减：命中时 kickView 注入的视觉偏移平滑归零 */
  const kr = 1 - Math.exp(-dt * 11);
  recoilPitch += (0 - recoilPitch) * kr;
  recoilYaw   += (0 - recoilYaw)   * kr;

  /* 旋转输入由 mousemove（指针锁定）写入 yawTarget / pitchTarget，
     这里只负责平滑插值与俯仰限位 */
  pitchTarget = clamp(pitchTarget, -1.35, 1.35);

  if (smoothAmount < 0.01){
    state.yaw = yawTarget;
    state.pitch = pitchTarget;
  } else {
    const tau = smoothAmount * 0.16;
    const k = 1 - Math.exp(-dt / Math.max(tau, 0.001));
    state.yaw   += (yawTarget   - state.yaw)   * k;
    state.pitch += (pitchTarget - state.pitch) * k;
  }
}

/* =========================================================
   指针锁定：FPS 式鼠标捕获
   ========================================================= */
const LOOK_VIEWS = new Set(['world']);   // 仅世界视图捕获鼠标（走廊/IDE/面板一律释放）
const MAX_MOUSE_STEP = 80;               // 单次位移钳制（px），防异常跳变
let pointerLocked = false;
let lastLockAt = 0;

function lockElement(){
  return renderer ? renderer.domElement : document.body;
}
function canLockView(){
  return LOOK_VIEWS.has(state.view) && state.started && !state.ended;
}
function requestLock(){
  if (pointerLocked || !renderer || !canLockView()) return;
  const el = lockElement();
  if (!el.requestPointerLock) return;
  try {
    /* 新版 Chrome 返回 Promise；Esc 后短时间内申请会被拒绝，静默即可 */
    const r = el.requestPointerLock();
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch(e){}
}
function releaseLock(){
  if (!pointerLocked) return;
  try { document.exitPointerLock(); } catch(e){}
}

const KEYMAP = {
  KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
  ShiftLeft: 'shift', ShiftRight: 'shift',
};

/* 复用的临时向量，避免每帧 new Vector3 触发 GC */
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();

function updatePlayer(dt){
  updateJump(dt);
  const sprinting = !!state.keys['shift'];
  const speed = sprinting ? 5.0 : 3.1;   // Shift 加速
  _fwd.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  _right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
  _move.set(0, 0, 0);
  if (state.keys['w']) _move.add(_fwd);
  if (state.keys['s']) _move.sub(_fwd);
  if (state.keys['d']) _move.add(_right);
  if (state.keys['a']) _move.sub(_right);

  const moving = _move.lengthSq() > 0;
  lastMoveSpeed = moving ? speed : 0;
  if (moving){
    _move.normalize().multiplyScalar(speed * dt);
    
    // 获取全局边界
    const zb = getZoneBounds();
    // 动态获取区域边界
    const clamped = clampToZone(state.pos.x + _move.x, state.pos.z + _move.z);
    const nx = clamped.x;
    const nz = clamped.z;
    
    // 动态判断跨区（x > 8 算进入街道，x < 7 算回到考场）
    if (nx > 8 && currentZoneId !== 'street') {
      setCurrentZone('street');
    } else if (nx < 7 && currentZoneId !== 'classroom') {
      setCurrentZone('classroom');
    }

    /* 分轴滑动碰撞 */
    const air = !onGround;
    if (air || !collides(nx, state.pos.z, 0.28)) state.pos.x = nx;
    if (air || !collides(state.pos.x, nz, 0.28)) state.pos.z = nz;

    state.bob += dt * (sprinting ? 15 : 11);
    if (Math.sin(state.bob) > 0.96 && Math.random() < 0.4) audio.step();
  } else {
    state.bob += dt * 1.2;
  }
  const bobY = moving ? Math.sin(state.bob) * 0.022 : Math.sin(state.bob) * 0.004;
  camera.position.set(state.pos.x, 1.65 + bobY, state.pos.z);
  camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
  
  camera.rotation.x += recoilPitch;
  camera.rotation.y += recoilYaw;
  applyShake(dt);
}

/* ---------- 跳跃 ---------- */
const JUMP_GRAVITY = 20;          
const JUMP_VELOCITY = 6.4;        
let jumpY = 0, velY = 0, onGround = true;
const _jumpSafe = new THREE.Vector3(0, 0, -2.08);

function tryJump(){
  if (!onGround || state.view !== 'world' || state.ended) return;
  velY = JUMP_VELOCITY;
  onGround = false;
  _jumpSafe.set(state.pos.x, 0, state.pos.z);
  audio.beep(420, 0.05, 0.03, 'triangle');
}

function updateJump(dt){
  if (onGround) return;
  velY -= JUMP_GRAVITY * dt;
  jumpY += velY * dt;
  if (jumpY <= 0){
    jumpY = 0;
    velY = 0;
    onGround = true;
    audio.step();
    
    /* 【核心修复】落点卡进障碍时，不再强行传送回起点，而是智能向周围寻找空地滑出 */
    if (collides(state.pos.x, state.pos.z, 0.28)){
      let found = false;
      for (let r = 0.5; r <= 3.0; r += 0.5) {
        if (!collides(state.pos.x + r, state.pos.z, 0.28)) { state.pos.x += r; found = true; break; }
        if (!collides(state.pos.x - r, state.pos.z, 0.28)) { state.pos.x -= r; found = true; break; }
        if (!collides(state.pos.x, state.pos.z + r, 0.28)) { state.pos.z += r; found = true; break; }
        if (!collides(state.pos.x, state.pos.z - r, 0.28)) { state.pos.z -= r; found = true; break; }
      }
      // 如果四周全堵死了，才无奈退回起跳点
      if (!found) {
        state.pos.x = _jumpSafe.x;
        state.pos.z = _jumpSafe.z;
      }
    }
  }
}

function updatePlayer(dt){
  updateJump(dt);
  const sprinting = !!state.keys['shift'];
  const speed = sprinting ? 5.0 : 3.1;   // Shift 加速
  _fwd.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  _right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
  _move.set(0, 0, 0);
  if (state.keys['w']) _move.add(_fwd);
  if (state.keys['s']) _move.sub(_fwd);
  if (state.keys['d']) _move.add(_right);
  if (state.keys['a']) _move.sub(_right);

  const moving = _move.lengthSq() > 0;
  lastMoveSpeed = moving ? speed : 0;
  if (moving){
    _move.normalize().multiplyScalar(speed * dt);
    
    const clamped = clampToZone(state.pos.x + _move.x, state.pos.z + _move.z);
    const nx = clamped.x;
    const nz = clamped.z;

    /* 分轴滑动碰撞 */
    const air = !onGround;
    if (air || !collides(nx, state.pos.z, 0.28)) state.pos.x = nx;
    if (air || !collides(state.pos.x, nz, 0.28)) state.pos.z = nz;

    state.bob += dt * (sprinting ? 15 : 11);   // 疾走时脚步更急促
    if (Math.sin(state.bob) > 0.96 && Math.random() < 0.4) audio.step();
  } else {
    state.bob += dt * 1.2;
  }
  
  const bobY = moving ? Math.sin(state.bob) * 0.022 : Math.sin(state.bob) * 0.004;
  
  /* 【核心修复】把跳跃高度 jumpY 加上去！相机终于能上天了！ */
  camera.position.set(state.pos.x, 1.65 + bobY + jumpY, state.pos.z);
  camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
  
  camera.rotation.x += recoilPitch;
  camera.rotation.y += recoilYaw;
  applyShake(dt);
}

/* ---------- 紧张态镜头抖动 ----------
   多频率正弦叠加：高频细颤 + 低频摇摆，幅度 ∝ 紧张值 × 移动强度。
   抖动是"吓到手抖"，不是晕动症模拟器，上限刻意压得很小。 */
const SHAKE_MAX = 0.011;          // 最大角偏移（弧度，约 0.63°）
let lastMoveSpeed = 0;
let shakeT = 0;

function applyShake(dt){
  const t = getTension();
  if (t < 0.02 || !shakeEnabled){ lastMoveSpeed = 0; return; }
  shakeT += dt;
  const move = clamp(lastMoveSpeed / 5, 0, 1);
  const amp = SHAKE_MAX * t * (0.30 + 0.70 * move);
  const n1 = Math.sin(shakeT * 37.3) * Math.sin(shakeT * 11.7);
  const n2 = Math.sin(shakeT * 23.1 + 1.3) * Math.sin(shakeT * 7.9 + 0.6);
  camera.rotation.x += (n2 * 0.6 - n1 * 0.4) * amp;
  camera.rotation.y += (n1 * 0.7 + n2 * 0.5) * amp;
}

/* ---------- 出拳视角回弹 ---------- */
let recoilPitch = 0, recoilYaw = 0;
function kickView(pitchAmt, yawAmt){
  recoilPitch = clamp(recoilPitch + pitchAmt, -0.10, 0.10);
  recoilYaw   = clamp(recoilYaw   + yawAmt,   -0.10, 0.10);
}

/* =========================================================
   小地图
   ========================================================= */
let mmFrameSkip = 0;
function drawMinimap(){
  if (++mmFrameSkip % 4 !== 0) return;
  const c = minimap, ctx = mmCtx;
  const W = c.width, H = c.height;
  
  const SCALE = 8.75; // 统一比例尺：8.75 像素/米

  if (currentZoneId === 'street') {
    /* ================= 城市局部战术雷达 ================= */
    const cx = state.pos.x;
    const cz = state.pos.z;
    const tx = x => (W / 2) + (x - cx) * SCALE;
    const ty = z => (H / 2) + (z - cz) * SCALE;

    // 1. 统一底色：人行道/空地（浅灰蓝）
    ctx.fillStyle = '#3a4555'; 
    ctx.fillRect(0, 0, W, H);

    // 2. 绘制车道（深色柏油路）
    const ROAD_X = [20, 60, 100, 140];
    const ROAD_Z = [-50, 0, 50];
    const roadWidth = 14;
    
    ctx.fillStyle = '#556478'; // 调亮的车道 (石板灰)
    for (let x of ROAD_X) {
      const rx = tx(x - roadWidth / 2);
      const rw = roadWidth * SCALE;
      ctx.fillRect(rx, -H, rw, H * 3); 
    }
    for (let z of ROAD_Z) {
      const rz = ty(z - roadWidth / 2);
      const rh = roadWidth * SCALE;
      ctx.fillRect(-W, rz, W * 3, rh);
    }

    // 3. 绘制所有非车辆障碍物（大楼，铁灰色）
    ctx.fillStyle = '#2d3748'; 
    ctx.strokeStyle = '#4a5868'; 
    ctx.lineWidth = 1;
    
    for (const o of obstacles) {
      if (o.active === false) continue;
      if (o.hw > 30 || o.hd > 30) continue; // 过滤边界墙
      
      const ox = tx(o.x);
      const oz = ty(o.z);
      
      const left = ox - o.hw * SCALE;
      const right = ox + o.hw * SCALE;
      const top = oz - o.hd * SCALE;
      const bottom = oz + o.hd * SCALE;
      
      if (right < 0 || left > W || bottom < 0 || top > H) continue;
      
      // 画铁灰大楼并描边
      ctx.fillRect(left, top, right - left, bottom - top);
      if (o.hw >= 10) ctx.strokeRect(left, top, right - left, bottom - top);
    }

    // 4. 绘制车辆（显眼的亮绿色）
    ctx.fillStyle = '#38d39f';
    for (const car of cityCars) {
      if (car.userData.hp <= 0) continue;
      const carx = tx(car.position.x + 8);
      const carz = ty(car.position.z);
      if (carx < -10 || carx > W + 10 || carz < -10 || carz > H + 10) continue;
      
      ctx.beginPath();
      ctx.arc(carx, carz, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. 绘制敌人（红色）
    for (const p of policeUnits) {
      if (p.userData.state === 'down') continue;
      const px = tx(p.group.position.x);
      const pz = ty(p.group.position.z);
      if (px < -10 || px > W + 10 || pz < -10 || pz > H + 10) continue;
      const pulse = 0.7 + 0.3 * Math.sin(performance.now() * 0.01);
      ctx.fillStyle = `rgba(255,68,68,${pulse})`;
      ctx.beginPath(); ctx.arc(px, pz, 3.5, 0, Math.PI * 2); ctx.fill();
    }

    // 6. 绘制路人（黄色）
    ctx.fillStyle = '#ffaa00';
    for (const n of cityNpcs) {
      if (n.userData.state === 'down') continue;
      const nx = tx(n.group.position.x);
      const nz = ty(n.group.position.z);
      if (nx < -10 || nx > W + 10 || nz < -10 || nz > H + 10) continue;
      ctx.beginPath(); ctx.arc(nx, nz, 2, 0, Math.PI * 2); ctx.fill();
    }

    // 7. 绘制玩家
    const cxPx = W / 2;
    const czPx = H / 2;
    ctx.fillStyle = '#5b8cff';
    ctx.beginPath(); ctx.arc(cxPx, czPx, 3.4, 0, Math.PI * 2); ctx.fill();
    
    ctx.strokeStyle = 'rgba(91,140,255,.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cxPx, czPx);
    ctx.lineTo(cxPx - Math.sin(state.yaw) * 9, czPx - Math.cos(state.yaw) * 9);
    ctx.stroke();

  } else {
    /* ================= 传统考场全景模式 ================= */
    ctx.fillStyle = '#3a4555'; // 考场底色
    ctx.fillRect(0, 0, W, H);

    const tx = x => (W / 2) + x * SCALE;
    const ty = z => (H / 2) + z * SCALE;

    // 障碍
    ctx.fillStyle = '#4a5868';
    for (const o of obstacles) {
      if (o.active === false) continue;
      if (o.x > 15 || o.x < -15 || o.z > 15 || o.z < -15) continue; 
      ctx.fillRect(tx(o.x - o.hw), ty(o.z - o.hd), o.hw * 2 * SCALE, o.hd * 2 * SCALE);
    }

    // NPC
    for (const n of npcs) {
      const ud = n.userData;
      if (!ud) continue;
      ctx.fillStyle = '#ffaa00';
      ctx.beginPath(); ctx.arc(tx(n.group.position.x), ty(n.group.position.z), 2.2, 0, Math.PI * 2); ctx.fill();
    }

    // 老师
    if (teacher) {
      ctx.fillStyle = '#ffcc57';
      ctx.beginPath(); ctx.arc(tx(teacher.group.position.x), ty(teacher.group.position.z), 2.8, 0, Math.PI * 2); ctx.fill();
    }

    // 保安
    for (const g of securityGuards) {
      if (!g.userData.alive) continue;
      const pulse = 0.7 + 0.3 * Math.sin(performance.now() * 0.01);
      ctx.fillStyle = `rgba(255,68,68,${pulse})`;
      ctx.beginPath(); ctx.arc(tx(g.group.position.x), ty(g.group.position.z), 3.2, 0, Math.PI * 2); ctx.fill();
    }

    // 玩家
    const px = tx(state.pos.x), py = ty(state.pos.z);
    ctx.fillStyle = '#5b8cff';
    ctx.beginPath(); ctx.arc(px, py, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(91,140,255,.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - Math.sin(state.yaw) * 9, py - Math.cos(state.yaw) * 9);
    ctx.stroke();
  }
}
