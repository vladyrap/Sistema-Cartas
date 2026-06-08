/** Card con efecto tilt 3D mouse-tracking puro (sin libs).
 * Sigue el cursor con perspective + rotateX/Y, con glare highlight encima.
 */
import { useRef } from 'react';

export default function TiltCard({ children, intensity = 12, glare = true, className = '', onClick }) {
  const ref = useRef(null);
  const glareRef = useRef(null);

  function onMove(e) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const rx = (0.5 - y) * intensity;
    const ry = (x - 0.5) * intensity;
    el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`;
    if (glare && glareRef.current) {
      glareRef.current.style.background = `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(255,255,255,0.18), transparent 55%)`;
      glareRef.current.style.opacity = '1';
    }
  }

  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'perspective(900px) rotateX(0) rotateY(0)';
    if (glareRef.current) glareRef.current.style.opacity = '0';
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onClick}
      style={{ transformStyle: 'preserve-3d', transition: 'transform 0.18s ease-out' }}
      className={`relative ${className}`}
    >
      {children}
      {glare && (
        <div
          ref={glareRef}
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-200"
        />
      )}
    </div>
  );
}
