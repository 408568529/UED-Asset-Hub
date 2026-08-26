"use client";

import { useEffect, useRef } from "react";
import type { ModuleSummary } from "@/types/module";

type Point = { x: number; y: number; phase: number; speed: number; size: number };

function createPoints(count: number): Point[] {
  return Array.from({ length: count }, (_, index) => {
    const seed = Math.sin((index + 1) * 91.27) * 10000;
    const random = seed - Math.floor(seed);
    return {
      x: (random * 1.7 + (index * 0.618) % 1) % 1,
      y: ((random * 2.3 + (index * 0.414) % 1) * 0.88 + 0.06) % 1,
      phase: random * Math.PI * 2,
      speed: 0.22 + (index % 5) * 0.035,
      size: 0.7 + (index % 4) * 0.24
    };
  });
}

export function AssetFlowCanvas({ modules }: { modules: ModuleSummary[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const activeCanvas = canvas;
    const activeContext = context;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const points = createPoints(Math.min(112, 64 + modules.length * 6));
    const moduleAnchors = modules.map((_, index) => {
      const angle = -1.5 + (index / Math.max(modules.length, 1)) * Math.PI * 1.45;
      return { x: 0.64 + Math.cos(angle) * 0.25, y: 0.49 + Math.sin(angle) * 0.36 };
    });
    let width = 0;
    let height = 0;
    let animationFrame = 0;
    let isVisible = true;
    let pointer = { x: 0.55, y: 0.5 };

    function resize() {
      const rect = activeCanvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
      width = Math.max(rect.width, 1);
      height = Math.max(rect.height, 1);
      activeCanvas.width = Math.round(width * ratio);
      activeCanvas.height = Math.round(height * ratio);
      activeContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (reduceMotion) draw(0);
    }

    function draw(time = 0) {
      activeContext.clearRect(0, 0, width, height);
      activeContext.fillStyle = "#080b0a";
      activeContext.fillRect(0, 0, width, height);

      const pulse = reduceMotion ? 0 : time * 0.00018;
      const resolve = (point: Point) => {
        const driftX = Math.sin(pulse * point.speed * 11 + point.phase) * 0.018;
        const driftY = Math.cos(pulse * point.speed * 8 + point.phase) * 0.012;
        const baseX = point.x + driftX;
        const baseY = point.y + driftY;
        const dx = baseX - pointer.x;
        const dy = baseY - pointer.y;
        const distance = Math.hypot(dx, dy);
        const influence = Math.max(0, 1 - distance * 2.5) * 0.015;
        return { x: (baseX + (distance ? dx / distance : 0) * influence) * width, y: (baseY + (distance ? dy / distance : 0) * influence) * height };
      };

      const resolved = points.map(resolve);

      activeContext.lineWidth = 1;
      for (let index = 0; index < resolved.length; index += 1) {
        const point = resolved[index];
        for (let nextIndex = index + 1; nextIndex < resolved.length; nextIndex += 1) {
          const next = resolved[nextIndex];
          const distance = Math.hypot(point.x - next.x, point.y - next.y);
          if (distance > Math.min(width, height) * 0.14) continue;
          const opacity = Math.max(0, 0.13 - distance / Math.min(width, height) * 0.5);
          activeContext.strokeStyle = `rgba(188, 255, 58, ${opacity})`;
          activeContext.beginPath();
          activeContext.moveTo(point.x, point.y);
          activeContext.lineTo(next.x, next.y);
          activeContext.stroke();
        }
      }

      moduleAnchors.forEach((anchor, index) => {
        const x = anchor.x * width;
        const y = anchor.y * height;
        const radius = 54 + (modules[index]?.count || 0) * 1.25;
        const gradient = activeContext.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, "rgba(190, 255, 60, 0.20)");
        gradient.addColorStop(0.35, "rgba(190, 255, 60, 0.05)");
        gradient.addColorStop(1, "rgba(190, 255, 60, 0)");
        activeContext.fillStyle = gradient;
        activeContext.beginPath();
        activeContext.arc(x, y, radius, 0, Math.PI * 2);
        activeContext.fill();
        activeContext.fillStyle = "rgba(210, 255, 93, 0.9)";
        activeContext.beginPath();
        activeContext.arc(x, y, 2.2, 0, Math.PI * 2);
        activeContext.fill();
      });

      resolved.forEach((point, index) => {
        activeContext.fillStyle = index % 9 === 0 ? "rgba(203, 255, 86, 0.86)" : "rgba(229, 237, 219, 0.34)";
        activeContext.beginPath();
        activeContext.arc(point.x, point.y, points[index].size, 0, Math.PI * 2);
        activeContext.fill();
      });

      if (!reduceMotion && isVisible) animationFrame = window.requestAnimationFrame(draw);
    }

    function updatePointer(event: PointerEvent) {
      const rect = activeCanvas.getBoundingClientRect();
      pointer = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
    }

    function handleVisibility() {
      isVisible = document.visibilityState === "visible";
      if (isVisible && !reduceMotion) animationFrame = window.requestAnimationFrame(draw);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(activeCanvas);
    window.addEventListener("pointermove", updatePointer, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    resize();
    if (!reduceMotion) draw(0);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("pointermove", updatePointer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [modules]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
