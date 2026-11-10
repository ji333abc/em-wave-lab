export const SCHEMA_VERSION = 1;
export const UNITS = {dBuV:'dBμV',dBm:'dBm','dBuV/m':'dBμV/m'};
export const ENVIRONMENTS = {indoor:'室内',outdoor:'室外'};
export const MATERIALS = {unspecified:'未指定 / 不适用',masonry:'砖石结构',reinforced_concrete:'钢筋混凝土',other:'其他'};
export const uid = () => crypto.randomUUID();
export function localDate(d = new Date()) {
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}
export function createGroup(previous, number = 1) {
  return {id:uid(),name:'测量组 '+number,date:localDate(),location:'',instrument:previous?.instrument || 'DS1131',
    frequency_mhz:previous?.frequency_mhz ?? '',unit:previous?.unit || 'dBuV',environment:'outdoor',
    material:'unspecified',floor:'',position:'',pair_id:'',distance_m:'',height_m:'',notes:'',samples:[]};
}
export function parseLevels(text) {
  const raw=String(text).trim().replace(/[−–]/g,'-');
  if(!raw) throw new Error('请先输入电平读数。');
  const tokens=raw.split(/[\s,，;；]+/).filter(Boolean);
  if(tokens.length>5000) throw new Error('每次最多录入 5000 条读数。');
  return tokens.map((token,i)=>{
    if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) throw new Error('第 '+(i+1)+' 项不是有效数值：'+token.slice(0,30));
    const n=Number(token);
    if(!Number.isFinite(n)||n < -300 || n > 300) throw new Error('电平读数应在 -300 到 300 之间，请核对第 '+(i+1)+' 项。');
    return n;
  });
}
export function statistics(values) {
  if(!values.length) return {n:0,mean:null,std:null,min:null,max:null,median:null};
  // Welford's method avoids cancellation in sample variance.
  let mean=0,m2=0,n=0,min=Infinity,max=-Infinity;
  for(const value of values) {n++;const delta=value-mean;mean+=delta/n;m2+=delta*(value-mean);min=Math.min(min,value);max=Math.max(max,value);}
  const sorted=[...values].sort((a,b)=>a-b),mid=Math.floor(n/2);
  return {n,mean,std:n>1?Math.sqrt(m2/(n-1)):null,min,max,median:n%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2};
}
export function penetration(groups) {
  const rows=[];
  for(const inside of groups.filter(g=>g.environment==='indoor'&&g.pair_id.trim()&&g.samples.length&&Number(g.frequency_mhz)>0)) {
    const outside=groups.filter(g=>g.environment==='outdoor'&&g.samples.length&&
      g.pair_id.trim()===inside.pair_id.trim()&&g.date===inside.date&&
      Number(g.frequency_mhz)===Number(inside.frequency_mhz)&&g.unit===inside.unit&&g.instrument===inside.instrument);
    if(!outside.length) continue;
    const out=statistics(outside.flatMap(g=>g.samples.map(s=>s.level))),inn=statistics(inside.samples.map(s=>s.level));
    rows.push({inside,outside,out,inn,loss:out.mean-inn.mean,complete:out.n>=51&&inn.n>=51});
  }
  return rows;
}
export const COLUMNS=['measurement_date','location','position','level','unit','group_id','group_name','environment','frequency_mhz','material','floor','pair_id','distance_m','height_m','instrument','group_notes','sample_note','sample_id','sample_index','recorded_at_utc'];
export function measurementRows(groups) {
  return groups.flatMap(g=>g.samples.map((s,i)=>({
    measurement_date:g.date,location:g.location,position:g.position,level:s.level,unit:g.unit,group_id:g.id,
    group_name:g.name,environment:g.environment,frequency_mhz:g.frequency_mhz,material:g.material,
    floor:g.floor,pair_id:g.pair_id,distance_m:g.distance_m,height_m:g.height_m,instrument:g.instrument,
    group_notes:g.notes,sample_note:s.note,sample_id:s.id,sample_index:i+1,recorded_at_utc:s.recorded_at
  })));
}
export const SUMMARY_COLUMNS=['group_id','group_name','measurement_date','location','position','environment','frequency_mhz','unit','material','floor','pair_id','instrument','count','mean_level','std_level','min_level','max_level','median_level','sampling_complete'];
export function summaryRows(groups) {
  return groups.map(g=>{const s=statistics(g.samples.map(s=>s.level));return {
    group_id:g.id,group_name:g.name,measurement_date:g.date,location:g.location,position:g.position,
    environment:g.environment,frequency_mhz:g.frequency_mhz,unit:g.unit,material:g.material,floor:g.floor,
    pair_id:g.pair_id,instrument:g.instrument,count:s.n,mean_level:s.mean,std_level:s.std,min_level:s.min,max_level:s.max,
    median_level:s.median,sampling_complete:s.n>=51?1:0
  };});
}
export function toCSV(rows,columns) {
  const cell=value=>{
    if(value===null||value===undefined||value==='') return '';
    if(typeof value==='number') return String(value);
    let text=String(value);
    // Text-only cells are protected from spreadsheet formula execution.
    if(/^[\s]*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text)) text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  };
  return '\uFEFF'+[columns.join(','),...rows.map(row=>columns.map(k=>cell(row[k])).join(','))].join('\r\n')+'\r\n';
}
function isObject(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function str(value,name,max,required=false){
  if(typeof value!=='string'||value.length>max||(required&&!value.trim())) throw new Error('备份字段无效：'+name);
  return value;
}
function num(value,name,min,max,integer=false){
  if(value==='') return '';
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value))) throw new Error('备份数值无效：'+name);
  return value;
}
export function validateBackup(data) {
  if(!isObject(data)||data.schema_version!==SCHEMA_VERSION||!Array.isArray(data.groups)||data.groups.length>2000) throw new Error('不是受支持的场记备份文件（版本 1）。');
  const groupIds=new Set(),sampleIds=new Set();let total=0;
  const groups=data.groups.map(g=>{
    if(!isObject(g)||!Array.isArray(g.samples)) throw new Error('测量组格式无效。');
    const id=str(g.id,'id',100,true);
    if(groupIds.has(id)) throw new Error('备份中包含重复测量组编号。');groupIds.add(id);
    if(!Object.hasOwn(UNITS,g.unit)||!Object.hasOwn(ENVIRONMENTS,g.environment)||!Object.hasOwn(MATERIALS,g.material)) throw new Error('备份包含未知的单位、环境或材料。');
    const date=str(g.date,'date',10,true);
    const parsedDate=new Date(date+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsedDate.getTime())||parsedDate.toISOString().slice(0,10)!==date) throw new Error('备份日期无效。');
    total+=g.samples.length;if(total>200000) throw new Error('备份最多支持 200000 条记录。');
    const clean={id,name:str(g.name,'name',100,true),date,location:str(g.location,'location',160),
      instrument:str(g.instrument,'instrument',80,true),frequency_mhz:num(g.frequency_mhz,'frequency_mhz',.000001,1000000),
      unit:g.unit,environment:g.environment,material:g.material,floor:num(g.floor,'floor',-20,200,true),
      position:str(g.position,'position',100),pair_id:str(g.pair_id,'pair_id',80),
      distance_m:num(g.distance_m,'distance_m',0,10000000),height_m:num(g.height_m,'height_m',0,10000),notes:str(g.notes,'notes',2000),
      samples:g.samples.map(s=>{
        if(!isObject(s)) throw new Error('单条读数格式无效。');
        const sid=str(s.id,'sample_id',100,true);
        if(sampleIds.has(sid)) throw new Error('备份中包含重复读数编号。');sampleIds.add(sid);
        const recorded_at=str(s.recorded_at,'recorded_at',30,true);
        if(!/^\d{4}-\d{2}-\d{2}T/.test(recorded_at)||!Number.isFinite(Date.parse(recorded_at))) throw new Error('备份时间戳无效。');
        if(typeof s.level!=='number'||!Number.isFinite(s.level)||s.level< -300||s.level>300) throw new Error('备份电平无效。');
        return {id:sid,level:s.level,note:str(s.note,'sample_note',500),recorded_at};
      })};
    if(clean.samples.length&&(!clean.location.trim()||clean.frequency_mhz==='')) throw new Error('有读数的测量组缺少地点或频率。');
    return clean;
  });
  return {schema_version:SCHEMA_VERSION,groups};
}
export function mergeGroups(existing,incoming) {
  const result=structuredClone(existing);let added=0,skipped=0;
  const usedSampleIds=new Set(result.flatMap(g=>g.samples.map(s=>s.id)));
  for(const group of incoming) {
    const found=result.find(g=>g.id===group.id);
    if(found&&JSON.stringify(found)===JSON.stringify(group)){skipped++;continue;}
    const copy=structuredClone(group);
    if(found){copy.id=uid();copy.name=(copy.name.slice(0,90)+' · 导入副本');}
    copy.samples=copy.samples.map(s=>{if(usedSampleIds.has(s.id)) s.id=uid();usedSampleIds.add(s.id);return s;});
    result.push(copy);added++;
  }
  return {groups:result,added,skipped};
}

