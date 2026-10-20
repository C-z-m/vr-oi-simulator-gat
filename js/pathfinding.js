'use strict';
/* =========================================================
   pathfinding —— 极速 A* 网格寻路系统
   ========================================================= */

const PF_CELL = 1;
// 匹配新地图
const PF_MIN_X = -40, PF_MAX_X = 190;
const PF_MIN_Z = -110, PF_MAX_Z = 110;
const PF_COLS = Math.ceil((PF_MAX_X - PF_MIN_X) / PF_CELL); 
const PF_ROWS = Math.ceil((PF_MAX_Z - PF_MIN_Z) / PF_CELL); 

let pfGrid = new Uint8Array(PF_COLS * PF_ROWS);

// 将场景中的障碍物烘焙到网格中
function initPathfinding() {
  pfGrid.fill(0);
  const pad = 0.3; // 稍微膨胀一点，防止卡墙角
  
  for (let o of obstacles) {
    if (o.x < PF_MIN_X - 5 || o.x > PF_MAX_X + 5) continue;

    const minX = o.x - o.hw - pad;
    const maxX = o.x + o.hw + pad;
    const minZ = o.z - o.hd - pad;
    const maxZ = o.z + o.hd + pad;

    const c0 = Math.max(0, Math.floor((minX - PF_MIN_X) / PF_CELL));
    const c1 = Math.min(PF_COLS - 1, Math.floor((maxX - PF_MIN_X) / PF_CELL));
    const r0 = Math.max(0, Math.floor((minZ - PF_MIN_Z) / PF_CELL));
    const r1 = Math.min(PF_ROWS - 1, Math.floor((maxZ - PF_MIN_Z) / PF_CELL));

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        pfGrid[r * PF_COLS + c] = 1;
      }
    }
  }
}

function findPath(startX, startZ, endX, endZ) {
  let sc = Math.floor((startX - PF_MIN_X) / PF_CELL);
  let sr = Math.floor((startZ - PF_MIN_Z) / PF_CELL);
  let ec = Math.floor((endX - PF_MIN_X) / PF_CELL);
  let er = Math.floor((endZ - PF_MIN_Z) / PF_CELL);

  sc = Math.max(0, Math.min(PF_COLS - 1, sc));
  sr = Math.max(0, Math.min(PF_ROWS - 1, sr));
  ec = Math.max(0, Math.min(PF_COLS - 1, ec));
  er = Math.max(0, Math.min(PF_ROWS - 1, er));

  const findNearestWalkable = (c, r) => {
    if (pfGrid[r * PF_COLS + c] === 0) return { c, r };
    for (let rad = 1; rad <= 5; rad++) {
      for (let dc = -rad; dc <= rad; dc++) {
        for (let dr = -rad; dr <= rad; dr++) {
          if (Math.abs(dc) !== rad && Math.abs(dr) !== rad) continue;
          const nc = c + dc, nr = r + dr;
          if (nc >= 0 && nc < PF_COLS && nr >= 0 && nr < PF_ROWS) {
            if (pfGrid[nr * PF_COLS + nc] === 0) return { c: nc, r: nr };
          }
        }
      }
    }
    return { c, r };
  };

  const startNode = findNearestWalkable(sc, sr);
  const endNode = findNearestWalkable(ec, er);

  sc = startNode.c; sr = startNode.r;
  ec = endNode.c; er = endNode.r;

  const startIdx = sr * PF_COLS + sc;
  const endIdx = er * PF_COLS + ec;

  if (startIdx === endIdx) return null;

  const openList = [];
  const closedList = new Set();
  const gScore = new Float32Array(PF_COLS * PF_ROWS).fill(Infinity);
  const fScore = new Float32Array(PF_COLS * PF_ROWS).fill(Infinity);
  const parent = new Int32Array(PF_COLS * PF_ROWS).fill(-1);

  gScore[startIdx] = 0;
  fScore[startIdx] = Math.abs(sc - ec) + Math.abs(sr - er);
  openList.push(startIdx);

  while (openList.length > 0) {
    let minF = Infinity, minIdx = -1, pos = -1;
    for (let i = 0; i < openList.length; i++) {
      const idx = openList[i];
      if (fScore[idx] < minF) {
        minF = fScore[idx];
        minIdx = idx;
        pos = i;
      }
    }

    if (minIdx === endIdx) {
      const path = [];
      let curr = endIdx;
      while (curr !== -1) {
        const c = curr % PF_COLS;
        const r = Math.floor(curr / PF_COLS);
        path.push({ x: PF_MIN_X + c * PF_CELL + 0.5, z: PF_MIN_Z + r * PF_CELL + 0.5 });
        curr = parent[curr];
      }
      return path.reverse();
    }

    openList.splice(pos, 1);
    closedList.add(minIdx);

    const cx = minIdx % PF_COLS;
    const cr = Math.floor(minIdx / PF_COLS);

    const dirs = [
      { dc: 0, dr: -1 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 1, dr: 0 },
      { dc: -1, dr: -1 }, { dc: 1, dr: -1 }, { dc: -1, dr: 1 }, { dc: 1, dr: 1 }
    ];

    for (const d of dirs) {
      const nc = cx + d.dc;
      const nr = cr + d.dr;
      if (nc < 0 || nc >= PF_COLS || nr < 0 || nr >= PF_ROWS) continue;

      const nIdx = nr * PF_COLS + nc;
      if (closedList.has(nIdx) || pfGrid[nIdx] === 1) continue;

      if (d.dc !== 0 && d.dr !== 0) {
        if (pfGrid[cr * PF_COLS + nc] === 1 || pfGrid[nr * PF_COLS + cx] === 1) continue;
      }

      const stepCost = (d.dc !== 0 && d.dr !== 0) ? 1.414 : 1;
      const tentativeG = gScore[minIdx] + stepCost;

      if (tentativeG < gScore[nIdx]) {
        parent[nIdx] = minIdx;
        gScore[nIdx] = tentativeG;
        fScore[nIdx] = tentativeG + Math.abs(nc - ec) + Math.abs(nr - er);
        if (!openList.includes(nIdx)) {
          openList.push(nIdx);
        }
      }
    }
  }
  return null;
}