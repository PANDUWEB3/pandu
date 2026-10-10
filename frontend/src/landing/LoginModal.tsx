import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, CircleAlert, X } from 'lucide-react';
import { useI18n } from '../i18n';
import type { WalletProvider } from './auth';

type Stage = 'idle' | 'connecting' | 'error' | 'success';
type Props = { open: boolean; onClose: () => void; providers: WalletProvider[]; onGoogle: () => Promise<void>; onConnect: (provider: WalletProvider) => Promise<void> };

export default function LoginModal({ open, onClose, providers, onGoogle, onConnect }: Props) {
  const { t } = useI18n();
  const copy = t.authModal;
  const [stage, setStage] = useState<Stage>('idle');
  const [provider, setProvider] = useState<WalletProvider | null>(null);
  const [reason, setReason] = useState<'rejected' | 'missing' | 'timeout' | 'error'>('error');
  const [errorDetail, setErrorDetail] = useState('');
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const attempt = useRef(0);
  const text = (value: string, name: string) => value.replace('{provider}', name);

  const close = useCallback(() => {
    attempt.current += 1;
    setMounted(false);
    window.setTimeout(() => { onClose(); setStage('idle'); setProvider(null); }, 220);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    setStage('idle'); setProvider(null); setMounted(false);
    const enter = window.setTimeout(() => { setMounted(true); cardRef.current?.querySelector<HTMLElement>('.pand-modal-google')?.focus(); }, 10);
    return () => { window.clearTimeout(enter); document.body.style.overflow = ''; window.clearTimeout(timer.current); opener.current?.focus(); };
  }, [open]);

  useEffect(() => {
    if (!open || stage !== 'connecting') return;
    timer.current = window.setTimeout(() => { setReason('timeout'); setStage('error'); }, 60000);
    return () => window.clearTimeout(timer.current);
  }, [open, stage]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab' && cardRef.current) {
        const items = [...cardRef.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]')];
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  async function connect(selected: WalletProvider | null) {
    const current = ++attempt.current;
    setProvider(selected); setStage('connecting');
    try { if (selected) await onConnect(selected); else await onGoogle(); if (attempt.current !== current) return; setStage('success'); window.setTimeout(() => { setMounted(false); window.setTimeout(() => { window.location.href = '/workspace'; }, 220); }, 600); }
    catch (error) {
      if (attempt.current !== current) return;
      const err = error as { code?: number | string; message?: string };
      const code = String(err.code ?? '');
      const message = err.message || '';
      if (code === '4001' || message === 'WALLET_REJECTED') { setReason('rejected'); setErrorDetail(''); }
      else if (message === 'WALLET_NOT_INSTALLED') { setReason('missing'); setErrorDetail(''); }
      else if (message === 'WALLET_DOMAIN_INVALID') { setReason('error'); setErrorDetail(copy.invalidDomain); }
      else if (code === '-32002') { setReason('error'); setErrorDetail(copy.pending); }
      else if (message === 'Supabase is not configured.') { setReason('error'); setErrorDetail(copy.configuration); }
      else { setReason('error'); setErrorDetail(message || ''); }
      setStage('error');
    }
  }

  if (!open) return null;
  return createPortal(<div className={`pand-modal-overlay ${mounted ? 'is-open' : ''}`} onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="pand-modal-card" ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="pand-modal-title">
      <div className="pand-modal-content" key={stage}>
        {stage === 'idle' && <>
          <button className="pand-modal-close" aria-label={copy.close} onClick={close}><X size={20}/></button>
          <h2 id="pand-modal-title">{copy.title}</h2>
          <button className="pand-modal-option pand-modal-google" onClick={() => void connect(null)}><GoogleIcon/><span>{copy.google}</span></button>
          <p className="pand-modal-label">{copy.signer}</p>
          <div className="pand-modal-wallets">{providers.map(item => <button className="pand-modal-option" key={item.id} onClick={() => void connect(item)}><WalletBrand id={item.id}/><span>{item.label}</span></button>)}</div>
          <p className="pand-modal-privacy">{copy.privacy}</p>
        </>}
        {stage === 'connecting' && <>
          <button className="pand-modal-back" aria-label={copy.back} onClick={() => { attempt.current += 1; window.clearTimeout(timer.current); setStage('idle'); }}><ArrowLeft size={19}/></button>
          <div className="pand-modal-wait"><span className="pand-modal-spinner"><WalletBrand id={provider?.id || 'metamask'} large/></span><h2 id="pand-modal-title">{text(copy.waiting, provider?.label || 'Google')}</h2><p>{copy.help}</p><button disabled className="pand-modal-disabled">{copy.connecting}</button></div>
        </>}
        {stage === 'error' && <>
          <button className="pand-modal-back" aria-label={copy.back} onClick={() => { attempt.current += 1; setStage('idle'); }}><ArrowLeft size={19}/></button>
          <div className="pand-modal-wait"><CircleAlert className="pand-modal-error-icon" size={46}/><h2 id="pand-modal-title">{copy.errorTitle}</h2><p>{errorDetail || copy[reason]}</p>{reason === 'missing' && provider?.id === 'metamask' && <a className="pand-modal-install" href="https://metamask.io/download/" target="_blank" rel="noreferrer">{copy.install}</a>}<button className="pand-modal-primary" onClick={() => void connect(provider)}>{copy.retry}</button><button className="pand-modal-text" onClick={() => setStage('idle')}>{copy.other}</button></div>
        </>}
        {stage === 'success' && <div className="pand-modal-wait"><span className="pand-modal-success"><Check size={35}/></span><h2 id="pand-modal-title">{copy.success}</h2></div>}
      </div>
    </section>
  </div>, document.body);
}

function GoogleIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.05 5.05 0 0 1-2.2 3.31v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.86C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09a6.96 6.96 0 0 1 0-4.18V7.05H2.18a11 11 0 0 0 0 9.9z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.86C6.71 7.31 9.14 5.38 12 5.38z"/></svg>; }
function WalletBrand({ id, large = false }: { id: WalletProvider['id']; large?: boolean }) { return <img className={`pand-wallet-icon pand-wallet-${id} ${large ? 'large' : ''}`} src="/metamask-icon-fox.svg" alt="" aria-hidden="true" />; }

