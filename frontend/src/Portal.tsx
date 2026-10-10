import { lazy, Suspense, useEffect, useState } from 'react';
import { useI18n } from './i18n';

const Landing = lazy(() => import('./landing/Landing'));
const Workspace = lazy(() => import('./Workspace'));
const WorkspaceDemo = lazy(() => import('./App').then(({ WorkspaceDemo: component }) => ({ default: component })));

const Login = lazy(() => import('./landing/Login'));
const InformationPage = lazy(() => import('./landing/InformationPage'));
const VerifyPublic = lazy(() => import('./landing/Verify').then(m => ({ default: m.VerifyPublic })));
const PublicProof = lazy(() => import('./landing/Verify').then(m => ({ default: m.PublicProof })));

function WorkspaceLoading() {
  const { t } = useI18n();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 12_000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="p-workspace-route-loading" role="status" aria-live="polite" aria-busy={!slow}>
      <span className="p-workspace-route-spinner" aria-hidden="true" />
      <p>{slow ? t.ws.gate.workspaceSlow : t.ws.gate.checking}</p>
      {slow && <button type="button" onClick={() => window.location.reload()}>{t.ws.gate.workspaceRetry}</button>}
    </main>
  );
}

export default function Portal() {
  const [path, setPath] = useState(window.location.pathname);
  const { lang } = useI18n();
  useEffect(() => {
    const hashRoute: Record<string, string> = { '#how-it-works': lang === 'en' ? '/how-it-works' : '/cara-kerja', '#cara-kerja': '/cara-kerja', '#who-its-for': lang === 'en' ? '/who-its-for' : '/untuk-siapa', '#untuk-siapa': '/untuk-siapa' };
    const target = hashRoute[window.location.hash];
    if (target) { window.history.replaceState({}, '', target); setPath(target); }
  }, [lang]);
  useEffect(() => {
    if (path === '/cara-kerja' || path === '/how-it-works') { const next = lang === 'en' ? '/how-it-works' : '/cara-kerja'; if (path !== next) { window.history.replaceState({}, '', next); setPath(next); } }
    if (path === '/untuk-siapa' || path === '/who-its-for') { const next = lang === 'en' ? '/who-its-for' : '/untuk-siapa'; if (path !== next) { window.history.replaceState({}, '', next); setPath(next); } }
  }, [lang, path]);
  useEffect(() => {
    const title = path === '/cara-kerja' || path === '/how-it-works' ? (lang === 'id' ? 'Cara kerja' : 'How it works') : path === '/untuk-siapa' || path === '/who-its-for' ? (lang === 'id' ? 'Untuk siapa' : "Who it's for") : path === '/verify' ? (lang === 'id' ? 'Verifikasi bukti' : 'Verify proof') : path.startsWith('/workspace') ? 'Workspace' : path === '/login' ? (lang === 'id' ? 'Masuk' : 'Log in') : 'PANDU';
    document.title = `${title} | PANDU`;
  }, [path, lang]);
  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest('a[href]') as HTMLAnchorElement | null : null;
      if (!target || target.target || target.hasAttribute('download')) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      const legacy = destination.pathname === '/' ? ({ '#how-it-works': lang === 'en' ? '/how-it-works' : '/cara-kerja', '#cara-kerja': '/cara-kerja', '#who-its-for': lang === 'en' ? '/who-its-for' : '/untuk-siapa', '#untuk-siapa': '/untuk-siapa' } as Record<string, string>)[destination.hash] : undefined;
      if (legacy) { event.preventDefault(); window.history.pushState({}, '', legacy); setPath(legacy); window.scrollTo({ top: 0, behavior: 'instant' }); return; }
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
  }, [lang]);
  
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
  if (path === '/cara-kerja' || path === '/how-it-works') return <Suspense fallback={null}><InformationPage kind="how" /></Suspense>;
  if (path === '/untuk-siapa' || path === '/who-its-for') return <Suspense fallback={null}><InformationPage kind="who" /></Suspense>;
  
  if (path === '/workspace/demo') return <Suspense fallback={<div className="p-auth-state">Memuat demo lokal…</div>}><WorkspaceDemo /></Suspense>;
  if (path.startsWith('/workspace')) {
    const key = path.split('/')[2] || 'overview';
    return <Suspense fallback={<WorkspaceLoading />}><Workspace page={key} /></Suspense>;
  }
  
  return <Suspense fallback={null}><Landing /></Suspense>;
}
