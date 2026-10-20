'use strict';
/* =========================================================
   explosion —— 车辆爆炸特效与无差别范围伤害
   ========================================================= */

function explodeCar(car) {
  if (!car.parent || car.userData.isExploding) return; 
  car.userData.isExploding = true;
  car.userData.hp = 0; // 标记为已死

  // 1. 销毁碰撞体，方便玩家进去舔包
  if (car.userData.obsRef) {
    car.userData.obsRef.active = false;
  }
  
  // 2. 移除车辆视觉
  car.parent.remove(car);
  
  // 3. 视觉：巨大的火球 + 冲击波
  const fireball = new THREE.Mesh(
    new THREE.SphereGeometry(2.5, 16, 16),
    new THREE.MeshBasicMaterial({ 
      color: 0xff5500, transparent: true, opacity: 1, 
      blending: THREE.AdditiveBlending, depthWrite: false 
    })
  );
  fireball.position.copy(car.position);
  fireball.position.y += 1;
  scene.add(fireball);

  let scale = 1;
  const expandTimer = setInterval(() => {
    scale += 0.3;
    fireball.scale.setScalar(scale);
    fireball.material.opacity -= 0.15;
    if (fireball.material.opacity <= 0) {
      clearInterval(expandTimer);
      scene.remove(fireball);
      fireball.geometry.dispose();
      fireball.material.dispose();
    }
  }, 30);

  // 4. 音效与屏幕震动
  audio.punch();
  audio.beep(60, 0.8, 0.2, 'sawtooth');
  if (typeof kickView === 'function') kickView(0.08, 0.08);
  if (typeof hitStop !== 'undefined') hitStop = 0.1;

  // 5. 无差别 AOE 伤害判定 (半径 6 米)
  const blastRadius = 6;
  const px = state.pos.x;
  const pz = state.pos.z;
  
  // A. 伤害玩家
  const cx = car.position.x + 8;
  const cz = car.position.z;
  const distToPlayer = Math.hypot(cx - px, cz - pz);
  if (distToPlayer < blastRadius) {
    state.hp -= 2; // 爆炸重伤
    if (typeof renderHp === 'function') renderHp();
    
    const rf = document.getElementById('redFlash');
    if (rf) {
      rf.style.opacity = '0.8';
      setTimeout(() => rf.style.opacity = '0', 300);
    }
    toast('你被爆炸波及了！', 2000);
    
    if (state.hp <= 0 && !state.ended) {
      state.ended = true;
      if (typeof showEnding === 'function') showEnding(0, '你被汽车爆炸的烈焰吞噬了……\n\nGAT 行动，到此为止。');
    }
  }

  // B. 伤害警察
  if (typeof policeUnits !== 'undefined') {
    for (const p of policeUnits) {
      if (p.userData.state === 'down') continue;
      const pd = Math.hypot(car.position.x - p.group.position.x, car.position.z - p.group.position.z);
      if (pd < blastRadius) {
        if (typeof spawnBodyDebris === 'function') spawnBodyDebris(p.group, { speed: 6.0 });
        if (p.parent) p.parent.remove(p);
        p.userData.state = 'down';
        if (typeof addWantedKill === 'function') addWantedKill();
      }
    }
  }

  // C. 伤害路人
  if (typeof cityNpcs !== 'undefined') {
    for (const n of cityNpcs) {
      if (n.userData.state === 'down') continue;
      const nd = Math.hypot(car.position.x - n.group.position.x, car.position.z - n.group.position.z);
      if (nd < blastRadius) {
        if (typeof spawnBodyDebris === 'function') spawnBodyDebris(n.group, { speed: 6.0 });
        if (n.group.parent) n.group.parent.remove(n.group);
        n.userData.state = 'down';
      }
    }
  }

  // D. 伤害保安（如果考场里有的话，或者未来城市里刷保安）
  if (typeof securityGuards !== 'undefined') {
    for (const g of securityGuards) {
      if (!g.userData.alive) continue;
      const gd = Math.hypot(car.position.x - g.group.position.x, car.position.z - g.group.position.z);
      if (gd < blastRadius) {
        g.userData.alive = false;
        if (typeof spawnBodyDebris === 'function') spawnBodyDebris(g.group, { speed: 6.0 });
        if (g.group.parent) g.group.parent.remove(g.group);
        state.guardKills++;
        if (typeof checkGuardKillMilestones === 'function') checkGuardKillMilestones(state.guardKills);
        if (state.guardKills >= 200 && typeof openFinalDoor === 'function') openFinalDoor();
      }
    }
  }

  // E. 连锁爆炸！周围 8 米内的其他车辆也会被引爆
  if (typeof cityCars !== 'undefined') {
    setTimeout(() => {
      for (const otherCar of cityCars) {
        if (otherCar.userData.isExploding || !otherCar.parent) continue;
        const cd = Math.hypot(car.position.x - otherCar.position.x, car.position.z - otherCar.position.z);
        if (cd < 8) {
          // 稍微延迟一点，制造连环爆炸的层次感
          setTimeout(() => explodeCar(otherCar), 150);
        }
      }
    }, 100);
  }
}