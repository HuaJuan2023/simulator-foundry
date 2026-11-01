import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSubjectName,safeFilename,chooseRecordingMime} from '../src/recording-utils.js';
import {buildDemoSteps,demoFrame,createDemoTour} from '../src/demo-tour.js';

test('subject names preserve Chinese and complete Unicode characters with a bounded length',()=>{
  assert.equal(normalizeSubjectName('  星辰远航号\n '),'星辰远航号');
  assert.equal(normalizeSubjectName('  ','Ocean Lab'),'Ocean Lab');
  assert.equal(Array.from(normalizeSubjectName('🚢'.repeat(30))).length,24);
  assert.ok(!safeFilename('船/名:*?').includes('/'));
});
test('recording format negotiates a supported codec, with and without audio',()=>{
  assert.ok(chooseRecordingMime(t=>t.includes('mp4')).includes('mp4'));
  assert.equal(chooseRecordingMime(t=>t==='video/webm;codecs=vp8,opus'),'video/webm;codecs=vp8,opus');
  assert.equal(chooseRecordingMime(t=>t==='video/webm;codecs=vp8',false),'video/webm;codecs=vp8');
  assert.equal(chooseRecordingMime(()=>false),'');
});
test('automatic recording covers the requested simulation features and both scene types',()=>{
  const cargo=buildDemoSteps(true),ocean=buildDemoSteps(false);
  for(const id of ['identity','sailing','turning','move','bridge','sunrise','noon','sunset','moon','cloudy','fog','storm','waves','wireframe','effects','quality','pause','resume'])assert.ok(cargo.some(s=>s.id===id),id);
  assert.ok(!ocean.some(s=>s.id==='bridge'));
  assert.equal(demoFrame(cargo,0,90).index,0);
  assert.equal(demoFrame(cargo,90,90).step.id,'resume');
  assert.equal(demoFrame(cargo,90,90).done,true);
});
test('ending or interrupting an automatic tour restores parameters and the original pause state',()=>{
  let callback,restored=false,paused=true,completed=false;
  const original={subjectName:'远航号',height:.6,time:9,view:'follow',knots:12},state={...original};
  const ocean={onBeforeFrame(fn){callback=fn;return()=>{};},captureState(){return{shipPosition:[0,0,0],floaters:[{x:0,z:0}]};},restoreState(){restored=true;},setView(){},update(){},orbitCamera(){},moveSubject(){}};
  const tour=createDemoTour({ocean,state,cargo:true,update(){},setPaused(v){paused=v;},onComplete(){completed=true;}});
  const start=performance.now();tour.start(45,true);callback(start+23000);assert.notDeepEqual(state,original);
  tour.stop();assert.deepEqual(state,original);assert.equal(paused,true);assert.equal(restored,true);
  tour.start(45,true);callback(performance.now()+46000);assert.equal(completed,true);tour.restore();assert.deepEqual(state,original);
});
