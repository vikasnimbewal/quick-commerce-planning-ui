'use strict';
// No network access: parse and join locally supplied output files only.
(function(root){
const keys=['tenant_id','plan_version_id','sku_code','location_id','period_id'];
const outputs=['ending_stock_qty','total_demand_qty','total_shortage_qty'];
const measures=['forecast_qty','sales_order_qty','planned_dependent_demand_qty','firm_dependent_demand_qty','planned_procurement_receipt_qty','firm_procurement_receipt_qty','planned_production_receipt_qty','firm_production_receipt_qty','planned_transfer_receipt_qty','firm_transfer_receipt_qty','planned_procurement_dispatch_qty','firm_procurement_dispatch_qty','planned_transfer_dispatch_qty','firm_transfer_dispatch_qty','planned_customer_dispatch_qty','firm_customer_dispatch_qty','baseline_inventory_qty','safety_stock_days','safety_stock_qty_input'];
function parseCSV(text){
 text=text.replace(/^\uFEFF/,'');const records=[];let row=[],value='',quoted=false,closed=false;
 const field=()=>{row.push(value);value='';closed=false};
 const record=()=>{field();if(row.some(v=>v!==''))records.push(row);row=[]};
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++}else{quoted=false;closed=true}}else value+=c;continue}
 if(c===',')field();else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;record()}else if(c==='"'&&!value&&!closed)quoted=true;else{if(closed||c==='"')throw Error('Malformed CSV quoting.');value+=c}}
 if(quoted)throw Error('Unclosed CSV quote.');if(value||row.length||closed)record();
 if(records.length<2)throw Error('CSV must contain headers and at least one data row.');
 const headers=records.shift();if(headers.some(h=>!h)||new Set(headers).size!==headers.length)throw Error('CSV headers must be unique and nonempty.');
 return {headers,rows:records.map((r,i)=>{if(r.length!==headers.length)throw Error('CSV row '+(i+2)+' has the wrong number of columns.');return Object.fromEntries(headers.map((h,j)=>[h,r[j]]))})};
}
const key=r=>JSON.stringify(keys.map(k=>r[k]));
function joinLedgers(preparedText,calculatedText){
 const p=parseCSV(preparedText),c=parseCSV(calculatedText);
 const required=[...keys,'location_type','period_start','period_end','period_sequence',...measures];
 for(const h of required)if(!p.headers.includes(h))throw Error('Prepared ledger is missing '+h+'.');
 for(const h of [...p.headers,...outputs])if(!c.headers.includes(h))throw Error('Calculated ledger is missing '+h+'.');
 const versions=new Set(p.rows.map(r=>JSON.stringify([r.tenant_id,r.plan_version_id])));if(versions.size!==1)throw Error('Load one tenant and plan version per run.');
 const ids=new Set(),periods=new Map(),sequences=new Map(),sites=new Map();
 for(const r of p.rows){
  if(keys.some(k=>!r[k])||!r.location_type)throw Error('Ledger identifiers must not be blank.');
  const k=key(r);if(ids.has(k))throw Error('Duplicate prepared ledger key: '+k);ids.add(k);
  for(const h of ['period_start','period_end']){const d=new Date(r[h]+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(r[h])||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==r[h])throw Error('Invalid '+h+' for '+r.period_id);}
  if(r.period_end<r.period_start||!/^\d+$/.test(r.period_sequence))throw Error('Invalid period dates or sequence.');
  const period=JSON.stringify([r.period_start,r.period_end,r.period_sequence]);
  if(periods.has(r.period_id)&&periods.get(r.period_id)!==period)throw Error('Inconsistent period definition.');periods.set(r.period_id,period);
  if(sequences.has(r.period_sequence)&&sequences.get(r.period_sequence)!==r.period_id)throw Error('Duplicate period sequence.');sequences.set(r.period_sequence,r.period_id);
  if(sites.has(r.location_id)&&sites.get(r.location_id)!==r.location_type)throw Error('Inconsistent site type.');sites.set(r.location_id,r.location_type);
  for(const h of measures)if(r[h]!==''&&!/^\d+(\.\d+)?$/.test(r[h]))throw Error('Invalid nonnegative number in '+h+'.');
 }
 const index=new Map();for(const r of c.rows){const k=key(r);if(index.has(k))throw Error('Duplicate calculated ledger key.');if(!ids.has(k))throw Error('Calculated ledger contains rows outside this prepared run.');index.set(k,r)}
 let missing=0;const rows=p.rows.map(r=>{const match=index.get(key(r));const result={...r};
  if(match){for(const h of p.headers)if(r[h]!==match[h])throw Error('Prepared/calculated mismatch in '+h+' for '+r.sku_code+' / '+r.location_id+' / '+r.period_id+'. Regenerate both files together.');}
  else missing++;
  for(const h of outputs){const v=match?match[h]:'';if(v!==''&&!/^\d+(\.\d+)?$/.test(v))throw Error('Invalid '+h+'.');result[h]=v;}return result;
 });return {rows,missing,generatedAt:new Date().toISOString()};
}
// Physical stock minus all unfulfilled demand to date equals the signed running balance.
// Preserve unknown/unpublished periods: later balances cannot bridge an unknown deficit.
function runningBalances(rows){
 const series=new Map();
 for(const row of rows){const k=JSON.stringify(keys.slice(0,4).map(key=>row[key]));if(!series.has(k))series.set(k,[]);series.get(k).push(row);}
 for(const group of series.values()){
  group.sort((a,b)=>Number(a.period_sequence)-Number(b.period_sequence));
  const scale=Math.max(0,...group.flatMap(r=>[r.ending_stock_qty,r.total_shortage_qty]).map(v=>(String(v||'').split('.')[1]||'').length));
  const integer=v=>{const [i,f='']=v.split('.');return BigInt(i+f.padEnd(scale,'0'));};
  let shortage=0n,known=true;
  for(const r of group){
   if(r.ending_stock_qty==null||r.ending_stock_qty===''||r.total_shortage_qty==null||r.total_shortage_qty==='')known=false;
   r.running_ending_inventory_qty='';if(!known)continue;
   shortage+=integer(r.total_shortage_qty);const balance=integer(r.ending_stock_qty)-shortage;
   const digits=(balance<0n?-balance:balance).toString().padStart(scale+1,'0');
   r.running_ending_inventory_qty=(balance<0n?'-':'')+(scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits);
  }
 }
 return rows;
}
const api={parseCSV,joinLedgers,runningBalances};if(typeof module!=='undefined')module.exports=api;else root.LedgerImport=api;
})(typeof window==='undefined'?globalThis:window);
