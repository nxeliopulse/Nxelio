"use client";
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Plus, Minus, Locate, Maximize2 } from "lucide-react";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A pannable + zoomable canvas (n8n / Dripify style). Drag the background to
 * pan, scroll or use the +/− buttons to zoom, and the target button to recenter.
 * Children are rendered inside the transformed plane.
 */
export function FlowCanvas({ children, height = 560 }: { children: React.ReactNode; height?: number }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [grabbing, setGrabbing] = useState(false);
  const drag = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Native non-passive wheel listener so we can preventDefault (zoom, not page scroll)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      setScale((s) => clamp(s + (e.deltaY < 0 ? 0.08 : -0.08), 0.4, 2));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(e: RPointerEvent<HTMLDivElement>) {
    drag.current = { sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y };
    setGrabbing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: RPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setPos({ x: drag.current.px + (e.clientX - drag.current.sx), y: drag.current.py + (e.clientY - drag.current.sy) });
  }
  function endDrag(e: RPointerEvent<HTMLDivElement>) {
    drag.current = null;
    setGrabbing(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  }
  function reset() { setScale(1); setPos({ x: 0, y: 0 }); }

  const btn = "h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700";

  return (
    <div
      ref={wrapRef}
      className="flow-grid relative rounded-xl border border-slate-200 overflow-hidden select-none"
      style={{ height, backgroundSize: "20px 20px" }}
    >
      <div
        className={grabbing ? "cursor-grabbing" : "cursor-grab"}
        style={{ position: "absolute", inset: 0 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <div
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transformOrigin: "center top",
            transition: drag.current ? "none" : "transform 0.12s ease-out",
            padding: "36px 24px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          {/* Nodes that want clicks call stopPropagation on pointerdown so the
              canvas only pans when the drag starts on empty space. */}
          {children}
        </div>
      </div>

      {/* Zoom controls */}
      <div className="absolute top-4 right-4 flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm p-1">
        <button onClick={() => setScale((s) => clamp(s + 0.1, 0.4, 2))} aria-label="Zoom in" title="Zoom in" className={btn}><Plus className="h-4 w-4" /></button>
        <button onClick={reset} aria-label="Reset view" title="Reset view" className={btn}><Locate className="h-4 w-4" /></button>
        <button onClick={() => setScale((s) => clamp(s - 0.1, 0.4, 2))} aria-label="Zoom out" title="Zoom out" className={btn}><Minus className="h-4 w-4" /></button>
        <div className="h-px bg-slate-100 my-1" />
        <button onClick={reset} aria-label="Fit" title="Fit to view" className={btn}><Maximize2 className="h-4 w-4" /></button>
      </div>

      {/* Zoom readout */}
      <div className="absolute bottom-4 right-4 text-xs text-slate-400 bg-white/80 dark:bg-slate-800/80 rounded px-2 py-1 border border-slate-200">{Math.round(scale * 100)}%</div>
    </div>
  );
}
