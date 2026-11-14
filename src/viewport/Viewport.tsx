import { useEffect, useRef } from 'preact/hooks';
import * as Zdog from 'zdog';
import { addStarterScene } from '../scene/starterScene';
import { fitZoom } from './fitZoom';

/**
 * The 3D view. It is sized to its own grid column (not the window) and
 * re-fits whenever that column changes size.
 */
export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    // zdog reads the initial size from these attributes when it attaches to an
    // <svg>; without them it writes width="null" and logs an error.
    svg.setAttribute('width', String(Math.max(1, container.clientWidth)));
    svg.setAttribute('height', String(Math.max(1, container.clientHeight)));

    const illo = new Zdog.Illustration({
      element: svg,
      // We size the scene to this column ourselves. zdog's 'fullscreen' mode
      // sized it to the whole window, so it ran under the side panels.
      resize: false,
      dragRotate: true,
    });
    addStarterScene(illo);

    const fitTo = (width: number, height: number) => {
      const zoom = fitZoom(width, height);
      if (zoom === null) return; // not laid out yet; the observer will call again
      illo.zoom = zoom;
      illo.setSize(width, height);
    };
    fitTo(container.clientWidth, container.clientHeight);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) fitTo(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(container);

    let frame = requestAnimationFrame(function tick() {
      illo.updateRenderGraph();
      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      svg.replaceChildren();
    };
  }, []);

  return (
    <div class="viewport" ref={containerRef}>
      <svg class="scene" ref={svgRef} role="img" aria-label="Scene" />
    </div>
  );
}
