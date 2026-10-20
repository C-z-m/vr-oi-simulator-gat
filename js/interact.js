'use strict';
/* =========================================================
   interact —— 准星交互判定（E / F / 空格）
   （自 index.html 内联脚本拆出）
   ========================================================= */
/* =========================================================
   交互判定
   ========================================================= */
let lastInteractKey = '';

/* 干扰同学的判定半径：必须贴到"他的人"身边，而非整个座位区 */
const NPC_DISTURB_RANGE = 0.72;

function updateInteract(){
  actionE = null;
  actionF = null;
  actionSpace = null;
  promptEl.classList.add('hidden');
  /* 准星指着门口白光时，交互提示切换浅底深字，保证可读 */
  promptEl.classList.toggle('bright', aimingAtWhiteLight());

  if (state.view !== 'world' || !state.started || state.ended || state.frozen) return;

  /* 弹窗存在期间：屏蔽场景交互提示，准星操作优先给弹窗按钮。
     放在指针锁定检查之前：弹窗期内不提示"点击画面"，避免误导 */
  if (hasDialog()){
    actionE = null; actionF = null; actionSpace = null;
    promptEl.classList.add('hidden');
    return;
  }

  /* ================= 新增：正常的上下车交互判定 ================= */
  // 1. 如果在驾驶中，提示并绑定下车
  if (typeof drivingState !== 'undefined' && drivingState.isDriving) {
    actionE = { fn: () => exitCar() };
    const txt = '[ E ] 下车';
    if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
    promptEl.classList.remove('hidden');
    return; // 结束判定，不再处理开枪/打人
  }

  // 2. 如果步行且靠近车，提示并绑定上车
  if (typeof cityCars !== 'undefined' && !state.ended) {
    if (typeof drivingState === 'undefined' || performance.now() >= drivingState.cooldownEnd) {
      for (const car of cityCars) {
        if (car.userData.hp <= 0 || !car.parent) continue;
        const cx = car.position.x + 8;
        const cz = car.position.z;
        const d = Math.hypot(state.pos.x - cx, state.pos.z - cz);
        // 3.5 米内允许上车
        if (d < 3.5) {
          actionE = { fn: () => enterCar(car) };
          const txt = '[ E ] 上车';
          if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
          promptEl.classList.remove('hidden');
          return; // 结束判定
        }
      }
    }
  }
  /* ============================================================== */

  /* 持枪时左键就是开火... (保留原有的逻辑) */

  /* 持枪时左键就是开火：近战判定（出拳/打老师/打同学）整体让位，
     E / F 交互保持原样，否则近身保安会一直把桌面交互提示顶掉 */
  const gunUp = gunIsUp();
  if (!gunUp && tryMeleePrompt()) return;

  /* 其他选手：坐着的 → F 干扰；离开的 → E 用电脑 */
  for (let i = 0; i < npcs.length; i++){
    const n = npcs[i];
    const ud = n.userData;
    if (!ud) continue;
    const d = Math.hypot(state.pos.x - ud.seatX, state.pos.z - ud.seatZ);
    if (d < 2.3){
      if (ud.state === 'seated'){
        /* 干扰的判定从"座位 2.3m"收紧到"他的人"：以身体实际位置为圆心 */
        const dBody = Math.hypot(state.pos.x - n.group.position.x,
                                 state.pos.z - n.group.position.z);
        if (dBody > NPC_DISTURB_RANGE) continue;
        actionF = { fn: () => disturbNPC(i) };
        const txt = `[ F ] 干扰${ud.name}（他可能会报告老师）`;
        if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
        promptEl.classList.remove('hidden');
        return;
      } else if (ud.state === 'walking_away' || ud.state === 'away'){
        actionE = { fn: () => useNPCComputer(i) };
        const txt = `[ E ] 使用${ud.name}的电脑`;
        if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
        promptEl.classList.remove('hidden');
        return;
      }
    }
  }

  /* 出口 → E */
  const dDoor = Math.hypot(state.pos.x - 7.85, state.pos.z - 0);
  if (dDoor < 3.0){
    /* 终局：门已开，走向白光即可走出去 */
    if (state.doorOpen){
      actionE = { fn: walkOutOfTheRoom };
      const txt = '[ E ] 走出去';
      if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
      promptEl.classList.remove('hidden');
      return;
    }
    if (state.bathroomApproved){
      actionE = { fn: () => enterCorridor('toilet') };
      const txt = '[ E ] 离开考场去洗手间';
      if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
    } else {
      const txt = '离开考场需要先按 H 举手征得老师同意';
      if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
    }
    promptEl.classList.remove('hidden');
    return;
  }

  /* 桌上物品（射线拾取） → E */
  raycaster.setFromCamera(CENTER, camera);
  raycaster.far = 3.2;
  const hits = raycaster.intersectObjects(interactables, false);
  if (hits.length && hits[0].object.userData.interact){
    const it = hits[0].object.userData.interact;
    actionE = { fn: it.action };
    const txt = '[ E ] ' + it.label;
    if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
    promptEl.classList.remove('hidden');
    return;
  }

  /* 持枪：前方射程内有可命中目标时给射击提示（不占用 E / F） */
  if (gunUp && state.gun.targetAhead){
    const txt = `[ 左键 ] 射击　·　弹匣 ${state.gun.mag}/${GUN_MAG_SIZE}　·　[R] 换弹`;
    if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
    promptEl.classList.remove('hidden');
    return;
  }

  /* 兜底提示：没有任何可交互/可攻击目标时，才提醒重新捕获鼠标。
     注意动作判定不依赖指针锁定——锁定失效时 E / 左键依然能交互和出拳。 */
  if (!pointerLocked){
    const txt = '鼠标已释放 —— 点击画面继续考试';
    if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
    promptEl.classList.remove('hidden');
  }
}

/* 近战 / 攻击提示：命中就写好提示并返回 true。
   持枪时整体不参与（见 updateInteract 的 gunUp 分支）。 */
function tryMeleePrompt(){
  // ================= 1. 驾驶状态最高优先级 =================
  if (typeof drivingState !== 'undefined' && drivingState.isDriving) {
    actionE = { fn: exitCar, label: '下车' };
    actionSpace = null;
    promptEl.textContent = '[ E ] 下车';
    promptEl.classList.remove('hidden');
    return true;
  }

  // ================= 2. 靠近车辆上车判定 =================
  if (typeof cityCars !== 'undefined' && !state.ended) {
    // 如果有下车冷却，跳过
    if (typeof drivingState === 'undefined' || drivingState.cooldown <= 0) {
      for (const car of cityCars) {
        if (car.userData.hp <= 0 || !car.parent) continue;
        const cx = car.position.x + 8;
        const cz = car.position.z;
        const d = Math.hypot(state.pos.x - cx, state.pos.z - cz);
        if (d < 4.5) {
          actionE = { fn: () => enterCar(car), label: '上车' };
          actionSpace = null; // 防止打架优先
          promptEl.textContent = '[ E ] 上车';
          promptEl.classList.remove('hidden');
          return true;
        }
      }
    }
  }

  // ================= 3. 以下全是原有的战斗/交互判定 =================
  /* 优先：保安 → 空格 */
  for (let i = 0; i < securityGuards.length; i++){
    const g = securityGuards[i];
    if (!g.userData.alive) continue;
    const d = Math.hypot(state.pos.x - g.group.position.x, state.pos.z - g.group.position.z);
    if (d < GUARD_PUNCH_RANGE){
      if (!inAttackArc(g.group.position.x, g.group.position.z)) continue;
      actionSpace = { fn: punchGuardsArc };
      const txt = `[ 左键 ] 出拳（拳锋 ${GUARD_PUNCH_RANGE.toFixed(1)}m · 前方扇形）`;
      if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
      promptEl.classList.remove('hidden');
      return true;
    }
  }

  /* 老师 → 空格 */
  if (teacher && !teacher.userData.leaving){
    const d = Math.hypot(state.pos.x - teacher.group.position.x,
                         state.pos.z - teacher.group.position.z);
    if (d < 2.4 && teacher.userData.mode !== 'warn' &&
        inAttackArc(teacher.group.position.x, teacher.group.position.z)){
      actionSpace = { fn: punchTeacher };
      const txt = '[ 左键 ] 殴打监考老师（后果自负）';
      if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
      promptEl.classList.remove('hidden');
      return true;
    }
  }

  /* 考场同学 */
  if (state.teacherDown){
    for (let i = 0; i < npcs.length; i++){
      const n = npcs[i];
      const ud = n.userData;
      if (!ud || ud.state === 'down') continue;
      const dBody = Math.hypot(state.pos.x - n.group.position.x,
                               state.pos.z - n.group.position.z);
      if (dBody > GUARD_PUNCH_RANGE) continue;
      if (!inAttackArc(n.group.position.x, n.group.position.z)) continue;
      actionSpace = { fn: () => downNPC(n) };
      const txt = `[ 左键 ] 殴打同学 ${ud.name}（他已经不敢告老师了）`;
      if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
      promptEl.classList.remove('hidden');
      return true;
    }
  }

  /* 城市街头路人 */
  if (typeof cityNpcs !== 'undefined') {
    for (let i = 0; i < cityNpcs.length; i++){
      const n = cityNpcs[i];
      const ud = n.userData;
      if (!ud || ud.state === 'down') continue;
      const dBody = Math.hypot(state.pos.x - n.group.position.x,
                               state.pos.z - n.group.position.z);
      if (dBody > GUARD_PUNCH_RANGE) continue;
      if (!inAttackArc(n.group.position.x, n.group.position.z)) continue;
      
      actionSpace = { fn: () => {
         spawnBodyDebris(n.group, { speed: 4.0 });
         scene.remove(n.group);
         ud.state = 'down';
         audio.punch();
         kickView(0.06, (Math.random() - 0.5) * 0.06);
         hitStop = 0.08;
         toast('你把无辜的路人揍飞了！', 1500);
         if (typeof addWantedKill === 'function') addWantedKill();
      } };
      const txt = `[ 左键 ] 痛殴无辜路人`;
      if (lastInteractKey !== txt){ promptEl.textContent = txt; lastInteractKey = txt; }
      promptEl.classList.remove('hidden');
      return true;
    }
  }

  /* 城市警察 */
  if (typeof policeUnits !== 'undefined') {
    for (let i = 0; i < policeUnits.length; i++){
      const n = policeUnits[i];
      const ud = n.userData;
      if (!ud || ud.state === 'down') continue;
      const dBody = Math.hypot(state.pos.x - n.group.position.x, state.pos.z - n.group.position.z);
      if (dBody > GUARD_PUNCH_RANGE) continue;
      if (!inAttackArc(n.group.position.x, n.group.position.z)) continue;
      
      actionSpace = { fn: () => {
         if (typeof spawnBodyDebris === 'function') spawnBodyDebris(n.group, { speed: 4.5 });
         if (n.group.parent) n.group.parent.remove(n.group);
         ud.state = 'down';
         audio.punch();
         hitStop = 0.08;
         toast('你击倒了一名警察！', 1500);
         if (typeof addWantedKill === 'function') addWantedKill();
      } };
      promptEl.textContent = `[ 左键 ] 痛殴警察`;
      promptEl.classList.remove('hidden');
      return true;
    }
  }

  return false;
}

function doInteract(key){
  if (state.view !== 'world' || state.ended || state.frozen) return;
  if (key === 'e'     && actionE)     actionE.fn();
  if (key === 'f'     && actionF)     actionF.fn();
  if (key === 'space' && actionSpace) actionSpace.fn();
}

function drinkWater(){
  audio.beep(520, 0.08, 0.05);
  setTimeout(() => audio.beep(420, 0.1, 0.04), 110);
  toast('\u{1F964} 你喝了一口水，感觉清醒了一些。', 1600);
}
