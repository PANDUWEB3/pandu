import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { FileSearch, Search, ArrowRight, CircleHelp, LockKeyhole, LoaderCircle, ShieldCheck, ChevronLeft, ArrowUpRight, BadgeCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useI18n } from '../i18n';
import { Tilt } from './ui';
import Navbar from './Navbar';
import Footer from './Footer';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8787';

export function VerifyPublic() {
  const { t } = useI18n();
  const [proofId, setProofId] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = proofId.trim();
    if (!id) {
      setError(t.verify.empty);
      return;
    }
    
    // If it's a URL, extract the token/code at the end
    const match = id.match(/\/verify\/([^/?#]+)/);
    const code = decodeURIComponent(match?.[1] || id);
    
    // If it looks like a 43-character base64url token or a PANDU-XXXX ID, use it directly
    if (/^[A-Za-z0-9_-]{32,80}$/.test(code) || /^PANDU-[A-Fa-f0-9]{16}$/.test(code)) {
      window.location.href = `/verify/${encodeURIComponent(code)}`;
      return;
    }

    // Otherwise, assume it's a batch code (e.g. IOT-000111) and resolve it to a token
    setError('Mencari nomor batch...');
    try {
      const response = await fetch(`${API}/api/public/resolve?code=${encodeURIComponent(code)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Pencarian gagal');
      window.location.href = `/verify/${body.token}`;
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="lp min-h-screen flex flex-col bg-mist text-ink transition-colors duration-300">
      <Navbar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 pt-32 pb-24 w-full max-w-2xl mx-auto">
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-canvas border border-black/5 dark:border-white/5 shadow-xl rounded-3xl w-full p-8 md:p-12 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
          
          <div className="relative z-10 text-center">
            <div className="w-16 h-16 bg-brand/10 text-brand rounded-2xl flex items-center justify-center mx-auto mb-6">
              <FileSearch size={32} />
            </div>
            
            <span className="text-sm font-semibold tracking-wider text-brand mb-2 uppercase block">
              {t.verify.noLogin}
            </span>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">{t.verify.title}</h1>
            <p className="text-ink-soft text-lg mb-8 leading-relaxed max-w-lg mx-auto">
              {t.verify.sub}
            </p>

            <form onSubmit={submit} className="mb-8">
              <div className="relative flex items-center shadow-sm rounded-xl bg-mist">
                <Search size={22} className="absolute left-5 text-ink-soft" />
                <input 
                  id="proof-id"
                  value={proofId}
                  onChange={e => { setProofId(e.target.value); setError(''); }}
                  placeholder={t.verify.placeholder}
                  className="w-full pl-14 pr-16 py-4 rounded-xl bg-transparent border-2 border-transparent focus:bg-canvas focus:border-brand outline-none transition-all text-lg text-ink"
                  autoFocus
                />
                <button 
                  type="submit" 
                  className="absolute right-2 top-2 bottom-2 px-4 bg-brand hover:bg-brand-600 text-white rounded-lg flex items-center justify-center transition-colors font-medium shadow-sm"
                  aria-label={t.verify.submit}
                >
                  <ArrowRight size={20} />
                </button>
              </div>
              {error && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-500 text-sm mt-3 font-medium flex items-center justify-center gap-1">
                  <CircleHelp size={14}/> {error}
                </motion.p>
              )}
            </form>

            <div className="flex items-start gap-3 p-4 bg-mist/50 border border-black/5 dark:border-white/5 rounded-xl text-sm text-ink-soft text-left">
              <LockKeyhole size={18} className="shrink-0 mt-0.5 text-brand" />
              <p>
                <strong className="text-ink block mb-0.5">{t.verify.privacyTitle}</strong>
                {t.verify.privacyText}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Steps */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mt-12 w-full grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {t.verify.steps.map((step: string, i: number) => (
            <div key={i} className="flex flex-col items-center text-center gap-3">
              <span className="w-10 h-10 rounded-full bg-canvas shadow-sm border border-black/5 dark:border-white/5 flex items-center justify-center text-brand font-bold shrink-0">
                {i + 1}
              </span>
              <p className="text-sm font-medium text-ink-soft px-4">{step}</p>
            </div>
          ))}
        </motion.div>

      </main>

      <Footer />
    </div>
  );
}

type PublicResult = {
  status: string;
  message: string;
  proof?: any;
  network?: string;
  explorerUrl?: string;
  transactionHash?: string;
  anchoredAt?: number;
  blockNumber?: number | string;
  commitment?: string;
  attester?: string;
  relayer?: string;
  revokedAt?: number;
  revoker?: string;
  revokeReason?: string;
};

export function PublicProof({ token }: { token: string }) {
  const { t } = useI18n();
  const [result, setResult] = useState<PublicResult | null>(null);
  const [retry, setRetry] = useState(0);
  const [fileMatchStatus, setFileMatchStatus] = useState<string | null>(null);
  const [fileMatchTone, setFileMatchTone] = useState<string>('');

  async function checkLocalFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const digestBuf = await crypto.subtle.digest('SHA-256', buf);
      const hashArray = Array.from(new Uint8Array(digestBuf));
      const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const evidenceList: any[] = result?.proof?.evidence || [];
      const hashList: string[] = result?.proof?.evidenceHashes || [];
      const matched = evidenceList.some((ev: any) => ev.sha256?.toLowerCase() === hex.toLowerCase()) ||
                      hashList.some((h: string) => h.toLowerCase() === hex.toLowerCase());

      if (matched) {
        setFileMatchTone('bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/30');
        setFileMatchStatus(`VALID: Hash berkas "${file.name}" (${hex.slice(0, 16)}...) cocok dengan komitmen on-chain!`);
      } else {
        setFileMatchTone('bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30');
        setFileMatchStatus(`MISMATCH: Hash berkas "${file.name}" (${hex.slice(0, 16)}...) tidak cocok dengan bukti ini.`);
      }
    } catch (err: any) {
      setFileMatchTone('bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30');
      setFileMatchStatus(`Gagal menghitung hash: ${err.message}`);
    }
  }

  useEffect(() => { 
    let live = true; 
    setResult(null); 
    fetch(`${API}/api/public/proofs/${encodeURIComponent(token)}`)
      .then(async response => { 
        const body = await response.json(); 
        if (!response.ok && !body.status) throw new Error(body.message || 'Bukti belum dapat dimuat.'); 
        return body; 
      })
      .then(data => { if (live) setResult(data); })
      .catch(error => { if (live) setResult({ status: 'UNAVAILABLE', message: error.message }); }); 
    return () => { live = false; }; 
  }, [token, retry]);

  // Determine status metadata
  const legend = t.verify.legend;
  let statusInfo = legend.find((l: any) => l.k === 'bad');
  let toneClass = 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30';
  let icon = <CircleHelp size={28} />;

  if (result?.status === 'VERIFIED') {
    statusInfo = legend.find((l: any) => l.k === 'good');
    toneClass = 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/30';
    icon = <BadgeCheck size={28} />;
  } else if (result?.status === 'PENDING') {
    statusInfo = legend.find((l: any) => l.k === 'pending');
    toneClass = 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-900/20 dark:text-brand-400 dark:border-brand-900/30';
    icon = <LoaderCircle className="animate-spin" size={28} />;
  }

  const title = statusInfo?.title || 'Belum dapat diperiksa';

  return (
    <div className="lp min-h-screen flex flex-col bg-mist text-ink transition-colors duration-300">
      <Navbar />

      <main className="flex-1 p-6 pt-32 pb-24 w-full max-w-4xl mx-auto flex flex-col items-center">
        
        <div className="w-full text-center mb-10">
          <span className="inline-flex items-center gap-2 text-xs font-bold text-ink-soft bg-canvas px-4 py-2 rounded-full border border-black/5 dark:border-white/5 uppercase tracking-wider mb-4 shadow-sm">
            <LockKeyhole size={14} className="text-brand" /> {t.verify.noLogin}
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Hasil pemeriksaan bukti</h1>
        </div>

        {!result ? (
          <div className="flex flex-col items-center justify-center p-16 text-ink-soft gap-4 bg-canvas rounded-3xl border border-black/5 dark:border-white/5 w-full shadow-sm">
            <LoaderCircle className="animate-spin text-brand" size={36} />
            <p className="font-medium text-lg">Memeriksa ringkasan dengan catatan jaringan…</p>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 items-start"
          >
            {/* Left: Certificate Detail / Status */}
            <div className="space-y-6 w-full">
              
              <div className={`flex flex-col sm:flex-row sm:items-center gap-5 p-6 rounded-3xl border ${toneClass} shadow-sm`}>
                <div className="shrink-0">{icon}</div>
                <div>
                  <h2 className="text-xl font-bold">{title}</h2>
                  <p className="opacity-90 mt-1 font-medium">{result.message}</p>
                </div>
              </div>

              {result.proof && (
                <div className="bg-canvas border border-black/5 dark:border-white/5 rounded-3xl p-6 sm:p-8 shadow-sm">
                  <h3 className="font-bold text-xl mb-6 flex items-center gap-2">
                    <FileSearch size={22} className="text-brand" />
                    Data yang dibagikan
                  </h3>
                  
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
                    <div>
                      <dt className="text-sm font-semibold text-ink-soft mb-1 uppercase tracking-wider">Produk / material</dt>
                      <dd className="font-bold text-ink text-lg">{result.proof.material}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-semibold text-ink-soft mb-1 uppercase tracking-wider">Nomor batch</dt>
                      <dd className="font-bold text-ink text-lg">{result.proof.batchRef}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-semibold text-ink-soft mb-1 uppercase tracking-wider">Pemasok</dt>
                      <dd className="font-bold text-ink text-lg">{result.proof.supplier}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-semibold text-ink-soft mb-1 uppercase tracking-wider">Disetujui pada</dt>
                      <dd className="font-bold text-ink text-lg">
                        {result.proof.approvedAt ? new Date(result.proof.approvedAt).toLocaleString('id-ID') : '—'}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-sm font-semibold text-ink-soft mb-2 uppercase tracking-wider">Hasil inspeksi</dt>
                      <dd className="font-medium text-ink bg-mist/50 border border-black/5 dark:border-white/5 p-4 rounded-xl leading-relaxed text-lg">
                        {result.proof.inspection?.result || 
                         result.proof.inspection?.checks?.map((c: any) => `${c.label || c.key}: ${c.actual} ${c.unit} · ${c.result}`).join(' / ')}
                      </dd>
                    </div>
                    <div className="sm:col-span-2 flex items-center gap-3 pt-6 mt-2 border-t border-black/5 dark:border-white/5">
                      <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-brand">
                        <ShieldCheck size={20} />
                      </div>
                      <div>
                        <dt className="text-xs font-bold text-ink-soft uppercase tracking-wider">Jaringan Pencatat</dt>
                        <dd className="font-bold text-ink text-lg">{result.network || 'Arbitrum'}</dd>
                      </div>
                    </div>
                    {[
                      ['Nomor bukti', result.proof.proofId],
                      ['Penerbit (Attester)', result.attester],
                      ['Waktu tercatat', result.anchoredAt ? new Date(result.anchoredAt * 1000).toLocaleString('id-ID') : null],
                      ['Status', result.status === 'REVOKED' ? 'Dicabut' : result.status === 'VERIFIED' ? 'Valid' : 'Tidak Valid'],
                      ['Waktu pencabutan', result.revokedAt ? new Date(result.revokedAt * 1000).toLocaleString('id-ID') : null],
                      ['Pencabut (Revoker)', result.revoker],
                      ['Alasan pencabutan', result.revokeReason && result.revokeReason !== '0x0000000000000000000000000000000000000000000000000000000000000000' ? result.revokeReason : null],
                      ['Blok', result.blockNumber],
                      ['Hash transaksi', result.transactionHash],
                      ['Sidik jari data (commitment)', result.commitment],
                      ['Jumlah berkas bukti', Array.isArray(result.proof.evidence) ? `${result.proof.evidence.length} berkas (hash tercatat)` : Array.isArray(result.proof.evidenceHashes) ? `${result.proof.evidenceHashes.length} berkas (hash tercatat)` : null],
                    ].filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => (
                      <div key={String(k)} className="sm:col-span-2">
                        <dt className="text-sm font-semibold text-ink-soft mb-1 uppercase tracking-wider">{k}</dt>
                        <dd className="font-mono text-sm text-ink break-all bg-mist/50 border border-black/5 dark:border-white/5 px-3 py-2 rounded-lg">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>

                  {/* Uji kecocokan berkas (dekripsi lokal) */}
                  <div className="mt-8 pt-6 border-t border-black/5 dark:border-white/5">
                    <h4 className="font-bold text-base mb-2 flex items-center gap-2 text-ink">
                      <ShieldCheck size={18} className="text-brand" />
                      Uji kecocokan berkas (dekripsi lokal)
                    </h4>
                    <p className="text-xs text-ink-soft mb-3 leading-relaxed">
                      Pilih berkas dokumen/inspeksi hasil dekripsi untuk menghitung SHA-256 langsung di browser dan mencocokkannya dengan komitmen bukti.
                    </p>
                    <input
                      type="file"
                      onChange={checkLocalFile}
                      className="block w-full text-xs text-ink-soft file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-brand/10 file:text-brand hover:file:bg-brand/20 cursor-pointer"
                    />
                    {fileMatchStatus && (
                      <div className={`mt-3 p-3 rounded-xl text-xs font-medium border ${fileMatchTone}`}>
                        {fileMatchStatus}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {result.status === 'UNAVAILABLE' && (
                <button 
                  className="w-full py-4 bg-canvas border border-black/10 dark:border-white/10 rounded-xl font-bold hover:bg-mist transition-colors shadow-sm"
                  onClick={() => setRetry(v => v + 1)}
                >
                  Coba periksa lagi
                </button>
              )}
              
            </div>

            {/* Right: QR Code & Actions */}
            <div className="space-y-6 w-full">
              
              {result.proof && (
                <Tilt>
                  <div className="bg-canvas border border-black/5 dark:border-white/5 rounded-3xl p-8 shadow-xl flex flex-col items-center text-center">
                    <div className="bg-white p-4 rounded-2xl shadow-sm mb-6 border border-black/5 ring-1 ring-black/5">
                      <QRCodeSVG value={window.location.href} size={150} level="M" />
                    </div>
                    <h3 className="font-bold text-ink text-lg mb-2">Tautan bukti dapat dibagikan</h3>
                    <p className="text-sm font-medium text-ink-soft leading-relaxed">
                      QR ini membuka halaman pemeriksaan yang sama. Dokumen asli tetap privat dan tidak ikut dibagikan.
                    </p>
                  </div>
                </Tilt>
              )}

              {result.explorerUrl && (
                <a 
                  href={result.explorerUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-4 bg-canvas hover:bg-mist text-ink font-bold rounded-2xl transition-colors border border-black/5 dark:border-white/5 shadow-sm"
                >
                  Lihat di Arbiscan <ArrowUpRight size={18} />
                </a>
              )}

              <details className="bg-canvas border border-black/5 dark:border-white/5 rounded-2xl group [&_summary::-webkit-details-marker]:hidden shadow-sm">
                <summary className="p-5 flex items-center justify-between font-bold cursor-pointer text-ink select-none">
                  Bagaimana cara membaca ini?
                  <span className="text-ink-soft transition-transform group-open:rotate-180">
                    <ChevronLeft className="-rotate-90" size={18} />
                  </span>
                </summary>
                <div className="p-5 pt-0 text-sm font-medium text-ink-soft leading-relaxed border-t border-black/5 dark:border-white/5 mt-2 pt-4">
                  PANDU menghitung ulang sidik jari digital (hash) dari data ringkasan ini dan membandingkannya dengan catatan yang ada di jaringan blockchain Arbitrum. Hasil ini membuktikan bahwa data belum diubah sejak disetujui, tetapi tidak dengan sendirinya menjamin kondisi fisik produk di dunia nyata.
                </div>
              </details>

            </div>

          </motion.div>
        )}
      </main>

      <Footer />
    </div>
  );
}
