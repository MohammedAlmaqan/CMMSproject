// ============================================================
// Tactical Dashboard Grid — 3D Background Effect
// ============================================================

import { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface TacticalGridProps {
  rowCount: number;
  columnCount: number;
  spacing: number;
  color: string;
}

function TacticalGrid({ rowCount, columnCount, spacing, color }: TacticalGridProps) {
  const offsetX = ((columnCount - 1) * spacing) / 2;
  const offsetY = ((rowCount - 1) * spacing) / 2;

  const rows = useMemo(() => {
    const result: { id: string; geometry: THREE.BufferGeometry; y: number }[] = [];
    for (let r = 0; r < rowCount; r++) {
      const geometry = new THREE.BufferGeometry();
      const y = r * spacing - offsetY;
      geometry.setAttribute('position', new THREE.BufferAttribute(
        new Float32Array([
          -offsetX, y, 0,
          (columnCount - 1) * spacing - offsetX, y, 0,
        ]),
        3
      ));
      geometry.computeBoundingSphere();
      result.push({ id: `h-${r}`, geometry, y });
    }
    return result;
  }, [rowCount, columnCount, spacing, offsetX, offsetY]);

  const columns = useMemo(() => {
    const result: { id: string; geometry: THREE.BufferGeometry; x: number }[] = [];
    for (let c = 0; c < columnCount; c++) {
      const geometry = new THREE.BufferGeometry();
      const x = c * spacing - offsetX;
      geometry.setAttribute('position', new THREE.BufferAttribute(
        new Float32Array([
          x, -offsetY, 0,
          x, (rowCount - 1) * spacing - offsetY, 0,
        ]),
        3
      ));
      geometry.computeBoundingSphere();
      result.push({ id: `v-${c}`, geometry, x });
    }
    return result;
  }, [rowCount, columnCount, spacing, offsetX, offsetY]);

  const lineRefs = useRef<(THREE.Line | null)[]>([]);
  const totalLines = rows.length + columns.length;

  if (lineRefs.current.length !== totalLines) {
    lineRefs.current = new Array(totalLines).fill(null);
  }

  useFrame(({ clock }) => {
    for (let i = 0; i < rowCount; i++) {
      const ref = lineRefs.current[i];
      if (!ref) continue;
      const y = rows[i].y;
      const waveY = y + Math.sin(clock.elapsedTime * 0.15 + y * 0.05) * 0.3;
      ref.geometry.attributes.position.setZ(0, waveY);
      ref.geometry.attributes.position.setZ(1, waveY);
      ref.geometry.attributes.position.needsUpdate = true;
    }
    for (let j = 0; j < columnCount; j++) {
      const ref = lineRefs.current[rowCount + j];
      if (!ref) continue;
      const x = columns[j].x;
      const waveX = x + Math.cos(clock.elapsedTime * 0.15 + x * 0.05) * 0.3;
      ref.geometry.attributes.position.setZ(0, waveX);
      ref.geometry.attributes.position.setZ(1, waveX);
      ref.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <group>
      {rows.map((row, index) => (
        <line
          key={row.id}
          ref={(el) => { lineRefs.current[index] = el as unknown as THREE.Line; }}
        >
          <primitive object={row.geometry} attach="geometry" />
          <lineBasicMaterial attach="material-0" color={color} toneMapped={false} transparent />
        </line>
      ))}
      {columns.map((col, index) => (
        <line
          key={col.id}
          ref={(el) => { lineRefs.current[rowCount + index] = el as unknown as THREE.Line; }}
        >
          <primitive object={col.geometry} attach="geometry" />
          <lineBasicMaterial attach="material-0" color={color} toneMapped={false} transparent />
        </line>
      ))}
    </group>
  );
}

interface TelemetryDotsProps {
  dotColor: string;
}

function TelemetryDots({ dotColor }: TelemetryDotsProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const positionsArray = useMemo(() => new Float32Array(15 * 3), []);

  const pointData = useMemo(() => {
    const boundsX = 14 * 0.25;
    const boundsY = 11 * 0.25;
    const data: {
      startX: number; startY: number; speed: number;
      freqX: number; freqY: number; ampX: number; ampY: number;
    }[] = [];
    for (let i = 0; i < 15; i++) {
      data.push({
        startX: (Math.random() - 0.5) * boundsX * 2,
        startY: (Math.random() - 0.5) * boundsY * 2,
        speed: 0.2 + Math.random() * 0.3,
        freqX: 0.5 + Math.random(),
        freqY: 0.5 + Math.random(),
        ampX: 0.2 + Math.random() * 0.3,
        ampY: 0.2 + Math.random() * 0.3,
      });
    }
    return data;
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < 15; i++) {
      const pd = pointData[i];
      const t = (state.clock.elapsedTime * pd.speed + i * 0.1) % 4;
      const cycle = t > 2 ? 4 - t : t;
      const x = pd.startX + Math.sin(state.clock.elapsedTime * pd.freqX + i) * pd.ampX;
      const y = pd.startY + Math.cos(state.clock.elapsedTime * pd.freqY + i) * pd.ampY;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = cycle;
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positionsArray, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        attach="material-0"
        size={0.08}
        color={dotColor}
        toneMapped={false}
        sizeAttenuation={true}
        transparent={true}
      />
    </points>
  );
}

function SceneContents() {
  const { camera, gl } = useThree();

  useMemo(() => {
    gl.setClearColor(0x000000, 0);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.lookAt(0, 0, 0);
    }
  }, [camera, gl]);

  return (
    <>
      <ambientLight intensity={0.5} />
      <TacticalGrid rowCount={25} columnCount={30} spacing={0.25} color="#D97706" />
      <TelemetryDots dotColor="#D97706" />
    </>
  );
}

export default function TacticalDashboardGrid() {
  const frustumSize = 10;
  const aspect = typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 2;
  const cameraPosition: [number, number, number] = [frustumSize * aspect, frustumSize, frustumSize];

  return (
    <div className="kpi-canvas-container">
      <Canvas
        orthographic
        camera={{ position: cameraPosition, zoom: 50, near: 0.1, far: 1000 }}
        gl={{ antialias: true, alpha: true }}
      >
        <SceneContents />
      </Canvas>
    </div>
  );
}
