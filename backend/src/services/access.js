export class HTTPError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function assertUUID(id) {
  if (!uuidPattern.test(id || '')) throw new HTTPError(400, 'Identificador inválido.');
  return id;
}
export function checked(result) {
  if (result.error) throw result.error;
  return result.data;
}
export async function listWorkspaces(db, userId) {
  const rows = checked(await db.from('workspace_members').select('role, workspaces(id, name, kind, owner_id)').eq('user_id', userId));
  return rows.filter(row => row.workspaces).map(row => ({ ...row.workspaces, role: row.role }));
}
export async function resolveScope(db, userId, workspace, mode = 'read') {
  if (workspace === 'all' && mode !== 'read') throw new HTTPError(400, 'Selecione um contexto específico no menu antes de criar ou alterar registros.');
  const available = await listWorkspaces(db, userId);
  let selected;
  if (workspace === 'all' && mode === 'read') selected = available;
  else if (!workspace || ['personal', 'business', 'family'].includes(workspace)) {
    selected = available.filter(w => w.kind === (workspace || 'personal') && (w.kind === 'family' || w.owner_id === userId));
    if (selected.length > 1) throw new HTTPError(400, 'Selecione um espaço específico.');
  } else selected = available.filter(w => w.id === workspace);
  if (!selected.length) throw new HTTPError(403, 'Espaço indisponível ou acesso revogado.');
  if (mode !== 'read' && (selected.length !== 1 || !['owner', 'editor'].includes(selected[0].role))) {
    throw new HTTPError(403, 'Seu papel não permite alterar este espaço.');
  }
  return { ids: selected.map(w => w.id), id: selected.length === 1 ? selected[0].id : null,
    userId, role: selected.length === 1 ? selected[0].role : null, kind: selected.length === 1 ? selected[0].kind : 'all' };
}
export function scopeQuery(query, scope, column = 'workspace_id') { return query.in(column, scope.ids); }
export async function requireRecordAccess(db, table, id, userId, mode = 'read') {
  assertUUID(id);
  const row = checked(await db.from(table).select('*').eq('id', id).maybeSingle());
  if (!row) throw new HTTPError(404, 'Registro não encontrado.');
  if (!row.workspace_id) throw new HTTPError(409, 'Registro sem espaço definido. Execute a migração e revise o histórico.');
  await resolveScope(db, userId, row.workspace_id, mode);
  return row;
}
export async function assertCategoryAccess(db, id, userId, workspaceId) {
  if (id === null || id === undefined) return null;
  assertUUID(id);
  const row = checked(await db.from('categories').select('*').eq('id', id).maybeSingle());
  if (!row) throw new HTTPError(400, 'Categoria indisponível.');
  if (row.is_system && row.user_id === null && row.workspace_id === null) return row;
  if (workspaceId && row.workspace_id !== workspaceId) throw new HTTPError(403, 'Categoria pertence a outro espaço.');
  if (!row.workspace_id) throw new HTTPError(403, 'Categoria indisponível.');
  await resolveScope(db, userId, row.workspace_id);
  return row;
}
export async function fetchAll(factory, pageSize = 500) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = checked(await factory().range(offset, offset + pageSize - 1));
    rows.push(...page);
    if (page.length < pageSize) return rows;
    if (rows.length >= 100000) throw new HTTPError(422, 'Consulta muito ampla. Reduza o período.');
  }
}
export function handleError(res, error) {
  const status = error.status || (error.name === 'ZodError' || error instanceof RangeError ? 400
    : ['23503', '23505', '23514', 'P0001'].includes(error.code) ? 409 : 500);
  if (status >= 500) console.error(JSON.stringify({ event: 'request_failed', code: error.code || 'internal' }));
  return res.status(status).json({ error: status >= 500 ? 'Não foi possível concluir. Tente novamente; seus dados não foram substituídos.'
    : error.name === 'ZodError' ? 'Revise os campos informados.' : error.message });
}
