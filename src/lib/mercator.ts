/**
 * Web Mercator, as OpenStreetMap's tiles are cut (wiki.openstreetmap.org,
 * «Slippy map tilenames»): at zoom z the world is 256·2^z pixels square,
 * x from the date line east, y from the top down. The map of the salon's
 * pin (src/components/osm-map.tsx) draws tiles and the pin with this, so no
 * map library is needed. No browser and no Next.js here: the tests call it.
 */
export const TILE = 256;
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 19;
/** Where the square world ends north and south. */
export const MAX_LAT = 85.05112878;

export type LatLng = { lat: number; lng: number };
export type Px = { x: number; y: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const clampZoom = (z: number) => clamp(Math.round(z), MIN_ZOOM, MAX_ZOOM);
const worldSize = (z: number) => TILE * 2 ** z;

/** A place's pixel in the world at zoom z. */
export function project({ lat, lng }: LatLng, z: number): Px {
  const size = worldSize(z);
  const phi = (clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * size,
    y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * size,
  };
}

/** The place at a pixel of the world at zoom z; east and west wrap, north and south stop at the edge. */
export function unproject({ x, y }: Px, z: number): LatLng {
  const size = worldSize(z);
  // x 0 is the date line (−180°); a pixel beyond either edge of the world wraps to its copy inside
  const lng = (((((x / size) * 360) % 360) + 360) % 360) - 180;
  const n = Math.PI * (1 - (2 * clamp(y, 0, size)) / size);
  return { lat: (Math.atan(Math.sinh(n)) * 180) / Math.PI, lng };
}

/** An OpenStreetMap tile's address. */
export const tileUrl = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

export type Tile = { key: string; url: string; left: number; top: number };

/**
 * The tiles that cover a w×h view whose middle is the world pixel `center`
 * at zoom z, each with its place in the view. East and west wrap round the
 * world; above and below it there are none.
 */
export function tilesFor(center: Px, w: number, h: number, z: number): Tile[] {
  const n = 2 ** z;
  const left = center.x - w / 2;
  const top = center.y - h / 2;
  const out: Tile[] = [];
  const x0 = Math.floor(left / TILE);
  const x1 = Math.floor((left + w - 1) / TILE);
  const y0 = Math.max(0, Math.floor(top / TILE));
  const y1 = Math.min(n - 1, Math.floor((top + h - 1) / TILE));
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const wx = ((tx % n) + n) % n;
      out.push({ key: `${z}/${tx}/${ty}`, url: tileUrl(z, wx, ty), left: Math.round(tx * TILE - left), top: Math.round(ty * TILE - top) });
    }
  }
  return out;
}

/** Where a place lands in a w×h view whose middle is `center` (world pixels at zoom z). */
export function toView(place: LatLng, center: Px, w: number, h: number, z: number): Px {
  const p = project(place, z);
  const size = worldSize(z);
  // the nearer copy of the world, east or west
  let dx = p.x - center.x;
  if (dx > size / 2) dx -= size;
  if (dx < -size / 2) dx += size;
  return { x: w / 2 + dx, y: h / 2 + (p.y - center.y) };
}

/** The place at a point of a w×h view whose middle is `center` (world pixels at zoom z). */
export const fromView = (pt: Px, center: Px, w: number, h: number, z: number): LatLng => unproject({ x: center.x + pt.x - w / 2, y: center.y + pt.y - h / 2 }, z);

/** Six decimals: about 10 cm, as the pin is kept (location-form.ts). */
export const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
