import { checked } from './access.js';

// Service-role joins ignore RLS. Enrich only through a second, scoped lookup;
// legacy invalid foreign keys must not expose another workspace's labels.
export async function enrichFinancialRows(db,rows,scope,{accounts=false}={}) {
 const categoryIds=[...new Set(rows.map(r=>r.category_id).filter(Boolean))];
 const accountIds=accounts?[...new Set(rows.map(r=>r.account_id).filter(Boolean))]:[];
 const categories=new Map(),accountMap=new Map();
 for(let i=0;i<categoryIds.length;i+=400){
  const data=checked(await db.from('categories').select('id,workspace_id,user_id,is_system,name,icon,color')
   .in('id',categoryIds.slice(i,i+400)).or(`and(is_system.eq.true,user_id.is.null,workspace_id.is.null),workspace_id.in.(${scope.ids.join(',')})`));
  data.forEach(r=>categories.set(r.id,r));
 }
 for(let i=0;i<accountIds.length;i+=400){
  const data=checked(await db.from('accounts').select('id,workspace_id,name,institution').in('id',accountIds.slice(i,i+400)).in('workspace_id',scope.ids));
  data.forEach(r=>accountMap.set(r.id,r));
 }
 return rows.map(row=>{
  const category=categories.get(row.category_id),account=accountMap.get(row.account_id);
  const validCategory=category&&(category.workspace_id===row.workspace_id||(category.is_system&&category.user_id===null&&category.workspace_id===null));
  const validAccount=account&&account.workspace_id===row.workspace_id;
  return {...row,category_id:validCategory?row.category_id:null,categories:validCategory?{name:category.name,icon:category.icon,color:category.color}:null,
   ...(accounts?{account_id:validAccount?row.account_id:null,accounts:validAccount?{name:account.name,institution:account.institution}:null}:{}),
   relation_needs_review:Boolean((row.category_id&&!validCategory)||(accounts&&row.account_id&&!validAccount))};
 });
}
