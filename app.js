'use strict';
let source={rows:[]};
let rows=[];
const $=id=>document.getElementById(id);
const sections=[
 ['demand','Demand', [['forecast_qty','Forecast'],['sales_order_qty','Sales orders'],['planned_dependent_demand_qty','Planned dependent demand'],['firm_dependent_demand_qty','Firm dependent demand']]],
 ['supply','Supply receipts', [['planned_procurement_receipt_qty','Planned procurement receipts'],['firm_procurement_receipt_qty','Firm procurement receipts'],['planned_production_receipt_qty','Planned production receipts'],['firm_production_receipt_qty','Firm production receipts'],['planned_transfer_receipt_qty','Planned transfer receipts'],['firm_transfer_receipt_qty','Firm transfer receipts']]],
 ['dispatch','Dispatches', [['planned_procurement_dispatch_qty','Planned procurement dispatches'],['firm_procurement_dispatch_qty','Firm procurement dispatches'],['planned_transfer_dispatch_qty','Planned transfer dispatches'],['firm_transfer_dispatch_qty','Firm transfer dispatches'],['planned_customer_dispatch_qty','Planned customer dispatches'],['firm_customer_dispatch_qty','Firm customer dispatches']]],
 ['inventory','Inventory & safety stock', [['baseline_inventory_qty','On-hand inventory','snapshot'],['safety_stock_days','Safety-stock days','setting'],['safety_stock_qty_input','Safety-stock quantity target','setting'],['ending_stock_qty','Ending inventory','closing']]]
];
const hiddenFigures = new Set();
const columnWidths = new Map();
const siteRank = {PLANT:0,RDC:1,WAREHOUSE:2,SUPPLIER:3};
function compareSites([,a],[,b]) {
  return a[0].sku_code.localeCompare(b[0].sku_code,undefined,{numeric:true}) ||
    (siteRank[a[0].location_type]??4)-(siteRank[b[0].location_type]??4) ||
    a[0].location_id.localeCompare(b[0].location_id,undefined,{numeric:true});
}
function syncFigureChoices(){
  for(const input of document.querySelectorAll('#figureChoices input'))input.checked=!hiddenFigures.has(input.value);
  $('figuresButton').textContent='Planning elements'+(hiddenFigures.size?' ('+hiddenFigures.size+' hidden)':'');
}
function initializeFigureChoices(){
  for(const [cls,title,measures] of sections){
    const fieldset=document.createElement('fieldset');const legend=document.createElement('legend');legend.textContent=title;fieldset.append(legend);
    const options=[...(cls==='demand'?[['total_demand_qty','Total Demand']]:cls==='supply'?[['total_supply','Total Supply']]:[]),...measures];
    for(const [field,title] of options){const label=document.createElement('label');const input=document.createElement('input');input.type='checkbox';input.value=field;input.checked=true;input.addEventListener('change',()=>{input.checked?hiddenFigures.delete(field):hiddenFigures.add(field);syncFigureChoices();render()});label.append(input,document.createTextNode(title));fieldset.append(label)}
    $('figureChoices').append(fieldset);
  }
  $('figuresButton').addEventListener('click',()=>{$('figuresPanel').hidden=!$('figuresPanel').hidden;$('figuresButton').setAttribute('aria-expanded',String(!$('figuresPanel').hidden))});
  $('closeFigures').addEventListener('click',()=>{$('figuresPanel').hidden=true;$('figuresButton').setAttribute('aria-expanded','false');$('figuresButton').focus()});
  $('showAll').addEventListener('click',()=>{hiddenFigures.clear();$('hideZero').checked=false;syncFigureChoices();render()});
  $('hideAll').addEventListener('click',()=>{document.querySelectorAll('#figureChoices input').forEach(i=>hiddenFigures.add(i.value));syncFigureChoices();render()});
}
function configureColumns(buckets){
  const table=$('ledger');table.querySelector('colgroup')?.remove();
  const keys=['sku','type','site','measure',...buckets.map(k=>$('grain').value+':'+k)];
  const defaults=[125,155,155,290,...buckets.map(()=>190)];
  const cols=document.createElement('colgroup');keys.forEach(()=>cols.append(document.createElement('col')));table.insertBefore(cols,table.tHead);
  function apply(){
    const sizes=keys.map((k,i)=>columnWidths.get(k)||defaults[i]);
    sizes.forEach((size,i)=>cols.children[i].style.width=size+'px');
    table.style.width=sizes.reduce((a,b)=>a+b,0)+'px';
    let left=0;['sku-col','type-col','site-col','measure-col'].forEach((cls,i)=>{table.style.setProperty('--'+cls+'-left',left+'px');left+=sizes[i]});
    table.querySelectorAll('.column-resize').forEach((h,i)=>h.setAttribute('aria-valuenow',sizes[i]));
  }
  [...table.tHead.rows[0].cells].forEach((th,i)=>{
    const name=th.childNodes[0].textContent;const handle=document.createElement('span');handle.className='column-resize';handle.tabIndex=0;handle.role='separator';handle.setAttribute('aria-label','Resize '+name+' column');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-valuemin','80');handle.setAttribute('aria-valuemax','700');handle.title='Drag to resize; arrow keys adjust width; double-click resets';
    const setWidth=w=>{columnWidths.set(keys[i],Math.max(80,Math.min(700,w)));apply()};
    handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();const x=e.clientX;const width=columnWidths.get(keys[i])||defaults[i];handle.setPointerCapture(e.pointerId);handle.onpointermove=event=>setWidth(width+event.clientX-x);handle.onpointerup=()=>{handle.onpointermove=null;handle.onpointerup=null};handle.onpointercancel=()=>{handle.onpointermove=null}});
    handle.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setWidth((columnWidths.get(keys[i])||defaults[i])+(e.key==='ArrowRight'?10:-10))}});
    handle.addEventListener('dblclick',()=>{columnWidths.delete(keys[i]);apply()});th.append(handle);
  });apply();
}
initializeFigureChoices();
function sumDecimal(values){let scale=Math.max(0,...values.map(v=>(v.split('.')[1]||'').length));let sum=values.reduce((s,v)=>{let [i,f='']=v.split('.');let neg=i.startsWith('-');let digits=i.replace('-','')+f.padEnd(scale,'0');return s+(neg?-1n:1n)*BigInt(digits)},0n);let neg=sum<0n;if(neg)sum=-sum;let digits=sum.toString().padStart(scale+1,'0');return (neg?'-':'')+(scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits)}
function format(value){let [i,f]=value.split('.');return i.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(f&&f.replace(/0+$/,'')?'.'+f.replace(/0+$/,''):'')}
function cell(tag,text,classes=''){let c=document.createElement(tag);c.textContent=text;c.className=classes;return c}
function bucketKey(r){return $('grain').value==='month'?r.period_start.slice(0,7):r.period_start+'|'+r.period_id}
function displayValue(group,field,kind){if(!group.length)return '—';if(kind==='closing'){const last=[...group].sort((a,b)=>a.period_start.localeCompare(b.period_start)||Number(a.period_sequence)-Number(b.period_sequence)).at(-1);return last.running_ending_inventory_qty===''||last.running_ending_inventory_qty==null?'—':format(last.running_ending_inventory_qty);}let values=group.map(r=>r[field]).filter(v=>v!==''&&v!=null);if(!values.length)return '—';if(kind==='setting')return [...new Set(values)].join(' / ');if(kind==='snapshot')return values.map(format).join(' / ');if(values.length!==group.length)return '—';return format(sumDecimal(values))}
function render(){const monthly=$('grain').value==='month';const filtered=rows.filter(r=>(!$('sku').value||r.sku_code===$('sku').value)&&(!$('site').value||r.location_id===$('site').value)&&(!$('type').value||r.location_type===$('type').value));const buckets=[...new Set(rows.map(bucketKey))].sort();const head=$('ledger').tHead;head.replaceChildren();let hr=document.createElement('tr');for(const [label,cls] of [['SKU','sku-col'],['Site type','type-col'],['Site','site-col'],['Planning element','measure-col']])hr.append(cell('th',label,'frozen '+cls));for(const key of buckets){let group=rows.filter(r=>bucketKey(r)===key);let title=monthly?new Date(key+'-01T00:00:00Z').toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'}):group[0].period_id;let th=cell('th',title,'bucket');let sub=document.createElement('small');sub.textContent=monthly?[...new Set(group.map(r=>r.period_id))].join(' · '):group[0].period_start;th.append(sub);hr.append(th)}head.append(hr);let body=$('ledger').tBodies[0];body.replaceChildren();let groups=new Map;for(const row of filtered){let key=[row.tenant_id,row.plan_version_id,row.sku_code,row.location_id].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}for(const [,group] of [...groups].sort(compareSites)){let first=group[0];sections.forEach(([cls,label,measures],index)=>{let band=document.createElement('tr');band.className='section '+cls+(index===0?' site-start':'');for(const [text,c] of [[index===0?first.sku_code:'','sku-col'],[index===0?first.location_type:'','type-col'],[index===0?first.location_id:'','site-col'],[label,'measure-col']])band.append(cell('th',text,'frozen '+c));for(const key of buckets){let total='';if((cls==='demand'&&!hiddenFigures.has('total_demand_qty'))||(cls==='supply'&&!hiddenFigures.has('total_supply'))){const bucketRows=group.filter(r=>bucketKey(r)===key);const raw=cls==='demand'?bucketRows.map(r=>r.total_demand_qty):bucketRows.flatMap(r=>measures.map(([field])=>r[field]));total=bucketRows.length&&raw.every(v=>v!==''&&v!=null)?format(sumDecimal(raw)):'—';}band.append(cell('td',total,'bucket'));}if(cls==='demand'&&!hiddenFigures.has('total_demand_qty'))band.children[3].textContent='Total Demand';if(cls==='supply'&&!hiddenFigures.has('total_supply'))band.children[3].textContent='Total Supply';body.append(band);for(const [field,label,kind] of measures){if(hiddenFigures.has(field))continue;let values=buckets.map(key=>displayValue(group.filter(r=>bucketKey(r)===key),field,kind));if($('hideZero').checked&&values.every(v=>v==='0'||v==='—'))continue;let tr=document.createElement('tr');tr.className=cls+' data';for(const c of ['sku-col','type-col','site-col'])tr.append(cell('td','','frozen '+c));let name=cell('th',label,'frozen measure-col');name.scope='row';tr.append(name);values.forEach((v,i)=>{let td=cell('td',v,field==='ending_stock_qty'&&v.startsWith('-')?'negative':v==='0'?'zero':v==='—'?'missing':'');td.title=buckets[i]+' · '+field;tr.append(td)});body.append(tr)}})}configureColumns(buckets);$('empty').hidden=filtered.length>0;$('count').textContent=groups.size+' SKU / site combinations · '+filtered.length+' source rows';$('notice').textContent=monthly?'Monthly quantities sum whole weeks by their start month. No daily allocation.':'Original source periods. Quantities shown at their supplied weekly grain.';}
function loadPlanningRun(run){
 source=run;rows=LedgerImport.runningBalances(run.rows);
 for(const [id,field,label] of [['sku','sku_code','All SKUs'],['type','location_type','All site types'],['site','location_id','All sites']]){
  $(id).replaceChildren(new Option(label,''));for(const value of [...new Set(rows.map(r=>r[field]))].sort())$(id).add(new Option(value,value));
 }
 $('plan').textContent=rows.length?[...new Set(rows.map(r=>r.tenant_id+' / '+r.plan_version_id))].join(' · '):'Load your planning ledgers';
 $('range').textContent=rows.length?rows.map(r=>r.period_start).sort()[0]+' — '+rows.map(r=>r.period_end).sort().at(-1):'';
 $('updated').textContent=source.generatedAt?'Loaded: '+new Date(source.generatedAt).toLocaleString():'';
 $('empty').textContent=rows.length?'No matching planning rows. Reset the filters to see all sites.':'Choose your prepared and calculated CSV files above to start.';
 render();
}
for(const id of ['sku','type','site','grain','hideZero'])$(id).addEventListener('change',render);
$('reset').addEventListener('click',()=>{for(const id of ['sku','type','site'])$(id).value='';$('grain').value='month';$('hideZero').checked=false;hiddenFigures.clear();columnWidths.clear();syncFigureChoices();render()});
loadPlanningRun(source);
