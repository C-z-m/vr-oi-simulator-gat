'use strict';

const ZONES = {};
let currentZoneId = 'classroom';

function registerZone(zone){
  if (!zone || !zone.id) return;
  ZONES[zone.id] = zone;
}

function getCurrentZone(){ return ZONES[currentZoneId] || null; }
function setCurrentZone(id){ if (!ZONES[id]) return false; currentZoneId = id; return true; }

registerZone({ 
  id: 'classroom', 
  label: '考场', 
  bounds: { minX: -7.5, maxX: 7.5, minZ: -6.5, maxZ: 6.5 } 
});

registerZone({ 
  id: 'street', 
  label: '街道', 
  bounds: { minX: -25, maxX: 185, minZ: -105, maxZ: 105 } 
});

// 获取当前区域边界
function getZoneBounds() {
  const zone = getCurrentZone();
  return zone ? zone.bounds : { minX: -7.5, maxX: 7.5, minZ: -6.5, maxZ: 6.5 };
}

// 【新增】统一把坐标限制在当前区域内（防止越界）
function clampToZone(x, z) {
  const b = getZoneBounds();
  return {
    x: Math.max(b.minX, Math.min(b.maxX, x)),
    z: Math.max(b.minZ, Math.min(b.maxZ, z))
  };
}