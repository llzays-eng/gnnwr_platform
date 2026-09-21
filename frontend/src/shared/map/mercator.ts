/** Web 墨卡托。离线图纸底自己做投影, 不依赖任何地图 SDK。 */
const R = 6378137;
const MAX_LAT = 85.05112878;

export const lngToX = (lng: number): number => (R * lng * Math.PI) / 180;

export const latToY = (lat: number): number => {
  const l = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  return R * Math.log(Math.tan(Math.PI / 4 + (l * Math.PI) / 360));
};

export const xToLng = (x: number): number => (x / R) * (180 / Math.PI);

export const yToLat = (y: number): number =>
  (360 / Math.PI) * Math.atan(Math.exp(y / R)) - 90;

/** zoom → 每米对应多少像素 */
export const scaleOf = (zoom: number): number => (256 * 2 ** zoom) / (2 * Math.PI * R);
