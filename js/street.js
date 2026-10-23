'use strict';
/* =========================================================
   street —— 十字街区（完美人行道覆盖版）
   ========================================================= */

let streetGroup = null;
const cityCars = [];

function makeBuildingTexture(w, h, d) {
  const canvas = document.createElement('canvas');
  const scale = 20;
  const cw = Math.max(w, d) * scale;
  const ch = h * scale;
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#8b96a8'; ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = '#2b3a55';
  for (let y = 2; y < h - 2; y += 3) {
    for (let x = 1; x < Math.max(w, d) - 1; x += 2.5) {
      if (Math.random() > 0.2) ctx.fillRect(x * scale, y * scale, 1.5 * scale, 1.5 * scale);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function buildStreet() {
  streetGroup = new THREE.Group();
  streetGroup.position.set(8, 0, 0);
  scene.add(streetGroup);

  /* 1. 超级底盘 */
  const baseFloor = new THREE.Mesh(new THREE.PlaneGeometry(250, 250), mat(0x2a303d, { roughness: 1 }));
  baseFloor.rotation.x = -Math.PI / 2;
  baseFloor.position.set(70, -0.1, 0);
  streetGroup.add(baseFloor);

  /* 2. 算法路网与人行道 */
  const ROAD_X = [20, 60, 100, 140];
  const ROAD_Z = [-50, 0, 50];
  const ROAD_W = 14;

  const roadMat = mat(0x444c5e, { roughness: 0.9 });
  const walkMat = mat(0x7a869a, { roughness: 0.8 });

  // 【核心修复1】直接铺一整层超大人行道，覆盖整个可活动区域
  // 这样不管马路怎么交错，马路旁边露出来的必定是浅色人行道，绝对不会漏铺。
  const megaWalk = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), walkMat);
  megaWalk.rotation.x = -Math.PI / 2;
  megaWalk.position.set(70, 0.02, 0);
  streetGroup.add(megaWalk);

  // 铺设纵向道路
  for (let x of ROAD_X) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 220), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(x - 8, 0.04, 0); // 提高一点，盖在人行道上
    streetGroup.add(road);
  }
  // 铺设横向道路
  for (let z of ROAD_Z) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(200, ROAD_W), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(70, 0.05, z); // 再高一点点，防止十字路口交界处闪烁
    streetGroup.add(road);
  }

  // 3. 算法生成建筑 (Block)
  const bldgMat = mat(0x8b96a8, { roughness: 0.9 });
  const matTop = new THREE.MeshStandardMaterial({ color: 0x555f70 });

  const xCenters = [-10, 40, 80, 120, 160];
  const zCenters = [-75, -25, 25, 75];

  for (let i = 0; i < xCenters.length; i++) {
    for (let j = 0; j < zCenters.length; j++) {
      let cx = xCenters[i];
      let cz = zCenters[j];
      
      if (cx === 40 && cz === -25) continue; // 预留便利店

      let w = 30;
      let d = 30;
      if (i === 0 || i === xCenters.length - 1) w = 26;
      let h = 20 + Math.random() * 15;

      const tex = makeBuildingTexture(w, h, d);
      const matSide = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
      
      const b = new THREE.Mesh(getBoxGeo(w, h, d), [matSide, matSide, matTop, matTop, matSide, matSide]);
      b.position.set(cx - 8, h / 2, cz);
      streetGroup.add(b);
      
      addObstacle(cx, cz, w / 2, d / 2);
    }
  }

  // 4. 建造边界墙（包裹整个城市）
  function createBoundaryWall(localX, z, w, d) {
    const h = 15; 
    const wall = new THREE.Mesh(getBoxGeo(w, h, d), mat(0x3a4355, { roughness: 0.95 }));
    wall.position.set(localX, h / 2, z);
    streetGroup.add(wall);
    addObstacle(localX + 8, z, w / 2, d / 2);
    
    const line = new THREE.Mesh(getBoxGeo(w, 0.5, d), mat(0x8b0000, { emissive: 0x330000 }));
    line.position.set(localX, h, z);
    streetGroup.add(line);
  }
  createBoundaryWall(-28, 0, 2, 240); // 西
  createBoundaryWall(168, 0, 2, 240); // 东
  createBoundaryWall(70, 110, 200, 2); // 南
  createBoundaryWall(70, -110, 200, 2); // 北

  // 5. 便利店
  const storeGroup = new THREE.Group();
  storeGroup.position.set(32, 0, -25);
  streetGroup.add(storeGroup);
  
  const storeFloor = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), mat(0x556677, { roughness: 0.6 }));
  storeFloor.rotation.x = -Math.PI / 2; storeFloor.position.y = 0.06; // 稍高防闪烁
  storeGroup.add(storeFloor);
  const storeCeil = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), mat(0x11151c));
  storeCeil.rotation.x = Math.PI / 2; storeCeil.position.y = 4.0;
  storeGroup.add(storeCeil);

  box(0.2, 4, 12, 0x334455, -8, 2, 0, storeGroup);
  box(0.2, 4, 12, 0x334455, 8, 2, 0, storeGroup);
  box(16, 4, 0.2, 0x334455, 0, 2, -6, storeGroup);
  box(5, 4, 0.2, 0x334455, -5.5, 2, 6, storeGroup);
  box(5, 4, 0.2, 0x334455, 5.5, 2, 6, storeGroup);
  box(6, 1, 0.2, 0x334455, 0, 3.5, 6, storeGroup);
  
  addObstacle(32, -25, 0.1, 6);
  addObstacle(48, -25, 0.1, 6);
  addObstacle(40, -31, 8, 0.1);
  addObstacle(34.5, -19, 2.5, 0.1);
  addObstacle(45.5, -19, 2.5, 0.1);

  const storeLight = new THREE.PointLight(0xffffff, 1.5, 20, 2);
  storeLight.position.set(0, 3.8, 0);
  storeGroup.add(storeLight);
  
  box(3, 1.1, 1.2, 0x334455, 0, 0.55, -4, storeGroup);
  addObstacle(40, -29, 1.5, 0.6);
  const monitor = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1), new THREE.MeshBasicMaterial({ color: 0x00ffcc }));
  monitor.position.set(0, 2.5, -5.89);
  storeGroup.add(monitor);
  monitor.userData.interact = {
    label: '查看监控屏幕',
    action: () => {
      toast('监控画面：一个穿第 46 届校服的人走进了死胡同，然后凭空消失了……', 5000);
      if (typeof discoverTrace === 'function') discoverTrace('monitor');
    }
  };
  interactables.push(monitor);

  // 6. 售货机
  const vendGroup = new THREE.Group();
  vendGroup.position.set(30, 0, -19); 
  streetGroup.add(vendGroup);
  const vendBox = box(1.2, 2.0, 0.8, 0x1a2233, 0, 1.0, 0, vendGroup);
  const vendGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), new THREE.MeshBasicMaterial({ color: 0x5b8cff }));
  vendGlow.position.set(0, 1.3, 0.41);
  vendGroup.add(vendGlow);
  vendBox.userData.interact = { 
    label: '购买补给 (E)', 
    action: () => {
      if (state.hp < 3) { state.hp++; renderHp(); toast('你买了一罐红牛，血量恢复 1 格。', 2000); }
      else if (state.gun && state.gun.owned) { addAmmo(12); toast('你买了一盒子弹，备弹 +12。', 2000); }
      else { toast('你买了一瓶水，感觉精神好多了。', 2000); }
      audio.beep(880, 0.1, 0.05);
    }
  };
  interactables.push(vendBox);
  addObstacle(38, -19, 0.6, 0.4); 

  // 7. 涂鸦 (偏僻角落)
  const graffitiTex = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#1a1a1a'; x.fillRect(0, 0, 512, 256);
    x.fillStyle = '#ff0055'; x.font = 'bold 48px monospace';
    x.fillText('别惹写代码的人', 40, 120);
    x.fillStyle = '#aabbcc'; x.font = '24px monospace';
    x.fillText('—— 46th NOI', 200, 180);
    return new THREE.CanvasTexture(c);
  })();
  const graffiti = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), new THREE.MeshBasicMaterial({ map: graffitiTex }));
  graffiti.position.set(3.05, 2.5, 75); 
  graffiti.rotation.y = Math.PI / 2; 
  streetGroup.add(graffiti);
  const graffitiTrigger = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 5), new THREE.MeshBasicMaterial({ visible: false }));
  graffitiTrigger.position.set(5, 2.5, 75); 
  streetGroup.add(graffitiTrigger);
  graffitiTrigger.userData.interact = {
    label: '阅读涂鸦',
    action: () => {
      toast('“别惹写代码的人…… —— 46th NOI”', 4000);
      if (typeof discoverTrace === 'function') discoverTrace('graffiti');
    }
  };
  interactables.push(graffitiTrigger);

  // 8. 出城隧道
  const endTunnel = new THREE.Group();
  endTunnel.position.set(52, 0, -107); 
  streetGroup.add(endTunnel);
  const tunnelBack = new THREE.Mesh(getBoxGeo(16, 10, 2), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  tunnelBack.position.set(0, 4, -2); 
  endTunnel.add(tunnelBack);
  box(1.5, 8, 8, 0x334455, -8, 4, 2, endTunnel);
  box(1.5, 8, 8, 0x334455, 8, 4, 2, endTunnel);
  box(17, 1, 8, 0x334455, 0, 8, 2, endTunnel);
  
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), new THREE.MeshBasicMaterial({ color: 0x00ff88 }));
  exitSign.position.set(0, 6, 5.9); endTunnel.add(exitSign);
  
  const tunnelTrigger = new THREE.Mesh(new THREE.BoxGeometry(14, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  tunnelTrigger.position.set(60, 4, -104);
  streetGroup.add(tunnelTrigger);
  tunnelTrigger.userData.interact = {
    label: '离开这座城市',
    action: () => { if (typeof endByCityVictory === 'function') endByCityVictory(); }
  };
  interactables.push(tunnelTrigger);

  // 9. 车辆生成
  function createCar(globalX, z, rotY, color) {
    const carGroup = new THREE.Group();
    carGroup.position.set(globalX - 8, 0, z);
    carGroup.rotation.y = rotY;
    streetGroup.add(carGroup);
    const body = new THREE.Mesh(getBoxGeo(1.8, 0.8, 4), mat(color, { roughness: 0.5, metalness: 0.6 }));
    body.position.y = 0.6; carGroup.add(body);
    const roof = new THREE.Mesh(getBoxGeo(1.6, 0.6, 2), mat(0x111111, { roughness: 0.2 }));
    roof.position.set(0, 1.3, 0.2); carGroup.add(roof);
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 12);
    const wheelMat = mat(0x111111);
    for (let wx of [-0.9, 0.9]) {
      for (let wz of [-1.2, 1.2]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat); w.rotation.z = Math.PI / 2;
        w.position.set(wx, 0.4, wz); carGroup.add(w);
      }
    }
    const hw = (1.8 * Math.abs(Math.cos(rotY)) + 4 * Math.abs(Math.sin(rotY))) / 2;
    const hd = (1.8 * Math.abs(Math.sin(rotY)) + 4 * Math.abs(Math.cos(rotY))) / 2;
    const obsRef = addObstacle(globalX, z, hw, hd);
    carGroup.userData = { isCar: true, hp: 100, obsRef, color };
    cityCars.push(carGroup);
  }

  let spawned = 0, attempts = 0;
  const carColors = [0x8b0000, 0x2f4f4f, 0x1e90ff, 0xdaa520, 0x556b2f, 0x483d8b];
  while (spawned < 30 && attempts < 300) { 
    attempts++;
    let rx, rz, rotY;
    const bnds = getZoneBounds();
    if (Math.random() > 0.5) {
      rx = bnds.minX + 15 + Math.random() * (bnds.maxX - bnds.minX - 30);
      rz = (Math.random() - 0.5) * 8;
      rotY = Math.random() > 0.5 ? 0 : Math.PI;
    } else {
      rx = 51 + Math.random() * 8;
      rz = bnds.minZ + 15 + Math.random() * (bnds.maxZ - bnds.minZ - 30);
      rotY = Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
    }
    if (!collides(rx, rz, 4.0)) {
      createCar(rx, rz, rotY, carColors[Math.floor(Math.random() * carColors.length)]);
      spawned++;
    }
  }
}