import { useRef, type PointerEvent, type ReactNode } from 'react';

/** PANDU adaptation of the React Bits Tilted Card interaction pattern. */
export default function TiltedCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const card = useRef<HTMLDivElement>(null);
  function move(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !card.current) return;
    const box = card.current.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    card.current.style.setProperty('--tilt-x', `${(0.5 - y) * 8}deg`);
    card.current.style.setProperty('--tilt-y', `${(x - 0.5) * 9}deg`);
    card.current.style.setProperty('--shine-x', `${x * 100}%`);
    card.current.style.setProperty('--shine-y', `${y * 100}%`);
  }
  function reset() { if (!card.current) return; card.current.style.setProperty('--tilt-x', '0deg'); card.current.style.setProperty('--tilt-y', '0deg'); }
  return <div ref={card} className={`tilted-card ${className}`} onPointerMove={move} onPointerLeave={reset}>{children}<span className="tilted-card-shine" aria-hidden="true" /></div>;
}
