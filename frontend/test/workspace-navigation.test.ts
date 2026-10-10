import { describe, expect, it } from 'vitest';
import { activeWorkspaceGroup, WORKSPACE_ROUTES } from '../src/workspace-navigation';
const groups = [
  { label: 'Ringkasan', ids: ['overview'] },
  { label: 'Data Produk', ids: ['products','batches','suppliers'] },
  { label: 'Pemeriksaan', ids: ['standards','inspection'] },
  { label: 'Bukti & Audit', ids: ['proofs','activity'] },
  { label: 'Organisasi', ids: ['team'] },
  { label: 'Bantuan & Akun', ids: ['guide','settings','profile'] },
];
describe('workspace navigation', () => {
  it('selects the category and contextual pill items for every route', () => {
    expect(activeWorkspaceGroup(groups,'batches')).toEqual({label:'Data Produk',ids:['products','batches','suppliers']});
    expect(activeWorkspaceGroup(groups,'inspection')).toEqual({label:'Pemeriksaan',ids:['standards','inspection']});
    expect(activeWorkspaceGroup(groups,'overview')?.ids).toEqual(['overview']);
  });
  it('retains all existing workspace routes in navigation', () => {
    expect(groups.flatMap(group=>group.ids).sort()).toEqual([...WORKSPACE_ROUTES].sort());
  });
});
