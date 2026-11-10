import {SCHEMA_VERSION,UNITS,ENVIRONMENTS,createGroup,uid,localDate,parseLevels,statistics,penetration,COLUMNS,measurementRows,SUMMARY_COLUMNS,summaryRows,toCSV,validateBackup,mergeGroups} from './core.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const STORAGE_KEY='em-wave-lab:v1';
let model,loadError=false,editingId=null,toastTimer,activeTab='record',lastPersisted=null;
try {
  const saved=localStorage.getItem(STORAGE_KEY);
  if(saved){const raw=JSON.parse(saved);model=validateBackup(raw);model.current_id=raw.current_id;lastPersisted=saved;}
} catch {loadError=true;}
if(!model||!model.groups.length){const g=createGroup();model={schema_version:SCHEMA_VERSION,groups:[g],current_id:g.id};}
if(!model.groups.some(g=>g.id===model.current_id))model.current_id=model.groups[0].id;
const group=()=>model.groups.find(g=>g.id===model.current_id);
const fmt=(v,d=2)=>v===null||v===undefined?'—':v.toFixed(d);
const time=s=>new Date(s).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
function toast(message,error=false){clearTimeout(toastTimer);const t=$('#toast');t.textContent=message;t.className=error?'error':'';t.hidden=false;toastTimer=setTimeout(()=>t.hidden=true,error?9000:3500);}
function commit(next){
  if(loadError){toast('原有存储无法读取，已停止写入。请先导出可用数据，或在其他浏览器导入备份。',true);return false;}
  try {
    // Detect another tab's write before overwriting its data.
    const actual=localStorage.getItem(STORAGE_KEY);
    if(actual!==lastPersisted){toast('另一个标签页修改了数据。请先下载当前 JSON 备份，再刷新页面合并。',true);return false;}
    const encoded=JSON.stringify(next);localStorage.setItem(STORAGE_KEY,encoded);lastPersisted=encoded;model=next;
    $('#save-status').textContent='已保存到当前设备';return true;
  }catch{ $('#save-status').textContent='保存失败 · 请导出备份';toast('浏览器空间不足或禁止存储，未保存本次修改。请先导出备份。',true);return false;}
}
function applyChange(fn){const next=structuredClone(model);fn(next);return commit(next);}
function readContext(){
  const values=Object.fromEntries(new FormData($('#context-form')));
  for(const key of ['frequency_mhz','floor','distance_m','height_m']) values[key]=values[key]===''?'':Number(values[key]);
  return values;
}
function syncContext(){
  const values=readContext();
  const form=$('#context-form');
  const requiredNow=['name','date','instrument',...(group().samples.length?['location','frequency_mhz']:[])];
  if(requiredNow.some(key=>String(values[key]).trim()===''||!form.elements.namedItem(key).checkValidity())||
    ['frequency_mhz','floor','distance_m','height_m'].some(key=>!form.elements.namedItem(key).checkValidity()&&values[key]!=='')){
    $('#save-status').textContent='条件待补全 · 已保存读数保留';return;
  }
  if(applyChange(next=>Object.assign(next.groups.find(g=>g.id===next.current_id),values))){renderPicker();renderStats();renderExport();}
}
function fillContext(){
  const g=group();
  for(const [key,value]of Object.entries(g)){const field=$('#context-form').elements.namedItem(key);if(field)field.value=value;}
}
function renderPicker(){
  $('#group-select').replaceChildren(...model.groups.map(g=>{const o=el('option',null,g.name+' · '+g.samples.length+' 点');o.value=g.id;return o;}));
  $('#group-select').value=model.current_id;
}
function empty(container,title,message){
  const box=el('div','empty-state');box.append(el('span','empty-icon','∿'),el('h3',null,title),el('p',null,message));container.replaceChildren(box);
}
function renderStats(){
  const g=group(),s=statistics(g.samples.map(s=>s.level)),unit=UNITS[g.unit];
  $('#entry-unit').textContent=unit;$('#level-unit').textContent=unit;
  $('#half-wave').textContent=g.frequency_mhz>0?fmt(299.792458/(2*g.frequency_mhz),3)+' m':'— m';
  $('#record-count').textContent=s.n;$('#tab-count').textContent=s.n;
  $('#progress-fill').style.width=Math.min(100,s.n/51*100)+'%';
  $('#progress-symbol').textContent=s.n>=51?'✓':'↗';
  $('#progress-text').textContent=s.n>=51?'已达到 51 点要求，可继续采样。':'还需 '+(51-s.n)+' 点 · 每个地点超过 50 个数据。';
  $('#mini-mean').textContent=fmt(s.mean);$('#mini-std').textContent=fmt(s.std);
  $('#mini-last').textContent=g.samples.length?fmt(g.samples.at(-1).level):'—';
  const recent=$('#recent-list');recent.replaceChildren();
  g.samples.slice(-3).reverse().forEach((s,i)=>{
    const row=el('div','recent-item'),b=el('button',null,'修改');b.type='button';b.addEventListener('click',()=>openEdit(s.id));
    row.append(el('span',null,'#'+(g.samples.length-i)+' · '+time(s.recorded_at)),el('strong',null,fmt(s.level)+' '+unit),b);recent.append(row);
  });
  if(activeTab==='analysis')renderAnalysis();
}
function renderData(){
  const g=group(),query=$('#search-records').value.trim().toLowerCase();
  const rows=g.samples.map((s,i)=>({...s,index:i+1})).filter(s=>(s.level+' '+s.note).toLowerCase().includes(query)).reverse();
  const container=$('#data-container');$('#data-export').disabled=!g.samples.length;
  if(!rows.length){empty(container,g.samples.length?'没有匹配的记录':'等待第一条读数',g.samples.length?'试试其他关键词。':'在「现场记录」中填写条件并保存测量。');return;}
  const scroll=el('div','table-scroll'),table=el('table','data-table'),thead=el('thead'),tr=el('tr');
  ['序号','记录时间','电平 / '+UNITS[g.unit],'单条备注','操作'].forEach(t=>tr.append(el('th',null,t)));thead.append(tr);
  const tbody=el('tbody'),mobile=el('div','mobile-records');
  // Cap visible results to keep phones responsive. The full dataset is always exported.
  rows.slice(0,500).forEach(s=>{
    const row=el('tr'),b=el('button',null,'修改');b.type='button';b.addEventListener('click',()=>openEdit(s.id));
    row.append(el('td',null,s.index),el('td',null,time(s.recorded_at)),el('td','level',fmt(s.level)),el('td',null,s.note||'—'));
    const action=el('td');action.append(b);row.append(action);tbody.append(row);
    const m=el('article','mobile-record'),top=el('div'),number=el('span','level',fmt(s.level));number.append(el('small',null,UNITS[g.unit]));
    const mb=el('button',null,'修改');mb.type='button';mb.addEventListener('click',()=>openEdit(s.id));top.append(number,mb);m.append(top,el('div','meta','#'+s.index+' · '+time(s.recorded_at)));if(s.note)m.append(el('p',null,s.note));mobile.append(m);
  });
  table.append(thead,tbody);scroll.append(table);container.replaceChildren(scroll,mobile);
  if(rows.length>500)container.append(el('p','helper','显示最近 500 条匹配记录。导出 CSV 包含全部记录。'));
}
function renderAnalysis(){
  const g=group(),s=statistics(g.samples.map(s=>s.level)),container=$('#stats-grid');container.replaceChildren();
  [['采样点数',s.n,'点'],['平均电平',s.mean,UNITS[g.unit]],['样本标准差',s.std,'dB'],['中位数',s.median,UNITS[g.unit]],['最小值',s.min,UNITS[g.unit]],['最大值',s.max,UNITS[g.unit]]].forEach(([label,value,unit],i)=>{
    const b=el('div','stat-block'),n=el('strong',null,i===0?String(value):fmt(value));n.append(el('small',null,unit));b.append(el('span',null,label),n);container.append(b);
  });
  $('#chart-unit').textContent=UNITS[g.unit];drawChart(g.samples.map(s=>s.level));
  const dest=$('#penetration-results'),pairs=penetration(model.groups);dest.replaceChildren();
  if(!pairs.length)empty(dest,'尚无可配对的数据','为室内、室外测量组填写相同配对编号，并分别录入读数。');
  for(const p of pairs){
    const box=el('article','penetration-card'),n=el('strong',null,fmt(p.loss));n.append(el('small',null,'dB'));
    box.append(el('div','pair-title',p.inside.pair_id+' · '+p.inside.name),n,
      el('p',null,p.inside.date+' / '+p.inside.frequency_mhz+' MHz / '+UNITS[p.inside.unit]),
      el('p',null,'室外 '+p.out.n+' 点，均值 '+fmt(p.out.mean)+'；室内 '+p.inn.n+' 点，均值 '+fmt(p.inn.mean)),
      el('p',null,'室外组：'+p.outside.map(g=>g.name).join('、')),
      el('p',null,p.complete?'样本数已达到要求':'样本不足 51 点，当前结果仅供预览'));dest.append(box);
  }
}
function drawChart(values){
  const c=$('#chart-container');if(!values.length){empty(c,'采样后查看曲线','原始读数按记录顺序呈现。');return;}
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 500 220');svg.setAttribute('role','img');svg.setAttribute('aria-label','电平按采样序号变化曲线');svg.classList.add('chart-svg');
  const node=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.append(e);return e;};
  const stats=statistics(values),padding=Math.max(1,(stats.max-stats.min)*.12),min=stats.min-padding,max=stats.max+padding;
  const x=i=>45+(values.length===1?210:i/(values.length-1)*435),y=v=>180-(v-min)/(max-min)*155;
  [0,.5,1].forEach(t=>{const value=min+(max-min)*t;node('line',{x1:45,y1:y(value),x2:480,y2:y(value)});node('text',{x:37,y:y(value)+3,'text-anchor':'end'},value.toFixed(1));});
  // Keep full data in statistics/exports; decimate chart only.
  const step=Math.max(1,Math.ceil(values.length/1000)),indices=[];
  for(let i=0;i<values.length;i+=step)indices.push(i);
  if(indices.at(-1)!==values.length-1)indices.push(values.length-1);
  node('polyline',{points:indices.map(i=>x(i)+','+y(values[i])).join(' ')});
  if(values.length===1)node('circle',{cx:x(0),cy:y(values[0]),r:4});
  node('text',{x:45,y:205},'1');node('text',{x:480,y:205,'text-anchor':'end'},String(values.length));node('text',{x:260,y:218,'text-anchor':'middle'},'采样序号');c.replaceChildren(svg);
}
function selectedGroups(){return $('#export-scope').value==='current'?[group()]:model.groups;}
function renderExport(){
  const gs=selectedGroups(),count=gs.reduce((n,g)=>n+g.samples.length,0);
  $('#export-summary').textContent=gs.length+' 个测量组 / '+count+' 条原始记录';
  $('#export-csv').disabled=!count;$('#export-summary-csv').disabled=!count;
}
function renderAll(){renderPicker();fillContext();renderStats();if(activeTab==='data')renderData();if(activeTab==='analysis')renderAnalysis();renderExport();}
function showTab(tab){
  activeTab=tab;$$('[data-tab]').forEach(b=>{const selected=b.dataset.tab===tab;b.classList.toggle('active',selected);b.setAttribute('aria-selected',String(selected));});
  $$('.panel').forEach(p=>p.hidden=p.id!=='panel-'+tab);
  if(tab==='data')renderData();if(tab==='analysis')renderAnalysis();if(tab==='export')renderExport();
}
function validContext(){
  showTab('record');
  if(!$('#context-form').reportValidity())return false;
  const values=readContext();
  if(['name','instrument','location'].some(key=>!String(values[key]).trim())){toast('测量组名称、仪器和地点不能只包含空格。',true);return false;}
  return true;
}
function saveSamples(values,note=''){
  if(!validContext())return false;
  const context=readContext();
  if(group().samples.length+values.length>50000){toast('单组最多保存 50000 条记录，请新建测量组。',true);return false;}
  const now=new Date().toISOString();
  if(!applyChange(next=>{const g=next.groups.find(g=>g.id===next.current_id);Object.assign(g,context);g.samples.push(...values.map(level=>({id:uid(),level,note,recorded_at:now})));}))return false;
  renderStats();renderPicker();renderExport();toast('已保存 '+values.length+' 条读数 · 本组 '+group().samples.length+' 点');return true;
}
function download(content,name,type){
  const a=el('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),60000);
}
function exportData(groups=selectedGroups()){
  const rows=measurementRows(groups);if(!rows.length){toast('还没有可导出的读数。',true);return;}
  download(toCSV(rows,COLUMNS),'measurements.csv','text/csv;charset=utf-8');toast('已生成 CSV，共 '+rows.length+' 条记录。');
}
function openEdit(id){
  const s=group().samples.find(s=>s.id===id);if(!s)return;
  editingId=id;$('#edit-level').value=s.level;$('#edit-note').value=s.note;$('#edit-dialog').showModal();
}
function ask(title,message){
  return new Promise(resolve=>{const d=$('#confirm-dialog');$('#confirm-title').textContent=title;$('#confirm-message').textContent=message;
    const end=answer=>{d.close();$('#confirm-ok').onclick=null;$('#confirm-cancel').onclick=null;d.oncancel=null;resolve(answer);};
    $('#confirm-ok').onclick=()=>end(true);$('#confirm-cancel').onclick=()=>end(false);d.oncancel=e=>{e.preventDefault();end(false);};d.showModal();
  });
}
$$('[data-tab]').forEach(b=>b.addEventListener('click',()=>{showTab(b.dataset.tab);$('.workspace-bar').scrollIntoView({block:'start'});}));
$('#toggle-sign').addEventListener('click',()=>{const input=$('#level');input.value=input.value.startsWith('-')?input.value.slice(1):'-'+input.value.replace(/^\+/, '');input.focus();});
$('#context-form').addEventListener('submit',e=>e.preventDefault());
$('#context-form').addEventListener('input',syncContext);
$('#group-select').addEventListener('change',async e=>{
  const target=e.target.value;
  if($('#level').value.trim()||$('#batch-values').value.trim())if(!await ask('切换测量组？','输入框中还有未保存读数。确认切换会清空输入框；已保存记录会保留。')){renderPicker();return;}
  if(applyChange(next=>next.current_id=target)){ $('#level').value='';$('#batch-values').value='';$('#sample-note').value='';$('#search-records').value='';renderAll();}
  else renderPicker();
});
$('#new-group').addEventListener('click',async()=>{
  if($('#level').value.trim()||$('#batch-values').value.trim())if(!await ask('切换测量组？','输入框里还有未保存的读数。确认后会清空输入框；已保存的记录会保留。'))return;
  const g=createGroup(group(),model.groups.length+1);
  if(applyChange(next=>{next.groups.push(g);next.current_id=g.id;})){ $('#level').value='';$('#batch-values').value='';$('#sample-note').value='';renderAll();showTab('record');$('#context-form').elements.name.focus();toast('已新建测量组。');}
});
$('#sample-form').addEventListener('submit',e=>{
  e.preventDefault();try{const values=parseLevels($('#level').value);if(values.length!==1)throw new Error('单条录入只接受一个数值；多条读数请使用批量录入。');if(saveSamples(values,$('#sample-note').value)){ $('#level').value='';$('#sample-note').value='';$('#level').focus();}}catch(error){toast(error.message,true);}
});
$('#batch-form').addEventListener('submit',e=>{e.preventDefault();try{if(saveSamples(parseLevels($('#batch-values').value)))$('#batch-values').value='';}catch(error){toast(error.message,true);}});
$('#search-records').addEventListener('input',renderData);
$('#edit-form').addEventListener('submit',e=>{
  e.preventDefault();try{const values=parseLevels($('#edit-level').value);if(values.length!==1)throw new Error('请填写一个电平读数。');
    if(applyChange(next=>{const s=next.groups.find(g=>g.id===next.current_id).samples.find(s=>s.id===editingId);s.level=values[0];s.note=$('#edit-note').value;})){ $('#edit-dialog').close();renderAll();toast('记录已修改。');}
  }catch(error){toast(error.message,true);}
});
$('[data-close]').addEventListener('click',()=>$('#edit-dialog').close());
$('#delete-sample').addEventListener('click',async()=>{
  $('#edit-dialog').close();
  if(!await ask('删除这条读数？','此操作会从当前测量组删除这条记录。建议先在「导出与备份」中备份重要数据。'))return;
  if(applyChange(next=>{const g=next.groups.find(g=>g.id===next.current_id);g.samples=g.samples.filter(s=>s.id!==editingId);})){renderAll();toast('读数已删除。');}
});
$('#export-scope').addEventListener('change',renderExport);
$('#export-csv').addEventListener('click',()=>exportData());
$('#data-export').addEventListener('click',()=>exportData([group()]));
$('#export-summary-csv').addEventListener('click',()=>{download(toCSV(summaryRows(selectedGroups()),SUMMARY_COLUMNS),'group_summary.csv','text/csv;charset=utf-8');toast('分组统计已导出。');});
$('#backup-json').addEventListener('click',()=>{download(JSON.stringify({...model,exported_at:new Date().toISOString()},null,2),'em-wave-lab-backup-'+localDate()+'.json','application/json');toast('已生成全部数据备份。');});
$('#import-json').addEventListener('change',async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try {
    if(file.size>30*1024*1024)throw new Error('备份文件不能超过 30 MB。');
    const incoming=validateBackup(JSON.parse(await file.text()));
    if(!await ask('导入备份？','文件包含 '+incoming.groups.length+' 个测量组、'+incoming.groups.reduce((n,g)=>n+g.samples.length,0)+' 条读数。\n将与现有数据合并，保留当前记录。'))return;
    const merged=mergeGroups(model.groups,incoming.groups);
    if(commit({...model,groups:merged.groups})){renderAll();toast('新增 '+merged.added+' 组，跳过相同数据 '+merged.skipped+' 组。');}
  }catch(error){toast('导入失败：'+error.message,true);}
});
window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY)toast('另一个标签页更新了数据，请导出当前备份后刷新页面。',true);});
window.addEventListener('beforeunload',e=>{if($('#level').value.trim()||$('#batch-values').value.trim()){e.preventDefault();e.returnValue='';}});
renderAll();
if(loadError){$('#save-status').textContent='本地数据读取失败';toast('本地存储无法读取，原有数据未覆盖。请使用备份恢复或更换浏览器。',true);}
else if(!lastPersisted)commit(model);
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});

