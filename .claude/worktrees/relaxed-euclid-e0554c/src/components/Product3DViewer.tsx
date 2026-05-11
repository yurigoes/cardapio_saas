"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stage, useGLTF } from "@react-three/drei";
import { Suspense } from "react";

function Model({ url }: { url: string }) {
  const gltf = useGLTF(url);
  return <primitive object={gltf.scene} />;
}

export default function Product3DViewer({ modelUrl }: { modelUrl?: string }) {
  return (
    <div className="h-[360px] overflow-hidden rounded-[2rem] border border-white/10 bg-black/40 shadow-2xl backdrop-blur">
      {modelUrl ? (
        <Canvas camera={{ position: [0, 1.5, 4], fov: 45 }}>
          <Suspense fallback={null}>
            <Stage environment="city" intensity={0.8}>
              <Model url={modelUrl} />
            </Stage>
            <OrbitControls autoRotate enableZoom />
          </Suspense>
        </Canvas>
      ) : (
        <div className="flex h-full items-center justify-center text-slate-400">
          Modelo 3D indisponível
        </div>
      )}
    </div>
  );
}
