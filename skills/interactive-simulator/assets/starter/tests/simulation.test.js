import {test} from 'node:test';
import assert from 'node:assert/strict';
import {celestialState} from '../src/simulators/celestial.js';
import {WakeHistory} from '../src/simulators/wake-history.js';

test('sun crosses horizon at the selected sunrise and sunset',()=>{
  for(const [rise,set] of [[6,18],[5,20],[8,17]]){
    assert.ok(Math.abs(celestialState(rise,rise,set).sun.y)<1e-8);
    assert.ok(Math.abs(celestialState(set,rise,set).sun.y)<1e-8);
    assert.ok(celestialState(rise+.2,rise,set).sun.y>0);
    assert.ok(celestialState(set+.2,rise,set).sun.y<0);
    assert.ok(celestialState((rise+set)/2,rise,set).daylight>.99);
  }
});
test('moon rises during night, solar and lunar directions are distinct',()=>{
  const noon=celestialState(12),night=celestialState(0);
  assert.ok(noon.sun.y>0&&noon.moon.y<0);
  assert.ok(night.moon.y>0&&night.sun.y<0);
  assert.ok(night.daylight<.01);
  assert.deepEqual(celestialState(24),celestialState(0));
});
test('wake spacing does not depend on frame count',()=>{
  const a=new WakeHistory(),b=new WakeHistory();a.record(0,0,0);b.record(0,0,0);
  a.record(0,-25,5);for(let i=1;i<=50;i++)b.record(0,-i*.5,i*.1);
  assert.equal(a.samples.length,10);assert.equal(a.samples.length,b.samples.length);
  a.samples.forEach((s,i)=>{assert.ok(Math.abs(s.z-b.samples[i].z)<1e-7);});
});
test('old wake stays in world space when the ship turns or is dragged',()=>{
  const h=new WakeHistory();h.record(0,0,0);h.record(0,-20,2);
  const old=h.samples.map(s=>({...s}));h.record(30,-20,4);
  assert.deepEqual(h.samples.slice(0,old.length),old);
  assert.ok(h.samples.some(s=>s.x>0&&s.z===-20));
  const count=h.samples.length;h.record(30,-20,5);assert.equal(h.samples.length,count);
});
test('wake dissipates, resets and has bounded memory',()=>{
  const h=new WakeHistory({capacity:20,lifetime:10});h.record(0,0,0);h.record(0,-1000,9);
  assert.equal(h.samples.length,20);h.prune(20);assert.equal(h.samples.length,0);
  h.record(0,-1010,21);h.clear();assert.equal(h.samples.length,0);assert.equal(h.previous,null);
});
