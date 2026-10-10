import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Activity, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, CircleHelp, Clipboard, ClipboardCheck, Clock3, FileCheck2, FileText, FlaskConical, Link2, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck, Upload, XCircle } from 'lucide-react';
import FadeContent from './components/FadeContent';
import './styles/public.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8787';
type State = {
  organization: string; batch: { id: string; material: string; supplier: string; origin: string };
  inspection: { status: string; actual: number; min: number; max: number; unit: string; submittedAt?: string; approvedAt?: string; notes: string };
  evidence: Array<{ id: string; name: string; mimeType: string; size: number; sha256: string; addedAt: string; downloadUrl: string }>;
  proof: null | { id: string; createdAt: string; canonicalizationVersion: number; commitment: string };
  anchor: { status: string; transactionHash: string | null; blockNumber: number | null; error?: string | null; revokeTransactionHash?: string };
  proofHistory?: Array<{ id: string; commitment: string; createdAt: string; batchRef: string; anchor: { status: string; transactionHash?: string | null; blockNumber?: number | null; revokeTransactionHash?: string } }>;
  configured: boolean;
};
type Health = { ok: boolean; chainId?: number; expectedChainId?: number; chainLabel?: string; explorerBase?: string; blockNumber?: number; contractAddress?: string | null; configured?: boolean; error?: string };
type Verification = { status: string; message: string; transactionHash?: string; explorerUrl?: string; blockNumber?: number; anchoredAt?: number; network?: string; commitment?: string; proof?: { proofId: string; batchRef: string; material: string; supplier: string; inspection: { actual: string; min: string; max: string; unit: string; result: string }; approvedAt: string } };

const initialHealth: Health = { ok: false };
const time = (value?: string | number) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(typeof value === 'number' ? value * 1000 : value)) : '—';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.message || `Permintaan gagal (${response.status})`);
  return body as T;
}

function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info' }) {
  const Icon = tone === 'good' ? CheckCircle2 : tone === 'warn' ? Clock3 : tone === 'bad' ? XCircle : tone === 'info' ? ShieldCheck : Activity;
  return <span className={`pill pill-${tone}`}><Icon size={14} aria-hidden="true" />{children}</span>;
}

function PublicProofPage({ proofId }: { proofId: string }) {
  const [result, setResult] = useState<Verification | null>(null);
  useEffect(() => {
    let active = true;
    request<Verification>(`/api/verify/${encodeURIComponent(proofId)}`).then((data) => { if (active) setResult(data); }).catch((e) => { if (active) setResult({ status: 'UNAVAILABLE', message: (e as Error).message }); });
    return () => { active = false; };
  }, [proofId]);
  const tone = result?.status === 'VERIFIED' ? 'good' : result?.status === 'MISMATCH' || result?.status === 'REVOKED' ? 'bad' : 'warn';
  const heading = result?.status === 'VERIFIED' ? 'Bukti cocok' : result?.status === 'MISMATCH' ? 'Bukti berubah' : result?.status === 'REVOKED' ? 'Bukti dicabut' : result?.status === 'NOT_FOUND' ? 'Bukti tidak ditemukan' : 'Belum dapat diperiksa';
  return <div className="public-shell"><header className="topbar"><a className="brand" href="/" aria-label="PANDU"><span className="brand-mark"><ShieldCheck size={21} /></span><span>PANDU<small>QUALITY PROOF</small></span></a><span className="public-label"><LockKeyhole size={14} />Pemeriksaan publik</span></header><main className="public-page"><div className="public-card"><span className="eyebrow">BUKTI PANDU DIGITAL</span><h1>Periksa bukti PANDU</h1><p className="public-intro">Hasil ini memeriksa apakah ringkasan proof cocok dengan catatan blockchain.</p>{!result ? <div className="public-loading"><LoaderCircle className="spin" size={20} />Memeriksa catatan jaringan…</div> : <><div className={`public-status public-status-${result.status.toLowerCase()}`}><Pill tone={tone}>{heading}</Pill><strong>{result.message}</strong></div><div className="public-proof-id"><span>Nomor bukti</span><strong>{result.proof?.proofId || proofId}</strong></div>{result.proof && <div className="public-facts"><div><span>Batch</span><strong>{result.proof.batchRef}</strong></div><div><span>Bahan</span><strong>{result.proof.material}</strong></div><div><span>Pemasok</span><strong>{result.proof.supplier}</strong></div><div><span>Hasil pemeriksaan</span><strong>{result.proof.inspection.result === 'PASS' ? 'Lulus' : result.proof.inspection.result} · {result.proof.inspection.actual} {result.proof.inspection.unit}</strong></div><div><span>Disetujui QA</span><strong>{time(result.proof.approvedAt)}</strong></div><div><span>Jaringan</span><strong>{result.network || 'Arbitrum Sepolia'}</strong></div></div>}{result.transactionHash && <a className="public-explorer" href={result.explorerUrl || `https://sepolia.arbiscan.io/tx/${result.transactionHash}`} target="_blank" rel="noreferrer">Lihat transaksi pada explorer <ArrowUpRight size={15} /></a>}<details className="public-explainer"><summary><CircleHelp size={15} />Apa arti hasil ini?</summary><p>Proof mencatat ringkasan yang disetujui pada satu waktu. Pemeriksaan ini menunjukkan kecocokan data digital; tidak membuktikan sendiri kondisi fisik barang atau kebenaran pengukuran awal.</p></details></>}</div><a className="back-link" href="/">Kembali ke PANDU</a></main></div>;
}

export function WorkspaceDemo() {
  const [state, setState] = useState<State | null>(null);
  const [health, setHealth] = useState<Health>(initialHealth);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [actual, setActual] = useState('10');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showTech, setShowTech] = useState(false);
  const publicProofId = window.location.pathname.startsWith('/verify/') ? decodeURIComponent(window.location.pathname.split('/')[2] || '') : '';

  const refresh = useCallback(async () => {
    try {
      const [demo, chain] = await Promise.all([request<State>('/api/demo'), request<Health>('/api/health')]);
      setState(demo); setHealth(chain); setActual(String(demo.inspection.actual));
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 20_000); return () => window.clearInterval(timer); }, [refresh]);

  async function run(action: string, path: string, init?: RequestInit) {
    setBusy(action); setError(''); setNotice('');
    try { const next = await request<State>(path, init); setState(next); setVerification(null); setNotice('Perubahan berhasil disimpan.'); }
    catch (e) { setError((e as Error).message); await refresh(); }
    finally { setBusy(''); }
  }
  async function submitInspection(event: FormEvent) {
    event.preventDefault(); await run('submit', '/api/inspection/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actual, notes }) });
  }
  async function uploadEvidence(file?: File) {
    if (!file) return;
    const form = new FormData(); form.append('file', file);
    await run('upload', '/api/evidence', { method: 'POST', body: form });
  }
  async function verify() {
    setBusy('verify'); setError('');
    try { setVerification(await request<Verification>('/api/verify')); }
    catch (e) { setVerification({ status: 'UNAVAILABLE', message: (e as Error).message }); }
    finally { setBusy(''); }
  }
  async function copyProofLink() {
    if (!state?.proof) return;
    await navigator.clipboard.writeText(`${window.location.origin}/verify/${encodeURIComponent(state.proof.id)}`);
    setNotice('Tautan verifikasi publik disalin.');
  }
  async function simulateTamper() {
    if (!window.confirm('Ubah data pemasok demo setelah proof direkam? Tautan verifikasi akan menunjukkan apakah ringkasannya berubah.')) return;
    setBusy('tamper'); setError('');
    try {
      const next = await request<State>('/api/demo/tamper', { method: 'POST' }); setState(next);
      setVerification(await request<Verification>('/api/verify'));
      setNotice('Simulasi selesai. Periksa status bukti di bawah.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }
  async function resetDemo() {
    if (!window.confirm('Mulai ulang dataset demo? Ini menghapus status pemeriksaan dan proof lokal demo. Transaksi di blockchain tidak akan dihapus.')) return;
    setBusy('reset'); setError('');
    try { const next = await request<State>('/api/reset', { method: 'POST' }); setState(next); setVerification(null); setNotice('Dataset demo lokal direset. Riwayat blockchain tetap ada.'); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }

  if (publicProofId) return <PublicProofPage proofId={publicProofId} />;
  if (!state) return <main className="loading-page"><div className="spinner" /><p>Menghubungkan ke PANDU…</p></main>;

  const inspection = state.inspection;
  const passed = inspection ? Number(inspection.actual) >= inspection.min && Number(inspection.actual) <= inspection.max : false;
  const currentStep = !inspection || inspection.status === 'DRAFT' || inspection.status === 'FAILED' ? 0 : inspection.status === 'SUBMITTED' ? 1 : !state?.proof ? 2 : state.anchor.status === 'CONFIRMED' || state.anchor.status === 'REVOKED' ? 4 : 3;
  const statusText: Record<string, string> = { DRAFT: 'Belum diperiksa', SUBMITTED: 'Menunggu review QA', FAILED: 'Di luar batas', APPROVED: 'Disetujui QA', NOT_ANCHORED: 'Belum direkam', PENDING: 'Sedang direkam', CONFIRMED: 'Terekam di blockchain', REVOKED: 'Bukti dicabut', FAILED_ANCHOR: 'Gagal direkam' };
  const verificationTone = verification?.status === 'VERIFIED' ? 'good' : verification?.status === 'REVOKED' || verification?.status === 'MISMATCH' ? 'bad' : 'warn';

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="PANDU beranda"><span className="brand-mark"><ShieldCheck size={21} /></span><span>PANDU<small>QUALITY PROOF</small></span></a>
      <div className="topbar-right"><Pill tone={health.ok && health.chainId === (health.expectedChainId ?? 421614) ? 'good' : 'warn'}>{health.ok ? (health.chainLabel || 'Arbitrum Sepolia') : 'Jaringan belum tersambung'}</Pill><span className="org-name"><span className="org-dot">M</span>{state.organization}</span></div>
    </header>

    <main className="page" id="top">
      <div className="page-heading"><div><div className="eyebrow">RUANG KERJA PANDU <span className="demo-tag">DEMO</span></div><h1>Bukti PANDU yang bisa diperiksa</h1><p>Catat pemeriksaan batch, minta persetujuan, lalu bagikan bukti yang dapat diverifikasi.</p></div><button className="button button-quiet reset-button" onClick={() => void resetDemo()} disabled={Boolean(busy)}><RefreshCw size={16} /> Mulai ulang demo</button></div>

      <div className="setup-banner"><div className="setup-icon"><LockKeyhole size={18} /></div><div><strong>Mode demo terisolasi</strong><span>Akun dan data contoh lokal. Bukti privat tidak dipublikasikan; hanya ringkasan proof yang ditambatkan.</span></div><button className="text-button" onClick={() => setShowTech((value) => !value)}>Detail jaringan <ChevronDown size={15} /></button></div>
      {showTech && <div className="network-details"><span>RPC {health.ok ? 'terhubung' : 'belum terhubung'}</span><span>Chain ID: {health.chainId ?? '—'}</span><span>Block: {health.blockNumber ?? '—'}</span><span>Kontrak: {health.contractAddress || 'belum diatur'}</span><span>Relayer: {health.configured ? 'siap' : 'belum diatur'}</span></div>}

      <div className="stepper" aria-label="Tahapan bukti PANDU">{['Periksa', 'Setujui', 'Buat bukti', 'Rekam & bagikan'].map((label, index) => <div className={`step ${index < currentStep ? 'step-done' : index === currentStep ? 'step-active' : ''}`} key={label}><span className="step-circle">{index < currentStep ? <Check size={14} /> : index + 1}</span><span>{label}</span>{index < 3 && <i />}</div>)}</div>

      {error && <div className="alert alert-error" role="alert"><XCircle size={18} /><span>{error}</span><button aria-label="Tutup" onClick={() => setError('')}><XCircle size={16} /></button></div>}
      {notice && <div className="alert alert-success" role="status"><CheckCircle2 size={18} /><span>{notice}</span><button aria-label="Tutup" onClick={() => setNotice('')}><XCircle size={16} /></button></div>}

      <section className="batch-card">
        <div className="batch-title"><div className="material-icon"><FlaskConical size={21} /></div><div><div className="eyebrow">BATCH {state.batch.id}</div><h2>{state.batch.material}</h2><span>{state.batch.supplier} <span className="bullet">·</span> {state.batch.origin}</span></div><Pill tone={inspection.status === 'APPROVED' ? 'good' : inspection.status === 'FAILED' ? 'bad' : inspection.status === 'SUBMITTED' ? 'warn' : 'neutral'}>{statusText[inspection.status] || inspection.status}</Pill></div>
        <div className="batch-facts"><div><span>Spesifikasi ketebalan</span><strong>{inspection.min}–{inspection.max} {inspection.unit}</strong></div><div><span>Hasil pengukuran</span><strong>{inspection.actual} {inspection.unit}</strong></div><div><span>Hasil</span><strong className={passed ? 'text-good' : 'text-bad'}>{passed ? 'Lulus' : 'Di luar batas'}</strong></div><div><span>Bukti terlampir</span><strong>{state.evidence.length} file</strong></div></div>
      </section>

      <div className="work-grid">
        <section className="panel inspection-panel">
          <div className="panel-heading"><span className="panel-icon"><ClipboardCheck size={18} /></span><div><h2>1. Pemeriksaan PANDU</h2><p>Masukkan hasil ukur yang tercantum pada alat pemeriksaan.</p></div></div>
          <form onSubmit={(event) => void submitInspection(event)}>
            <div className="measurement-label"><label htmlFor="actual">Hasil pengukuran</label><span className="spec-chip">Batas {inspection.min}–{inspection.max} {inspection.unit}</span></div>
            <div className="measurement-input"><input id="actual" type="number" min="0" step="0.1" value={actual} onChange={(event) => setActual(event.target.value)} required /><span>{inspection.unit}</span></div>
            <div className={`result-box ${passed ? 'result-good' : 'result-bad'}`}><span className="result-symbol">{passed ? <CheckCircle2 size={18} /> : <XCircle size={18} />}</span><div><strong>{passed ? 'Hasil dalam batas' : 'Hasil di luar batas'}</strong><span>{passed ? 'Hasil pemeriksaan dapat dikirim ke QA.' : 'Periksa ulang ukuran. Hasil ini tidak dapat disetujui sebagai lulus.'}</span></div></div>
            <label className="field-label" htmlFor="notes">Catatan <span>(opsional)</span></label><textarea id="notes" rows={2} placeholder="Contoh: diukur dengan jangka sorong digital" value={notes} onChange={(event) => setNotes(event.target.value)} />
            <div className="form-actions"><button className="button button-primary" type="submit" disabled={!passed || Boolean(busy)}>{busy === 'submit' ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}Kirim ke QA</button>{inspection.status === 'SUBMITTED' && <span className="inline-hint"><Clock3 size={14} /> Menunggu QA</span>}</div>
          </form>
        </section>

        <section className="panel evidence-panel">
          <div className="panel-heading"><span className="panel-icon"><FileCheck2 size={18} /></span><div><h2>Bukti pendukung</h2><p>Berkas disimpan privat. Hanya sidik jari digitalnya yang dipakai untuk proof.</p></div></div>
          <label className="upload-box"><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => { void uploadEvidence(event.target.files?.[0]); event.currentTarget.value = ''; }} disabled={Boolean(busy)} /><Upload size={18} /><span><strong>{busy === 'upload' ? 'Mengunggah…' : 'Pilih PDF atau foto'}</strong><small>Maksimal 10 MB · PDF, JPG, PNG, WebP</small></span></label>
          {state.evidence.length ? <div className="file-list">{state.evidence.map((file) => <div className="file-row" key={file.id}><div className="file-icon"><FileText size={16} /></div><div className="file-name"><strong>{file.name}</strong><span>SHA-256 · {file.sha256.slice(0, 16)}…</span><a className="evidence-open" href={`${API}${file.downloadUrl}`} target="_blank" rel="noreferrer">Buka berkas untuk review QA</a></div><Pill tone="good">Tersimpan</Pill></div>)}</div> : <div className="empty-evidence"><FileText size={18} /><span>Belum ada bukti dilampirkan</span></div>}
          <div className="privacy-note"><LockKeyhole size={14} /><span>File tidak ditaruh di blockchain dan tidak dapat dibuka dari halaman publik.</span></div>
        </section>
      </div>

      <section className="panel review-panel">
        <div className="panel-heading"><span className="panel-icon"><ShieldCheck size={18} /></span><div><h2>2. Persetujuan QA</h2><p>Persetujuan dilakukan terpisah dari pemeriksaan.</p></div></div>
        <div className="review-row"><div className="review-status"><span className={`review-indicator ${inspection.status === 'APPROVED' ? 'indicator-good' : ''}`}>{inspection.status === 'APPROVED' ? <Check size={15} /> : '2'}</span><div><strong>{inspection.status === 'APPROVED' ? 'Pemeriksaan disetujui' : inspection.status === 'SUBMITTED' ? 'Siap ditinjau QA' : 'Menunggu hasil pemeriksaan'}</strong><span>{inspection.status === 'APPROVED' ? `Disetujui ${time(inspection.approvedAt)}` : 'QA memeriksa hasil dan file bukti sebelum menyetujui.'}</span></div></div><button className="button button-secondary" disabled={inspection.status !== 'SUBMITTED' || Boolean(busy)} onClick={() => void run('approve', '/api/qa/approve', { method: 'POST' })}>{busy === 'approve' ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />}Setujui pemeriksaan</button></div>
      </section>

      <section className="panel proof-panel">
        <div className="panel-heading"><span className="panel-icon"><Link2 size={18} /></span><div><h2>3. Bukti PANDU & verifikasi</h2><p>Buat ringkasan yang disetujui, rekam di testnet, lalu periksa secara publik.</p></div></div>
        {!state.proof ? <div className="proof-empty"><div className="proof-empty-icon"><FileCheck2 size={21} /></div><div><strong>Bukti PANDU belum dibuat</strong><span>QA harus menyetujui pemeriksaan terlebih dahulu.</span></div><button className="button button-primary" disabled={inspection.status !== 'APPROVED' || Boolean(busy)} onClick={() => void run('proof', '/api/proof', { method: 'POST' })}>{busy === 'proof' ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}Buat bukti PANDU</button></div> : <>
          <div className="proof-summary"><div className="proof-id-block"><span className="eyebrow">NOMOR BUKTI</span><strong>{state.proof.id}</strong><span>Dibuat {time(state.proof.createdAt)}</span></div><Pill tone={state.anchor.status === 'CONFIRMED' ? 'good' : state.anchor.status === 'REVOKED' || state.anchor.status === 'FAILED' ? 'bad' : 'warn'}>{state.anchor.status === 'FAILED' ? 'Gagal direkam' : statusText[state.anchor.status] || state.anchor.status}</Pill></div>
          <div className="anchor-progress"><div className={`anchor-stage ${state.anchor.status !== 'NOT_ANCHORED' ? 'anchor-stage-active' : ''}`}><span>{state.anchor.status === 'CONFIRMED' || state.anchor.status === 'REVOKED' ? <Check size={13} /> : '1'}</span><div><strong>Permintaan dibuat</strong><small>Proof disetujui QA</small></div></div><i /><div className={`anchor-stage ${state.anchor.status === 'PENDING' || state.anchor.status === 'CONFIRMED' || state.anchor.status === 'REVOKED' ? 'anchor-stage-active' : ''}`}><span>{state.anchor.status === 'CONFIRMED' || state.anchor.status === 'REVOKED' ? <Check size={13} /> : '2'}</span><div><strong>Dikirim ke testnet</strong><small>{health.chainLabel || 'Arbitrum Sepolia'}</small></div></div><i /><div className={`anchor-stage ${state.anchor.status === 'CONFIRMED' || state.anchor.status === 'REVOKED' ? 'anchor-stage-done' : ''}`}><span>{state.anchor.status === 'CONFIRMED' || state.anchor.status === 'REVOKED' ? <Check size={13} /> : '3'}</span><div><strong>Dikonfirmasi</strong><small>Transaksi berhasil</small></div></div></div>
          {state.anchor.error && <div className="anchor-error"><XCircle size={15} /><span>{state.anchor.error}</span></div>}
          {state.anchor.transactionHash && <a className="tx-link" href={`${health.explorerBase || 'https://sepolia.arbiscan.io'}/tx/${state.anchor.transactionHash}`} target="_blank" rel="noreferrer"><span>Transaksi jaringan</span><code>{state.anchor.transactionHash.slice(0, 12)}…{state.anchor.transactionHash.slice(-8)}</code><ArrowUpRight size={15} /></a>}
          <div className="proof-actions">{state.anchor.status !== 'CONFIRMED' && state.anchor.status !== 'REVOKED' && <button className="button button-primary" disabled={!state.configured || !health.ok || Boolean(busy)} onClick={() => void run('anchor', '/api/anchor', { method: 'POST' })}>{busy === 'anchor' ? <LoaderCircle className="spin" size={16} /> : <Link2 size={16} />}{state.anchor.status === 'PENDING' ? 'Periksa / lanjutkan rekaman' : 'Rekam bukti di testnet'}</button>}{(state.anchor.status === 'CONFIRMED' || state.anchor.status === 'REVOKED') && <button className="button button-primary" disabled={Boolean(busy)} onClick={() => void verify()}>{busy === 'verify' ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}Periksa bukti</button>}{state.anchor.status === 'CONFIRMED' && <button className="button button-secondary" disabled={Boolean(busy)} onClick={() => void copyProofLink()}><Clipboard size={16} />Salin tautan publik</button>}{state.anchor.status === 'CONFIRMED' && <button className="button button-quiet" disabled={Boolean(busy)} onClick={() => void simulateTamper()}>{busy === 'tamper' ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}Simulasikan perubahan</button>}<button className="button button-quiet" disabled={state.anchor.status !== 'CONFIRMED' || Boolean(busy)} onClick={() => void run('revoke', '/api/revoke', { method: 'POST' })}><XCircle size={16} />Cabut proof demo</button></div>
          {!state.configured && <div className="config-hint"><CircleHelp size={15} /><span>Untuk transaksi nyata, atur RPC, wallet testnet relayer, dan alamat kontrak pada konfigurasi backend lokal.</span></div>}
          {verification && <FadeContent key={verification.status} className={`verification-result verification-${verification.status.toLowerCase()}`}><div className="verification-head"><Pill tone={verificationTone}>{verification.status === 'VERIFIED' ? 'Bukti cocok' : verification.status === 'REVOKED' ? 'Bukti dicabut' : verification.status === 'MISMATCH' ? 'Bukti berubah' : 'Belum dapat diperiksa'}</Pill><span>{verification.network || health.chainLabel || 'Arbitrum Sepolia'}{verification.anchoredAt ? ` · direkam ${time(verification.anchoredAt)}` : ''}</span></div><p>{verification.message}</p>{verification.transactionHash && <a className="verification-link" href={`${health.explorerBase || 'https://sepolia.arbiscan.io'}/tx/${verification.transactionHash}`} target="_blank" rel="noreferrer">Lihat transaksi di explorer <ArrowUpRight size={14} /></a>}</FadeContent>}
          {state.proof && <details className="technical-details"><summary>Detail teknis <ChevronDown size={15} /></summary><div className="technical-content"><span>Komitmen proof · SHA-256</span><code>{state.proof.commitment}</code><span>Versi format {state.proof.canonicalizationVersion} · Jaringan {health.chainLabel || 'Arbitrum Sepolia'}</span>{health.contractAddress && <span>Kontrak <code>{health.contractAddress}</code></span>}</div></details>}
        </>}
      </section>

      {state.proofHistory?.length ? <section className="panel history-panel"><div className="panel-heading"><span className="panel-icon"><Clock3 size={18} /></span><div><h2>Riwayat bukti</h2><p>Tautan proof yang sudah dibuat tetap tersedia setelah dataset demo dimulai ulang.</p></div></div><div className="history-list">{[...state.proofHistory].reverse().map((proof) => { const anchored = proof.anchor.status === 'CONFIRMED' || proof.anchor.status === 'REVOKED'; const proofTone = proof.anchor.status === 'CONFIRMED' ? 'good' : proof.anchor.status === 'REVOKED' ? 'bad' : proof.anchor.status === 'FAILED' ? 'bad' : 'warn'; const proofLabel = proof.anchor.status === 'CONFIRMED' ? 'Terekam' : proof.anchor.status === 'REVOKED' ? 'Dicabut' : proof.anchor.status === 'FAILED' ? 'Gagal' : 'Belum direkam'; return <div className="history-row" key={proof.id}><div className="history-id"><strong>{proof.id}</strong><span>Batch {proof.batchRef} · {time(proof.createdAt)}</span></div><Pill tone={proofTone}>{proofLabel}</Pill>{anchored ? <a className="history-link" href={`/verify/${encodeURIComponent(proof.id)}`}>Periksa proof <ArrowUpRight size={14} /></a> : <span className="history-muted">Belum ada tautan publik</span>}</div>; })}</div></section> : null}

      <footer className="footer"><span>© PANDU · Demo pengembangan</span><span><LockKeyhole size={13} />Data demo lokal · testnet bukan uang sungguhan</span><span>Block terbaru: {health.blockNumber ?? '—'}</span></footer>
    </main>
  </div>;
}
