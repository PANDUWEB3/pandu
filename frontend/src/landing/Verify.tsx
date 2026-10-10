import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { FileSearch, Search, ArrowRight, CircleHelp, LockKeyhole, LoaderCircle, ShieldCheck, ArrowUpRight, BadgeCheck, XCircle } from 'lucide-react';
import { useI18n } from '../i18n';
import Navbar from './Navbar';
import Footer from './Footer';
import { verifyProofOnchain, type OnchainProofStatus } from '../onchain-verification';
import { verifyDisclosurePackage } from '../merkle';
import { parseMerkleDisclosureFragment } from '../merkle-disclosure-link';
import { parseVerifierShareFragment } from '../verifier-share';

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
                  aria-label={t.verify.label}
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
  proofId: string;
  chainId: number;
  contractAddress: string;
  legacy: boolean;
  commitment: string;
  attester: string;
  transactionHash: string | null;
  anchoredAt: number;
  revoked: boolean;
  network: string;
  explorerUrl: string | null;
  onchain: OnchainProofStatus;
  disclosed: Array<{ path: string; value: unknown }>;
  disclosureValid: boolean | null;
};

export function PublicProof({ token }: { token: string }) {
  const { t } = useI18n();
  const [result, setResult] = useState<PublicResult | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setResult(null);
    setError('');
    (async () => {
      try {
        const response = await fetch(`${API}/api/public/proofs/${encodeURIComponent(token)}`);
        const metadata = await response.json();
        if (!response.ok) throw new Error(metadata.message || 'Metadata bukti tidak tersedia.');
        if (!metadata.proofId || !metadata.commitment || !metadata.contractAddress || !metadata.chainId) {
          throw new Error('Metadata minimum untuk pemeriksaan on-chain tidak lengkap.');
        }
        const chainId = Number(import.meta.env.VITE_PANDU_CHAIN_ID || 421614);
        const legacyRegistryAddress = import.meta.env.VITE_PANDU_LEGACY_REGISTRY_ADDRESS || '';
        const legacy = Boolean(legacyRegistryAddress)
          && String(metadata.contractAddress).toLowerCase() === legacyRegistryAddress.toLowerCase();
        const onchain = await verifyProofOnchain({
          proofId: metadata.proofId,
          commitment: metadata.commitment,
          contractAddress: metadata.contractAddress,
          chainId: Number(metadata.chainId),
          legacy,
        }, {
          chainId,
          rpcUrl: import.meta.env.VITE_PANDU_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
          registryAddress: import.meta.env.VITE_PANDU_REGISTRY_ADDRESS || '0x2e6aE365874D3b06dA896980D1CFc817Be873EE9',
          legacyRegistryAddress,
        });
        const sharePayload = parseVerifierShareFragment(window.location.hash);
        const disclosure = sharePayload?.disclosure || parseMerkleDisclosureFragment(window.location.hash);
        const disclosureValid = disclosure ? await verifyDisclosurePackage(disclosure, metadata.commitment) : null;
        const explorer = Number(metadata.chainId) === 42161 ? 'https://arbiscan.io' : 'https://sepolia.arbiscan.io';
        const status = onchain.status;
        const message = status === 'VERIFIED'
          ? 'Commitment cocok dengan evidenceHash di chain dan proof masih valid.'
          : status === 'REVOKED' || status === 'LEGACY_REVOKED'
            ? 'Proof telah dicabut menurut status on-chain.'
            : status.startsWith('LEGACY_')
              ? 'Legacy v1: catatan lama tanpa tanda tangan penerbit.'
              : 'Commitment tidak cocok atau proof tidak valid di chain.';
        if (active) setResult({
          ...metadata,
          status,
          legacy,
          message,
          attester: onchain.attester,
          anchoredAt: onchain.timestamp,
          revoked: onchain.revoked,
          network: Number(metadata.chainId) === 42161 ? 'Arbitrum One' : 'Arbitrum Sepolia',
          explorerUrl: metadata.transactionHash ? `${explorer}/tx/${metadata.transactionHash}` : null,
          onchain,
          disclosed: disclosureValid && disclosure ? disclosure.disclosed.map(({ path, value }) => ({ path, value })) : [],
          disclosureValid,
        });
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Pemeriksaan on-chain gagal.');
      }
    })();
    return () => { active = false; };
  }, [token, retry]);

  const legacy = result?.legacy || false;
  const good = result?.status === 'VERIFIED';
  const toneClass = good
    ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/30'
    : legacy
      ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-900/30'
      : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30';
  const title = good ? 'Valid di chain' : legacy ? 'Legacy v1 — tanpa tanda tangan penerbit' : result?.status === 'REVOKED' ? 'Proof dicabut' : 'Belum terverifikasi';

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
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 1 }} className="w-full max-w-3xl space-y-6">
          {!result && !error && (
            <div className="flex items-center justify-center p-16 text-ink-soft gap-4 bg-canvas rounded-3xl border border-black/5 dark:border-white/5 shadow-sm">
              <LoaderCircle className="animate-spin text-brand" size={28} /><span>Memeriksa langsung melalui RPC publik…</span>
            </div>
          )}
          {error && (
            <div role="alert" className="p-6 bg-red-50 text-red-700 border border-red-200 rounded-3xl">
              <div className="flex items-center gap-2 font-bold"><XCircle size={20} />Pemeriksaan chain tidak tersedia</div>
              <p className="mt-2">{error}</p>
              <button className="mt-4 px-4 py-2 rounded-xl bg-white border border-red-200 font-semibold" onClick={() => setRetry((value) => value + 1)}>Coba lagi</button>
            </div>
          )}
          {result && (
            <>
              <section className={`p-6 rounded-3xl border shadow-sm flex items-start gap-4 ${toneClass}`}>
                {good ? <BadgeCheck size={28} /> : legacy ? <ShieldCheck size={28} /> : result.status === 'REVOKED' ? <XCircle size={28} /> : <CircleHelp size={28} />}
                <div><h2 className="text-xl font-bold">{title}</h2><p className="mt-1">{result.message}</p></div>
              </section>
              <section aria-label="Status bukti on-chain" className="bg-canvas border border-black/5 dark:border-white/5 rounded-3xl p-6 shadow-sm space-y-3">
                <h3 className="font-bold text-lg">Lapisan pemeriksaan</h3>
                <p>Tanda tangan penerbit: <strong>{legacy ? 'Tidak diperiksa pada kontrak v1' : 'Diterima kontrak v2 saat anchor'}</strong></p>
                <p>Status cabut: <strong>{result.revoked ? 'Dicabut' : 'Belum dicabut'}</strong></p>
                <p>Kecocokan evidenceHash: <strong>{result.onchain.commitmentMatches ? 'Cocok dengan commitment metadata' : 'Tidak cocok'}</strong></p>
                <p>isValid(): <strong>{result.onchain.isValid === null ? 'Tidak tersedia di v1' : String(result.onchain.isValid)}</strong></p>
                <p>verify(): <strong>{result.onchain.verify === null ? 'Tidak tersedia di v1' : String(result.onchain.verify)}</strong></p>
              </section>
              <section aria-label="Bukti selective disclosure" className="bg-canvas border border-black/5 dark:border-white/5 rounded-3xl p-6 shadow-sm space-y-3">
                <h3 className="font-bold text-lg">Disclosure Merkle</h3>
                {result.disclosureValid === false
                  ? <p role="alert">Bukti field yang dibagikan tidak cocok dengan root on-chain.</p>
                  : result.disclosed.length
                    ? <><p>Field yang dipilih penerbit dan bukti Merkle cocok dengan commitment on-chain.</p><dl className="grid gap-3 text-sm">{result.disclosed.map((field) => <div key={field.path}><dt className="font-semibold text-ink-soft">{field.path}</dt><dd className="break-words">{typeof field.value === 'string' ? field.value : JSON.stringify(field.value)}</dd></div>)}</dl></>
                    : <p>Tidak ada field bisnis yang dibagikan. Nilai dan salt tertutup tetap berada di fragmen tautan hanya saat penerbit memilih disclosure.</p>}
              </section>
              <section className="bg-canvas border border-black/5 dark:border-white/5 rounded-3xl p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-lg flex items-center gap-2"><FileSearch size={20} className="text-brand" />Metadata bukti</h3>
                <dl className="grid gap-4 text-sm">
                  <div><dt className="font-semibold text-ink-soft">Proof ID</dt><dd className="font-mono break-all">{result.proofId}</dd></div>
                  <div><dt className="font-semibold text-ink-soft">Commitment</dt><dd className="font-mono break-all">{result.commitment}</dd></div>
                  <div><dt className="font-semibold text-ink-soft">Attester on-chain</dt><dd className="font-mono break-all">{result.attester}</dd></div>
                  <div><dt className="font-semibold text-ink-soft">Waktu anchor on-chain</dt><dd>{result.anchoredAt ? new Date(result.anchoredAt * 1000).toLocaleString('id-ID') : '—'}</dd></div>
                  <div><dt className="font-semibold text-ink-soft">Status</dt><dd>{result.status}</dd></div>
                </dl>
                <p className="text-xs text-ink-soft">Endpoint publik hanya memberi metadata minimum. Data bisnis dan snapshot tidak diambil atau ditampilkan.</p>
              </section>
              {result.explorerUrl && <a href={result.explorerUrl} target="_blank" rel="noreferrer" className="w-full flex items-center justify-center gap-2 py-4 bg-canvas hover:bg-mist text-ink font-bold rounded-2xl transition-colors border border-black/5 dark:border-white/5 shadow-sm">Lihat transaksi pada explorer <ArrowUpRight size={18} /></a>}
              <button className="w-full py-4 bg-canvas border border-black/10 dark:border-white/10 rounded-xl font-bold hover:bg-mist transition-colors shadow-sm" onClick={() => setRetry((value) => value + 1)}>Periksa ulang</button>
            </>
          )}
        </motion.div>
      </main>
      <Footer />
    </div>
  );
}
