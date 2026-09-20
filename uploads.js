'use strict';
const storageKey='planning-ui-private-runs-v1';
let savedRuns=[],activeId=null;
function message(text,error=false){$('importStatus').textContent=text;$('importStatus').className=error?'import-error':'import-status';}
function refreshRuns(){const select=$('savedRuns');select.replaceChildren(new Option('Choose a saved run',''));for(const run of savedRuns)select.add(new Option(run.name,run.id));select.value=activeId||'';$('deleteRun').disabled=!activeId;}
function persist(next){localStorage.setItem(storageKey,JSON.stringify(next));savedRuns=next;}
try {const stored=JSON.parse(localStorage.getItem(storageKey)||'[]');if(!Array.isArray(stored)||stored.some(r=>!r.id||!Array.isArray(r.rows)))throw Error();savedRuns=stored;}catch{message('Saved runs are unavailable in this browser. You can still load files for this session.',true);}
refreshRuns();
$('loadRun').addEventListener('submit',async event=>{
 event.preventDefault();const button=$('loadButton');button.disabled=true;message('Checking ledger files…');
 try{
  const prepared=$('preparedFile').files[0],calculated=$('calculatedFile').files[0];
  if(!prepared||!calculated)throw Error('Choose both prepared and calculated CSV files.');
  if(prepared.size>10*1024*1024||calculated.size>10*1024*1024)throw Error('Each CSV must be 10 MB or smaller.');
  const texts=await Promise.all([prepared.text(),calculated.text()]);const run=LedgerImport.joinLedgers(...texts);
  if(run.rows.length>5000)throw Error('This browser version supports up to 5,000 ledger rows per run.');
  run.id=crypto.randomUUID();run.name=$('runName').value.trim()||run.rows[0].plan_version_id+' · '+new Date().toLocaleString();
  let storageWarning='';activeId=null;
  if($('rememberRun').checked){try{persist([...savedRuns,run]);activeId=run.id;}catch{storageWarning=' Could not save locally (storage may be full or disabled); loaded for this session only.';}}
  loadPlanningRun(run);refreshRuns();message('Loaded '+run.rows.length+' rows.'+(run.missing?' '+run.missing+' unpublished rows have no calculated balances.':' Prepared and calculated files match.')+storageWarning);
  $('preparedFile').value='';$('calculatedFile').value='';
 }catch(error){message(error.message,true);}finally{button.disabled=false;}
});
$('savedRuns').addEventListener('change',()=>{const run=savedRuns.find(r=>r.id===$('savedRuns').value);if(!run)return;activeId=run.id;loadPlanningRun(run);refreshRuns();message('Opened saved run: '+run.name);});
$('deleteRun').addEventListener('click',()=>{if(!activeId)return;try{persist(savedRuns.filter(r=>r.id!==activeId));activeId=null;loadPlanningRun({rows:[]});refreshRuns();message('Deleted the saved browser copy. Your original CSV files are unchanged.');}catch{message('Could not delete the saved browser copy.',true);}});
$('clearSession').addEventListener('click',()=>{activeId=null;loadPlanningRun({rows:[]});refreshRuns();$('preparedFile').value='';$('calculatedFile').value='';message('Sheet cleared. Saved runs remain available in this browser.');});
