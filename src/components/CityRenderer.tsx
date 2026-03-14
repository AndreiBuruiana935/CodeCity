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
  onBuildingClick: (building: Building) => void;
}

interface DistrictLayout {
  district: District;
  position: [number, number, number];
  size: [number, number];
  cols: number;
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

  return (
    <group position={position}>
      <mesh
        position={[0, height / 2, 0]}
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

      {!lowPerf && (
        <>
          <mesh position={[0, height + 0.05, 0]} castShadow>
            <boxGeometry args={[width * 0.9, 0.08, width * 0.9]} />
            <meshStandardMaterial color="#0c1325" metalness={0.05} roughness={0.82} />
          </mesh>

          <mesh position={[0, height * 0.55, width / 2 + 0.01]}>
            <planeGeometry args={[width * 0.7, height * 0.62]} />
            <meshStandardMaterial
              color="#8fd5ff"
              emissive="#66ccff"
              emissiveIntensity={highlighted ? 0.28 : hovered ? 0.16 : 0.05}
              transparent
              opacity={0.15}
              roughness={0.15}
              metalness={0.05}
            />
          </mesh>
        </>
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
    </group>
  );
}

// District ground + label
function DistrictGround({
  district,
  position,
  size,
}: {
  district: District;
  position: [number, number, number];
  size: [number, number];
}) {
  return (
    <group position={position}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[size[0] / 2, -0.01, size[1] / 2]}
        receiveShadow
      >
        <planeGeometry args={[size[0] + 0.5, size[1] + 0.5]} />
        <meshStandardMaterial color="#1a1a2e" transparent opacity={0.4} />
      </mesh>
      <Text
        position={[size[0] / 2, 0.01, -0.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.25}
        color="#6366f1"
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
  const width = THREE.MathUtils.clamp(0.07 + weight * 0.09, 0.08, 0.22);

  return (
    <group position={[(from[0] + to[0]) / 2, 0, (from[2] + to[2]) / 2]} rotation={[0, angle, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
        <planeGeometry args={[length, width]} />
        <meshStandardMaterial color="#242b36" roughness={0.94} metalness={0.02} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.009, 0]}>
        <planeGeometry args={[length * 0.94, 0.018]} />
        <meshBasicMaterial color="#b5c2d6" transparent opacity={0.3} />
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
      camera.position.set(cx + dist * 0.55, Math.max(14, dist * 0.6), cz + dist * 0.55);
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
      maxDistance={100}
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
  onBuildingClick,
}: CityRendererProps) {
  const totalBuildingCount = useMemo(
    () => city.city.districts.reduce((sum, d) => sum + d.buildings.length, 0),
    [city]
  );
  const lowPerfMode = totalBuildingCount > 350;

  const districtLayouts = useMemo(() => {
    const districts = city.city.districts;
    const spacing = 1.8;
    const plans = districts.map((district) => {
      const cols = Math.max(1, Math.ceil(Math.sqrt(district.buildings.length)));
      const rows = Math.max(1, Math.ceil(district.buildings.length / cols));
      return {
        district,
        cols,
        rows,
        size: [cols * spacing, rows * spacing] as [number, number],
      };
    });

    const count = plans.length;
    if (count === 0) return [] as DistrictLayout[];

    const gridCols = Math.ceil(Math.sqrt(count));
    const gridRows = Math.ceil(count / gridCols);
    const maxWidth = Math.max(...plans.map((p) => p.size[0]), spacing);
    const maxDepth = Math.max(...plans.map((p) => p.size[1]), spacing);
    const cellW = maxWidth + 4.2;
    const cellD = maxDepth + 4.2;
    const offsetX = -((gridCols - 1) * cellW) / 2;
    const offsetZ = -((gridRows - 1) * cellD) / 2;

    return plans.map((plan, i) => {
      const gx = i % gridCols;
      const gz = Math.floor(i / gridCols);
      const jitterX = Math.sin(i * 1.71) * 0.7;
      const jitterZ = Math.cos(i * 1.37) * 0.7;
      const centerX = offsetX + gx * cellW + jitterX;
      const centerZ = offsetZ + gz * cellD + jitterZ;
      return {
        district: plan.district,
        cols: plan.cols,
        size: plan.size,
        position: [centerX - plan.size[0] / 2, 0, centerZ - plan.size[1] / 2] as [number, number, number],
      };
    });
  }, [city]);

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
      <ambientLight intensity={0.2} />
      <hemisphereLight intensity={0.22} color="#6f87a7" groundColor="#121a27" />
      <directionalLight
        position={[22, 34, 16]}
        intensity={0.85}
      />
      <pointLight position={[-12, 14, -8]} intensity={0.2} color="#4f7db5" />
      <fog attach="fog" args={["#0b1320", 52, 150]} />

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
        <meshStandardMaterial color="#0f1722" roughness={0.95} metalness={0.03} />
      </mesh>
      <gridHelper args={[sceneBounds.groundSize, 90, "#263247", "#182333"]} />

      {/* Districts */}
      {districtLayouts.map((dl) => (
        <DistrictGround
          key={dl.district.id}
          district={dl.district}
          position={dl.position}
          size={dl.size}
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
