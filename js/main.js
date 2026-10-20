'use strict';
/* =========================================================
   main —— 事件绑定 / 主循环 / 初始化入口
   ========================================================= */
/* =========================================================
   事件绑定
   ========================================================= */
function bindEvents(){
  /* 左键交互与全自动开火 */
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // 只处理左键
    if (!state.started || state.ended) return;
    if (hasDialog()){ if (!pointerLocked) requestLock(); return; }
    
    if (gunIsUp()){
      if (!pointerLocked && !state.gun.targetAhead){ requestLock(); return; }
      state.keys.mouseLeft = true;
      fireGun(); // 按下瞬间打出一发
      return;
    }
    
    if (!pointerLocked && !actionSpace){ requestLock(); return; }
    doInteract(actionSpace ? 'space' : 'e');
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      state.keys.mouseLeft = false; // 松开停止连发
    }
  });

  document.addEventListener('keydown', e => {
    /* 走廊 */
    if (state.view === 'corridor'){
      if (e.code === 'KeyW' || e.code === 'ArrowUp'){
        state.keys['w'] = true; e.preventDefault();
      }
      return;
    }
    /* 洗手间 */
    if (state.view === 'bathroom'){
      if (e.code === 'KeyW'){ state.keys['w'] = true; e.preventDefault(); }
      if (e.code === 'Space'){ state.keys['space'] = true; e.preventDefault(); }
      const step = BATHROOM_STEPS[bathroomStepIdx];
      if (step && step.key === 'e' && e.code === 'KeyE'){
        e.preventDefault();
        if (step.action === 'secret') bathroomSecret();
        else finishBathroom();
      }
      return;
    }
    /* NPC 电脑 */
    if (state.view === 'npcComputer'){
      if (e.code === 'Escape' || e.code === 'KeyE'){
        closeNPCComputer(); e.preventDefault();
      }
      return;
    }
    /* Esc 关闭面板 */
    if (e.code === 'Escape'){
      if (state.view === 'pause'){ closePauseMenu(); return; }
      if (state.view === 'code'){ closeCode(); return; }
      if (state.view === 'paper'){ closePaper(); return; }
      if (hasDialog()){ closeTeacherDialog(); return; }
      if (state.view === 'world' && state.started && !state.ended){
        if (!pointerLocked) openPauseMenu();
        return;
      }
      return;
    }
    if (state.view !== 'world') return;

    /* 数字键 1-9 */
    if (hasDialog() && /^Digit[1-9]$/.test(e.code)){
      selectDialogOption(Number(e.code.slice(5)) - 1);
      e.preventDefault();
      return;
    }

    const k = KEYMAP[e.code];
    if (k){
      state.keys[k] = true;
      if ('wasd'.includes(k)) e.preventDefault();
    }
    if (e.code === 'KeyE'){
      if (hasDialog()) activateDialogButton();
      else doInteract(actionSpace ? 'space' : 'e');
    }
    if (e.code === 'KeyF'){ doInteract('f'); }
    if (e.code === 'Space'){
      if (!hasDialog()) tryJump();
      e.preventDefault();
    }
    if (e.code === 'KeyH') callTeacher();
    if (e.code === 'KeyR'){ if (reloadGun()) e.preventDefault(); }
    if (e.code === 'KeyQ'){ if (toggleWeapon()) e.preventDefault(); }
  });

  document.addEventListener('keyup', e => {
    if (state.view === 'corridor'){
      if (e.code === 'KeyW' || e.code === 'ArrowUp') state.keys['w'] = false;
      return;
    }
    if (state.view === 'bathroom'){
      if (e.code === 'KeyW') state.keys['w'] = false;
      if (e.code === 'Space') state.keys['space'] = false;
      return;
    }
    const k = KEYMAP[e.code];
    if (k) state.keys[k] = false;
  });

  window.addEventListener('blur', () => { state.keys = {}; });

  /* ---------- 指针锁定 ---------- */
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === lockElement();
    if (pointerLocked) lastLockAt = performance.now();
    else if (state.view === 'world' && state.started && !state.ended) openPauseMenu();
  });
  document.addEventListener('pointerlockerror', () => {
    if (canLockView()) toast('鼠标锁定失败，点击画面重试。', 1600);
  });
  
  document.addEventListener('mousemove', e => {
    if (pointerLocked){
      if (!LOOK_VIEWS.has(state.view)) return;
      if (performance.now() - lastLockAt < 120) return;
      const mx = clamp(e.movementX || 0, -MAX_MOUSE_STEP, MAX_MOUSE_STEP);
      const my = clamp(e.movementY || 0, -MAX_MOUSE_STEP, MAX_MOUSE_STEP);
      yawTarget   -= mx * mouseSens * SENS_SCALE;
      pitchTarget -= my * mouseSens * SENS_SCALE;
      pitchTarget = clamp(pitchTarget, -1.35, 1.35);
      return;
    }
    dlgMouseNdc.set((e.clientX / innerWidth) * 2 - 1,
                    -(e.clientY / innerHeight) * 2 + 1);
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
      resizePostFX();
      forceRedraw = true;
    }, 150);
  });

  function bindSlider(id, apply){
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', () => {
      apply(parseFloat(el.value));
      scheduleSaveViewSettings();
      syncViewUI();
    });
  }
  bindSlider('turnSliderStart',   v => mouseSens = sliderToSens(v));
  bindSlider('turnSlider',        v => mouseSens = sliderToSens(v));
  bindSlider('smoothSliderStart', v => smoothAmount = v / 100);
  bindSlider('smoothSlider',      v => smoothAmount = v / 100);
  bindSlider('timeSliderStart',   v => timeScale = v);
  bindSlider('timeSlider',        v => timeScale = v);
  bindSlider('volSliderStart',    v => audio.setVolume(v / 100));
  bindSlider('volSlider',         v => audio.setVolume(v / 100));

  const mt = $('muteToggle');
  if (mt){
    mt.classList.toggle('on', !audio.muted);
    mt.onclick = () => {
      audio.setMuted(!audio.muted);
      mt.classList.toggle('on', !audio.muted);
      saveViewSettings();
    };
  }

  const st = $('shakeToggle');
  if (st){
    st.classList.toggle('on', shakeEnabled);
    st.onclick = () => {
      shakeEnabled = !shakeEnabled;
      st.classList.toggle('on', shakeEnabled);
      saveViewSettings();
    };
  }
  const st2 = $('shakeToggleStart');
  if (st2){
    st2.classList.toggle('on', shakeEnabled);
    st2.onclick = () => {
      shakeEnabled = !shakeEnabled;
      st2.classList.toggle('on', shakeEnabled);
      saveViewSettings();
    };
  }

  $('btnResume').onclick = closePauseMenu;
  $('btnPauseEnd').onclick = () => {
    if (confirm('确定要提前交卷离场吗？')){
      pauseMenu.classList.add('hidden');
      endContest(true);
    }
  };
  $('btnSave').onclick = () => { persistSave(); toast('进度已保存', 1200); };
  $('btnClearSave').onclick = () => { clearSave(); toast('存档已清除', 1200); };

  $('btnSettings').onclick = openPauseMenu;
  $('btnCloseNPCComp').onclick = closeNPCComputer;

  codeArea.addEventListener('input', () => {
    saveCode();
    scheduleHighlight();
    if (Math.random() < 0.7) audio.key();
  });
  codeArea.addEventListener('keydown', e => {
    if (e.code === 'Tab'){
      e.preventDefault();
      const s = codeArea.selectionStart, en = codeArea.selectionEnd;
      codeArea.value = codeArea.value.substring(0, s) + '    ' +
                       codeArea.value.substring(en);
      codeArea.selectionStart = codeArea.selectionEnd = s + 4;
      saveCode();
      scheduleHighlight();
    }
    if (e.code !== 'Escape') e.stopPropagation();
  });
  codeArea.addEventListener('scroll', () => {
    codeHighlight.scrollTop = codeArea.scrollTop;
    codeHighlight.scrollLeft = codeArea.scrollLeft;
  });
  codeArea.addEventListener('keyup', e => {
    if (e.code !== 'Escape') e.stopPropagation();
  });
  codeArea.addEventListener('click', updateCursorInfo);
  codeArea.addEventListener('keyup', updateCursorInfo);

  function updateCursorInfo(){
    const v = codeArea.value.substring(0, codeArea.selectionStart);
    const lines = v.split('\n');
    $('cursorInfo').textContent =
      `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}  ·  C++14  ·  g++ -O2`;
  }

  $('btnSubmit').onclick = submitCode;
  $('btnLeave').onclick = closeCode;
  $('btnReset').onclick = () => {
    const p = state.problems.find(x => x.id === state.curProb);
    if (confirm('确定要重置本题代码吗？')){
      codeArea.value = p.starter;
      state.code[state.curProb] = p.starter;
      scheduleHighlight();
    }
  };
  $('btnEnd').onclick = () => {
    if (state.ended) return;
    if (confirm('确定要提前交卷离场吗？')) endContest(true);
  };
  $('btnRestart').onclick = () => {
    clearSave();
    location.reload();
  };

  $('btnClearSaveStart').onclick = () => {
    if (confirm('确定要清空存档吗？已保存的代码和进度都会丢失。')){
      clearSave();
      toast('存档已清除', 1500);
    }
  };

  $('btnStart').onclick = () => {
    audio.init();
    audio.setVolume(audio.volume);
    $('start').classList.add('hidden');
    hud.classList.remove('hidden');
    minimapWrap.classList.remove('hidden');
    crosshair.classList.remove('hidden');
    state.started = true;
    state.startTime = performance.now();
    yawTarget = state.yaw; pitchTarget = state.pitch;
    clock.getDelta();
    toast('比赛开始！WASD 移动，鼠标转动视角，左键交互 / 攻击。', 2600);
    requestLock();
    if (tryLoadSave()) toast('已恢复上次的答题进度。', 2200);
  };
}

/* =========================================================
   主循环
   ========================================================= */
let lastInteractUpdate = 0;
let forceRedraw = false;
let hitStop = 0;
let worldTimeScale = 1;
let slowMoDlg = null;

function worldDtFor(realDt){
  const hs = hitStop > 0 ? 0.12 : 1;
  return realDt * hs * worldTimeScale;
}

function beginSlowMo(){ worldTimeScale = 0.1; }
function endSlowMo(){ worldTimeScale = 1; }

const VIEW_NO_RENDER = new Set([
  'code','paper','corridor','bathroom','npcComputer','ending','pause'
]);

function animate(){
  requestAnimationFrame(animate);
  const realDt = Math.min(clock.getDelta(), 0.1);
  const t = performance.now() * 0.001;

  if (state.started && !state.ended){
    state.elapsed += realDt * timeScale;
    if (state.elapsed >= CONTEST_LEN) endContest(false);
  }

  if (hitStop > 0) hitStop -= realDt;
  if (slowMoDlg && dialogs.indexOf(slowMoDlg) < 0){
    slowMoDlg = null;
    endSlowMo();
  }
  const worldDt = worldDtFor(realDt);
  state.worldTime += worldDt;

  const inWorld = state.view === 'world';

  if (inWorld && state.started && !state.ended && !state.frozen){
    if (typeof drivingState !== 'undefined' && drivingState.isDriving) {
      // 【新增】调用驾驶更新逻辑
      if (typeof updateDriving === 'function') updateDriving(realDt);
    } else {
      applyLook(realDt);
      updatePlayer(worldDt);
    }
  }

  /* --- 全自动开火检测 --- */
  if (state.keys.mouseLeft && gunIsUp() && pointerLocked && !hasDialog() && !state.ended && !state.frozen) {
    fireGun();
  }

  if (dialogs.length) updateDialogs(realDt);
  if (debrisList.length) updateDebris(worldDt);
  updateGun(realDt);
  updateReticle(realDt);

  if (state.view === 'corridor') updateCorridor(realDt);
  if (state.view === 'bathroom') updateBathroom(realDt);
  if (state.doorOpen) updateDoorLight(realDt);

  if (inWorld){
    updateNPCs(worldDt, t);

    if (currentZoneId === 'street' && typeof updateCityNpcs === 'function') {
      updateCityNpcs(realDt, t);
    }

    if (currentZoneId === 'street') {
      // 路人刷新与更新
      if (typeof updateCityNpcSpawner === 'function') updateCityNpcSpawner(realDt);
      
      // 警察刷新与更新
      if (typeof updatePoliceSpawner === 'function') updatePoliceSpawner(realDt);
      if (typeof updatePolice === 'function') updatePolice(realDt, t);

      // 更新 46 届真相弹窗触发条件
      if (typeof updateCityStory === 'function') updateCityStory();
    }

    if (teacher && !state.frozen){
      const tm = teacher.userData;
      const pos = teacher.group.position;

      if (tm.mode === 'patrol'){
        const theta = t * 0.15;
        const a = 6.5, b = 5.5, n = 0.7;
        const c1 = Math.cos(theta), s1 = Math.sin(theta);
        const c2 = Math.cos(theta + 0.02), s2 = Math.sin(theta + 0.02);
        const x1 = a * Math.sign(c1) * Math.pow(Math.abs(c1), n);
        const z1 = b * Math.sign(s1) * Math.pow(Math.abs(s1), n);
        const x2 = a * Math.sign(c2) * Math.pow(Math.abs(c2), n);
        const z2 = b * Math.sign(s2) * Math.pow(Math.abs(s2), n);
        pos.x = x1;
        pos.z = z1;
        teacher.group.rotation.y = Math.atan2(x2 - x1, z2 - z1);
        pos.y = Math.abs(Math.sin(t * 4)) * 0.008;
      } else if (tm.mode === 'approach'){
        const dx = state.pos.x - pos.x;
        const dz = state.pos.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.4){
          tm.mode = 'warn';
          teacher.group.rotation.y = Math.atan2(dx, dz);
          showTeacherWarning();
        } else {
          const sp = 3.2 * worldDt;
          const nx = pos.x + (dx / d) * sp;
          const nz = pos.z + (dz / d) * sp;
          if (!collides(nx, pos.z, 0.3)) pos.x = nx;
          if (!collides(pos.x, nz, 0.3)) pos.z = nz;
          teacher.group.rotation.y = Math.atan2(dx, dz);
        }
      } else if (tm.mode === 'warn'){
        const dx = state.pos.x - pos.x;
        const dz = state.pos.z - pos.z;
        teacher.group.rotation.y = Math.atan2(dx, dz);
      } else if (tm.mode === 'returning'){
        const theta = t * 0.15;
        const a = 6.5, b = 5.5, n = 0.7;
        const c = Math.cos(theta), s = Math.sin(theta);
        const targetX = a * Math.sign(c) * Math.pow(Math.abs(c), n);
        const targetZ = b * Math.sign(s) * Math.pow(Math.abs(s), n);
        const dx = targetX - pos.x;
        const dz = targetZ - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) tm.mode = 'patrol';
        else {
          const sp = 3.0 * worldDt;
          pos.x += (dx / d) * sp; pos.z += (dz / d) * sp;
          teacher.group.rotation.y = Math.atan2(dx, dz);
        }
      }
    }

    updateGuards(worldDt, t);
    updateTension(worldDt, state.guardKills, nearestGuardDist, lastMoveSpeed);

    if (state.started && !state.ended && !state.frozen && !state.doorOpen
        && !state.bathroomApproved && !state.teacherWarnActive && teacher
        && teacher.userData.mode === 'patrol'
        && securityGuards.length === 0){
      const dx = state.pos.x - 0;
      const dz = state.pos.z - (-3);
      const distFromSeat = Math.hypot(dx, dz);
      if (distFromSeat > 3.5){
        state.wanderTimer += realDt;
        if (state.wanderTimer > 2.0) triggerTeacherWarning();
      } else {
        state.wanderTimer = 0;
      }
    }
    if (state.started && !state.ended && !state.wanderPenaltyApplied
      && state.wanderCount >= 5){
      applyWanderPenalty();
    }

    const now = performance.now();
    if (now - lastInteractUpdate > 80){
      lastInteractUpdate = now;
      updateInteract();
    }
  }

  if (state.started && !state.ended){
    const remain = CONTEST_LEN - state.elapsed;
    const txt = fmtTime(remain);
    if (hudTimer.textContent !== txt){
      hudTimer.textContent = txt;
      const ideTime = $('ideTime');
      if (ideTime) ideTime.textContent = txt;
      hudTimer.classList.toggle('warn', remain < 1800);
    }
    const alive = aliveGuardCount();
    const key = `${state.totalScore}|${state.warnCount}|${alive}`;
    if (hudScore.dataset.key !== key){
      hudScore.dataset.key = key;
      const guardInfo = alive > 0
        ? `　<span style="color:#ff6b78;font-size:16px">\u26A0 保安 ${alive}</span>`
        : '';
      hudScore.innerHTML =
        `总分 <b>${state.totalScore}</b> / 400　` +
        `<span style="color:#5d6880;font-size:16px">警告 ${state.warnCount} 次</span>${guardInfo}`;
    }
    const tn = getTension();
    hudTimer.classList.toggle('tense', tn > 0.05);
    minimapWrap.classList.toggle('tense', tn > 0.05);
    drawMinimap();
  }

  if (!VIEW_NO_RENDER.has(state.view) || forceRedraw){
    renderFrame(realDt);
    forceRedraw = false;
  }
}

/* =========================================================
   初始化
   ========================================================= */
function init(){
  loadViewSettings();
  syncViewUI();

  renderer = new THREE.WebGLRenderer({
    canvas: $('scene'),
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090b11);
  scene.fog = new THREE.FogExp2(0x090b11, 0.038);

  camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.05, 120);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, 1.65, -1.72);

  scene.add(new THREE.AmbientLight(0xffffff, 0.42));
  scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x232833, 0.5));

  state.problems = pickProblems();
  state.curProb = state.problems[0].id;
  state.npcProbId = state.problems[Math.floor(Math.random() * state.problems.length)].id;

  buildWorld();
  updateAllDeskScreens();
  initReticle();
  initGun();
  initPostFX();
  initGuardLights();
  initTension();
  initHp();
  bindEvents();
  initPaperEvents();
  initStory();
  renderHudProbs();

  clock = new THREE.Clock();
  animate();
}

try {
  init();
} catch(e){
  console.error(e);
  const s = document.getElementById('start');
  if (s){
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);' +
      'background:#3a1a1a;color:#f88;padding:12px 22px;border-radius:8px;z-index:999;font-size:13px';
    d.textContent = '初始化失败：' + e.message + '（按 F12 查看详情）';
    document.body.appendChild(d);
  }
}