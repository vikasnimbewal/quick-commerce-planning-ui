'use strict';
const operationalSections={
 commitment:[
 ['demand','Committed demand', [['remaining_forecast_qty','Remaining forecast'],['open_sales_order_qty','Open sales orders'],['net_forecast_commitment_qty','Net forecast commitment'],['committed_independent_demand_qty','Independent demand'],['committed_dependent_demand_qty','Dependent demand']]],
 ['supply','Committed receipts', [['committed_procurement_receipt_qty','Procurement receipts'],['committed_production_receipt_qty','Production receipts'],['committed_transfer_receipt_qty','Transfer receipts']]],
 ['dispatch','Remaining dispatches', [['remaining_procurement_dispatch_qty','Procurement dispatches'],['remaining_transfer_dispatch_qty','Transfer dispatches'],['remaining_customer_dispatch_qty','Customer dispatches'],['committed_total_dispatch_qty','Total dispatches']]],
 ['inventory','Projected inventory', [['beginning_inventory_qty','Opening inventory','opening'],['ending_inventory_qty','Projected physical ending inventory','last'],['total_shortage_qty','Unfulfilled demand'],['safety_stock_target_qty','Safety-stock target','last'],['safety_stock_shortfall_qty','Safety-stock shortfall','last']]],
 ['lifecycle','Order lifecycle', ['procurement','production','transfer'].flatMap(f=>[[f+'_total_commitment_qty',f+' total commitment'],['remaining_'+f+'_receipt_qty',f+' remaining receipts'],[f+'_in_execution_qty',f+' in execution'],[f+'_open_unstarted_qty',f+' open / unstarted']])]
 ],
 execution:[
 ['demand','Customer actuals', [['customer_order_qty','Customer orders'],['customer_fulfilled_qty','Customer fulfilled']]],
 ['supply','Actual receipts', [['procurement_receipt_qty','Procurement receipts'],['production_receipt_qty','Production receipts'],['transfer_receipt_qty','Transfer receipts']]],
 ['dispatch','Actual dispatches', [['customer_dispatch_qty','Customer dispatches'],['procurement_dispatch_qty','Procurement dispatches'],['transfer_dispatch_qty','Transfer dispatches'],['total_dispatch_qty','Total dispatches']]],
 ['production','Production & components', [['good_produced_qty','Good production'],['scrap_qty','Scrap'],['actual_component_consumption_qty','Actual component consumption'],['standard_component_consumption_for_actual_output_qty','Standard components for actual output']]],
 ['inventory','Actual inventory', [['actual_inventory_qty','Actual inventory','last'],['safety_stock_target_qty','Safety-stock target','last'],['safety_stock_shortfall_qty','Safety-stock shortfall','last']]]
 ]
};
function parseRunBundle(text){
 const b=JSON.parse(text);if(b.schema_version!=='planning-ui-run/v1')throw Error('Unsupported run bundle version.');
 for(const field of ['prepared_rows','calculated_rows','commitment_rows','execution_rows','diagnostics','contributors'])if(!Array.isArray(b[field]))throw Error('Bundle is missing '+field);
 if(typeof b.invocation_blocked!=='boolean')throw Error('Bundle must declare invocation_blocked.');
 for(const field of ['tenant_id','plan_version_id','operational_snapshot_id','as_of_datetime'])if(typeof b[field]!=='string'||!b[field])throw Error('Missing run context: '+field);
 const csv=records=>{if(!records.length)throw Error('Bundle has no approved planning baseline.');const headers=Object.keys(records[0]);const q=v=>'"'+String(v??'').replaceAll('"','""')+'"';return [headers,...records.map(r=>headers.map(h=>r[h]))].map(r=>r.map(q).join(',')).join('\n')};
 if(b.prepared_rows.length>5000)throw Error('Maximum 5,000 planning rows.');
 const run=LedgerImport.joinLedgers(csv(b.prepared_rows),csv(b.calculated_rows));
 if(run.rows.some(r=>r.tenant_id!==b.tenant_id||r.plan_version_id!==b.plan_version_id))throw Error('Bundle plan context does not match its baseline.');
 const periods=new Map(run.rows.map(r=>[r.period_id,[r.period_start,r.period_end,String(r.period_sequence)].join('|')]));
 const seenByView=[];
 for(const view of ['commitment','execution']){
  const seen=new Set();const records=b[view+'_rows'];if(records.length>5000)throw Error('Maximum 5,000 rows per view.');
  for(const r of records){
   for(const [, , measures] of operationalSections[view])for(const [field] of measures)if(!(field in r))throw Error('Missing operational measure: '+field);
   for(const field of view==='commitment'?['committed_total_demand_qty','committed_supply_in_qty']:['total_supply_in_qty'])if(!(field in r))throw Error('Missing operational total: '+field);
   for(const f of ['tenant_id','plan_version_id','operational_snapshot_id','as_of_datetime'])if(r[f]!==b[f])throw Error('Mixed plan or operational snapshot in '+view+'.');
   for(const f of ['sku_code','location_id','location_type','period_id'])if(typeof r[f]!=='string'||!r[f])throw Error('Missing '+view+' identifier: '+f);
   if(periods.get(r.period_id)!==[r.period_start,r.period_end,String(r.period_sequence)].join('|'))throw Error('Operational period does not match the planning calendar.');
   const key=JSON.stringify([r.sku_code,r.location_id,r.period_id]);if(seen.has(key))throw Error('Duplicate '+view+' ledger key.');seen.add(key);
   for(const [f,v] of Object.entries(r))if(f.endsWith('_qty')&&v!==null&&v!==''&&(typeof v!=='string'||! /^-?\d+(\.\d+)?$/.test(v)))throw Error('Invalid decimal quantity: '+f);
  }
  seenByView.push(seen);run[view+'Rows']=records.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v==null?'':String(v)])));
 }
 if(seenByView[0].size!==seenByView[1].size||[...seenByView[0]].some(k=>!seenByView[1].has(k)))throw Error('Commitment and actual ledger keys differ.');
 if(b.invocation_blocked&&(b.commitment_rows.length||b.execution_rows.length))throw Error('Blocked bundle cannot contain published operational rows.');
 run.operationalSnapshot=b.operational_snapshot_id;run.asOf=b.as_of_datetime;run.blocked=b.invocation_blocked;run.diagnostics=b.diagnostics;run.contributors=b.contributors;run.bomContext=Array.isArray(b.bom_context)?b.bom_context:[];
 return run;
}
function renderEvidence(){
 const body=$('evidenceBody');body.replaceChildren();
 const kind=$('evidenceKind').value;const records=kind==='diagnostics'?(source.diagnostics||[]):kind==='bom'?(source.bomContext||[]).map(r=>({calculation_id:r.record_type,field_name:r.record?.bom_id||r.record?.production_order_id||'',message:JSON.stringify(r.record)})):(source.contributors||[]);
 const query=$('evidenceSearch').value.trim().toLowerCase();
 const matches=records.filter(r=>JSON.stringify(r).toLowerCase().includes(query));
 $('evidenceCount').textContent=matches.length+' records';
 for(const r of matches.slice(0,500)){const tr=document.createElement('tr');for(const v of [r.calculation_id,r.code||r.field_name,r.message??r.quantity,r.canonical_key||r.source_key,r.source_lineage||r.basis||r.scope,r.timing])tr.append(cell('td',v==null?'—':typeof v==='object'?JSON.stringify(v):String(v)));body.append(tr)}
}
