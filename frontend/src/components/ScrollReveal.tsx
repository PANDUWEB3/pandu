import { useEffect, useRef, type ReactNode } from 'react';

/** PANDU adaptation of React Bits scroll-triggered reveal; respects reduced motion. */
export default function ScrollReveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const node = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!node.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      node.current?.classList.add('reveal-visible'); return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { entry.target.classList.add('reveal-visible'); observer.unobserve(entry.target); }
    }, { threshold: 0.12, rootMargin: '0px 0px -32px 0px' });
    observer.observe(node.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={node} className={`scroll-reveal ${className}`}>{children}</div>;
}
