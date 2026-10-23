'use strict';
/* =========================================================
   driving —— 经典WASD载具驾驶系统（自由环绕第三人称版）
   ========================================================= */

let drivingState = {
  isDriving: false,
  car: null,
  speed: 0,
  cooldownEnd: 0
};

function enterCar(car) {
  if (drivingState.isDriving) return;
  if (car.userData.hp <= 0) return;
  
  drivingState.isDriving = true;
  drivingState.car = car;
  drivingState.speed = 0;
  
  if (car.userData.obsRef) car.userData.obsRef.active = false;
  
  state.pos.x = car.position.x + 8;
  state.pos.z = car.position.z;
  
  // 初始视角对齐车头，稍微向下俯视
  state.yaw = car.rotation.y;
  state.pitch = -0.15; 
  yawTarget = state.yaw;
  pitchTarget = -0.15;
  
  if (typeof gunGroup !== 'undefined' && gunGroup) gunGroup.visible = false;
  toast('🚗 驾驶中：W/S 油门倒车，A/D 转向，鼠标自由环顾', 3000);
  audio.beep(300, 0.1, 0.05, 'square');
}

function exitCar() {
  if (!drivingState.isDriving) return;
  
  const car = drivingState.car;
  drivingState.isDriving = false;
  drivingState.car = null;
  drivingState.cooldownEnd = performance.now() + 1500;
  
  if (car.userData.obsRef) car.userData.obsRef.active = true;
  
  state.pos.x = car.position.x + 8 + 2.5;
  state.pos.z = car.position.z;
  // 下车恢复第一人称高度
  state.pos.y = 1.65; 
  
  toast('你下了车。', 1500);
  audio.beep(300, 0.1, 0.05, 'square');
  if (typeof gunGroup !== 'undefined' && gunGroup) gunGroup.visible = gunVisible();
}

function updateDriving(dt) {
  if (!drivingState.isDriving || state.ended) return;
  
  const car = drivingState.car;
  if (!car.parent) { exitCar(); return; }

  // 1. W/S 油门与刹车
  const maxSpeed = 16.0;
  const accel = 12.0;
  if (state.keys['w']) {
    drivingState.speed += accel * dt;
  } else if (state.keys['s']) {
    drivingState.speed -= accel * dt;
  } else {
    drivingState.speed *= Math.max(0, 1 - 3 * dt);
  }
  drivingState.speed = clamp(drivingState.speed, -8, maxSpeed);

  // 2. A/D 左右转（只影响车身朝向，不影响鼠标视角）
  const turnSpeed = 2.5;
  if (Math.abs(drivingState.speed) > 0.1) {
    if (state.keys['a']) car.rotation.y += turnSpeed * dt * (drivingState.speed > 0 ? 1 : -1);
    if (state.keys['d']) car.rotation.y -= turnSpeed * dt * (drivingState.speed > 0 ? 1 : -1);
  }

  // 3. 按照车头朝向计算位移
  const dx = -Math.sin(car.rotation.y) * drivingState.speed * dt;
  const dz = -Math.cos(car.rotation.y) * drivingState.speed * dt;
  
  const nx = state.pos.x + dx;
  const nz = state.pos.z + dz;

  // 4. 碰撞检测
  let hitWall = false;
  if (collides(nx, state.pos.z, 1.0, 0.5)) hitWall = true;
  if (collides(state.pos.x, nz, 1.0, 0.5)) hitWall = true;

  if (hitWall) {
    if (Math.abs(drivingState.speed) > 5.0) {
      audio.punch();
      toast('🚗 车辆发生剧烈碰撞！', 1500);
      state.hp -= 1;
      if (typeof renderHp === 'function') renderHp();
      const rf = document.getElementById('redFlash');
      if (rf) { rf.style.opacity = '0.5'; setTimeout(() => rf.style.opacity = '0', 200); }
      
      if (state.hp <= 0) {
        state.ended = true;
        if (typeof releaseLock === 'function') releaseLock();
        if (typeof showEnding === 'function') showEnding(0, '你死于车祸。\n\nGAT 行动，到此为止。');
        return;
      }
    }
    drivingState.speed = 0;
  } else {
    state.pos.x = nx;
    state.pos.z = nz;
  }

  // 把坐标同步给车（减去局部偏移）
  car.position.x = state.pos.x - 8;
  car.position.z = state.pos.z;

  // 5. 碾压判定
  if (Math.abs(drivingState.speed) > 2.0) {
    if (typeof policeUnits !== 'undefined') {
      for (const p of policeUnits) {
        if (p.userData.state === 'down') continue;
        const dist = Math.hypot(p.group.position.x - state.pos.x, p.group.position.z - state.pos.z);
        if (dist < 2.5) {
          if (typeof spawnBodyDebris === 'function') spawnBodyDebris(p.group, { speed: 8.0 });
          if (p.group.parent) p.group.parent.remove(p.group);
          p.userData.state = 'down';
          toast('🚗 你碾过了一名敌人！', 1500);
          if (typeof addWantedKill === 'function') addWantedKill();
          audio.punch();
        }
      }
    }
    if (typeof cityNpcs !== 'undefined') {
      for (const n of cityNpcs) {
        if (n.userData.state === 'down') continue;
        const dist = Math.hypot(n.group.position.x - state.pos.x, n.group.position.z - state.pos.z);
        if (dist < 2.5) {
          if (typeof spawnBodyDebris === 'function') spawnBodyDebris(n.group, { speed: 8.0 });
          if (n.group.parent) n.group.parent.remove(n.group);
          n.userData.state = 'down';
        }
      }
    }
  }

  // 6. 【核心修复】第三人称自由环绕视角
  const camDist = 9; // 相机离车 9 米，稍微高一点看着舒服
  
  // 相机的 XZ 坐标由鼠标视线 (state.yaw) 计算得出
  const camX = state.pos.x + Math.sin(state.yaw) * camDist * Math.cos(state.pitch);
  const camZ = state.pos.z + Math.cos(state.yaw) * camDist * Math.cos(state.pitch);
  
  // 鼠标抬头时相机往下沉，鼠标低头时相机往上升（看车顶）
  const camY = Math.max(0.5, state.pos.y + 1.5 - Math.sin(state.pitch) * camDist);
  
  camera.position.set(camX, camY, camZ);
  
  // 视线死死咬住车身中心
  camera.lookAt(state.pos.x, state.pos.y, state.pos.z);
}