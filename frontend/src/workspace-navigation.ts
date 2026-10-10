export type WorkspaceNavGroup = { label: string; ids: string[] };
export const WORKSPACE_ROUTES = ['overview','products','batches','suppliers','standards','inspection','proofs','activity','team','guide','settings','profile'] as const;
export function activeWorkspaceGroup(groups: WorkspaceNavGroup[], route: string): WorkspaceNavGroup | undefined {
  return groups.find(group => group.ids.includes(route)) || groups[0];
}
