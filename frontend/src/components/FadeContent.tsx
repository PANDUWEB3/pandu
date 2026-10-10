// Adapted from React Bits FadeContent (MIT + Commons Clause):
// https://reactbits.dev/animations/fade-content
import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

type Props = HTMLAttributes<HTMLDivElement> & { children: ReactNode; duration?: number; delay?: number };

export default function FadeContent({ children, duration = 0.35, delay = 0, ...props }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo(element, { autoAlpha: 0, y: 5 }, { autoAlpha: 1, y: 0, duration, delay, ease: 'power2.out', clearProps: 'all' });
    return () => { gsap.killTweensOf(element); };
  }, [duration, delay]);
  return <div ref={ref} {...props}>{children}</div>;
}
