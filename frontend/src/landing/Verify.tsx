import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { FileSearch, Search, ArrowRight, CircleHelp, LockKeyhole, LoaderCircle, ShieldCheck, ChevronLeft, ArrowUpRight, BadgeCheck, CheckCircle2, XCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useI18n } from '../i18n';
import { Tilt } from './ui';
import Navbar from './Navbar';
import Footer from './Footer';
import {
  decryptFileClient,
  deriveKeyFromWallet,
  deriveKeyFromPasskey,
  computeCanonicalEvidenceHash,
  computeFileHmacSha256,
  sha256Hex,
  recoverDekWithWallet,
  decryptFileName,
} from '../crypto';
import {
  parseVerifierShareFragment,
  importSharedDek,
  unwrapDekForVerifier,
  importVerifierPrivateKey,
  generateVerifierKeyPair,
  exportVerifierPublicKey,
  exportVerifierPrivateKey,
  type VerifierSharePayload,
  type VerifierShareEntryPlain,
  type VerifierShareEntryWrapped,
} from '../verifier-share';

const VERIFIER_PRIVKEY_STORAGE = 'PANDU.verifier.privateKey';

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
  legacy?: boolean;
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
  const [decryptMethod, setDecryptMethod] = useState<'share' | 'wallet' | 'passkey' | 'plaintext'>('wallet');
  const [decrypting, setDecrypting] = useState(false);
  const [share, setShare] = useState<VerifierSharePayload | null>(null);
  const [shareNotice, setShareNotice] = useState('');
  const [verifierPublicKeyHex, setVerifierPublicKeyHex] = useState('');
  const [verificationReport, setVerificationReport] = useState<{
    success: boolean;
    fileName?: string;
    decryptedSha256?: string;
    decryptedHmac?: string;
    matchedCid?: string;
    perFileSalt?: string;
    hashMatchedEvidence?: boolean;
    recomputedEvidenceHash?: string;
    onchainCommitmentMatch?: boolean;
    error?: string;
  } | null>(null);

  async function handleDecryptAndVerify(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !result?.proof) return;
    setDecrypting(true);
    setVerificationReport(null);

    try {
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      let decryptedBytes: ArrayBuffer | null = null;
      let decryptedSha256 = '';
      let activeDek: CryptoKey | null = null;

      if (decryptMethod === 'plaintext') {
        decryptedBytes = fileBytes.buffer;
        decryptedSha256 = await sha256Hex(decryptedBytes);
      } else if (decryptMethod === 'share') {
        // Berbagi akses verifikator: DEK datang dari fragmen URL (tidak pernah dari server)
        // dan TIDAK PERNAH memakai frasa sandi pemulihan penerbit.
        if (!share) {
          throw new Error(
            'Tautan berbagi akses tidak ditemukan di URL ini. Minta penerbit membuat tautan berbagi verifikator untuk bukti ini.'
          );
        }
        if (share.proofId && share.proofId !== result.proof.proofId) {
          throw new Error('Tautan akses ini dibuat untuk bukti lain dan tidak dapat digunakan pada halaman ini.');
        }
        let unwrapped = false;
        if (share.mode === 'ecies') {
          let privHex = localStorage.getItem(VERIFIER_PRIVKEY_STORAGE) || '';
          if (!privHex) {
            privHex =
              (window.prompt(
                'Tautan ini dibungkus ke kunci publik verifikator. Tempel kunci privat verifikator (hex PKCS#8):'
              ) || '').trim();
          }
          if (!privHex) throw new Error('Kunci privat verifikator diperlukan untuk membuka tautan ECIES.');
          const verifierPrivate = await importVerifierPrivateKey(privHex);
          for (const entry of share.entries as VerifierShareEntryWrapped[]) {
            try {
              const dek = await unwrapDekForVerifier(entry.wrap, verifierPrivate);
              const dec = await decryptFileClient(fileBytes, dek);
              decryptedBytes = dec.decryptedBytes;
              decryptedSha256 = dec.decryptedSha256;
              activeDek = dek;
              unwrapped = true;
              break;
            } catch (_) {}
          }
          if (!unwrapped) throw new Error('Kunci privat verifikator tidak cocok dengan pembungkus DEK.');
        } else {
          for (const entry of share.entries as VerifierShareEntryPlain[]) {
            try {
              const dek = await importSharedDek(entry.dek);
              const dec = await decryptFileClient(fileBytes, dek);
              decryptedBytes = dec.decryptedBytes;
              decryptedSha256 = dec.decryptedSha256;
              activeDek = dek;
              unwrapped = true;
              break;
            } catch (_) {}
          }
          if (!unwrapped) throw new Error('DEK pada tautan berbagi tidak dapat membuka berkas ini.');
        }
      } else {
        let key: CryptoKey;
        if (decryptMethod === 'wallet') {
          if (!window.ethereum) throw new Error('MetaMask / Web3 provider diperlukan.');
          const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
          key = await deriveKeyFromWallet(accounts[0]);
        } else {
          key = await deriveKeyFromPasskey();
        }

        const evidenceList: any[] = result.proof.evidence || [];
        let unwrapped = false;
        for (const ev of evidenceList) {
          if (ev.wrappedKeys?.wrappedBy?.wallet && decryptMethod === 'wallet') {
            try {
              const dek = await recoverDekWithWallet(ev.wrappedKeys, key);
              const dec = await decryptFileClient(fileBytes, dek);
              decryptedBytes = dec.decryptedBytes;
              decryptedSha256 = dec.decryptedSha256;
              activeDek = dek;
              unwrapped = true;
              break;
            } catch (_) {}
          }
        }

        if (!unwrapped) {
          const decrypted = await decryptFileClient(fileBytes, key);
          decryptedBytes = decrypted.decryptedBytes;
          decryptedSha256 = decrypted.decryptedSha256;
          activeDek = key;
        }
      }

      if (!decryptedBytes || !decryptedSha256) {
        throw new Error('Gagal memproses dekripsi berkas.');
      }

      // 1. Cek kecocokan HMAC atau hash berkas dengan lampiran bukti di canonical snapshot
      const evidenceList: any[] = result.proof.evidence || [];
      const hashList: string[] = result.proof.evidenceHashes || [];

      let matchedEvidenceItem: any = null;
      let matchedHmac: string | undefined;

      for (const ev of evidenceList) {
        if (ev.hmac && ev.salt) {
          const candidateHmac = await computeFileHmacSha256(decryptedBytes, ev.salt);
          if (candidateHmac.toLowerCase() === ev.hmac.toLowerCase()) {
            matchedEvidenceItem = ev;
            matchedHmac = candidateHmac;
            break;
          }
        } else if (ev.sha256) {
          if (ev.sha256.toLowerCase() === decryptedSha256.toLowerCase()) {
            matchedEvidenceItem = ev;
            break;
          }
        }
      }

      const hashMatchedEvidence = Boolean(
        matchedEvidenceItem ||
        hashList.some((h: string) => h.toLowerCase() === decryptedSha256.toLowerCase())
      );

      // Dekripsi nama berkas jika terenkripsi
      let displayFileName = file.name;
      if (activeDek && matchedEvidenceItem?.encryptedName) {
        try {
          displayFileName = await decryptFileName(matchedEvidenceItem.encryptedName, activeDek);
        } catch (_) {}
      }

      // 2. Rakit ulang Canonical Proof Snapshot
      const reconstructedSnapshot = {
        approvedAt: result.proof.approvedAt,
        batchRef: result.proof.batchRef,
        canonicalizationVersion: result.proof.canonicalizationVersion || 1,
        evidence: result.proof.evidence || [],
        inspection: result.proof.inspection,
        material: result.proof.material,
        proofId: result.proof.proofId,
        salt: result.proof.salt,
        supplier: result.proof.supplier,
      };

      // 3. Hitung ulang evidenceHash
      const recomputedEvidenceHash = await computeCanonicalEvidenceHash(reconstructedSnapshot);

      // 4. Bandingkan dengan on-chain commitment yang disimpan di kontrak
      const onchainCommitmentMatch =
        recomputedEvidenceHash.toLowerCase() === (result.commitment || '').toLowerCase();

      setVerificationReport({
        success: onchainCommitmentMatch && hashMatchedEvidence,
        fileName: displayFileName,
        decryptedSha256,
        decryptedHmac: matchedHmac,
        matchedCid: matchedEvidenceItem?.cid,
        perFileSalt: matchedEvidenceItem?.salt,
        hashMatchedEvidence,
        recomputedEvidenceHash,
        onchainCommitmentMatch,
      });
    } catch (err: any) {
      setVerificationReport({
        success: false,
        error: err.message || 'Gagal mendekripsi atau memvalidasi berkas.',
      });
    } finally {
      setDecrypting(false);
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

  // Baca fragmen URL: tautan berbagi akses verifikator (DEK untuk SATU bukti)
  useEffect(() => {
    const parsed = parseVerifierShareFragment(window.location.hash);
    setShare(parsed);
    setShareNotice('');
    if (parsed) setDecryptMethod('share');
  }, [token]);

  /** Verifikator membuat pasangan kunci sendiri; kunci publik dikirim ke penerbit. */
  async function createVerifierKeypair() {
    try {
      const pair = await generateVerifierKeyPair();
      const privateKeyHex = await exportVerifierPrivateKey(pair.privateKey);
      const publicKeyHex = await exportVerifierPublicKey(pair.publicKey);
      localStorage.setItem(VERIFIER_PRIVKEY_STORAGE, privateKeyHex);
      setVerifierPublicKeyHex(publicKeyHex);
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(publicKeyHex);
      setShareNotice('Kunci verifikator dibuat. Kunci publik disalin ke clipboard — kirimkan ke penerbit.');
    } catch (err: any) {
      setShareNotice(err.message || 'Gagal membuat kunci verifikator.');
    }
  }

  // Determine status metadata
  const legend = t.verify.legend;
  let statusInfo = legend.find((l: any) => l.k === 'bad');
  let toneClass = 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/30';
  let icon = <CircleHelp size={28} />;

  if (result?.status === 'VERIFIED') {
    statusInfo = legend.find((l: any) => l.k === 'good');
    toneClass = 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/30';
    icon = <BadgeCheck size={28} />;
  } else if (result?.status === 'LEGACY_UNSIGNED' || result?.status === 'LEGACY_REVOKED') {
    statusInfo = legend.find((l: any) => l.k === 'legacy');
    toneClass = 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-900/30';
    icon = <ShieldCheck size={28} />;
  } else if (result?.status === 'PENDING') {
    statusInfo = legend.find((l: any) => l.k === 'pending');
    toneClass = 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-900/20 dark:text-brand-400 dark:border-brand-900/30';
    icon = <LoaderCircle className="animate-spin" size={28} />;
  }

  const title = result?.legacy ? t.proof.status[result.status] : statusInfo?.title || 'Belum dapat diperiksa';

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
                      ['Penerbit (Attester)', result.legacy ? null : result.attester],
                      ['Relayer v1 (bukan penandatangan)', result.legacy ? result.relayer : null],
                      ['Waktu tercatat', result.anchoredAt ? new Date(result.anchoredAt * 1000).toLocaleString('id-ID') : null],
                      ['Status', result.legacy ? t.proof.status[result.status] : result.status === 'REVOKED' ? 'Dicabut' : result.status === 'VERIFIED' ? 'Valid' : 'Tidak Valid'],
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

                  {/* Dekripsi Klien & Rekonstruksi Canonical Proof */}
                  <div className="mt-8 pt-6 border-t border-black/5 dark:border-white/5 space-y-4">
                    <div>
                      <h4 className="font-bold text-base flex items-center gap-2 text-ink">
                        <ShieldCheck size={18} className="text-brand" />
                        Verifikasi Mandiri: Dekripsi & Rekonstruksi Canonical Proof
                      </h4>
                      <p className="text-xs text-ink-soft mt-1 leading-relaxed">
                        Dekripsi ciphertext secara lokal di browser, rakit ulang objek canonical proof secara deterministik, dan bandingkan <code>evidenceHash</code> langsung dengan komitmen <code>verify()</code> on-chain.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setDecryptMethod('share')}
                        className={`px-3 py-1.5 rounded-lg font-semibold border transition-all ${
                          decryptMethod === 'share'
                            ? 'bg-brand text-white border-brand'
                            : 'bg-canvas text-ink border-black/10 dark:border-white/10 hover:bg-mist'
                        }`}
                      >
                        Tautan Berbagi Akses
                      </button>
                      <button
                        type="button"
                        onClick={() => setDecryptMethod('wallet')}
                        className={`px-3 py-1.5 rounded-lg font-semibold border transition-all ${
                          decryptMethod === 'wallet'
                            ? 'bg-brand text-white border-brand'
                            : 'bg-canvas text-ink border-black/10 dark:border-white/10 hover:bg-mist'
                        }`}
                      >
                        Kunci Wallet (MetaMask)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDecryptMethod('passkey')}
                        className={`px-3 py-1.5 rounded-lg font-semibold border transition-all ${
                          decryptMethod === 'passkey'
                            ? 'bg-brand text-white border-brand'
                            : 'bg-canvas text-ink border-black/10 dark:border-white/10 hover:bg-mist'
                        }`}
                      >
                        Passkey / WebAuthn
                      </button>
                      <button
                        type="button"
                        onClick={() => setDecryptMethod('plaintext')}
                        className={`px-3 py-1.5 rounded-lg font-semibold border transition-all ${
                          decryptMethod === 'plaintext'
                            ? 'bg-brand text-white border-brand'
                            : 'bg-canvas text-ink border-black/10 dark:border-white/10 hover:bg-mist'
                        }`}
                      >
                        Berkas Sudah Terdekripsi
                      </button>
                    </div>

                    {decryptMethod === 'share' && (
                      <div className="p-3 rounded-xl bg-mist/60 border border-black/5 dark:border-white/5 text-xs text-ink-soft space-y-2">
                        {share ? (
                          <p>
                            <strong className="text-ink">Tautan berbagi akses terdeteksi.</strong>{' '}
                            {share.mode === 'ecies'
                              ? 'DEK dibungkus ke kunci publik verifikator (ECIES P-256 + HKDF-SHA256 + AES-256-GCM).'
                              : `DEK untuk ${share.entries.length} berkas dibawa pada fragmen URL dan tidak pernah dikirim ke server.`}
                            {share.proofId ? ` · Bukti ${share.proofId}` : ''}
                          </p>
                        ) : (
                          <p>
                            Halaman ini tidak memuat akses DEK. Minta penerbit membuat tautan berbagi verifikator
                            untuk bukti ini, atau buat kunci verifikator di bawah dan kirimkan kunci publiknya ke penerbit.
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={createVerifierKeypair}
                            className="px-3 py-1.5 rounded-lg font-semibold border bg-canvas text-ink border-black/10 dark:border-white/10 hover:bg-mist"
                          >
                            {verifierPublicKeyHex ? 'Buat ulang kunci verifikator' : 'Buat kunci verifikator'}
                          </button>
                          {verifierPublicKeyHex && (
                            <code className="break-all text-[10px]">
                              {verifierPublicKeyHex.slice(0, 24)}…{verifierPublicKeyHex.slice(-16)}
                            </code>
                          )}
                        </div>
                        {shareNotice && <p className="text-brand font-medium">{shareNotice}</p>}
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-ink-soft uppercase tracking-wider">
                        {decryptMethod === 'plaintext'
                          ? 'Pilih Berkas Asli (Hasil Dekripsi)'
                          : 'Pilih Berkas Ciphertext (.enc)'}
                      </label>
                      <input
                        type="file"
                        disabled={decrypting}
                        onChange={handleDecryptAndVerify}
                        className="block w-full text-xs text-ink-soft file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-brand/10 file:text-brand hover:file:bg-brand/20 cursor-pointer"
                      />
                    </div>

                    {decrypting && (
                      <div className="flex items-center gap-2 text-xs text-brand py-2">
                        <LoaderCircle size={16} className="animate-spin" />
                        <span>Mendekripsi berkas dan merekonstruksi canonical snapshot...</span>
                      </div>
                    )}

                    {verificationReport && (
                      <div
                        className={`p-4 rounded-2xl text-xs space-y-2 border ${
                          verificationReport.success
                            ? 'bg-green-50 text-green-800 border-green-200 dark:bg-green-950/20 dark:text-green-300 dark:border-green-900/30'
                            : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/20 dark:text-red-300 dark:border-red-900/30'
                        }`}
                      >
                        {verificationReport.error ? (
                          <div className="flex items-center gap-2 font-bold text-sm">
                            <XCircle size={16} className="text-red-600 shrink-0" />
                            <span>{verificationReport.error}</span>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 font-bold text-sm mb-2">
                              {verificationReport.success ? (
                                <>
                                  <CheckCircle2 size={18} className="text-green-600 shrink-0" />
                                  <span>VERIFIKASI PENUH BERHASIL (100% Cocok On-Chain)</span>
                                </>
                              ) : (
                                <>
                                  <XCircle size={18} className="text-red-600 shrink-0" />
                                  <span>VERIFIKASI GAGAL: Terdeteksi Ketidakcocokan</span>
                                </>
                              )}
                            </div>
                            <div className="grid grid-cols-1 gap-1.5 text-[11px] font-mono break-all">
                              <div><strong>Berkas:</strong> {verificationReport.fileName}</div>
                              <div><strong>SHA-256 Plaintext:</strong> {verificationReport.decryptedSha256}</div>
                              {verificationReport.decryptedHmac && (
                                <div><strong>HMAC-SHA256 (Per-File Salt):</strong> {verificationReport.decryptedHmac}</div>
                              )}
                              {verificationReport.perFileSalt && (
                                <div><strong>Salt Berkas:</strong> {verificationReport.perFileSalt}</div>
                              )}
                              <div>
                                <strong>Kesesuaian Lampiran (CID/HMAC):</strong>{' '}
                                {verificationReport.hashMatchedEvidence
                                  ? `✓ Cocok dengan lampiran snapshot (${verificationReport.matchedCid || 'terdaftar'})`
                                  : '✗ Tidak ditemukan di bukti ini'}
                              </div>
                              <div><strong>Canonical evidenceHash Dihitung:</strong> {verificationReport.recomputedEvidenceHash}</div>
                              <div><strong>On-chain Commitment di Kontrak:</strong> {result.commitment}</div>
                              <div>
                                <strong>Status On-chain:</strong>{' '}
                                {result.legacy
                                  ? result.status === 'LEGACY_UNSIGNED' && verificationReport.onchainCommitmentMatch
                                    ? 'Legacy v1: commitment cocok; tanda tangan penerbit tidak diperiksa.'
                                    : result.status === 'LEGACY_REVOKED'
                                      ? 'Legacy v1: telah dicabut; tanda tangan penerbit tidak diperiksa.'
                                      : 'Legacy v1: record tidak cocok; tanda tangan penerbit tidak diperiksa.'
                                  : verificationReport.onchainCommitmentMatch && result.status === 'VERIFIED'
                                  ? '✓ VALID & IDENTIK (verify() = true)'
                                  : result.status === 'REVOKED'
                                  ? '✗ DICABUT (Revoked)'
                                  : '✗ MISMATCH'}
                              </div>
                            </div>
                          </>
                        )}
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
