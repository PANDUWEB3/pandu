import { lazy, Suspense, useEffect, useState } from 'react';

const Landing = lazy(() => import('./landing/Landing'));
const Workspace = lazy(() => import('./Workspace'));
const WorkspaceDemo = lazy(() => import('./App').then(({ WorkspaceDemo: component }) => ({ default: component })));

const Login = lazy(() => import('./landing/Login'));
const VerifyPublic = lazy(() => import('./landing/Verify').then(m => ({ default: m.VerifyPublic })));
const PublicProof = lazy(() => import('./landing/Verify').then(m => ({ default: m.PublicProof })));

export default function Portal() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest('a[href]') as HTMLAnchorElement | null : null;
      if (!target || target.target || target.hasAttribute('download')) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) {
        if (destination.hash) {
          event.preventDefault();
          window.history.pushState({}, '', destination.pathname + destination.search + destination.hash);
          const el = document.getElementById(destination.hash.slice(1));
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }
        return;
      }
      event.preventDefault();
      window.history.pushState({}, '', destination.pathname + destination.search + destination.hash);
      setPath(destination.pathname);
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onClick);
    return () => { window.removeEventListener('popstate', onPopState); document.removeEventListener('click', onClick); };
  }, []);
  
  if (path.startsWith('/verify/')) { 
    const proofToken = decodeURIComponent(path.split('/')[2] || ''); 
    return proofToken ? (
      <Suspense fallback={<div className="p-auth-state" aria-busy="true" />}>
        <PublicProof token={proofToken} />
      </Suspense>
    ) : (
      <Suspense fallback={null}><VerifyPublic /></Suspense>
    ); 
  }
  
  if (path === '/verify') return <Suspense fallback={null}><VerifyPublic /></Suspense>;
  if (path === '/login') return <Suspense fallback={null}><Login /></Suspense>;
  
  if (path === '/workspace/demo') return <Suspense fallback={<div className="p-auth-state">Memuat demo lokal…</div>}><WorkspaceDemo /></Suspense>;
  if (path.startsWith('/workspace')) {
    const key = path.split('/')[2] || 'overview';
    return <Suspense fallback={<div className="p-auth-state">Memuat ruang kerja…</div>}><Workspace page={key} /></Suspense>;
  }
  
  return <Suspense fallback={null}><Landing /></Suspense>;
}
