"use client";

import { useRef, useState, useMemo, useEffect } from "react";
import { Canvas, useFrame, ThreeEvent } from "@react-three/fiber";
import {
  OrbitControls,
  Text,
  Html,
} from "@react-three/drei";
import * as THREE from "three";
import { CitySchema, Building, District } from "@/types/city";

interface CityRendererProps {
  city: CitySchema;
  highlightedBuildings: string[];
  cameraTarget: string | null;
  detailSelectionTarget: string | null;
  selectedDistrictId: string | null;
  onDistrictClick: (districtId: string) => void;
  onBuildingClick: (building: Building) => void;
}

interface DistrictLayout {
  district: District;
  position: [number, number, number];
  size: [number, number];
  cols: number;
  neighborhood: string;
}

function seededHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function WindowGrid({
  width,
  height,
  depth,
  buildingId,
  bodyBottom,
}: {
  width: number;
  height: number;
  depth: number;
  buildingId: string;
  bodyBottom: number;
}) {
  const windows = useMemo(() => {
    const items: {
      key: string;
      position: [number, number, number];
      rotation: [number, number, number];
      lit: boolean;
    }[] = [];

    const windowSize = 0.08;
    const step = 0.2;
    const minY = bodyBottom + 0.22;
    const maxY = bodyBottom + height - 0.2;
    const baseSeed = seededHash(buildingId);

    const xCount = Math.max(1, Math.floor((width - 0.2) / step));
    const zCount = Math.max(1, Math.floor((depth - 0.2) / step));

    let idx = 0;
    for (let yi = 0; minY + yi * step <= maxY; yi++) {
      const y = minY + yi * step;

      for (let xi = 0; xi < xCount; xi++) {
        const x = -((xCount - 1) * step) / 2 + xi * step;
        const lit = seededRandom(baseSeed + idx * 17) > 0.42;
        items.push({
          key: `z-${yi}-${xi}`,
          position: [x, y, depth / 2 + 0.011],
          rotation: [0, 0, 0],
          lit,
        });
        idx++;
      }

      for (let zi = 0; zi < zCount; zi++) {
        const z = -((zCount - 1) * step) / 2 + zi * step;
        const lit = seededRandom(baseSeed + idx * 23) > 0.42;
        items.push({
          key: `x-${yi}-${zi}`,
          position: [width / 2 + 0.011, y, z],
          rotation: [0, -Math.PI / 2, 0],
          lit,
        });
        idx++;
      }
    }

    return { items, windowSize };
  }, [width, height, depth, buildingId, bodyBottom]);

  return (
    <>
      {windows.items.map((windowItem) => (
        <mesh
          key={windowItem.key}
          position={windowItem.position}
          rotation={windowItem.rotation}
        >
          <planeGeometry args={[windows.windowSize, windows.windowSize]} />
          <meshStandardMaterial
            color={windowItem.lit ? "#88ccff" : "#112233"}
            emissive={windowItem.lit ? "#88ccff" : "#112233"}
            emissiveIntensity={windowItem.lit ? 0.4 : 0.05}
            roughness={0.2}
            metalness={0.05}
          />
        </mesh>
      ))}
    </>
  );
}

function StreetLight({
  position,
  armDirection,
}: {
  position: [number, number, number];
  armDirection: [number, number, number];
}) {
  const armAngle = Math.atan2(armDirection[2], armDirection[0]);
  const lampOffset = 0.6;
  const lampPos: [number, number, number] = [
    position[0] + armDirection[0] * lampOffset,
    position[1] + 2.2,
    position[2] + armDirection[2] * lampOffset,
  ];

  return (
    <group>
      <mesh position={[position[0], position[1] + 1.1, position[2]]} castShadow receiveShadow>
        <cylinderGeometry args={[0.03, 0.04, 2.2, 6]} />
        <meshStandardMaterial color="#2a2f3a" roughness={0.8} metalness={0.2} />
      </mesh>

      <mesh
        position={[position[0] + armDirection[0] * 0.3, position[1] + 2.2, position[2] + armDirection[2] * 0.3]}
        rotation={[0, -armAngle, 0]}
        castShadow
      >
        <boxGeometry args={[0.6, 0.04, 0.04]} />
        <meshStandardMaterial color="#353c49" roughness={0.75} metalness={0.15} />
      </mesh>

      <mesh position={lampPos} castShadow>
        <sphereGeometry args={[0.1, 10, 10]} />
        <meshStandardMaterial
          color="#fffacc"
          emissive="#fffacc"
          emissiveIntensity={1.2}
          roughness={0.25}
          metalness={0.1}
        />
      </mesh>

      <pointLight
        position={lampPos}
        color="#ffe8aa"
        intensity={0.4}
        distance={6}
        decay={2}
      />
    </group>
  );
}

// Single building mesh
function BuildingMesh({
  building,
  position,
  highlighted,
  lowPerf,
  onClick,
}: {
  building: Building;
  position: [number, number, number];
  highlighted: boolean;
  lowPerf: boolean;
  onClick: () => void;
}) {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const emissiveIntensity = highlighted ? 0.22 : hovered ? 0.12 : 0.04;

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.emissiveIntensity = emissiveIntensity;
    }
  }, [emissiveIntensity]);

  const width = Math.max(0.3, Math.min(building.linesOfCode / 200, 1.2));
  const height = Math.max(0.7, Math.min(building.height / 8, 14));
  const bodyBottom = 0.15;
  const baseHeight = 0.15;
  const roofColor = useMemo(
    () => `#${new THREE.Color(building.color).multiplyScalar(1.18).getHexString()}`,
    [building.color]
  );
  const plinthColor = useMemo(
    () => `#${new THREE.Color(building.color).multiplyScalar(0.42).getHexString()}`,
    [building.color]
  );
  const roofLabel = building.filename.length > 24
    ? `${building.filename.slice(0, 21)}...`
    : building.filename;

  return (
    <group position={position}>
      <mesh position={[0, baseHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.3, baseHeight, width + 0.3]} />
        <meshStandardMaterial color={plinthColor} roughness={0.9} metalness={0.12} />
      </mesh>

      <mesh
        position={[0, bodyBottom + height / 2, 0]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[width, height, width]} />
        <meshStandardMaterial
          ref={materialRef}
          color={building.color}
          emissive={building.color}
          emissiveIntensity={emissiveIntensity}
          metalness={0.12}
          roughness={0.46}
        />
      </mesh>

      <mesh position={[0, bodyBottom + height + 0.05, 0]} castShadow>
        <boxGeometry args={[width, 0.1, width]} />
        <meshStandardMaterial color={roofColor} roughness={0.72} metalness={0.08} />
      </mesh>

      {!lowPerf && (
        <WindowGrid
          width={width}
          height={height}
          depth={width}
          buildingId={building.id}
          bodyBottom={bodyBottom}
        />
      )}

      {!lowPerf && hovered && (
        <Html position={[0, height + 0.5, 0]} center>
          <div
            style={{
              background: "rgba(8,12,20,0.94)",
              color: "white",
              padding: "8px 12px",
              borderRadius: "8px",
              fontSize: "12px",
              whiteSpace: "nowrap",
              border: "1px solid #1f2b43",
              pointerEvents: "none",
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            }}
          >
            <div style={{ fontWeight: "bold" }}>{building.filename}</div>
            <div style={{ color: "#999", marginTop: 2 }}>
              {building.linesOfCode} LOC | Risk: {building.riskScore}
            </div>
          </div>
        </Html>
      )}

      <Text
        position={[0, bodyBottom + height + 0.11, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={Math.max(0.1, Math.min(width * 0.24, 0.2))}
        maxWidth={Math.max(width * 1.5, 0.7)}
        anchorX="center"
        anchorY="middle"
        color="#cfe8ff"
        outlineWidth={0.02}
        outlineColor="#0c1728"
      >
        {roofLabel}
      </Text>
    </group>
  );
}

// District ground + label
function DistrictGround({
  district,
  position,
  size,
  selected,
  onClick,
}: {
  district: District;
  position: [number, number, number];
  size: [number, number];
  selected: boolean;
  onClick: () => void;
}) {
  const padHeight = 0.04;
  const padWidth = size[0] + 0.5;
  const padDepth = size[1] + 0.5;
  const borderColor = selected ? "#67d4ff" : "#334466";

  return (
    <group position={position}>
      <mesh
        position={[size[0] / 2, padHeight / 2 + 0.005, size[1] / 2]}
        receiveShadow
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <boxGeometry args={[padWidth, padHeight, padDepth]} />
        <meshStandardMaterial
          color={selected ? "#13385f" : "#1a1a2e"}
          transparent
          opacity={selected ? 0.74 : 0.55}
          roughness={0.88}
          metalness={0.06}
        />
      </mesh>

      <mesh position={[size[0] / 2, padHeight / 2 + 0.006, size[1] / 2 - padDepth / 2]}>
        <boxGeometry args={[padWidth, 0.04, 0.06]} />
        <meshStandardMaterial color={borderColor} roughness={0.65} />
      </mesh>
      <mesh position={[size[0] / 2, padHeight / 2 + 0.006, size[1] / 2 + padDepth / 2]}>
        <boxGeometry args={[padWidth, 0.04, 0.06]} />
        <meshStandardMaterial color={borderColor} roughness={0.65} />
      </mesh>
      <mesh position={[size[0] / 2 - padWidth / 2, padHeight / 2 + 0.006, size[1] / 2]}>
        <boxGeometry args={[0.06, 0.04, padDepth]} />
        <meshStandardMaterial color={borderColor} roughness={0.65} />
      </mesh>
      <mesh position={[size[0] / 2 + padWidth / 2, padHeight / 2 + 0.006, size[1] / 2]}>
        <boxGeometry args={[0.06, 0.04, padDepth]} />
        <meshStandardMaterial color={borderColor} roughness={0.65} />
      </mesh>

      <Text
        position={[size[0] / 2, 0.08, -0.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.25}
        color={selected ? "#8ee8ff" : "#6366f1"}
        anchorX="center"
        anchorY="middle"
        maxWidth={size[0]}
      >
        {district.name.length > 20
          ? "..." + district.name.slice(-18)
          : district.name}
      </Text>
    </group>
  );
}

// Road as a thin tube mesh
function RoadMesh({
  from,
  to,
  weight,
}: {
  from: [number, number, number];
  to: [number, number, number];
  weight: number;
}) {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.max(Math.sqrt(dx * dx + dz * dz), 0.2);
  const angle = Math.atan2(dz, dx);
  const roadWidth = THREE.MathUtils.clamp(0.35 + weight * 0.18, 0.4, 1.2);

  const laneGap = 0.08;
  const laneWidth = Math.max(0.12, (roadWidth - laneGap) / 2);
  const roadHeight = 0.02;

  const dashPositions = useMemo(() => {
    const positions: number[] = [];
    const dashLength = 0.3;
    const pattern = 0.6;
    for (let x = -length / 2 + dashLength / 2; x <= length / 2 - dashLength / 2; x += pattern) {
      positions.push(x);
    }
    return positions;
  }, [length]);

  return (
    <group position={[(from[0] + to[0]) / 2, 0.01, (from[2] + to[2]) / 2]} rotation={[0, angle, 0]}>
      <mesh position={[0, roadHeight / 2, laneGap / 2 + laneWidth / 2]} castShadow receiveShadow>
        <boxGeometry args={[length, roadHeight, laneWidth]} />
        <meshStandardMaterial color="#1a1f2e" roughness={0.9} metalness={0.04} />
      </mesh>

      <mesh position={[0, roadHeight / 2, -(laneGap / 2 + laneWidth / 2)]} castShadow receiveShadow>
        <boxGeometry args={[length, roadHeight, laneWidth]} />
        <meshStandardMaterial color="#1a1f2e" roughness={0.9} metalness={0.04} />
      </mesh>

      {dashPositions.map((x) => (
        <mesh key={`dash-${x}`} position={[x, roadHeight + 0.006, 0]} castShadow>
          <boxGeometry args={[0.3, 0.01, 0.05]} />
          <meshStandardMaterial color="#f6ce4f" roughness={0.55} metalness={0.08} />
        </mesh>
      ))}

      <mesh position={[0, roadHeight + 0.004, roadWidth / 2 - 0.03]} castShadow>
        <boxGeometry args={[length, 0.008, 0.03]} />
        <meshStandardMaterial color="#e5eefb" roughness={0.35} metalness={0.08} />
      </mesh>
      <mesh position={[0, roadHeight + 0.004, -(roadWidth / 2 - 0.03)]} castShadow>
        <boxGeometry args={[length, 0.008, 0.03]} />
        <meshStandardMaterial color="#e5eefb" roughness={0.35} metalness={0.08} />
      </mesh>
    </group>
  );
}

// Camera controller
function CameraController({
  target,
  detailSelectionTarget,
  buildingPositions,
  buildingHeights,
  cityCenter,
  citySpan,
}: {
  target: string | null;
  detailSelectionTarget: string | null;
  buildingPositions: Map<string, [number, number, number]>;
  buildingHeights: Map<string, number>;
  cityCenter: [number, number, number];
  citySpan: number;
}) {
  const controlsRef = useRef<{
    target: THREE.Vector3;
    update: () => void;
  } | null>(null);
  const keyState = useRef({
    w: false,
    a: false,
    s: false,
    d: false,
    q: false,
    e: false,
    shift: false,
  });
  const initializedRef = useRef(false);
  const sprintFactorRef = useRef(1);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key in keyState.current) {
        keyState.current[key as keyof typeof keyState.current] = true;
      }
      if (event.key === "Shift") {
        keyState.current.shift = true;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key in keyState.current) {
        keyState.current[key as keyof typeof keyState.current] = false;
      }
      if (event.key === "Shift") {
        keyState.current.shift = false;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    initializedRef.current = false;
  }, [cityCenter, citySpan]);

  useFrame(({ camera }, delta) => {
    if (!controlsRef.current) return;

    if (!initializedRef.current) {
      const [cx, _, cz] = cityCenter;
      const dist = THREE.MathUtils.clamp(citySpan * 0.9, 20, 90);
      camera.position.set(cx + dist * 0.55, Math.max(18, dist * 0.65), cz + dist * 0.55);
      controlsRef.current.target.set(cx, 1, cz);
      controlsRef.current.update();
      initializedRef.current = true;
    }

    if (target && buildingPositions.has(target)) {
      const pos = buildingPositions.get(target)!;
      const isDetailSelection = detailSelectionTarget === target;
      const height = buildingHeights.get(target) ?? 2;
      const targetVec = isDetailSelection
        ? new THREE.Vector3(pos[0], Math.max(1.2, height * 0.45), pos[2])
        : new THREE.Vector3(pos[0], 1.6, pos[2]);
      const distance = isDetailSelection
        ? THREE.MathUtils.clamp(3.8 + height * 0.65, 4.8, 14.5)
        : 4.2;
      const cameraY = isDetailSelection ? Math.max(height * 1.15, 5.4) : Math.max(4.6, pos[1] + 6.3);
      camera.position.lerp(
        new THREE.Vector3(pos[0] + distance, cameraY, pos[2] + distance),
        Math.min(delta * 2.8, 0.12)
      );
      controlsRef.current.target.lerp(targetVec, Math.min(delta * 2.8, 0.12));
      controlsRef.current.update();
      return;
    }

    const sprintTarget = keyState.current.shift ? 6 : 1;
    sprintFactorRef.current = THREE.MathUtils.lerp(
      sprintFactorRef.current,
      sprintTarget,
      Math.min(delta * 2.2, 0.2)
    );

    const baseSpeed = 8 * sprintFactorRef.current;
    const step = baseSpeed * delta;
    const forward = new THREE.Vector3()
      .subVectors(controlsRef.current.target, camera.position)
      .setY(0);
    if (forward.lengthSq() < 1e-4) {
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }

    const right = new THREE.Vector3()
      .crossVectors(forward, new THREE.Vector3(0, 1, 0))
      .normalize();

    const move = new THREE.Vector3();
    if (keyState.current.w) move.add(forward);
    if (keyState.current.s) move.addScaledVector(forward, -1);
    if (keyState.current.a) move.addScaledVector(right, -1);
    if (keyState.current.d) move.add(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(step);
      camera.position.add(move);
      controlsRef.current.target.add(move);
    }

    const lift = (keyState.current.e ? 1 : 0) - (keyState.current.q ? 1 : 0);
    if (lift !== 0) {
      const deltaY = lift * step * 0.85;
      camera.position.y = THREE.MathUtils.clamp(camera.position.y + deltaY, 0.06, 42);
      controlsRef.current.target.y = THREE.MathUtils.clamp(
        controlsRef.current.target.y + deltaY,
        -0.2,
        30
      );
    }
  });

  return (
    <OrbitControls
      ref={controlsRef as React.Ref<never>}
      makeDefault
      minDistance={2}
      maxDistance={85}
      enablePan
      maxPolarAngle={Math.PI / 2.2}
      enableDamping
      dampingFactor={0.05}
    />
  );
}

function CityScene({
  city,
  highlightedBuildings,
  cameraTarget,
  detailSelectionTarget,
  selectedDistrictId,
  onDistrictClick,
  onBuildingClick,
}: CityRendererProps) {
  const totalBuildingCount = useMemo(
    () => city.city.districts.reduce((sum, d) => sum + d.buildings.length, 0),
    [city]
  );
  const lowPerfMode = totalBuildingCount > 350;

  const layoutData = useMemo(() => {
    const spacing = 1.8;
    const districtPlans = city.city.districts.map((district) => {
      const cols = Math.max(1, Math.ceil(Math.sqrt(district.buildings.length)));
      const rows = Math.max(1, Math.ceil(district.buildings.length / cols));
      const neighborhood = district.name === "."
        ? "root"
        : district.name.split("/").slice(0, -1).join("/") || "root";
      return {
        district,
        cols,
        rows,
        neighborhood,
        size: [cols * spacing, rows * spacing] as [number, number],
      };
    });

    const neighborhoodMap = new Map<string, typeof districtPlans>();
    for (const plan of districtPlans) {
      if (!neighborhoodMap.has(plan.neighborhood)) {
        neighborhoodMap.set(plan.neighborhood, []);
      }
      neighborhoodMap.get(plan.neighborhood)!.push(plan);
    }

    const neighborhoodEntries = [...neighborhoodMap.entries()].sort(([a], [b]) => a.localeCompare(b));
    if (neighborhoodEntries.length === 0) {
      return { districtLayouts: [] as DistrictLayout[], neighborhoodLabels: [] as { name: string; position: [number, number, number] }[] };
    }

    const neighborhoodBlocks = neighborhoodEntries.map(([name, plans]) => {
      const childCols = Math.max(1, Math.ceil(Math.sqrt(plans.length)));
      const childRows = Math.max(1, Math.ceil(plans.length / childCols));
      const maxDistrictW = Math.max(...plans.map((p) => p.size[0]), spacing);
      const maxDistrictD = Math.max(...plans.map((p) => p.size[1]), spacing);
      const childCellW = maxDistrictW + 3.6;
      const childCellD = maxDistrictD + 3.6;
      return {
        name,
        plans,
        childCols,
        childRows,
        childCellW,
        childCellD,
        width: childCols * childCellW,
        depth: childRows * childCellD,
      };
    });

    const neighborhoodGridCols = Math.ceil(Math.sqrt(neighborhoodBlocks.length));
    const maxBlockW = Math.max(...neighborhoodBlocks.map((b) => b.width), 10);
    const maxBlockD = Math.max(...neighborhoodBlocks.map((b) => b.depth), 10);
    const neighborhoodCellW = maxBlockW + 9;
    const neighborhoodCellD = maxBlockD + 9;
    const rootOffsetX = -((neighborhoodGridCols - 1) * neighborhoodCellW) / 2;

    const districtLayouts: DistrictLayout[] = [];
    const neighborhoodLabels: { name: string; position: [number, number, number] }[] = [];

    for (let i = 0; i < neighborhoodBlocks.length; i++) {
      const block = neighborhoodBlocks[i];
      const gx = i % neighborhoodGridCols;
      const gz = Math.floor(i / neighborhoodGridCols);

      const blockCenterX = rootOffsetX + gx * neighborhoodCellW;
      const blockCenterZ = -((Math.ceil(neighborhoodBlocks.length / neighborhoodGridCols) - 1) * neighborhoodCellD) / 2 + gz * neighborhoodCellD;
      neighborhoodLabels.push({
        name: block.name,
        position: [blockCenterX, 0.02, blockCenterZ - block.depth / 2 - 1.4],
      });

      const localOffsetX = blockCenterX - block.width / 2;
      const localOffsetZ = blockCenterZ - block.depth / 2;

      for (let j = 0; j < block.plans.length; j++) {
        const plan = block.plans[j];
        const lx = j % block.childCols;
        const lz = Math.floor(j / block.childCols);
        const districtCenterX = localOffsetX + lx * block.childCellW + block.childCellW / 2;
        const districtCenterZ = localOffsetZ + lz * block.childCellD + block.childCellD / 2;
        districtLayouts.push({
          district: plan.district,
          cols: plan.cols,
          neighborhood: plan.neighborhood,
          size: plan.size,
          position: [districtCenterX - plan.size[0] / 2, 0, districtCenterZ - plan.size[1] / 2],
        });
      }
    }

    return { districtLayouts, neighborhoodLabels };
  }, [city]);

  const districtLayouts = layoutData.districtLayouts;
  const neighborhoodLabels = layoutData.neighborhoodLabels;

  const streetLightData = useMemo(() => {
    if (lowPerfMode || districtLayouts.length >= 60) return [] as {
      key: string;
      position: [number, number, number];
      armDirection: [number, number, number];
    }[];

    const lights: {
      key: string;
      position: [number, number, number];
      armDirection: [number, number, number];
    }[] = [];

    districtLayouts.forEach((layout) => {
      const corners: [number, number, number][] = [
        [layout.position[0] - 0.3, 0, layout.position[2] - 0.3],
        [layout.position[0] + layout.size[0] + 0.3, 0, layout.position[2] - 0.3],
        [layout.position[0] - 0.3, 0, layout.position[2] + layout.size[1] + 0.3],
        [layout.position[0] + layout.size[0] + 0.3, 0, layout.position[2] + layout.size[1] + 0.3],
      ];

      const centerX = layout.position[0] + layout.size[0] / 2;
      const centerZ = layout.position[2] + layout.size[1] / 2;

      corners.forEach((corner, idx) => {
        const dirX = corner[0] - centerX;
        const dirZ = corner[2] - centerZ;
        const len = Math.max(Math.hypot(dirX, dirZ), 1e-6);
        lights.push({
          key: `${layout.district.id}-${idx}`,
          position: corner,
          armDirection: [dirX / len, 0, dirZ / len],
        });
      });
    });

    return lights;
  }, [districtLayouts, lowPerfMode]);

  const buildingPositions = useMemo(() => {
    const positions = new Map<string, [number, number, number]>();
    const spacing = 1.8;

    for (const layout of districtLayouts) {
      let bx = 0;
      let bz = 0;

      for (const building of layout.district.buildings) {
        positions.set(building.id, [layout.position[0] + bx * spacing, 0, layout.position[2] + bz * spacing]);
        bx++;
        if (bx >= layout.cols) {
          bx = 0;
          bz++;
        }
      }
    }

    return positions;
  }, [districtLayouts]);

  const sceneBounds = useMemo(() => {
    if (districtLayouts.length === 0) {
      return {
        center: [0, 0, 0] as [number, number, number],
        span: 50,
        groundSize: 120,
      };
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const layout of districtLayouts) {
      minX = Math.min(minX, layout.position[0] - 2);
      maxX = Math.max(maxX, layout.position[0] + layout.size[0] + 2);
      minZ = Math.min(minZ, layout.position[2] - 2);
      maxZ = Math.max(maxZ, layout.position[2] + layout.size[1] + 2);
    }

    const width = maxX - minX;
    const depth = maxZ - minZ;
    const span = Math.max(width, depth) + 24;
    return {
      center: [(minX + maxX) / 2, 0, (minZ + maxZ) / 2] as [number, number, number],
      span,
      groundSize: Math.max(140, span + 40),
    };
  }, [districtLayouts]);

  const buildingHeights = useMemo(() => {
    const heights = new Map<string, number>();
    for (const district of city.city.districts) {
      for (const building of district.buildings) {
        const renderedHeight = Math.max(0.7, Math.min(building.height / 8, 14));
        heights.set(building.id, renderedHeight);
      }
    }
    return heights;
  }, [city]);

  const roadData = useMemo(() => {
    return city.city.roads
      .slice(0, lowPerfMode ? 60 : 120)
      .map((road) => {
        const fromPos = buildingPositions.get(road.from);
        const toPos = buildingPositions.get(road.to);
        if (!fromPos || !toPos) return null;
        return { from: fromPos, to: toPos, weight: road.weight };
      })
      .filter(Boolean) as {
      from: [number, number, number];
      to: [number, number, number];
      weight: number;
    }[];
  }, [city, buildingPositions, lowPerfMode]);

  const highlightSet = useMemo(
    () => new Set(highlightedBuildings),
    [highlightedBuildings]
  );

  return (
    <>
      <color attach="background" args={["#090e18"]} />
      <ambientLight intensity={0.15} />
      <hemisphereLight intensity={0.22} color="#6f87a7" groundColor="#0d1018" />
      <directionalLight
        position={[22, 34, 16]}
        intensity={0.85}
      />
      <directionalLight
        position={[-18, 20, -12]}
        intensity={0.25}
        color="#3a4a6a"
      />
      <pointLight position={[-12, 14, -8]} intensity={0.2} color="#4f7db5" />
      <fogExp2 attach="fog" args={["#080d18", 0.012]} />

      <CameraController
        target={cameraTarget}
        detailSelectionTarget={detailSelectionTarget}
        buildingPositions={buildingPositions}
        buildingHeights={buildingHeights}
        cityCenter={sceneBounds.center}
        citySpan={sceneBounds.span}
      />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[sceneBounds.groundSize, sceneBounds.groundSize]} />
        <meshStandardMaterial color="#0d1520" roughness={0.95} metalness={0.03} />
      </mesh>
      <gridHelper args={[sceneBounds.groundSize, 90, "#263247", "#182333"]} />
      <gridHelper
        args={[
          sceneBounds.groundSize,
          Math.max(8, Math.floor(sceneBounds.groundSize / 18)),
          "#1e2a3a",
          "#1e2a3a",
        ]}
        position={[0, 0.005, 0]}
      />

      {/* Districts */}
      {districtLayouts.map((dl) => (
        <DistrictGround
          key={dl.district.id}
          district={dl.district}
          position={dl.position}
          size={dl.size}
          selected={selectedDistrictId === dl.district.id}
          onClick={() => onDistrictClick(dl.district.id)}
        />
      ))}

      {neighborhoodLabels.map((neighborhood) => (
        <Text
          key={neighborhood.name}
          position={neighborhood.position}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.35}
          color="#95f0ff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.03}
          outlineColor="#081424"
        >
          {neighborhood.name}
        </Text>
      ))}

      {streetLightData.map((light) => (
        <StreetLight
          key={light.key}
          position={light.position}
          armDirection={light.armDirection}
        />
      ))}

      {/* Buildings */}
      {city.city.districts.flatMap((district) =>
        district.buildings.map((building) => {
          const pos = buildingPositions.get(building.id);
          if (!pos) return null;
          return (
            <BuildingMesh
              key={building.id}
              building={building}
              position={pos}
              highlighted={highlightSet.has(building.id)}
              lowPerf={lowPerfMode}
              onClick={() => onBuildingClick(building)}
            />
          );
        })
      )}

      {/* Roads */}
      {roadData.map((road, i) => (
        <RoadMesh key={i} from={road.from} to={road.to} weight={road.weight} />
      ))}

    </>
  );
}

export default function CityRenderer(props: CityRendererProps) {
  const [mounted, setMounted] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [canvasKey, setCanvasKey] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0a1a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#666",
        }}
      >
        Initializing 3D renderer...
      </div>
    );
  }

  if (contextLost) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0a1a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#9fb0c8",
          fontSize: 14,
          padding: 24,
          textAlign: "center",
        }}
      >
        WebGL context was lost repeatedly. Reload the page to retry.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        key={canvasKey}
        dpr={[1, 1]}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: "low-power",
          preserveDrawingBuffer: false,
          stencil: false,
        }}
        camera={{ position: [15, 20, 25], fov: 50 }}
        shadows={false}
        style={{ width: "100%", height: "100%", background: "#0a0a1a" }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.18;
          gl.shadowMap.enabled = false;
          gl.domElement.addEventListener("webglcontextlost", (event) => {
            event.preventDefault();
            setRetryCount((count) => {
              const next = count + 1;
              if (next >= 3) {
                setContextLost(true);
              } else {
                window.setTimeout(() => setCanvasKey((k) => k + 1), 250);
              }
              return next;
            });
          });
          gl.domElement.addEventListener("webglcontextrestored", () => {
            setRetryCount(0);
          });
        }}
      >
        <CityScene {...props} />
      </Canvas>
    </div>
  );
}
