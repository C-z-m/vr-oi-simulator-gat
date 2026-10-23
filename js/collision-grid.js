'use strict';
/* =========================================================
   collision-grid —— 真 3D 空间哈希碰撞索引
   ========================================================= */

const GRID_CELL = 2;
const gridBuckets = new Map();
let gridStamp = 0;

function gridKey(cx, cz){ return cx + ',' + cz; }
function gridCell(v){ return Math.floor(v / GRID_CELL); }

/* 注册 3D 障碍物，加入高度 minY 和 maxY */
function addObstacle(x, z, hw, hd, height = 10, yOffset = 0){
  const o = { x, z, hw, hd, minY: yOffset, maxY: yOffset + height, _stamp: 0, active: true };
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
  return o;
}

/* 3D 碰撞查询：传入高度 y，检测该高度是否有障碍物 */
function collides(x, z, r, y = 0){
  gridStamp++;
  const cx = gridCell(x), cz = gridCell(z);
  for (let dx = -1; dx <= 1; dx++){
    for (let dz = -1; dz <= 1; dz++){
      const arr = gridBuckets.get(gridKey(cx + dx, cz + dz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++){
        const o = arr[i];
        if (o._stamp === gridStamp || o.active === false) continue;
        o._stamp = gridStamp;
        
        // 核心：不仅要 XZ 平面相交，且高度 Y 也必须落在障碍物的区间内
        if (y >= o.minY - 0.5 && y < o.maxY - 0.1) {
          if (Math.abs(x - o.x) < o.hw + r && Math.abs(z - o.z) < o.hd + r) return true;
        }
      }
    }
  }
  return false;
}

/* 寻找脚下的落脚点高度：返回玩家在该 XZ 坐标能站立的最高高度 */
function getGroundY(x, z, r, currentY){
  let maxGround = 0; // 默认为地面高度
  gridStamp++;
  const cx = gridCell(x), cz = gridCell(z);
  for (let dx = -1; dx <= 1; dx++){
    for (let dz = -1; dz <= 1; dz++){
      const arr = gridBuckets.get(gridKey(cx + dx, cz + dz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++){
        const o = arr[i];
        if (o._stamp === gridStamp || o.active === false) continue;
        o._stamp = gridStamp;
        
        if (Math.abs(x - o.x) < o.hw + r && Math.abs(z - o.z) < o.hd + r) {
          // 如果障碍物顶部低于玩家当前位置（防止穿模），且高于目前的落脚点
          if (o.maxY <= currentY + 0.6 && o.maxY > maxGround) {
             maxGround = o.maxY;
          }
        }
      }
    }
  }
  return maxGround;
}