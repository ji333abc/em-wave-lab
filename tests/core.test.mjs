import test from 'node:test';
import assert from 'node:assert/strict';
import {createGroup,parseLevels,statistics,penetration,toCSV,COLUMNS,measurementRows,validateBackup,mergeGroups} from '../core.js';
function populated(environment='outdoor',unit='dBuV',frequency=100) {
  const g=createGroup();Object.assign(g,{location:'A楼，东侧',environment,unit,frequency_mhz:frequency,pair_id:'A'});
  g.samples=[{id:crypto.randomUUID(),level:environment==='outdoor'?60:45,note:'含"引号"\n第二行',recorded_at:new Date().toISOString()}];return g;
}
test('single and batch parsing preserves zero, negatives and decimals',()=>{
  assert.deepEqual(parseLevels('−50.3，0; +25.5\n.5'),[-50.3,0,25.5,.5]);
  for(const bad of ['', '2 -', '12dBm', 'NaN','Infinity','1e4','300.1','1,2oops'])assert.throws(()=>parseLevels(bad));
});
test('sample statistics use n-1, with undefined standard deviation for one sample',()=>{
  assert.equal(statistics([1,2,3]).mean,2);assert.equal(statistics([1,2,3]).std,1);
  assert.equal(statistics([4]).std,null);assert.equal(statistics([]).mean,null);
  assert.equal(statistics([0,0]).std,0);assert.equal(statistics([-3,-1]).median,-2);
});
test('CSV is BOM UTF-8 RFC4180 with independent numeric and text handling',()=>{
  const g=populated();g.name='=HYPERLINK("example")';g.samples[0].level=-50.3;
  const csv=toCSV(measurementRows([g]),COLUMNS);
  assert.ok(csv.startsWith('\uFEFFmeasurement_date,'));assert.ok(csv.includes(',-50.3,'));
  assert.ok(csv.includes('"A楼，东侧"'));assert.ok(csv.includes('"含""引号""\n第二行"'));
  assert.ok(csv.includes('"\'=HYPERLINK'));assert.ok(csv.endsWith('\r\n'));
});
test('penetration never mixes units, dates, instruments or frequencies',()=>{
  const out=populated(),inside=populated('indoor'),wrong=populated('outdoor','dBm');
  wrong.samples[0].level=-100;
  assert.equal(penetration([out,inside,wrong])[0].loss,15);
  assert.equal(penetration([wrong,inside]).length,0);
  const second=structuredClone(out);second.id=crypto.randomUUID();second.samples[0].level=80;
  assert.equal(penetration([out,second,inside])[0].loss,25);
  inside.frequency_mhz=200;assert.equal(penetration([out,inside]).length,0);
  inside.frequency_mhz=100;inside.date='2020-01-01';assert.equal(penetration([out,inside]).length,0);
});
test('backup validates atomically, including numeric fields, duplicates and dates',()=>{
  const g=populated(),data={schema_version:1,groups:[g]};
  assert.deepEqual(validateBackup(data).groups,[g]);
  for(const mutation of [x=>x.groups[0].samples[0].level=null,x=>x.groups[0].unit='watts',x=>x.groups.push(x.groups[0]),x=>x.groups[0].date='2026-02-30',x=>x.groups[0].frequency_mhz='',x=>x.groups[0].floor=1.5]) {
    const copy=structuredClone(data);mutation(copy);assert.throws(()=>validateBackup(copy));
  }
});
test('merge preserves current data, skips identical backups and remaps conflicts',()=>{
  const g=populated(),same=mergeGroups([g],[g]);assert.equal(same.skipped,1);assert.equal(same.groups.length,1);
  const changed=structuredClone(g);changed.samples[0].level=99;
  const merged=mergeGroups([g],[changed]);
  assert.equal(merged.groups.length,2);assert.equal(merged.groups[0].samples[0].level,60);
  assert.notEqual(merged.groups[1].id,g.id);assert.notEqual(merged.groups[1].samples[0].id,g.samples[0].id);
  assert.doesNotThrow(()=>validateBackup({schema_version:1,groups:merged.groups}));
});

