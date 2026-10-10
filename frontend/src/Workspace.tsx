import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, BadgeCheck, BookOpen, Boxes, CheckCircle2, CircleHelp, ClipboardCheck, FileCheck2, Factory, Gauge, History, Layers3, LoaderCircle, LockKeyhole, LogOut, Moon, Search, Send, Settings, ShieldCheck, Sun, Truck, Users, WalletCards, XCircle, UserRound, PackagePlus, SlidersHorizontal, ChevronDown, Check, Bell, Unplug, type LucideIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './supabase';
import { useI18n, type Dict } from './i18n';
import { useTheme } from './theme';
import { Logo } from './landing/ui';
import TiltedCard from './components/TiltedCard';
import ModernSelect from './components/ModernSelect';
import CountUp from './landing/reactbits/CountUp';
import { motion, AnimatePresence } from 'motion/react';
import { keccak256, toUtf8Bytes } from 'ethers';
import { encryptFileEnvelope, encryptFileName, deriveKeyFromWallet, validateRecoveryPassphrase, recoverDekWithWallet } from './crypto';
import { buildDisclosurePackage, type MerkleLeaf } from './merkle';
import { createEncryptedProofCommitment, openEncryptedProofCommitment } from './proof-commitment';
import {
  buildVerifierSharePayload,
  buildVerifierShareUrl,
  wrapDekForVerifier,
  base64UrlEncode,
  importVerifierPublicKey,
  exportDekRaw,
} from './verifier-share';

declare global { interface Window { ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<unknown> } } }
const API = import.meta.env.VITE_API_URL || 'http://localhost:8787';
type Org = { id: string; name: string; industry_key: string; role: string };
type ChainHealth = { ok: boolean; chainId?: number; chainLabel?: string; configured?: boolean; writesEnabled?: boolean; supabaseConfigured?: boolean; error?: string };
type DbRow = Record<string, any>;
type Ws = Dict['ws'];

const fill = (text: string, vars: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_match, key) => String(vars[key] ?? ''));
const locale = (lang: string) => (lang === 'id' ? 'id-ID' : 'en-US');
const displayCategory = (value: string) => value.replace(/\b\w/g, letter => letter.toUpperCase());

const NAV_ICONS: Record<string, LucideIcon> = {
  overview: Gauge, products: PackagePlus, standards: SlidersHorizontal, batches: Boxes, inspection: ClipboardCheck,
  suppliers: Truck, proofs: FileCheck2, team: Users, activity: History, guide: BookOpen, settings: Settings, profile: UserRound,
};
const GUIDE_HREFS = ['/workspace/standards', '/workspace/batches', '/workspace/inspection', '/workspace/proofs', '/verify'];
const GUIDE_FEATURE_ICONS: LucideIcon[] = [ShieldCheck, LockKeyhole, BadgeCheck, WalletCards];

const errorText = (error: any, w: Ws) => {
  if (error?.code === '23505') return w.err.duplicate;
  if (error?.code === 'PGRST205' || error?.status === 404 || /schema cache|could not find the table/i.test(error?.message || '')) return w.err.noDb;
  if (/record "new" has no field "user_id"/i.test(error?.message || '')) return w.err.trigger;
  return error?.message || w.err.generic;
};
const displayDate = (value: unknown, lang: string) => {
  if (typeof value !== 'string' || !value.trim()) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium' }).format(date);
};

function Brand() { return <Logo size="md" />; }
function Status({ children, tone = 'good' }: { children: ReactNode; tone?: string }) { return <span className={`p-status p-status-${tone}`}><i />{children}</span>; }

function MetricCard({ label, value, note, icon }: { label: string; value: number; note: string; icon: ReactNode }) {
  return (
    <TiltedCard className="p-metric-card">
      <span className="p-metric-label">{label}</span>
      <strong className="p-metric-value"><CountUp to={value} duration={0.8} /></strong>
      <small className="p-metric-note">{icon}{note}</small>
      <span className="p-metric-sheen" aria-hidden="true" />
    </TiltedCard>
  );
}

function ProofShareCell({ proof, accessToken, w }: { proof: DbRow; accessToken: string; w: Ws }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!['confirmed', 'revoked'].includes(proof.anchor_status)) return;
    let active = true;
    fetch(`${API}/api/proofs/${proof.id}/share`, { headers: { Authorization: `Bearer ${accessToken}` } }).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || w.err.linkPending); return body.url as string; }).then(value => { if (active) setUrl(value); }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [proof.id, proof.anchor_status, accessToken, w]);
  if (!['confirmed', 'revoked'].includes(proof.anchor_status)) return <span className="p-share-pending">{w.proofCell.pending}</span>;
  if (error) return <span className="p-share-pending" title={error}>{w.proofCell.noLink}</span>;
  if (!url) return <span className="p-share-pending">{w.proofCell.making}</span>;
  return <span className="p-qr-cell"><QRCodeSVG value={url} size={64} level="M" /><a className="p-row-link" target="_blank" rel="noreferrer" href={url}>{w.proofCell.check} <ArrowRight size={13} /></a></span>;
}

/**
 * Berbagi akses dekripsi SATU bukti kepada verifikator pihak ketiga.
 * Dua mode: (1) tautan berisi DEK (fragmen URL), (2) DEK dibungkus ke kunci
 * publik verifikator (ECIES). Frasa sandi pemulihan TIDAK PERNAH dipakai di sini.
 */
function VerifierShareDialog({
  proof,
  accessToken,
  orgId,
  onClose,
}: {
  proof: DbRow;
  accessToken: string;
  orgId: string;
  onClose: () => void;
}) {
  const [publicKey, setPublicKey] = useState('');
  const [disclosurePathText, setDisclosurePathText] = useState('inspection.result');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');

  async function createShareLink() {
    setBusy(true);
    setError('');
    setUrl('');
    try {
      if (!supabase || !window.ethereum) throw new Error('Supabase dan wallet (MetaMask) diperlukan.');
      const useEcies = publicKey.trim().length > 0;
      if (useEcies && !/^[A-Fa-f0-9]{160,200}$/.test(publicKey.trim())) {
        throw new Error('Kunci publik verifikator harus berupa hex SPKI P-256 (sekitar 160-200 karakter hex).');
      }

      // 1. Tautan verifikasi resmi dari backend (hanya untuk bukti tercatat/dicabut)
      const shareRes = await fetch(`${API}/api/proofs/${proof.id}/share`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const shareBody = await shareRes.json();
      if (!shareRes.ok) throw new Error(shareBody.error || 'Tautan verifikasi belum tersedia.');
      const baseUrl = shareBody.url as string;

      // Open the issuer-only encrypted Merkle leaves locally, then include only paths selected here.
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      const kekWallet = await deriveKeyFromWallet(accounts[0]);
      const { data: proofRow, error: proofError } = await supabase.from('quality_proofs')
        .select('organization_id,private_snapshot_ciphertext').eq('id', proof.id).single();
      if (proofError || !proofRow?.private_snapshot_ciphertext) throw new Error('Kunci proof tidak tersedia.');
      const privateBundle = await openEncryptedProofCommitment({
        organizationId: proofRow.organization_id, proofRowId: proof.id,
        envelope: proofRow.private_snapshot_ciphertext, walletKek: kekWallet, walletAccount: accounts[0],
      });
      const selectedPaths = [...new Set(disclosurePathText.split(',').map((item) => item.trim()).filter(Boolean))];
      const disclosure = selectedPaths.length ? await buildDisclosurePackage(privateBundle.leaves, selectedPaths) : undefined;

      const proofCids = new Set(privateBundle.leaves
        .filter((leaf) => /^evidence\.\d+\.cid$/.test(leaf.path))
        .map((leaf) => String(leaf.value)));
      const filesResult = proofCids.size ? await supabase.from('evidence_files')
        .select('cid,original_name').eq('organization_id', orgId).eq('inspection_id', proof.inspection_id)
        .in('cid', [...proofCids]) : { data: [], error: null };
      if (filesResult.error) throw filesResult.error;
      const verifierPublicKey = useEcies ? await importVerifierPublicKey(publicKey.trim()) : null;

      const entries: Array<Record<string, unknown>> = [];
      for (const file of filesResult.data || []) {
        const metaMatch = String(file.original_name || '').match(/#meta=([^#]+)/);
        if (!metaMatch) continue;
        const wrappedMeta = JSON.parse(decodeURIComponent(metaMatch[1]));
        const dek = await recoverDekWithWallet(wrappedMeta, kekWallet);
        const rawDek = await exportDekRaw(dek);
        if (verifierPublicKey) {
          entries.push({ cid: file.cid, wrap: await wrapDekForVerifier(rawDek, verifierPublicKey) });
        } else {
          entries.push({ cid: file.cid, dek: base64UrlEncode(rawDek) });
        }
      }
      if (!entries.length && !disclosure) throw new Error('Pilih setidaknya satu field disclosure atau berkas proof.');

      const payload = buildVerifierSharePayload({
        mode: verifierPublicKey ? 'ecies' : 'dek',
        proofId: proof.public_id,
        entries: entries as any,
        disclosure,
      });
      setUrl(buildVerifierShareUrl(baseUrl, payload));
    } catch (err: any) {
      setError(err.message || 'Gagal membuat tautan berbagi akses.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
              <LockKeyhole size={18} className="text-brand" /> Bagikan akses verifikator
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Berlaku untuk bukti <strong>{proof.public_id}</strong>. Frasa sandi pemulihan tidak dipakai di sini.
            </p>
          </div>
          <button className="p-icon-button" aria-label="Tutup" onClick={onClose}>×</button>
        </div>

        <label className="mb-2 block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
          Kunci publik verifikator (opsional, hex SPKI P-256)
        </label>
        <textarea
          className="mb-3 h-20 w-full resize-none rounded-xl border border-slate-200 p-2 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-800"
          placeholder="Kosongkan untuk tautan berisi DEK (bearer). Isi untuk mode ECIES."
          value={publicKey}
          onChange={(e) => setPublicKey(e.target.value)}
        />
        <label className="mb-2 block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400" htmlFor="disclosure-paths">
          Field Merkle yang dibagikan (pisahkan dengan koma)
        </label>
        <input id="disclosure-paths" className="mb-3 w-full rounded-xl border border-slate-200 p-2 text-sm dark:border-slate-700 dark:bg-slate-800" value={disclosurePathText} onChange={(event) => setDisclosurePathText(event.target.value)} placeholder="inspection.result, material" />

        <div className="flex flex-wrap gap-2">
          <button className="p-button p-button-primary" disabled={busy} onClick={() => void createShareLink()}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <LockKeyhole size={16} />} Buat tautan akses
          </button>
          {url && (
            <button
              className="p-button p-button-outline"
              onClick={() => navigator.clipboard?.writeText(url).then(() => setError(''))}
            >
              <ClipboardCheck size={16} /> Salin tautan
            </button>
          )}
        </div>

        {error && <p className="mt-3 text-xs font-medium text-red-600">{error}</p>}
        {url && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold text-emerald-600">Tautan akses verifikator siap dibagikan.</p>
            <div className="flex items-start gap-3">
              <QRCodeSVG value={url} size={88} level="M" />
              <a
                className="p-row-link break-all text-xs"
                target="_blank"
                rel="noreferrer"
                href={url}
              >
                {url}
              </a>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Berikan tautan hanya kepada verifikator yang berwenang. Kunci privat verifikator tetap di peramban mereka.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

type TeamMember = { organization_id: string; user_id: string; role: string; status: string; joined_at: string; email: string | null; name: string | null };
type AuditEntry = { id: number; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; details: Record<string, unknown>; created_at: string };

function OrgChart({ members }: { members: TeamMember[] }) {
  const owners = members.filter(m => m.role === 'owner');
  const admins = members.filter(m => m.role === 'admin');
  const staff = members.filter(m => !['owner', 'admin'].includes(m.role));

  const MemberCard = ({ m }: { m: TeamMember }) => (
    <div className="flex flex-col items-center bg-white dark:bg-slate-800/80 p-3 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)] border border-slate-200/60 dark:border-slate-700/60 w-32 relative z-10 backdrop-blur-xl hover:-translate-y-1 transition-transform">
      <span className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold text-sm mb-2 shadow-sm border border-white dark:border-slate-600">
        {(m.name || m.email || '?').slice(0, 1).toUpperCase()}
      </span>
      <strong className="text-xs text-slate-800 dark:text-slate-100 truncate w-full text-center" title={m.name || m.email || m.user_id}>
        {m.name || m.email?.split('@')[0] || m.user_id.slice(0, 8)}
      </strong>
      <small className="text-[10px] text-slate-500 dark:text-slate-400 capitalize mt-0.5">{m.role}</small>
    </div>
  );

  return (
    <div className="mb-10 flex flex-col items-center py-8 px-4 bg-slate-50/50 dark:bg-slate-900/30 rounded-3xl border border-slate-200/50 dark:border-slate-800/50 overflow-x-auto shadow-inner backdrop-blur-sm">
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
        <Users size={16} className="text-orange-500 drop-shadow-md" /> Struktur Organisasi
      </h3>

      {owners.length > 0 && (
        <div className="flex flex-col items-center">
          <div className="flex gap-4">
            {owners.map(m => <MemberCard key={m.user_id} m={m} />)}
          </div>
        </div>
      )}
      
      {owners.length > 0 && (admins.length > 0 || staff.length > 0) && (
        <div className="w-px h-8 bg-gradient-to-b from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-500 shadow-sm" />
      )}

      {admins.length > 0 && (
        <div className="flex flex-col items-center">
          <div className="flex gap-4 flex-wrap justify-center relative">
             {admins.length > 1 && <div className="absolute top-0 left-[15%] right-[15%] h-px bg-slate-400 dark:bg-slate-500 shadow-sm" />}
             {admins.map(m => (
               <div key={m.user_id} className="relative pt-5 flex flex-col items-center">
                 {admins.length > 1 && <div className="absolute top-0 left-1/2 w-px h-5 bg-slate-400 dark:bg-slate-500 -translate-x-1/2 shadow-sm" />}
                 {admins.length === 1 && owners.length > 0 && <div className="absolute top-0 left-1/2 w-px h-5 bg-slate-400 dark:bg-slate-500 -translate-x-1/2 shadow-sm" />}
                 <MemberCard m={m} />
               </div>
             ))}
          </div>
        </div>
      )}

      {admins.length > 0 && staff.length > 0 && (
        <div className="w-px h-8 bg-gradient-to-b from-slate-400 to-slate-300 dark:from-slate-500 dark:to-slate-600 shadow-sm" />
      )}
      {owners.length > 0 && admins.length === 0 && staff.length > 0 && (
        <div className="w-px h-8 bg-gradient-to-b from-slate-400 to-slate-300 dark:from-slate-500 dark:to-slate-600 shadow-sm" />
      )}

      {staff.length > 0 && (
        <div className="flex flex-col items-center">
          <div className="flex gap-4 flex-wrap justify-center relative">
             {staff.length > 1 && <div className="absolute top-0 left-[10%] right-[10%] h-px bg-slate-300 dark:bg-slate-600 shadow-sm" />}
             {staff.map(m => (
               <div key={m.user_id} className="relative pt-5 flex flex-col items-center">
                 {staff.length > 1 && <div className="absolute top-0 left-1/2 w-px h-5 bg-slate-300 dark:bg-slate-600 -translate-x-1/2 shadow-sm" />}
                 {staff.length === 1 && (admins.length > 0 || owners.length > 0) && <div className="absolute top-0 left-1/2 w-px h-5 bg-slate-300 dark:bg-slate-600 -translate-x-1/2 shadow-sm" />}
                 <MemberCard m={m} />
               </div>
             ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Workspace({ page = 'overview' }: { page?: string }) {
  const { lang, setLang, t } = useI18n();
  const w = t.ws;
  const { mode, toggle: toggleTheme } = useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgsReady, setOrgsReady] = useState(false);
  const organizationLoadRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [rows, setRows] = useState<{ batches: DbRow[]; suppliers: DbRow[]; materials: DbRow[]; profiles: DbRow[]; inspections: DbRow[]; proofs: DbRow[]; wallets: DbRow[]; evidence: DbRow[] }>({ batches: [], suppliers: [], materials: [], profiles: [], inspections: [], proofs: [], wallets: [], evidence: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const [search, setSearch] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [orgName, setOrgName] = useState('');
  const [industry, setIndustry] = useState('general');
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth > 768 : true);
  const [mobileRailMenu, setMobileRailMenu] = useState<string | null>(null);
  const [newCode, setNewCode] = useState('');
  const [newBatchSupplier, setNewBatchSupplier] = useState('');
  const [newBatchMaterial, setNewBatchMaterial] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [newMaterial, setNewMaterial] = useState('');
  const [measurements, setMeasurements] = useState<Record<string, Record<string, string>>>({});
  const [parameter, setParameter] = useState('Kadar air');
  const [minimum, setMinimum] = useState('');
  const [maximum, setMaximum] = useState('');
  const [unit, setUnit] = useState('%');
  const [walletBusy, setWalletBusy] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState('qc');
  const [auditEvents, setAuditEvents] = useState<AuditEntry[]>([]);
  const [explorerLink, setExplorerLink] = useState('');
  const [shareProof, setShareProof] = useState<DbRow | null>(null);
  const [chainHealth, setChainHealth] = useState<ChainHealth | null>(null);
  const [recoveryPassphraseSession, setRecoveryPassphraseSession] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileMenu, setProfileMenu] = useState(false);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  useEffect(() => { setRecoveryPassphraseSession(''); }, [session?.user.id]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(true); }
      if (event.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (!profileMenu && !orgDropdownOpen && !notifOpen) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.('[data-ws-pop]')) { setProfileMenu(false); setOrgDropdownOpen(false); setNotifOpen(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setProfileMenu(false); setOrgDropdownOpen(false); setNotifOpen(false); } };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [profileMenu, orgDropdownOpen, notifOpen]);

  const loadOrganizations = useCallback(async (currentSession: Session) => {
    if (!supabase) return;
    const accepted = await supabase.rpc('accept_organization_invites');
    if (accepted.error && accepted.error.code !== 'PGRST202') throw accepted.error;
    const { data, error } = await supabase.from('organization_members').select('organization_id,role,organizations(id,name,industry_key)').eq('user_id', currentSession.user.id).eq('status', 'active');
    if (error) throw error;
    const available = (data || []).map((row: any) => ({ ...row.organizations, role: row.role })).filter((o: any) => o.id);
    setOrgs(available);
    const preferred = localStorage.getItem('PANDU.active-organization');
    setOrg(available.find((item: Org) => item.id === preferred) || available[0] || null);
    setOrgsReady(true);
  }, []);

  const loadOrganizationsOnce = useCallback((currentSession: Session) => {
    const pending = organizationLoadRef.current;
    if (pending?.userId === currentSession.user.id) return pending.promise;
    const promise = loadOrganizations(currentSession).finally(() => {
      if (organizationLoadRef.current?.promise === promise) organizationLoadRef.current = null;
    });
    organizationLoadRef.current = { userId: currentSession.user.id, promise };
    return promise;
  }, [loadOrganizations]);

  useEffect(() => {
    if (!supabase) { setOrgsReady(true); setLoading(false); return; }
    let alive = true;
    let bootstrapTimer = 0;
    const finishBootstrap = () => {
      window.clearTimeout(bootstrapTimer);
      if (alive) { setOrgsReady(true); setLoading(false); }
    };
    const startBootstrapTimer = () => {
      window.clearTimeout(bootstrapTimer);
      bootstrapTimer = window.setTimeout(() => {
        if (!alive) return;
        setFailure(w.gate.bootstrapTimeout);
        setOrgsReady(true);
        setLoading(false);
      }, 15_000);
    };
    startBootstrapTimer();
    void supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) throw error;
      if (!alive) return;
      setSession(data.session);
      if (data.session) await loadOrganizationsOnce(data.session);
      if (alive) setFailure('');
    }).catch((error) => { if (alive) setFailure(errorText(error, w)); }).finally(finishBootstrap);
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (!next) {
        window.clearTimeout(bootstrapTimer);
        setFailure(''); setOrgs([]); setOrg(null); setOrgsReady(true);
        setRows({ batches: [], suppliers: [], materials: [], profiles: [], inspections: [], proofs: [], wallets: [], evidence: [] });
      } else if (event === 'SIGNED_IN') {
        setFailure(''); setOrgsReady(false); setLoading(true); startBootstrapTimer();
        // INITIAL_SESSION is handled by getSession above. Only SIGNED_IN needs a
        // second path, and the in-flight promise guard coalesces redirect races.
        window.setTimeout(() => void loadOrganizationsOnce(next)
          .then(() => { if (alive) setFailure(''); })
          .catch((error) => { if (alive) setFailure(errorText(error, w)); })
          .finally(finishBootstrap), 0);
      }
    });
    return () => { alive = false; window.clearTimeout(bootstrapTimer); listener.subscription.unsubscribe(); };
  }, [loadOrganizationsOnce, w]);

  const refresh = useCallback(async () => {
    if (!supabase || !org || !session) return;
    const requests = await Promise.all([
      supabase.from('batches').select('*,materials(name),suppliers(name)').eq('organization_id', org.id).order('created_at', { ascending: false }),
      supabase.from('suppliers').select('*').eq('organization_id', org.id).order('name'),
      supabase.from('materials').select('*').eq('organization_id', org.id).order('name'),
      supabase.from('quality_profiles').select('*').eq('organization_id', org.id).eq('active', true).order('created_at'),
      supabase.from('inspections').select('*,batches(batch_code,materials(name),suppliers(name))').eq('organization_id', org.id).order('created_at', { ascending: false }),
      supabase.from('quality_proofs').select('*').eq('organization_id', org.id).order('created_at', { ascending: false }),
      supabase.from('user_wallets').select('id,chain_id,address,verified_at').eq('user_id', session.user.id),
      supabase.from('evidence_files').select('*').eq('organization_id', org.id).order('created_at', { ascending: false }),
    ]);
    const error = requests.find((item) => item.error)?.error;
    if (error) throw error;
    setRows({ batches: requests[0].data || [], suppliers: requests[1].data || [], materials: requests[2].data || [], profiles: requests[3].data || [], inspections: requests[4].data || [], proofs: requests[5].data || [], wallets: requests[6].data || [], evidence: requests[7].data || [] });
  }, [org, session]);

  const refreshMembers = useCallback(async () => {
    if (!session || !org) return;
    const response = await fetch(`${API}/api/organizations/${org.id}/members`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || t.ws.msg.membersFail);
    setMembers(body.members || []);
  }, [org, session, t.ws.msg.membersFail]);

  useEffect(() => {
    if (!supabase || !session || !org) return;
    const client = supabase;
    setLoading(true);
    void refresh().catch((error) => setFailure(errorText(error, w))).finally(() => setLoading(false));
    const interval = window.setInterval(() => void refresh().catch((error) => setFailure(errorText(error, w))), 15000);
    const channel = client.channel(`PANDU-org-${org.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'batches', filter: `organization_id=eq.${org.id}` }, () => void refresh()).on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers', filter: `organization_id=eq.${org.id}` }, () => void refresh()).on('postgres_changes', { event: '*', schema: 'public', table: 'inspections', filter: `organization_id=eq.${org.id}` }, () => void refresh()).on('postgres_changes', { event: '*', schema: 'public', table: 'quality_proofs', filter: `organization_id=eq.${org.id}` }, () => void refresh()).subscribe();
    return () => { window.clearInterval(interval); void client.removeChannel(channel); };
  }, [org, session, refresh, w]);

  useEffect(() => {
    if (!supabase || !org || !session || page !== 'activity') return;
    let active = true;
    void supabase.from('audit_events').select('id,actor_id,action,entity_type,entity_id,details,created_at').eq('organization_id', org.id).order('created_at', { ascending: false }).limit(100)
      .then(({ data, error }) => { if (!active) return; if (error) setFailure(errorText(error, w)); else setAuditEvents(data || []); });
    return () => { active = false; };
  }, [org, session, page, w]);

  useEffect(() => {
    if (page !== 'team' || !org || !session) return;
    void refreshMembers().catch((error) => setFailure(errorText(error, w)));
  }, [org, session, page, refreshMembers, w]);

  useEffect(() => {
    if (!supabase || !session || page !== 'profile') return;
    setProfileName(String(session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email || ''));
    void supabase.from('profiles').select('display_name').eq('user_id', session.user.id).maybeSingle()
      .then(({ data, error }) => { if (error) setFailure(errorText(error, w)); else if (data?.display_name) setProfileName(data.display_name); });
  }, [session, page, w]);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try { const response = await fetch(`${API}/api/health`); const data = await response.json(); if (active) setChainHealth(data); }
      catch { if (active) setChainHealth({ ok: false }); }
    };
    void check();
    const timer = window.setInterval(() => void check(), 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  async function perform(action: () => Promise<unknown>, message: string) {
    setBusy(true); setFailure(''); setNotice(''); setExplorerLink('');
    try { await action(); await refresh(); setNotice(message); }
    catch (error) { setFailure(errorText(error, w)); }
    finally { setBusy(false); }
  }
  async function createOrganization(event: FormEvent) {
    event.preventDefault(); if (!supabase || !session) return;
    await perform(async () => {
      const { data, error } = await supabase!.rpc('create_organization', { p_name: orgName.trim(), p_industry_key: industry });
      if (error) throw error;
      await loadOrganizations(session);
      const id = data as string; localStorage.setItem('PANDU.active-organization', id);
      const { data: created } = await supabase!.from('organizations').select('id,name,industry_key').eq('id', id).single();
      if (created) { const next = { ...created, role: 'owner' }; setOrg(next); setOrgs((prev) => [next, ...prev]); }
    }, w.msg.orgCreated);
  }
  async function addProfile(event: FormEvent) {
    event.preventDefault(); if (!supabase || !org || !session) return;
    const low = Number(minimum), high = Number(maximum);
    if (!parameter.trim() || !Number.isFinite(low) || !Number.isFinite(high) || low > high || !unit.trim()) { setFailure(w.msg.stdInvalid); return; }
    await perform(async () => { const { error } = await supabase!.from('quality_profiles').insert({ organization_id: org.id, name: `${w.standards.profilePrefix} ${parameter}`, industry_key: org.industry_key, rules: { measurements: [{ key: 'measurement', label: parameter.trim(), min: low, max: high, unit: unit.trim() }] }, created_by: session.user.id }); if (error) throw error; }, w.msg.stdSaved);
  }
  async function saveProfile(event: FormEvent) {
    event.preventDefault(); if (!supabase || !session) return;
    const name = profileName.trim();
    if (name.length < 2 || name.length > 100) { setFailure(w.msg.nameInvalid); return; }
    await perform(async () => {
      const { error } = await supabase!.from('profiles').upsert({ user_id: session.user.id, display_name: name, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
      const updated = await supabase!.auth.updateUser({ data: { full_name: name, name } });
      if (updated.error) throw updated.error;
      if (updated.data.user) setSession({ ...session, user: updated.data.user });
    }, w.msg.profileSaved);
  }
  async function addSupplier(event: FormEvent) { event.preventDefault(); if (!supabase || !org || !session) return; await perform(async () => { const { error } = await supabase!.from('suppliers').insert({ organization_id: org.id, name: newSupplier.trim(), created_by: session.user.id }); if (error) throw error; setNewSupplier(''); }, w.msg.supplierSaved); }
  async function addMaterial(event: FormEvent) { event.preventDefault(); if (!supabase || !org || !session) return; await perform(async () => { const { error } = await supabase!.from('materials').insert({ organization_id: org.id, name: newMaterial.trim(), category: org.industry_key, created_by: session.user.id }); if (error) throw error; setNewMaterial(''); }, w.msg.materialSaved); }
  async function addBatch(event: FormEvent) {
    event.preventDefault(); if (!supabase || !org || !session) return;
    const code = newCode.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(code)) { setFailure(w.msg.batchCodeInvalid); return; }
    if (!newBatchMaterial || !rows.materials.some(material => material.id === newBatchMaterial)) { setFailure(w.msg.batchMaterialInvalid); return; }
    await perform(async () => { const { error } = await supabase!.from('batches').insert({ organization_id: org.id, batch_code: code, material_id: newBatchMaterial, supplier_id: newBatchSupplier || null, created_by: session.user.id }); if (error) throw error; setNewCode(''); setNewBatchMaterial(''); setNewBatchSupplier(''); }, w.msg.batchSaved);
  }
  async function assignBatchProduct(batch: DbRow, materialId: string) {
    if (!supabase || !org || !materialId) return;
    await perform(async () => {
      const { error } = await supabase!.from('batches').update({ material_id: materialId }).eq('id', batch.id).eq('organization_id', org.id);
      if (error) throw error;
    }, fill(w.msg.productAssigned, { code: batch.batch_code }));
  }
  async function createInspection(batchId: string) { if (!supabase || !org || !rows.profiles[0]) return; await perform(async () => { const { error } = await supabase!.rpc('create_inspection', { p_batch_id: batchId, p_quality_profile_id: rows.profiles[0].id }); if (error) throw error; }, w.msg.inspectionDraft); }
  async function submitInspection(event: FormEvent, inspection: DbRow) {
    event.preventDefault(); if (!supabase) return;
    const rules = inspection.specification_snapshot?.measurements || [];
    const values = rules.map((rule: any) => ({ key: rule.key, value: Number(measurements[inspection.id]?.[rule.key] ?? inspection.measurements?.find((item: any) => item.key === rule.key)?.value) }));
    if (values.some((item: any) => !Number.isFinite(item.value))) { setFailure(w.msg.measureInvalid); return; }
    await perform(async () => {
      const draft = await supabase!.rpc('save_inspection_draft', { p_inspection_id: inspection.id, p_measurements: values, p_notes: inspection.notes || '' }); if (draft.error) throw draft.error;
      const submitted = await supabase!.rpc('submit_inspection', { p_inspection_id: inspection.id }); if (submitted.error) throw submitted.error;
    }, w.msg.measureSaved);
  }
  async function reviewInspection(inspectionId: string, decision: 'approved' | 'rejected') { if (!supabase) return; await perform(async () => { const { error } = await supabase!.rpc('review_inspection', { p_inspection_id: inspectionId, p_decision: decision, p_notes: null }); if (error) throw error; }, decision === 'approved' ? w.msg.reviewApproved : w.msg.reviewRejected); }
  async function inviteMember(event: FormEvent) {
    event.preventDefault(); if (!session || !org) return;
    await perform(async () => {
      const response = await fetch(`${API}/api/organizations/${org.id}/invitations`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: memberEmail, role: memberRole }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || w.msg.inviteFail);
      setMemberEmail(''); await refreshMembers();
    }, w.msg.inviteSent);
  }
  async function changeMemberRole(userId: string, role: string) {
    if (!session || !org) return;
    await perform(async () => { const response = await fetch(`${API}/api/organizations/${org.id}/members/${userId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || w.msg.roleFail); await refreshMembers(); }, w.msg.roleUpdated);
  }
  async function removeMember(member: TeamMember) {
    if (!session || !org || member.role === 'owner') return;
    if (!window.confirm(fill(w.msg.confirmMember, { who: member.email || member.user_id }))) return;
    await perform(async () => { const response = await fetch(`${API}/api/organizations/${org.id}/members/${member.user_id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` } }); const body = await response.json(); if (!response.ok) throw new Error(body.error || w.msg.memberFail); await refreshMembers(); }, w.msg.memberRemoved);
  }
  async function revokeProof(proof: DbRow) {
    if (!session || !window.ethereum) { setFailure(w.msg.mmMissing || "Metamask diperlukan."); return; }
    if (!window.confirm(fill(w.msg.confirmRevoke, { id: proof.public_id }))) return;
    await perform(async () => {
      const reasonText = "Pencabutan oleh pengguna";
      const payloadRes = await fetch(`${API}/api/proofs/${proof.id}/revoke-payload?reason=${encodeURIComponent(reasonText)}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await payloadRes.json();
      if (!payloadRes.ok) throw new Error(payload.error || w.msg.revokeFail);
      
      const accounts = await window.ethereum!.request({ method: 'eth_requestAccounts' }) as string[];
      const attester = accounts[0];
      const MAX_DEADLINE_SECONDS = 15 * 60; // Maksimal 15 menit
      const deadline = Math.floor(Date.now() / 1000) + MAX_DEADLINE_SECONDS;

      const typedData = {
        domain: payload.domain,
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" }
          ],
          Revoke: [
            { name: "proofId", type: "bytes32" },
            { name: "reasonHash", type: "bytes32" },
            { name: "deadline", type: "uint256" }
          ]
        },
        primaryType: "Revoke",
        message: {
          proofId: payload.proofId,
          reasonHash: payload.reasonHash,
          deadline
        }
      };

      const signature = await window.ethereum!.request({
        method: 'eth_signTypedData_v4',
        params: [attester, JSON.stringify(typedData)]
      });

      const response = await fetch(`${API}/api/proofs/${proof.id}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reasonHash: payload.reasonHash, signature, deadline })
      });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || w.msg.revokeFail);
      setExplorerLink(body.explorerUrl || '');
    }, w.msg.revoked);
  }
  async function uploadEvidence(inspection: DbRow, file?: File) {
    if (!supabase || !org || !session || !file) return;
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setFailure(w.msg.uploadInvalid); return; }
    
    if (!window.ethereum) { setFailure(w.msg.mmMissing); return; }
    
    await perform(async () => {
      // 1. Derivasi KEK dari wallet (HKDF) dan pastikan recovery passphrase tersedia
      const accounts = (await window.ethereum!.request({ method: 'eth_requestAccounts' })) as string[];
      const kekWallet = await deriveKeyFromWallet(accounts[0]);
      
      let recoveryPassphrase = recoveryPassphraseSession;
      if (!recoveryPassphrase) {
        recoveryPassphrase = window.prompt('Masukkan Frasa Sandi Pemulihan (Recovery Passphrase) darurat untuk membungkus DEK berkas:') || '';
        try {
          validateRecoveryPassphrase(recoveryPassphrase);
        } catch (err: any) {
          throw new Error(`${err.message} Frasa sandi hanya untuk pemulihan milik Anda sendiri, bukan untuk verifikator.`);
        }
        setRecoveryPassphraseSession(recoveryPassphrase);
      }

      // 2. Pola Envelope Encryption: Enkripsi berkas menggunakan DEK acak, bungkus DEK dengan KEK Wallet & Recovery Passphrase
      const fileBytes = await file.arrayBuffer();
      const { payload, fileHmac, fileSalt, wrappedKeyMeta, dek } = await encryptFileEnvelope(fileBytes, {
        kekWallet,
        walletAccount: accounts[0],
        recoveryPassphrase,
      });

      // 3. Enkripsi nama berkas asli (original_name) di sisi klien dengan DEK (tidak pernah simpan nama asli dalam plaintext)
      const encryptedName = await encryptFileName(file.name, dek);
      const originalNameMeta = `${encryptedName}#salt=${fileSalt}#meta=${encodeURIComponent(JSON.stringify(wrappedKeyMeta))}`;

      const encryptedBlob = new Blob([payload], { type: 'application/octet-stream' });
      
      // 4. Unggah ciphertext ke backend dengan nama anonim (Pinata IPFS)
      const formData = new FormData();
      formData.append('file', encryptedBlob, `evidence-${fileHmac.slice(0, 12)}.enc`);
      
      const response = await fetch(`${API}/api/evidence`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData
      });
      
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Gagal mengunggah file.');
      
      // 5. Simpan ke database: original_name terenkripsi, sha256 diisi HMAC (TIDAK ADA plaintextSha256)
      const inserted = await supabase!.from('evidence_files').insert({
        organization_id: org.id,
        inspection_id: inspection.id,
        cid: body.cid,
        original_name: originalNameMeta,
        mime_type: 'application/octet-stream',
        byte_size: encryptedBlob.size,
        sha256: `\\x${fileHmac}`,
        uploaded_by: session.user.id
      });
      
      if (inserted.error) throw inserted.error;
    }, w.msg.evidenceSaved);
  }
  async function createProof(inspectionId: string) {
    if (!session || !org || !supabase || !window.ethereum) { setFailure(w.msg.mmMissing); return; }
    const client = supabase;
    const ethereumProvider = window.ethereum;
    await perform(async () => {
      const { data: inspection, error: inspectionError } = await client.from('inspections')
        .select('id,batch_id,status,measurements,specification_snapshot,result_summary')
        .eq('id', inspectionId).eq('organization_id', org.id).single();
      if (inspectionError) throw inspectionError;
      if (inspection.status !== 'approved') throw new Error(w.msg.proofFail);
      const { data: batch, error: batchError } = await client.from('batches')
        .select('id,batch_code,material_id,supplier_id').eq('id', inspection.batch_id).eq('organization_id', org.id).single();
      if (batchError) throw batchError;
      const [materialResult, supplierResult, evidenceResult] = await Promise.all([
        batch.material_id ? client.from('materials').select('name').eq('id', batch.material_id).single() : Promise.resolve({ data: null, error: null }),
        batch.supplier_id ? client.from('suppliers').select('name').eq('id', batch.supplier_id).single() : Promise.resolve({ data: null, error: null }),
        client.from('evidence_files').select('cid,sha256').eq('organization_id', org.id).eq('inspection_id', inspectionId),
      ]);
      if (materialResult.error) throw materialResult.error;
      if (supplierResult.error) throw supplierResult.error;
      if (evidenceResult.error) throw evidenceResult.error;

      const proofRowId = crypto.randomUUID();
      const publicBytes = crypto.getRandomValues(new Uint8Array(8));
      const publicId = `PANDU-${Array.from(publicBytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
      const leaves: MerkleLeaf[] = [
        { path: 'proofId', value: publicId, salt: Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('') },
        { path: 'batchRef', value: String(batch.batch_code), salt: Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('') },
        { path: 'material', value: String(materialResult.data?.name || 'Belum ditentukan'), salt: Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('') },
        { path: 'supplier', value: String(supplierResult.data?.name || 'Belum ditentukan'), salt: Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('') },
        { path: 'inspection.result', value: String(inspection.result_summary?.result || 'PASS'), salt: Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('') },
      ];
      for (const measurement of inspection.measurements || []) {
        const safePath = `measurement.${String(measurement.key).replace(/[^A-Za-z0-9._-]/g, '_')}`;
        leaves.push({ path: safePath, value: String(measurement.value), salt: Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('') });
      }
      for (const [index, evidence] of (evidenceResult.data || []).entries()) {
        leaves.push({ path: `evidence.${index}.cid`, value: String(evidence.cid), salt: Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('') });
        leaves.push({ path: `evidence.${index}.hash`, value: String(evidence.sha256), salt: Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('') });
      }
      const accounts = await ethereumProvider.request({ method: 'eth_requestAccounts' }) as string[];
      const walletKek = await deriveKeyFromWallet(accounts[0]);
      let recoveryPassphrase = recoveryPassphraseSession;
      if (!recoveryPassphrase) {
        recoveryPassphrase = window.prompt('Masukkan frasa pemulihan minimal 12 karakter untuk proof ini:') || '';
        validateRecoveryPassphrase(recoveryPassphrase);
        setRecoveryPassphraseSession(recoveryPassphrase);
      }
      const { root: merkleRoot, privateEnvelope } = await createEncryptedProofCommitment({
        organizationId: org.id, proofRowId, publicId, leaves, walletKek,
        walletAccount: accounts[0], recoveryPassphrase,
      });
      const batchRefHash = keccak256(toUtf8Bytes(`PANDU:${org.id}:${batch.batch_code}`));
      const response = await fetch(`${API}/api/organizations/${org.id}/proofs`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionId, proofRowId, publicId, merkleRoot, batchRefHash, disclosedPaths: [], privateEnvelope }),
      });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || w.msg.proofFail);
    }, w.msg.proofCreated);
  }
  async function anchorProof(proofId: string) {
    if (!session || !window.ethereum) { setFailure(w.msg.mmMissing || "Metamask diperlukan."); return; }
    await perform(async () => {
      const payloadRes = await fetch(`${API}/api/proofs/${proofId}/sign-payload`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await payloadRes.json();
      if (!payloadRes.ok) throw new Error(payload.error || w.msg.anchorFail);
      
      // 1. Verifikasi integritas: Hitung ulang evidenceHash dari snapshot secara mandiri di klien
      const { data: proofRow, error: proofRowError } = await supabase!.from('quality_proofs').select('organization_id,private_snapshot_ciphertext').eq('id', proofId).single();
      if (proofRowError || !proofRow?.private_snapshot_ciphertext) throw new Error(w.msg.keyUnavailable || 'Kunci proof tidak tersedia.');
      const accounts = await window.ethereum!.request({ method: 'eth_requestAccounts' }) as string[];
      const walletKek = await deriveKeyFromWallet(accounts[0]);
      const proofBundle = await openEncryptedProofCommitment({
        organizationId: proofRow.organization_id, proofRowId: proofId,
        envelope: proofRow.private_snapshot_ciphertext, walletKek, walletAccount: accounts[0],
      });
      const localEvidenceHash = proofBundle.root;
      if (localEvidenceHash.toLowerCase() !== payload.evidenceHash.toLowerCase()) {
        throw new Error(
          `Integritas snapshot DITOLAK! evidenceHash lokal (${localEvidenceHash}) berbeda dari hash backend (${payload.evidenceHash}). Penandatanganan dibatalkan demi keamanan.`
        );
      }

      // 2. Tampilkan snapshot ke pengguna untuk konfirmasi eksplisit sebelum meminta tanda tangan MetaMask
      const confirmReview = window.confirm(
        `[PANDU v2] TINJAU SNAPSHOT SEBELUM PENANDATANGANAN ON-CHAIN:\n\n` +
        `Nomor Bukti : ${payload.snapshot.proofId}\n` +
        `Batch       : ${payload.snapshot.batchRef}\n` +
        `Material    : ${payload.snapshot.material}\n` +
        `Pemasok     : ${payload.snapshot.supplier}\n` +
        `Hasil QC    : ${payload.snapshot.inspection?.result || 'PASS'}\n` +
        `Lampiran    : ${payload.snapshot.evidence?.length || 0} berkas (HMAC terverifikasi)\n` +
        `evidenceHash: ${localEvidenceHash}\n\n` +
        `Apakah Anda menyetujui snapshot ini untuk ditandatangani via wallet Anda?`
      );
      if (!confirmReview) {
        throw new Error('Penandatanganan dibatalkan oleh pengguna setelah meninjau snapshot.');
      }

      const accounts = await window.ethereum!.request({ method: 'eth_requestAccounts' }) as string[];
      const attester = accounts[0];
      const MAX_DEADLINE_SECONDS = 15 * 60; // Maksimal 15 menit
      const deadline = Math.floor(Date.now() / 1000) + MAX_DEADLINE_SECONDS;
      
      const typedData = {
        domain: payload.domain,
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" }
          ],
          Anchor: [
            { name: "proofId", type: "bytes32" },
            { name: "batchRef", type: "bytes32" },
            { name: "evidenceHash", type: "bytes32" },
            { name: "attester", type: "address" },
            { name: "deadline", type: "uint256" }
          ]
        },
        primaryType: "Anchor",
        message: {
          proofId: payload.proofId,
          batchRef: payload.batchRef,
          evidenceHash: payload.evidenceHash,
          attester,
          deadline
        }
      };
      
      const signature = await window.ethereum!.request({
        method: 'eth_signTypedData_v4',
        params: [attester, JSON.stringify(typedData)]
      });
      
      const response = await fetch(`${API}/api/proofs/${proofId}/anchor`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature, attester, deadline })
      });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || w.msg.anchorFail);
    }, w.msg.anchored);
  }
  async function openEvidence(path: string) {
    if (!supabase) return;
    const { data, error } = await supabase.storage.from('quality-evidence').createSignedUrl(path, 60);
    if (error) { setFailure(error.message); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }
  async function connectWallet() {
    if (!window.ethereum || !session) { setFailure(w.msg.mmMissing); return; }
    setWalletBusy(true); setFailure('');
    try {
      const accounts = await window.ethereum!.request({ method: 'eth_requestAccounts' }) as string[];
      const chainHex = await window.ethereum!.request({ method: 'eth_chainId' }) as string;
      const chainId = Number.parseInt(chainHex, 16);
      if (![421614, 42161].includes(chainId)) throw new Error(w.msg.mmNetwork);
      const token = session.access_token;
      const challengeResponse = await fetch(`${API}/api/wallet/link/challenge`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ address: accounts[0], chainId }) });
      const challenge = await challengeResponse.json(); if (!challengeResponse.ok) throw new Error(challenge.error || w.msg.challengeFail);
      const signature = await window.ethereum!.request({ method: 'personal_sign', params: [challenge.message, accounts[0]] });
      const verifyResponse = await fetch(`${API}/api/wallet/link/verify`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId: challenge.challengeId, message: challenge.message, signature }) });
      const result = await verifyResponse.json(); if (!verifyResponse.ok) throw new Error(result.error || w.msg.verifyFail);
      await refresh(); setNotice(fill(w.msg.walletConnected, { addr: `${String(result.address).slice(0, 6)}…${String(result.address).slice(-4)}` }));
    } catch (error) { setFailure(errorText(error, w)); } finally { setWalletBusy(false); }
  }
  async function disconnectWallet(wallet: DbRow) {
    if (!supabase || !session || !window.confirm(fill(w.msg.confirmDisconnect, { addr: `${wallet.address.slice(0, 8)}…${wallet.address.slice(-5)}` }))) return;
    await perform(async () => { const { error } = await supabase!.from('user_wallets').delete().eq('id', wallet.id).eq('user_id', session.user.id); if (error) throw error; }, w.msg.walletDisconnected);
  }

  useEffect(() => { if (orgsReady && !session && !failure) window.location.replace('/login'); }, [orgsReady, session, failure]);

  const matchingBatches = useMemo(() => rows.batches.filter((row) => `${row.batch_code} ${row.materials?.name || ''} ${row.suppliers?.name || ''}`.toLowerCase().includes(search.toLowerCase())), [rows.batches, search]);
  const openInspectionBatches = useMemo(() => new Set(rows.inspections.filter((item) => item.status !== 'approved').map((item) => item.batch_id)), [rows.inspections]);
  const signOut = () => { void supabase?.auth.signOut(); window.location.href = '/'; };
  if (!supabaseConfigured || !supabase) return <SetupGate w={w} />;
  if (!orgsReady) return <div className="p-auth-state p-auth-loading" role="status" aria-live="polite" aria-busy="true"><span className="p-auth-spinner" aria-hidden="true" /><p>{w.gate.checking}</p></div>;
  if (failure && !session) return <div className="p-auth-state"><CircleHelp size={25} /><h1>{w.gate.bootstrapErrorTitle}</h1><p>{failure}</p><button className="p-button p-button-outline" onClick={() => window.location.reload()}>{w.gate.retry}</button></div>;
  if (!session) return <div className="p-auth-state"><ShieldCheck size={26} /><h1>{w.gate.signInTitle}</h1><p>{w.gate.signInText}</p><a className="p-button p-button-primary" href="/login">{w.gate.signInCta} <ArrowRight size={16} /></a></div>;
  if (failure && !orgs.length) return <div className="p-auth-state"><CircleHelp size={25} /><h1>{w.gate.orgError}</h1><p>{failure}</p><button className="p-button p-button-outline" onClick={() => window.location.reload()}>{w.gate.retry}</button></div>;
  if (!org) return (
    <div className="p-onboarding">
      <div className="p-onboarding-brand"><Logo dark={mode === 'dark'} /></div>
      <form className="p-onboarding-card" onSubmit={(event) => void createOrganization(event)}>
        <div className="p-onboarding-step"><span className="p-onboarding-step-icon"><Factory size={17} /></span><span>{w.gate.onbKicker}</span></div>
        <h1>{w.gate.onbTitle}</h1>
        <p className="p-onboarding-intro">{w.gate.onbText}</p>
        <div className="p-onboarding-fields">
          <label className="p-onboarding-field">
            <span>{w.gate.onbName}</span>
            <input aria-describedby="onboarding-name-hint" required minLength={2} maxLength={160} value={orgName} onChange={e => setOrgName(e.target.value)} placeholder={w.gate.onbNamePh} />
            <small id="onboarding-name-hint">{w.gate.onbNameHint}</small>
          </label>
          <label className="p-onboarding-field">
            <span>{w.gate.onbIndustry}</span>
            <ModernSelect value={industry} onChange={setIndustry} aria-label={w.gate.onbIndustry} options={[ {value: 'general', label: w.gate.industry.general}, {value: 'agriculture', label: w.gate.industry.agriculture}, {value: 'manufacturing', label: w.gate.industry.manufacturing}, {value: 'food', label: w.gate.industry.food}, {value: 'construction', label: w.gate.industry.construction} ]} />
            <small>{w.gate.onbIndustryHint}</small>
          </label>
        </div>
        {failure && <p className="p-login-note">{failure}</p>}
        <button className="p-button p-button-primary p-onboarding-submit" disabled={busy}>{busy ? w.gate.onbSaving : w.gate.onbSubmit} <ArrowRight size={17} /></button>
        <div className="p-onboarding-privacy"><LockKeyhole size={15} /><span>{w.gate.onbPrivacy}</span></div>
      </form>
    </div>
  );
  const orgNameDisplay = org.name;
  const title = (w.pages as Record<string, string>)[page] || w.pages.overview;
  const description = (w.desc as Record<string, string>)[page] || w.desc.overview;
  const awaitingInspections = rows.inspections.filter(i => i.status === 'submitted').length;
  const canManageRecords = ['owner', 'admin', 'qc'].includes(org.role);
  const canReviewInspections = ['admin', 'qa'].includes(org.role);
  const canManageSettings = ['owner', 'admin'].includes(org.role);
  const canAnchorProofs = ['owner', 'admin', 'qa'].includes(org.role);
  const visible: Record<string, boolean> = {
    overview: true, products: true, standards: true, batches: true, inspection: true, suppliers: true, proofs: true,
    team: true,
    activity: ['owner', 'admin', 'auditor'].includes(org.role),
    guide: true, settings: true, profile: true,
  };
  const menuGroups = [
    { label: w.nav.gOverview, ids: ['overview'] },
    { label: w.nav.gData, ids: ['products', 'batches', 'suppliers'] },
    { label: w.nav.gQuality, ids: ['standards', 'inspection'] },
    { label: w.nav.gProof, ids: ['proofs', 'activity'] },
    { label: w.nav.gOrg, ids: ['team'] },
    { label: w.nav.gAccount, ids: ['guide', 'settings', 'profile'] },
  ].map(group => ({ label: group.label, ids: group.ids.filter(id => visible[id]) })).filter(group => group.ids.length > 0);
  const paletteResults = [
    ...menuGroups.flatMap(group => group.ids.map(id => ({ id, label: w.nav.items[id as keyof typeof w.nav.items], group: group.label, href: id === 'overview' ? '/workspace' : `/workspace/${id}` }))),
    ...rows.batches.map(row => ({ id: `batch-${row.id}`, label: `${row.batch_code} · ${row.materials?.name || ''}`, group: w.nav.items.batches, href: '/workspace/batches' })),
    ...rows.materials.map(row => ({ id: `product-${row.id}`, label: row.name, group: w.nav.items.products, href: '/workspace/products' })),
    ...rows.suppliers.map(row => ({ id: `supplier-${row.id}`, label: row.name, group: w.nav.items.suppliers, href: '/workspace/suppliers' })),
    ...rows.inspections.map(row => ({ id: `inspection-${row.id}`, label: `${row.batches?.batch_code || ''} · ${row.status}`, group: w.nav.items.inspection, href: '/workspace/inspection' })),
    ...rows.proofs.map(row => ({ id: `proof-${row.id}`, label: row.public_id || row.id, group: w.nav.items.proofs, href: '/workspace/proofs' })),
  ];
  const filteredPaletteResults = paletteResults.filter(item => !search || item.label.toLowerCase().includes(search.toLowerCase()) || item.group.toLowerCase().includes(search.toLowerCase()));
  const empty = (text: string, href = '/workspace/products', action = w.empty.action) => <div className="p-db-empty"><Boxes size={24} /><strong>{w.empty.title}</strong><span>{text}</span><a className="p-button p-button-outline" href={href}>{action} <ArrowRight size={14}/></a></div>;
  const table = (headers: string[], content: ReactNode) => <div className="p-table-wrap"><table><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{content}</tbody></table></div>;
  const batchTable = (records: DbRow[]) => table([w.tbl.batchCode, w.tbl.supplier, w.tbl.status, w.tbl.created, w.tbl.inspection], records.map(row => <tr key={row.id}><td><strong>{row.materials?.name || w.tbl.noProduct}</strong><small>{row.batch_code}</small>{!row.material_id && canManageRecords && rows.materials.length > 0 && <ModernSelect className="ms-sm" aria-label={fill(w.tbl.pickProductAria, { code: row.batch_code })} value="" disabled={busy} onChange={val => void assignBatchProduct(row, val)} placeholder={w.tbl.pickProduct} options={rows.materials.map(m => ({value: m.id, label: m.name}))} />}</td><td>{row.suppliers?.name || w.tbl.noSupplier}</td><td><Status tone={row.status === 'accepted' ? 'good' : row.status === 'rejected' ? 'review' : 'pending'}>{row.status}</Status></td><td>{displayDate(row.created_at, lang)}</td><td>{openInspectionBatches.has(row.id) ? <a className="p-row-link" href="/workspace/inspection">{w.tbl.openInspection} <ArrowRight size={13} /></a> : <button className="p-row-link" onClick={() => void createInspection(row.id)} disabled={!canManageRecords || !rows.profiles.length || busy}>{rows.profiles.length ? w.tbl.makeInspection : w.tbl.stdFirst}</button>}</td></tr>));

  const chainText = !chainHealth?.ok
    ? w.top.netDown
    : `${chainHealth.chainLabel || 'Arbitrum'}${!chainHealth.configured ? ` · ${w.top.noContract}` : chainHealth.chainId === 42161 ? (chainHealth.writesEnabled ? ` · ${w.top.txLive}` : ` · ${w.top.readOnly}`) : ` · ${w.top.linked}`}`;
  const syncText = loading ? w.top.syncing : failure ? w.top.check : w.top.synced;

  return <div className="p-workspace">
    <aside className="p-sidebar" aria-label={w.nav.openNav}>
      
      <div className="ws-org" data-ws-pop>
        <button type="button" onClick={() => setOrgDropdownOpen(o => !o)} aria-expanded={orgDropdownOpen} className={`ws-org-trigger${orgDropdownOpen ? ' is-open' : ''}`}>
          <span className="ws-org-badge">{orgNameDisplay.slice(0, 2).toUpperCase()}</span>
          <span className="ws-org-meta">
            <strong>{orgNameDisplay}</strong>
            <small><em className="ws-role-chip">{org.role}</em> {w.nav.activeOrg}</small>
          </span>
          <ChevronDown size={16} className={`ws-chev${orgDropdownOpen ? ' is-open' : ''}`} />
        </button>
        <AnimatePresence>
          {orgDropdownOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="ws-pop ws-org-menu"
            >
              <div className="ws-pop-body">
                {orgs.map(item => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      localStorage.setItem('PANDU.active-organization', item.id);
                      setOrg(orgs.find(o => o.id === item.id) || null);
                      setOrgDropdownOpen(false);
                    }}
                    className={`ws-pop-item ws-org-item${item.id === org.id ? ' is-active' : ''}`}
                  >
                    <span className="ws-org-badge sm">{item.name.slice(0, 2).toUpperCase()}</span>
                    <span className="ws-org-meta"><strong>{item.name}</strong><small><em className="ws-role-chip">{item.role}</em></small></span>
                    {item.id === org.id && <Check size={14} className="ws-org-check" />}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <nav className="p-nav-scroll" aria-label={w.nav.openNav}>
        {menuGroups.map(group => {
          const first = group.ids[0]; const Icon = NAV_ICONS[first]; const active = group.ids.includes(page);
          return <div key={group.label} className={`p-rail-item${active ? ' active' : ''}${mobileRailMenu === group.label ? ' is-mobile-open' : ''}`}>
            <a href={first === 'overview' ? '/workspace' : `/workspace/${first}`} className="p-rail-link" aria-label={group.label} aria-expanded={group.ids.length > 1 ? mobileRailMenu === group.label : undefined} aria-current={active ? 'page' : undefined} onClick={event => { if (window.innerWidth < 768 && group.ids.length > 1) { event.preventDefault(); setMobileRailMenu(current => current === group.label ? null : group.label); } }}><Icon size={19}/><span className="p-rail-label">{group.label}</span></a>
            {group.ids.length > 1 && <div className="p-rail-submenu" role="menu" aria-label={group.label}>{group.ids.map(id => <a role="menuitem" key={id} href={`/workspace/${id}`} onClick={() => setMobileRailMenu(null)} aria-current={page === id ? 'page' : undefined}>{w.nav.items[id as keyof typeof w.nav.items]}{id === 'inspection' && awaitingInspections > 0 && <span className="p-nav-count">{awaitingInspections}</span>}</a>)}</div>}
          </div>;
        })}
      </nav>
    </aside>
    {sidebarOpen && <button className="p-sidebar-scrim md:hidden" aria-label={w.nav.closeNav} onClick={() => setSidebarOpen(false)} />}
    <div className={`p-workspace-main transition-[margin-left,width] duration-300 ease-in-out ${sidebarOpen ? '' : '!ml-0 !w-full'}`}>
      <header className="p-work-top">
        <div className="p-top-brand"><Brand /></div>
        <div className="p-search-field"><Search size={18}/><input aria-label={w.top.searchAria} placeholder={w.top.search} onFocus={() => setPaletteOpen(true)} onClick={() => setPaletteOpen(true)} readOnly/><kbd>Ctrl K</kbd></div>
        <div className="p-top-right">
          <span className={`p-chain-state ${chainHealth?.ok && chainHealth.configured ? 'is-ready' : 'is-warning'}`} title={chainHealth?.error || w.top.netTitle}><i />{chainText}</span>
          <span className={`p-sync-state ${loading ? 'is-syncing' : failure ? 'is-error' : ''}`}><i />{syncText}</span>
          <div className="ws-notif" data-ws-pop>
            <button type="button" className="ws-notif-btn" aria-label="Notifikasi" aria-expanded={notifOpen} onClick={() => setNotifOpen(o => !o)}>
              <Bell size={17} />
              {(failure || !chainHealth?.ok || !chainHealth.configured) && <i className="ws-notif-dot" />}
            </button>
            {notifOpen && (
              <div className="ws-pop ws-notif-menu">
                <div className="ws-pop-body"><strong className="ws-pop-title">{lang === 'id' ? 'Aktivitas terbaru' : 'Recent activity'}</strong>
                  {auditEvents.slice(0, 5).map(event => <div className="ws-notif-row ws-activity-row" key={event.id}><strong>{w.activity.actions[event.action] || event.action}</strong><small>{displayDate(event.created_at, lang)}</small></div>)}
                  {!auditEvents.length && <div className="ws-notif-row">{lang === 'id' ? 'Belum ada aktivitas terbaru.' : 'No recent activity.'}</div>}
                  <div className="ws-notif-row"><span className={`p-chain-state ${chainHealth?.ok && chainHealth.configured ? 'is-ready' : 'is-warning'}`}><i />{chainText}</span></div>
                  <div className="ws-notif-row"><span className={`p-sync-state ${loading ? 'is-syncing' : failure ? 'is-error' : ''}`}><i />{syncText}</span></div>
                </div>
              </div>
            )}
          </div>
          <div className="ws-prof" data-ws-pop>
            <button type="button" className="ws-prof-trigger" aria-label={w.nav.openProfile} aria-expanded={profileMenu} onClick={() => setProfileMenu(value => !value)}>
              <span className="ws-prof-avatar">{(session.user.user_metadata?.full_name || session.user.email || 'U').slice(0,1).toUpperCase()}</span>
              <ChevronDown size={14} className={`ws-chev${profileMenu ? ' is-open' : ''}`} />
            </button>
            <AnimatePresence>
            {profileMenu && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="ws-pop ws-prof-menu"
              >
                <div className="ws-prof-head">
                  <span className="ws-prof-avatar lg">{(session.user.user_metadata?.full_name || session.user.email || 'U').slice(0,1).toUpperCase()}</span>
                  <div>
                    <strong>{session.user.user_metadata?.full_name || session.user.email}</strong>
                    <small>{rows.wallets[0]?.address ? `${rows.wallets[0].address.slice(0, 6)}…${rows.wallets[0].address.slice(-4)}` : session.user.email}</small>
                    <em className="ws-role-chip">{org.role}</em>
                  </div>
                </div>
                <div className="ws-pop-body">
                  <a href="/workspace/profile" onClick={() => setProfileMenu(false)} className="ws-pop-item"><UserRound size={15} /> {w.nav.profileLink}</a>
                  <a href="/workspace/settings" onClick={() => setProfileMenu(false)} className="ws-pop-item"><Settings size={15} /> {w.nav.items.settings}</a>
                  <button type="button" className="ws-pop-item" onClick={toggleTheme}>{mode === 'dark' ? <Sun size={15}/> : <Moon size={15}/>} {mode === 'dark' ? w.ctl.toLight : w.ctl.toDark}</button>
                  <div className="ws-pop-item ws-pop-language"><span>{w.ctl.lang}</span><div className="p-ws-switch" role="group" aria-label={w.ctl.lang}><button type="button" className={lang === 'id' ? 'is-on' : ''} aria-pressed={lang === 'id'} onClick={() => setLang('id')}>ID</button><button type="button" className={lang === 'en' ? 'is-on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button></div></div>
                  <button type="button" onClick={signOut} className="ws-pop-item is-danger"><LogOut size={15} /> {w.nav.signOut}</button>
                </div>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </div>
      </header>
      <main className="p-work-content" key={page}>
        <div className="p-work-heading"><div><span className="p-kicker">{w.top.kicker}</span><h1>{page === 'overview' ? fill(w.ov.welcome, { name: session.user.user_metadata?.full_name?.split(' ')[0] || w.ov.friend }) : title}</h1><p>{description}</p></div></div>
        {failure && <div className="p-toast p-toast-error" role="alert"><CircleHelp size={16} />{failure}<button onClick={() => setFailure('')}>{w.top.close}</button></div>}
        {notice && <div className="p-toast" role="status"><CheckCircle2 size={16} />{notice}{explorerLink && <a className="p-toast-link" href={explorerLink} target="_blank" rel="noreferrer">{w.top.viewTx} <ArrowUpRight size={14} /></a>}</div>}
        {loading && <div className="p-db-loading"><LoaderCircle className="p-spin" />{w.top.syncing}…</div>}

        {page === 'overview' && (loading && rows.batches.length + rows.suppliers.length + rows.profiles.length + rows.proofs.length === 0 ? <div className="p-dashboard-skeleton" role="status" aria-label={w.top.syncing}><div className="p-skeleton-banner"/><div className="p-skeleton-metrics">{[0,1,2,3].map(item => <span key={item}/>)}</div><div className="p-skeleton-panel"/></div> : <>
          <div className="p-welcome">
            <div>
              <span className="p-kicker">{w.ov.kicker}</span>
              <h2>{session.user.user_metadata?.full_name?.split(' ')[0] || w.ov.friend}</h2>
              <p>{w.ov.sub}</p>
              <a className="p-button p-button-outline" href="/workspace/batches">{w.ov.seeBatch} <ArrowRight size={15} /></a>
            </div>
            <div className="p-welcome-art">
              <div className="p-orbit-dot"><Layers3 size={30} /></div>
              <span className="p-orbit-tag tag-top">{w.ov.tagTop}</span>
              <span className="p-orbit-tag tag-bottom">{w.ov.tagBottom}</span>
            </div>
          </div>
          <a className="p-overview-guide" href="/workspace/guide"><span><BookOpen size={18} /></span><div><strong>{w.ov.guideTitle}</strong><small>{w.ov.guideText}</small></div><ArrowRight size={16} /></a>
          <div className="p-metric-grid">
            <MetricCard label={w.ov.m1} value={rows.batches.length} note={w.ov.m1s} icon={<Boxes size={14} />} />
            <MetricCard label={w.ov.m2} value={awaitingInspections} note={w.ov.m2s} icon={<ClipboardCheck size={14} />} />
            <MetricCard label={w.ov.m3} value={rows.suppliers.length} note={w.ov.m3s} icon={<Factory size={14} />} />
            <MetricCard label={w.ov.m4} value={rows.proofs.filter(p => p.anchor_status === 'confirmed').length} note={w.ov.m4s} icon={<BadgeCheck size={14} />} />
          </div>
          <section className="p-work-section">
            <div className="p-section-title"><div><h2>{w.ov.recent}</h2><p>{w.ov.recentSub}</p></div><a href="/workspace/batches">{w.ov.allBatch} <ArrowRight size={15} /></a></div>
            {matchingBatches.length ? batchTable(matchingBatches.slice(0, 8)) : empty(w.ov.emptyBatch, '/workspace/batches', w.nav.items.batches)}
          </section>
          <section className="p-work-section p-latest-proof">
            <div className="p-section-title"><div><h2>{w.ov.std}</h2><p>{w.ov.stdSub}</p></div><a href="/workspace/standards">{w.ov.setStd} <ArrowRight size={15} /></a></div>
            {rows.profiles.length ? rows.profiles.map(profile => <p key={profile.id}><strong>{profile.name}</strong> · {(profile.rules?.measurements || []).map((m: any) => `${m.label} ${m.min}–${m.max} ${m.unit}`).join(', ')}</p>) : empty(w.ov.emptyStd, '/workspace/standards', w.nav.items.standards)}
          </section>
        </>)}

        {page === 'products' && <>
          {canManageRecords && <form className="p-db-form p-inline-form" onSubmit={e => void addMaterial(e)}><h2>{w.products.addTitle}</h2><label>{w.products.name}<input required minLength={2} maxLength={160} value={newMaterial} onChange={e => setNewMaterial(e.target.value)} placeholder={w.products.namePh} /></label><button className="p-button p-button-primary" disabled={busy}>{w.products.save}</button></form>}
          {rows.materials.length ? table([w.tbl.product, w.tbl.category, w.tbl.related], rows.materials.filter(m => m.name.toLowerCase().includes(search.toLowerCase())).map(m => <tr key={m.id}><td><strong>{m.name}</strong></td><td>{displayCategory(m.category || w.products.general)}</td><td>{rows.batches.filter(b => b.material_id === m.id).length}</td></tr>)) : <div className="p-db-empty"><PackagePlus size={24}/><strong>{w.products.emptyTitle}</strong><span>{w.products.emptyText}</span>{canManageRecords && <a className="p-button p-button-outline" href="/workspace/products">{w.empty.action} <ArrowRight size={14}/></a>}</div>}
        </>}

        {page === 'standards' && <>
          {canManageSettings && <form className="p-db-form p-inline-form p-standard-form" onSubmit={addProfile}><h2>{w.standards.addTitle}</h2><label>{w.standards.param}<input required value={parameter} onChange={e => setParameter(e.target.value)} placeholder={w.standards.paramPh} /></label><label>{w.standards.min}<input type="number" step="any" required value={minimum} onChange={e => setMinimum(e.target.value)} /></label><label>{w.standards.max}<input type="number" step="any" required value={maximum} onChange={e => setMaximum(e.target.value)} /></label><label>{w.standards.unit}<input required value={unit} onChange={e => setUnit(e.target.value)} placeholder={w.standards.unitPh} /></label><button className="p-button p-button-primary" disabled={busy}>{w.standards.save}</button></form>}
          {!canManageSettings && <p className="p-settings-readonly">{w.standards.readonly}</p>}
          {rows.profiles.length ? <div className="p-profile-standards">{rows.profiles.map(profile => <article key={profile.id}><SlidersHorizontal size={18}/><div><strong>{profile.name}</strong><span>{(profile.rules?.measurements || []).map((m: any) => `${m.label} ${m.min}–${m.max} ${m.unit}`).join(' | ')}</span></div><Status>{w.standards.active}</Status></article>)}</div> : empty(w.standards.empty, '/workspace/standards', w.nav.items.standards)}
        </>}

        {page === 'batches' && <>
          <div className="p-toolbar"><label className="p-table-search"><Search size={16} /><input placeholder={w.batches.search} value={search} onChange={e => setSearch(e.target.value)} /></label></div>
          {canManageRecords && <form className="p-db-form p-inline-form" onSubmit={e => void addBatch(e)}><h2>{w.batches.addTitle}</h2><label>{w.batches.code}<input required minLength={2} maxLength={64} pattern="[A-Za-z0-9][A-Za-z0-9._/-]{1,63}" title={w.batches.codeTitle} value={newCode} onChange={e => setNewCode(e.target.value)} placeholder={w.batches.codePh} /></label><label>{w.batches.product}<ModernSelect required value={newBatchMaterial} onChange={setNewBatchMaterial} placeholder={rows.materials.length ? w.batches.pickProduct : w.batches.noProduct} options={rows.materials.map(m => ({value: m.id, label: m.name}))} /></label><label>{w.batches.supplier}<ModernSelect value={newBatchSupplier} onChange={setNewBatchSupplier} placeholder={w.batches.pickSupplier} options={[{value: '', label: w.batches.pickSupplier}, ...rows.suppliers.map(s => ({value: s.id, label: s.name}))]} /></label><button className="p-button p-button-primary" disabled={busy || !rows.materials.length}>{w.batches.save}</button>{!rows.materials.length && <a className="p-inline-hint" href="/workspace/products">{w.batches.hint} <ArrowRight size={14}/></a>}</form>}
          {matchingBatches.length ? batchTable(matchingBatches) : empty(w.batches.empty, '/workspace/batches', w.nav.items.batches)}
        </>}

        {page === 'inspection' && <>
          <div className="p-section-title"><div><h2>{w.inspection.title}</h2><p>{w.inspection.sub}</p></div></div>
          {rows.inspections.length ? <div className="p-inspection-list">{rows.inspections.map((inspection) => {
            const rules = inspection.specification_snapshot?.measurements || [];
            const existingProof = rows.proofs.find(p => p.inspection_id === inspection.id);
            return <article className="p-inspection-card" key={inspection.id}>
              <div className="p-inspection-card-head"><div><span className="p-kicker">{inspection.batches?.batch_code || 'BATCH'}</span><h2>{inspection.batches?.materials?.name || inspection.batches?.batch_code}</h2><p>{inspection.batches?.suppliers?.name || w.tbl.noSupplier}</p></div><Status tone={inspection.status === 'approved' ? 'good' : inspection.status === 'rejected' ? 'review' : 'pending'}>{inspection.status}</Status></div>
              {inspection.status === 'draft' || inspection.status === 'rejected' ? (canManageRecords
                ? <form onSubmit={event => void submitInspection(event, inspection)}>
                    <div className="p-inspection-fields">{rules.map((rule: any) => <label key={rule.key}>{rule.label}<span className="p-measure-input"><input type="number" step="any" required value={measurements[inspection.id]?.[rule.key] ?? inspection.measurements?.find((m: any) => m.key === rule.key)?.value ?? ''} onChange={event => setMeasurements(current => ({ ...current, [inspection.id]: { ...current[inspection.id], [rule.key]: event.target.value } }))} /><small>{rule.min}–{rule.max} {rule.unit}</small></span></label>)}</div>
                    <label className="p-upload-inline">{w.inspection.attach}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={event => { void uploadEvidence(inspection, event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
                    <div className="p-work-actions"><button className="p-button p-button-primary" disabled={busy}>{w.inspection.submit} <ArrowRight size={15} /></button></div>
                  </form>
                : <div className="p-inspection-review"><strong>{w.inspection.waitQc}</strong><p>{w.inspection.waitQcText}</p></div>)
              : inspection.status === 'submitted'
                ? <div className="p-inspection-review"><strong>{fill(w.inspection.waitQa, { result: inspection.result_summary?.result || '—' })}</strong><p>{(inspection.result_summary?.checks || []).map((check: any) => `${check.key}: ${check.actual ?? '—'} ${check.unit || ''} (${check.result})`).join(' / ')}</p><button className="p-button p-button-outline" disabled={busy || !canReviewInspections} onClick={() => void reviewInspection(inspection.id, 'approved')}>{w.inspection.approve}</button>{canReviewInspections && <button className="p-button p-button-ghost" disabled={busy} onClick={() => void reviewInspection(inspection.id, 'rejected')}>{w.inspection.reject}</button>}</div>
                : <div className="p-inspection-review"><strong>{inspection.result_summary?.result === 'PASS' ? w.inspection.pass : w.inspection.result}</strong><p>{(inspection.result_summary?.checks || []).map((check: any) => `${check.key}: ${check.actual ?? '—'} ${check.unit || ''} (${check.result})`).join(' / ')}</p>{inspection.status === 'approved' && (existingProof ? <a className="p-button p-button-outline" href="/workspace/proofs">{w.inspection.openProof} <ArrowRight size={15} /></a> : <button className="p-button p-button-primary" disabled={busy || !canAnchorProofs} onClick={() => void createProof(inspection.id)}>{w.inspection.makeProof} <BadgeCheck size={15} /></button>)}</div>}
              {rows.evidence.filter(file => file.inspection_id === inspection.id).length > 0 && <ul className="p-evidence-list">{rows.evidence.filter(file => file.inspection_id === inspection.id).map(file => <li key={file.id}><span>{file.original_name}</span><button type="button" onClick={() => void openEvidence(file.object_path)}>{w.inspection.openFile}</button></li>)}</ul>}
            </article>;
          })}</div> : empty(rows.batches.length ? w.inspection.emptyBatch : w.inspection.empty)}
        </>}

        {page === 'suppliers' && <>
          {canManageRecords && <form className="p-db-form p-inline-form" onSubmit={e => void addSupplier(e)}><h2>{w.suppliers.addTitle}</h2><label>{w.suppliers.name}<input required minLength={2} value={newSupplier} onChange={e => setNewSupplier(e.target.value)} placeholder={w.suppliers.namePh} /></label><button className="p-button p-button-primary" disabled={busy}>{w.suppliers.save}</button></form>}
          {rows.suppliers.length ? <div className="p-supplier-grid">{rows.suppliers.filter(s => s.name.toLowerCase().includes(search.toLowerCase())).map(s => <article key={s.id}><span className="p-supplier-avatar"><Factory size={20} /></span><Status>{s.external_ref || w.suppliers.registered}</Status><h3>{s.name}</h3><p>{displayCategory(s.category || s.attributes?.category || org.industry_key)}</p><div><span>{fill(w.suppliers.batches, { n: rows.batches.filter(b => b.supplier_id === s.id).length })}</span></div></article>)}</div> : empty(w.suppliers.empty, '/workspace/suppliers', w.nav.items.suppliers)}
        </>}

        {page === 'proofs' && <>
          <div className="p-proof-summary">
            <TiltedCard className="p-proof-stat"><BadgeCheck size={21} /><span><strong>{rows.proofs.filter(p => p.anchor_status === 'confirmed').length}</strong><small>{w.proofs.confirmed}</small></span></TiltedCard>
            <TiltedCard className="p-proof-stat"><LockKeyhole size={21} /><span><strong>{rows.proofs.length}</strong><small>{w.proofs.total}</small></span></TiltedCard>
            <TiltedCard className="p-proof-stat"><ShieldCheck size={21} /><span><strong>{w.proofs.separated}</strong><small>{w.proofs.separatedNote}</small></span></TiltedCard>
          </div>
          {rows.proofs.length ? table([w.tbl.proofRef, w.tbl.status, w.tbl.date, w.tbl.qr], rows.proofs.map(p => <tr key={p.id}><td><strong>{p.public_snapshot?.material || 'PANDU'}</strong><small>{p.public_id}</small></td><td><Status tone={p.anchor_status === 'confirmed' ? 'good' : p.anchor_status === 'revoked' || p.anchor_status === 'failed' ? 'review' : 'pending'}>{p.anchor_status}</Status></td><td>{new Date(p.created_at).toLocaleDateString(locale(lang))}</td><td><ProofShareCell proof={p} accessToken={session.access_token} w={w} />{['confirmed', 'revoked'].includes(p.anchor_status) && <button className="p-row-link p-share-row" disabled={busy} onClick={() => setShareProof(p)}><LockKeyhole size={13} /> Akses verifikator</button>}{canAnchorProofs && p.anchor_status !== 'confirmed' && p.anchor_status !== 'revoked' && <button className="p-row-link p-anchor-row" disabled={busy} onClick={() => void anchorProof(p.id)}>{w.proofs.anchor}</button>}{p.anchor_status === 'confirmed' && canAnchorProofs && <button className="p-row-link p-revoke-row" disabled={busy} onClick={() => void revokeProof(p)}><XCircle size={13} /> {w.proofs.revoke}</button>}</td></tr>)) : empty(w.proofs.empty, '/workspace/proofs', w.nav.items.proofs)}
        </>}

        {page === 'team' && <>
          <section className="p-guide-callout"><div><span className="p-kicker">{w.team.kicker}</span><h2>{w.team.title}</h2><p>{w.team.sub}</p></div><Users size={28} aria-hidden="true" /></section>
          
          <OrgChart members={members} />

          <form className="p-db-form p-team-invite" onSubmit={event => void inviteMember(event)}>
            <div><h2>{w.team.inviteTitle}</h2><p>{w.team.inviteText}</p></div>
            <label>{w.team.email}<input type="email" required value={memberEmail} onChange={event => setMemberEmail(event.target.value)} placeholder={w.team.emailPh} /></label>
            <label>{w.team.role}<ModernSelect value={memberRole} onChange={setMemberRole} options={[ {value: 'qc', label: w.team.roleQc}, {value: 'qa', label: w.team.roleQa}, {value: 'auditor', label: w.team.roleAuditor}, ...(org.role === 'owner' ? [{value: 'admin', label: w.team.roleAdmin}] : []) ]} /></label>
            <button className="p-button p-button-primary" disabled={busy}><Send size={15} />{w.team.send}</button>
          </form>
          <section className="p-work-section">
            <div className="p-section-title"><div><h2>{w.team.listTitle}</h2><p>{fill(w.team.listSub, { n: members.length })}</p></div></div>
            {members.length ? <div className="p-team-list">{members.map(member => <article key={member.user_id}>
              <span className="p-user-avatar">{(member.name || member.email || '?').slice(0,1).toUpperCase()}</span>
              <div className="p-team-person"><strong>{member.name || member.email || fill(w.team.fallbackName, { id: member.user_id.slice(0,8) })}</strong><small>{member.email || member.user_id}</small></div>
              <Status tone={member.status === 'active' ? 'good' : 'pending'}>{member.status === 'active' ? w.team.active : w.team.pending}</Status>
              {member.role === 'owner' ? <strong className="p-team-role">{w.team.owner}</strong> : <ModernSelect className="ms-inline" aria-label={fill(w.team.roleAria, { who: member.email || member.user_id })} value={member.role} disabled={busy} onChange={val => void changeMemberRole(member.user_id, val)} options={[ {value: 'admin', label: 'Admin'}, {value: 'qc', label: 'QC'}, {value: 'qa', label: 'QA'}, {value: 'auditor', label: 'Auditor'} ]} />}
              {member.role !== 'owner' && <button className="p-icon-button p-team-remove" aria-label={fill(w.team.removeAria, { who: member.email || member.user_id })} title={w.team.removeTitle} disabled={busy} onClick={() => void removeMember(member)}><XCircle size={17} /></button>}
            </article>)}</div> : empty(w.team.empty, '/workspace/team', w.nav.items.team)}
          </section>
        </>}

        {page === 'activity' && <>
          <section className="p-guide-callout"><div><span className="p-kicker">{w.activity.kicker}</span><h2>{w.activity.title}</h2><p>{w.activity.sub}</p></div><History size={28} aria-hidden="true" /></section>
          {auditEvents.length ? table([w.tbl.time, w.tbl.action, w.tbl.object, w.tbl.actor], auditEvents.map(event => <tr key={event.id}><td>{new Date(event.created_at).toLocaleString(locale(lang))}</td><td><strong>{w.activity.actions[event.action] || event.action}</strong></td><td>{event.entity_type}{event.entity_id ? <small>{event.entity_id.slice(0,8)}</small> : null}{typeof event.details?.transaction_hash === 'string' && <a className="p-audit-tx" href={`${Number(event.details.chain_id) === 42161 ? 'https://arbiscan.io' : 'https://sepolia.arbiscan.io'}/tx/${event.details.transaction_hash}`} target="_blank" rel="noreferrer">{w.activity.viewTx}</a>}</td><td>{event.actor_id ? event.actor_id.slice(0,8) : w.activity.system}</td></tr>)) : empty(w.activity.empty, '/workspace/activity', w.nav.items.activity)}
        </>}

        {page === 'guide' && <>
          <section className="p-guide-hero"><span className="p-guide-mark"><BookOpen size={23} /></span><span className="p-kicker">{w.guide.kicker}</span><h2>{w.guide.title}</h2><p>{w.guide.sub}</p></section>
          <div className="p-guide-steps">{w.guide.steps.map((step, index) => <article key={step.title}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{step.title}</h3><p>{step.text}</p><a href={GUIDE_HREFS[index]}>{step.link} <ArrowRight size={14} /></a></div></article>)}</div>
          <section className="p-feature-grid">{w.guide.feats.map((feat, index) => { const Icon = GUIDE_FEATURE_ICONS[index]; return <article key={feat.title}><Icon size={19} /><h3>{feat.title}</h3><p>{feat.text}</p></article>; })}</section>
          <p className="p-guide-note"><CircleHelp size={15} /> {w.guide.note}</p>
        </>}

        {page === 'settings' && <div className="ws-set">
          <section className="ws-set-hero">
            <span className="ws-set-badge">{org.name.slice(0, 2).toUpperCase()}</span>
            <div className="ws-set-hero-text">
              <span className="p-kicker">{w.settings.kicker}</span>
              <h2>{org.name}</h2>
              <div className="ws-set-chips"><span className="ws-set-chip"><Factory size={13} />{displayCategory(org.industry_key)}</span><span className="ws-role-chip">{org.role}</span></div>
            </div>
          </section>
          <div className="ws-set-grid">
            <a className="ws-set-card" href="/workspace/products"><span className="ws-set-icon"><PackagePlus size={20} /></span><span className="ws-set-body"><strong>{w.settings.manageProducts}</strong><small>{fill(w.settings.productsCount, { n: rows.materials.length })}</small></span><ArrowRight size={16} className="ws-set-go" /></a>
            <a className="ws-set-card" href="/workspace/standards"><span className="ws-set-icon"><SlidersHorizontal size={20} /></span><span className="ws-set-body"><strong>{w.settings.stdTitle}</strong><small>{fill(w.settings.stdCount, { n: rows.profiles.length })}</small></span><ArrowRight size={16} className="ws-set-go" /></a>
            <a className="ws-set-card" href="/workspace/profile"><span className="ws-set-icon"><UserRound size={20} /></span><span className="ws-set-body"><strong>{w.settings.profileWallet}</strong><small>{w.settings.profileWalletNote}</small></span><ArrowRight size={16} className="ws-set-go" /></a>
          </div>
        </div>}

        {page === 'profile' && <div className="p-settings-layout">
          <section className="p-settings-card"><span className="p-kicker">{w.profile.kicker}</span><h2>{w.profile.title}</h2><p>{w.profile.sub}</p><form className="p-db-form p-profile-form" onSubmit={e => void saveProfile(e)}><label>{w.profile.name}<input required minLength={2} maxLength={100} value={profileName} onChange={e => setProfileName(e.target.value)} /></label><span>{session.user.email}</span><button className="p-button p-button-primary" disabled={busy}>{w.profile.save}</button></form></section>
          <section className="p-settings-card p-profile-wallet"><span className="p-kicker">{w.profile.walletKicker}</span><h2>{w.profile.walletTitle}</h2><p>{w.profile.walletSub}</p>
            {rows.wallets.map(wallet => <div className="p-wallet-card" key={wallet.id}><WalletCards size={19}/><div><strong>{wallet.address.slice(0,10)}...{wallet.address.slice(-6)}</strong><small>{fill(w.profile.walletMeta, { net: Number(wallet.chain_id) === 42161 ? 'One' : 'Sepolia', date: displayDate(wallet.verified_at, lang) })}</small></div><button type="button" className="p-wallet-disconnect" disabled={busy} onClick={() => void disconnectWallet(wallet)}><Unplug size={15}/> {w.profile.disconnect}</button></div>)}
            {!rows.wallets.length && <div className="p-wallet-card"><WalletCards size={19}/><div><strong>{w.profile.noneTitle}</strong><small>{w.profile.noneText}</small></div><button type="button" disabled={walletBusy || busy} onClick={() => void connectWallet()}>{walletBusy ? w.profile.waiting : w.profile.connect}</button></div>}
          </section>
        </div>}

        {shareProof && (
          <VerifierShareDialog
            proof={shareProof}
            accessToken={session.access_token}
            orgId={org.id}
            onClose={() => setShareProof(null)}
          />
        )}

    {paletteOpen && <div className="p-palette-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPaletteOpen(false); }}><section className="p-palette" role="dialog" aria-modal="true" aria-label={lang === 'id' ? 'Pencarian PANDU' : 'PANDU search'}><div className="p-palette-input"><Search size={18}/><input autoFocus placeholder={lang === 'id' ? 'Cari halaman atau data' : 'Search pages or data'} value={search} onChange={event => { setSearch(event.target.value); setPaletteIndex(0); }} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setPaletteIndex(index => Math.min(index + 1, filteredPaletteResults.length - 1)); } else if (event.key === 'ArrowUp') { event.preventDefault(); setPaletteIndex(index => Math.max(index - 1, 0)); } else if (event.key === 'Enter' && filteredPaletteResults[paletteIndex]) window.location.href = filteredPaletteResults[paletteIndex].href; }}/><kbd>ESC</kbd></div><div className="p-palette-results" role="listbox">{filteredPaletteResults.map((item, index) => <a key={item.id} role="option" aria-selected={index === paletteIndex} className={index === paletteIndex ? 'is-selected' : ''} href={item.href}><span>{item.label}</span><small>{item.group}</small></a>)}{!filteredPaletteResults.length && <p>{lang === 'id' ? 'Tidak ada hasil' : 'No results'}</p>}</div></section></div>}
        <footer className="p-work-footer"><span>{w.foot.stored}</span><span>{fill(w.foot.stats, { b: rows.batches.length, s: rows.suppliers.length, p: rows.proofs.length })}</span><a href="/verify">{w.foot.check}</a></footer>
      </main>
    </div>
  </div>;
}

function SetupGate({ w }: { w: Ws }) {
  return <div className="p-auth-state">
    <ShieldCheck size={28} />
    <h1>{w.gate.setupTitle}</h1>
    <p>{w.gate.setupText}</p>
    <ol>{w.gate.setupSteps.map(step => <li key={step}>{step}</li>)}</ol>
    <a href="/login" className="p-button p-button-outline">{w.gate.setupBack}</a>

  </div>;
}
