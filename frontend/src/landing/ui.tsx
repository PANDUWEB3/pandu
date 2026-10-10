import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';

/** Logo concept: letter "P" whose bowl rises into an upward arrow. */
export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="PANDU logo">
      <rect width="40" height="40" rx="11" fill="#F97316" />
      <path d="M13.5 31V10.5" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <path d="M13.5 23.5h5.5a7 7 0 0 0 7-7V12" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20.5 16.5 26 10.5l5.5 6" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ dark = false }: { dark?: boolean }) {
  const { t } = useI18n();
  return (
    <a href="/" className="group inline-flex items-center gap-2.5" aria-label={t.nav.home}>
      <LogoMark className="h-9 w-9 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:-rotate-6" />
      <span className={`font-display text-xl font-extrabold tracking-tight ${dark ? 'text-pure' : 'text-ink'}`}>PANDU</span>
    </a>
  );
}

const variants = {
  primary: 'bg-brand text-pure shadow-[0_8px_24px_-8px_rgba(249,115,22,0.7)] hover:bg-brand-600 hover:-translate-y-0.5',
  secondary: 'bg-white text-ink ring-1 ring-inset ring-gray-200 hover:ring-brand hover:text-brand-600 hover:-translate-y-0.5',
  ghost: 'text-ink hover:text-brand-600',
  onDark: 'bg-pure/10 text-pure ring-1 ring-inset ring-pure/25 hover:bg-pure/20 hover:-translate-y-0.5',
} as const;

export function Button({ children, href, variant = 'primary', size = 'md', className = '', onClick }: {
  children: ReactNode; href: string; variant?: keyof typeof variants; size?: 'sm' | 'md'; className?: string; onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const pad = size === 'sm' ? 'px-4 py-2 text-sm' : 'px-6 py-3.5 text-[15px]';
  return (
    <a href={href} onClick={onClick} className={`group inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-300 active:translate-y-0 active:scale-[0.98] ${pad} ${variants[variant]} ${className}`}>
      {children}
    </a>
  );
}

/** Fade-and-rise when scrolled into view (motion is disabled via MotionConfig for reduced-motion users). */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function SectionHead({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl font-extrabold leading-[1.1] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[2.75rem]">{title}</h2>
      {children && <p className="mt-4 text-base text-ink-soft sm:text-lg">{children}</p>}
    </div>
  );
}

/** Pointer-driven 3D tilt (React Bits "Tilted Card" interaction), mouse only. */
export function Tilt({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 160, damping: 18 });
  const sy = useSpring(py, { stiffness: 160, damping: 18 });
  const rotateX = useTransform(sy, [0, 1], [7, -7]);
  const rotateY = useTransform(sx, [0, 1], [-8, 8]);
  return (
    <div style={{ perspective: 1100 }}>
      <motion.div
        style={reduce ? undefined : { rotateX, rotateY, transformStyle: 'preserve-3d' }}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return;
          const b = e.currentTarget.getBoundingClientRect();
          px.set((e.clientX - b.left) / b.width);
          py.set((e.clientY - b.top) / b.height);
        }}
        onPointerLeave={() => { px.set(0.5); py.set(0.5); }}
      >
        {children}
      </motion.div>
    </div>
  );
}
