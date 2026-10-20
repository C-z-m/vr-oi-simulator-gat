'use strict';
/* =========================================================
   collision-grid —— 空间哈希碰撞索引
   ---------------------------------------------------------
   替换 core.js 里 O(n) 的 collides()。行为与旧实现完全一致：
   障碍物仍是轴对齐 AABB {x, z, hw, hd}，判定仍是"中心距离 < hw+r"。
   ---------------------------------------------------------
   - 网格单元 GRID_CELL 米见方；障碍注册到它覆盖的所有单元；
   - 查询点所在单元的 3x3 邻域；覆盖 r ≤ GRID_CELL 的所有情况
     （本游戏最大 r = 0.3，GRID_CELL = 2，安全）；
   - 用 _stamp 去重：同一个障碍被多个桶命中时只判一次。
   ========================================================= */

const GRID_CELL = 2;
const gridBuckets = new Map();
let gridStamp = 0;

function gridKey(cx, cz){ return cx + ',' + cz; }
function gridCell(v){ return Math.floor(v / GRID_CELL); }

/* 向障碍系统添加一个轴对齐 AABB */
function addObstacle(x, z, hw, hd){
  const o = { x, z, hw, hd, _stamp: 0, active: true }; // 新增 active 属性
  obstacles.push(o);

  const cx0 = gridCell(x - hw), cx1 = gridCell(x + hw);
  const cz0 = gridCell(z - hd), cz1 = gridCell(z + hd);
  for (let cx = cx0; cx <= cx1; cx++){
    for (let cz = cz0; cz <= cz1; cz++){
      const k = gridKey(cx, cz);
      let arr = gridBuckets.get(k);
      if (!arr){ arr = []; gridBuckets.set(k, arr); }
      arr.push(o);
    }
  }
  return o; // 返回引用，方便后续控制
}

/* 点 (x,z) 半径 r 是否与任何障碍相交 */
function collides(x, z, r){
  gridStamp++;
  const cx = gridCell(x), cz = gridCell(z);
  for (let dx = -1; dx <= 1; dx++){
    for (let dz = -1; dz <= 1; dz++){
      const arr = gridBuckets.get(gridKey(cx + dx, cz + dz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++){
        const o = arr[i];
        if (o._stamp === gridStamp || o.active === false) continue; // 跳过失效的障碍
        o._stamp = gridStamp;
        if (Math.abs(x - o.x) < o.hw + r && Math.abs(z - o.z) < o.hd + r) return true;
      }
    }
  }
  return false;
}