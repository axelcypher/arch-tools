import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { sohlenPolygon, unterbau } from '../calc';
import type { Point } from '../geometry';
import type { OutlineShape, Project, Storey } from '../model';
import { modellSolidFaces } from '../modellSolid';
import { polygoneOf } from '../polygon';
import type { Point3 } from '../roof';
import { solidFaces } from '../roof';

/**
 * Bausteine der 3D-Ansichten (Flächenrechner, GRZ-Nachweis): Körper der BGF-Umrisse bis zur Dachhaut,
 * Unterbau (Bodenplatte, Split-Level), Prismen, Kamera einpassen, Aufräumen.
 * Koordinaten: Grundriss (x, y) + Höhe z → three.js (x, z, y), y-Achse nach oben.
 */

/** Körperflächen eines Umrisses; bei Dach aus Modell als Höhenfeld */
export function outlineFaces(s: OutlineShape, project: Project, floorZ: number, storeyH: number) {
  const h = s.hoehe ?? storeyH;
  if (s.dach?.typ === 'modell' && project.dachModell) {
    const storey = project.storeys.find((st) => st.shapes.includes(s));
    return modellSolidFaces(project, storey, s, floorZ);
  }
  return solidFaces(s.points, s.dach, h);
}

export function facesToGeometry(f: { tops: Point3[][]; sides: Point3[][]; bottom: Point3[] }, z0: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const push = (p: Point3) => pos.push(p.x, p.z + z0, p.y);
  const addPoly = (poly: Point3[], proj: (p: Point3) => THREE.Vector2) => {
    if (poly.length < 3) return;
    const tris = THREE.ShapeUtils.triangulateShape(poly.map(proj), []);
    for (const [a, b, c] of tris) {
      push(poly[a]);
      push(poly[b]);
      push(poly[c]);
    }
  };
  const xy = (p: Point3) => new THREE.Vector2(p.x, p.y);
  for (const t of f.tops) addPoly(t, xy);
  addPoly(f.bottom, xy);
  for (const s of f.sides) {
    // senkrechte Fläche: in (Länge entlang der Wand, Höhe) triangulieren
    const a = s[0];
    const b = s[s.length - 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    addPoly(s, (p) => new THREE.Vector2((p.x - a.x) * ux + (p.y - a.y) * uy, p.z));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

export interface UnterbauKoerper {
  art: 'versatz' | 'absenkung' | 'sohle';
  polygone: { aussen: Point[]; loecher: Point[][] }[];
  /** Höhen relativ zum Geschossfußboden */
  unten: number;
  oben: number;
}

/** Körper unter dem Geschossfußboden – dieselben Teile wie im BRI (calc.unterbau) */
export function unterbauKoerper(s: OutlineShape, storey: Storey, project: Project): UnterbauKoerper[] {
  const out: UnterbauKoerper[] = [];
  const v = s.versatz ?? 0;
  const ganz = [{ aussen: s.points, loecher: [] as Point[][] }];
  // ein höher liegender Fußboden verkleinert den Körper – das zeigt der Hauptkörper nicht; nur Absenkungen darstellen
  if (v < 0) out.push({ art: 'versatz', polygone: ganz, unten: v, oben: 0 });
  for (const t of unterbau(s, storey, project)) {
    if (t.art === 'absenkung' && t.raumId) {
      const r = storey.shapes.find((x) => x.id === t.raumId);
      if (r) out.push({ art: 'absenkung', polygone: [{ aussen: r.points, loecher: [] }], unten: r.versatz ?? 0, oben: v });
    } else if (t.art === 'sohle') {
      const sp = polygoneOf(sohlenPolygon(s, storey, project));
      const tiefe = Math.min(v, 0);
      if (sp.length) out.push({ art: 'sohle', polygone: sp, unten: tiefe - t.hoehe, oben: tiefe });
    }
  }
  return out;
}

/** senkrechtes Prisma über Polygonen mit Löchern von z0 bis z1 */
export function prismaGeometrie(polys: { aussen: Point[]; loecher: Point[][] }[], z0: number, z1: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const push = (x: number, y: number, z: number) => pos.push(x, z, y);
  for (const { aussen, loecher } of polys) {
    const v2 = (pts: Point[]) => pts.map((p) => new THREE.Vector2(p.x, p.y));
    const alle = [...aussen, ...loecher.flat()];
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(v2(aussen), loecher.map(v2))) {
      for (const z of [z0, z1]) {
        push(alle[a].x, alle[a].y, z);
        push(alle[b].x, alle[b].y, z);
        push(alle[c].x, alle[c].y, z);
      }
    }
    for (const ring of [aussen, ...loecher]) {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i];
        const q = ring[(i + 1) % ring.length];
        push(p.x, p.y, z0);
        push(q.x, q.y, z0);
        push(q.x, q.y, z1);
        push(p.x, p.y, z0);
        push(q.x, q.y, z1);
        push(p.x, p.y, z1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

export function fitCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, box: THREE.Box3) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.length() / 2, 2);
  const dist = r / Math.sin((camera.fov * Math.PI) / 360);
  const dir = new THREE.Vector3(1, 0.75, 1.2).normalize();
  camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
  camera.near = dist / 100;
  camera.far = dist * 20;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

export function disposeGroup(g: THREE.Group) {
  for (const o of [...g.children]) {
    g.remove(o);
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }
}

