'use strict';
/* =========================================================
   helicopter —— 直升机 (第三人称高空自由环绕视角)
   ========================================================= */

let heliGroup = null;
let heliRotor = null;
const heliState = {
  spawned: false,
  isDriving: false,
  y: 0,
  speed: 0,
  isUp: false,
  isDown: false
};

// 专属直升机的升降监听
window.addEventListener('keydown', e => {
  if (heliState.isDriving) {
    if (e.code === 'Space') heliState.isUp = true;
    if (e.code === 'ShiftLeft') heliState.isDown = true;
  }
});
window.addEventListener('keyup', e => {
  if (heliState.isDriving) {
    if (e.code === 'Space') heliState.isUp = false;
    if (e.code === 'ShiftLeft') heliState.isDown = false;
  }
});

function spawnHelicopter(x, y, z) {
  if (heliState.spawned) return;
  heliState.spawned = true;
  heliState.y = y;
  
  heliGroup = new THREE.Group();
  heliGroup.position.set(x - 8, y, z);
  streetGroup.add(heliGroup);

  const body = new THREE.Mesh(getBoxGeo(2, 1.5, 4.5), mat(0x111111, { metalness: 0.8, roughness: 0.3 }));
  heliGroup.add(body);

  const glass = new THREE.Mesh(getBoxGeo(1.8, 1, 1.5), mat(0x334455, { transparent: true, opacity: 0.6 }));
  glass.position.set(0, 0.2, -1.2);
  heliGroup.add(glass);

  const tail = new THREE.Mesh(getBoxGeo(0.5, 0.5, 3), mat(0x111111));
  tail.position.set(0, 0, 3.5);
  heliGroup.add(tail);

  heliRotor = new THREE.Group();
  heliRotor.position.set(0, 1.0, 0);
  const blade1 = new THREE.Mesh(getBoxGeo(8, 0.1, 0.3), mat(0x222222));
  const blade2 = new THREE.Mesh(getBoxGeo(0.3, 0.1, 8), mat(0x222222));
  heliRotor.add(blade1); heliRotor.add(blade2);
  heliGroup.add(heliRotor);

  const tailRotor = new THREE.Mesh(getBoxGeo(0.2, 2, 0.1), mat(0x222222));
  tailRotor.position.set(0.3, 0.5, 4.8);
  heliGroup.add(tailRotor);

  addObstacle(x, z, 2, 2, 2, y);
}

function enterHelicopter() {
  if (heliState.isDriving) return;
  heliState.isDriving = true;
  heliState.speed = 0;
  heliState.isUp = false;
  heliState.isDown = false;
  
  state.pos.x = heliGroup.position.x + 8;
  state.pos.z = heliGroup.position.z;
  state.pos.y = heliState.y; 
  
  // 初始视角微微向下，方便看地面
  state.pitch = -0.3;
  pitchTarget = -0.3;
  
  if (typeof gunGroup !== 'undefined' && gunGroup) gunGroup.visible = false;
  toast('🚁 驾驶中：鼠标环顾，W/S 前后，A/D 侧飞，空格上升，Shift 下降', 4000);
  audio.beep(200, 0.5, 0.1, 'sawtooth');
}

function exitHelicopter() {
  if (!heliState.isDriving) return;
  heliState.isDriving = false;
  
  heliState.y = state.pos.y;
  heliGroup.position.set(state.pos.x - 8, heliState.y, state.pos.z);
  heliGroup.rotation.y = state.yaw;
  
  toast('你跳出了直升机！', 2000);
  if (typeof gunGroup !== 'undefined' && gunGroup) gunGroup.visible = gunVisible();
}

function updateHelicopter(dt) {
  if (!heliGroup || !heliRotor) return;
  
  heliRotor.rotation.y += dt * 30; 
  
  if (!heliState.isDriving) return;

  // 1. 高度控制
  if (heliState.isUp) heliState.speed = 15;
  else if (heliState.isDown) heliState.speed = -15;
  else heliState.speed = 0;
  
  state.pos.y += heliState.speed * dt;
  if (state.pos.y < 1.0) { 
    state.pos.y = 1.0; 
    heliState.speed = 0; 
  }

  // 2. 机头朝向跟随鼠标
  heliGroup.rotation.y = state.yaw;

  // 3. 移动逻辑
  const forwardX = -Math.sin(state.yaw);
  const forwardZ = -Math.cos(state.yaw);
  const rightX = Math.cos(state.yaw);
  const rightZ = -Math.sin(state.yaw);

  if (state.keys['w']) {
    state.pos.x += forwardX * 20 * dt;
    state.pos.z += forwardZ * 20 * dt;
  } else if (state.keys['s']) {
    state.pos.x -= forwardX * 15 * dt;
    state.pos.z -= forwardZ * 15 * dt;
  }
  if (state.keys['a']) {
    state.pos.x -= rightX * 15 * dt;
    state.pos.z -= rightZ * 15 * dt;
  }
  if (state.keys['d']) {
    state.pos.x += rightX * 15 * dt;
    state.pos.z += rightZ * 15 * dt;
  }
  
  const clamped = clampToZone(state.pos.x, state.pos.z);
  state.pos.x = clamped.x;
  state.pos.z = clamped.z;

  // 4. 更新模型位置
  heliGroup.position.set(state.pos.x - 8, state.pos.y - 1.5, state.pos.z);

  // 5. 【核心修复】第三人称高空环绕视角
  const camDist = 14; // 相机和飞机的距离
  // 动态计算相机的XYZ，让它围绕飞机旋转
  const camX = state.pos.x + Math.sin(state.yaw) * camDist * Math.cos(state.pitch);
  const camZ = state.pos.z + Math.cos(state.yaw) * camDist * Math.cos(state.pitch);
  // 抬头时相机下降，低头时相机上升（这样才能看清地面）
  const camY = state.pos.y - Math.sin(state.pitch) * camDist + 4; 
  
  camera.position.set(camX, camY, camZ);
  // 相机永远死死盯着直升机
  camera.lookAt(state.pos.x, state.pos.y, state.pos.z);
}