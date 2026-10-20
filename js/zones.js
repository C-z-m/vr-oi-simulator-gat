'use strict';

const ZONES = {};
let currentZoneId = 'classroom';

function registerZone(zone){
  if (!zone || !zone.id) return;
  ZONES[zone.id] = zone;
}

function getCurrentZone(){ return ZONES[currentZoneId] || null; }
function setCurrentZone(id){ if (!ZONES[id]) return false; currentZoneId = id; return true; }

registerZone({ id: 'classroom', label: '考场', bounds: { minX: -7.5, maxX: 7.5, minZ: -6.5, maxZ: 6.5 } });

// 扩充为 200x200 的超大城市
registerZone({ id: 'street', label: '街道', bounds: { minX: 7.5, maxX: 180, minZ: -100, maxZ: 100 } });

function getZoneBounds() {
  return { minX: -7.5, maxX: 180, minZ: -100, maxZ: 100 };
}