import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { versiegelungInfo } from '@core/lageplan';
import type { Project } from '@core/model';
import { storeyElevations } from '@core/model';
import { useTheme } from '@core/platform/theme';
import { disposeGroup, facesToGeometry, fitCamera, outlineFaces, prismaGeometrie } from '@core/ui/three3d';
import type { Nachweis } from '../massNutzung';
import { useGrz } from '../store';

/**
 * 3D-Ansicht des GRZ-Nachweises: Gebäude je Geschoss (Vollgeschosse grün, übrige grau), Geländeoberfläche
 * aus dem Modell bzw. die Lageplan-Flächen auf ihrer Höhe und die gemittelte Geländeoberfläche je Geschoss
 * als Bezugsebene – so lässt sich die Geschossigkeit am Hang nachvollziehen.
 * Koordinaten: Grundriss (x, y) + Höhe z → three.js (x, z, y).
 */
export default function Gelaende3D({ project, n }: { project: Project; n: Nachweis }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const three = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; content: THREE.Group; fitted: boolean } | null>(null);
  const dunkel = useTheme((s) => s.theme) === 'dunkel';
  const selectedIds = useGrz((s) => s.selectedIds);
  const [ebene, setEbene] = useState(true);
  const [gebaeude, setGebaeude] = useState(true);

  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
    camera.position.set(30, 25, 30);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(40, 80, 25);
    scene.add(sun);
    const content = new THREE.Group();
    scene.add(content);
    three.current = { renderer, scene, camera, controls, content, fitted: false };
    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      disposeGroup(content);
      renderer.dispose();
      renderer.domElement.remove();
      three.current = null;
    };
  }, []);

  useEffect(() => {
    three.current?.renderer.setClearColor(dunkel ? 0x1a1d22 : 0xf4f5f7);
  }, [dunkel]);

  useEffect(() => {
    const t = three.current;
    if (!t) return;
    disposeGroup(t.content);
    const elev = storeyElevations(project);
    const vg = new Map(n.geschosse.map((g) => [g.storeyId, g]));

    // Gebäude
    if (gebaeude) {
      project.storeys.forEach((st, i) => {
        const g = vg.get(st.id);
        if (!g) return;
        const farbe = g.vollgeschoss ? 0x2e9d58 : 0x8a8f99;
        for (const s of st.shapes) {
          if (s.kind !== 'outline' || s.points.length < 3) continue;
          const geo = facesToGeometry(outlineFaces(s, project, elev[i], st.hoehe), elev[i]);
          const mat = new THREE.MeshStandardMaterial({
            color: s.subtract ? 0xc0392b : farbe,
            transparent: true,
            opacity: g.vollgeschoss ? 0.5 : 0.32,
            side: THREE.DoubleSide,
            depthWrite: false,
            roughness: 0.8,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.renderOrder = 3;
          t.content.add(mesh);
          t.content.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: g.vollgeschoss ? 0x1d6b3b : 0x5b6068 })));
        }
      });
    }

    // Gelände aus dem Modell
    if (project.gelaendeModell?.triangles.length) {
      const tr = project.gelaendeModell.triangles;
      const pos = new Float32Array(tr.length);
      for (let i = 0; i < tr.length; i += 3) {
        pos[i] = tr[i];
        pos[i + 1] = tr[i + 2];
        pos[i + 2] = tr[i + 1];
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x9cbf7a, side: THREE.DoubleSide, transparent: true, opacity: 0.75, roughness: 1 }));
      mesh.renderOrder = 1;
      t.content.add(mesh);
    }

    // Lageplan-Flächen auf ihrer Höhe (ohne Höhe: auf der gemittelten Geländeoberfläche)
    for (const f of project.lageplan?.flaechen ?? []) {
      if (f.points.length < 3) continue;
      const z = (f.hoehe ?? n.gelaende.hoehe) + 0.02;
      const geo = prismaGeometrie([{ aussen: f.points, loecher: [] }], z, z + 0.02);
      const sel = selectedIds.includes(f.id);
      const mat = new THREE.MeshStandardMaterial({
        color: sel ? 0xff7a00 : new THREE.Color(versiegelungInfo(f.versiegelung).color),
        transparent: true,
        opacity: f.nachbar ? 0.25 : 0.7,
        side: THREE.DoubleSide,
        roughness: 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 2;
      t.content.add(mesh);
    }

    // Bezugsebene: gemittelte Geländeoberfläche je Geschoss (Ring um das Gebäude)
    if (ebene) {
      const box = new THREE.Box3().setFromObject(t.content);
      const size = box.isEmpty() ? new THREE.Vector3(20, 0, 20) : box.getSize(new THREE.Vector3());
      const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
      const s = Math.max(size.x, size.z) * 1.4 + 6;
      const hoehen = [...new Set(n.geschosse.map((g) => Math.round(g.gelaende.mittel * 100) / 100))];
      for (const h of hoehen.length ? hoehen : [n.gelaende.hoehe]) {
        const geo = new THREE.PlaneGeometry(s, s);
        geo.rotateX(-Math.PI / 2);
        geo.translate(center.x, h, center.z);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x2a5bd7, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
        t.content.add(mesh);
        const rand = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x2a5bd7, transparent: true, opacity: 0.4 }));
        t.content.add(rand);
      }
    }

    const box = new THREE.Box3().setFromObject(t.content);
    if (!box.isEmpty() && !t.fitted) {
      fitCamera(t.camera, t.controls, box);
      t.fitted = true;
    }
  }, [project, n, ebene, gebaeude, selectedIds]);

  return (
    <div className="grz-3d">
      <div ref={hostRef} className="grz-3d-canvas" />
      <div className="canvas-controls grz-3d-controls">
        <label className="toggle">
          <input type="checkbox" checked={gebaeude} onChange={(e) => setGebaeude(e.target.checked)} />
          Gebäude
        </label>
        <label className="toggle" title="gemittelte Geländeoberfläche entlang der Außenwände je Geschoss – Bezug für „Deckenoberkante im Mittel über Gelände“">
          <input type="checkbox" checked={ebene} onChange={(e) => setEbene(e.target.checked)} />
          Bezugsebene Gelände
        </label>
        <button
          className="small"
          onClick={() => {
            const t = three.current;
            if (!t) return;
            const box = new THREE.Box3().setFromObject(t.content);
            if (!box.isEmpty()) fitCamera(t.camera, t.controls, box);
          }}
        >
          ⤢ Alles
        </button>
      </div>
      <div className="grz-3d-legende small-text">
        <span>
          <i style={{ background: '#2e9d58' }} /> Vollgeschoss
        </span>
        <span>
          <i style={{ background: '#8a8f99' }} /> kein Vollgeschoss
        </span>
        {project.gelaendeModell && (
          <span>
            <i style={{ background: '#9cbf7a' }} /> Gelände (IFC)
          </span>
        )}
        <span>
          <i style={{ background: 'rgba(42, 91, 215, 0.35)' }} /> Gelände im Mittel
        </span>
      </div>
    </div>
  );
}
