import { checked } from './access.js';
export async function mutate(db,actor,table,operation,workspace,payload={},id=null) {
  return checked(await db.rpc('mutate_financial_record',{p_actor:actor,p_table:table,p_operation:operation,p_id:id,p_workspace:workspace,p_payload:payload}));
}
