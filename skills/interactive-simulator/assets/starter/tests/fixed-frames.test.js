import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderFixedFrames} from '../src/fixed-frames.js';
import {buildDemoSteps,demoFrame} from '../src/demo-tour.js';

test('slow asynchronous encoding preserves all 1350 frames and every demo chapter',async()=>{
  let pending=false,rendered=-1;const timestamps=[],chapters=new Set(),steps=buildDemoSteps();
  const count=await renderFixedFrames({seconds:45,
    render(i,t){assert.equal(pending,false);rendered=i;chapters.add(demoFrame(steps,t,45).step.id);},
    async encode(i,t,dt){assert.equal(rendered,i);pending=true;await Promise.resolve();await Promise.resolve();timestamps.push(t);assert.equal(dt,1/30);pending=false;},
    yieldTask:()=>Promise.resolve()});
  assert.equal(count,1350);assert.equal(timestamps[0],0);assert.equal(timestamps.at(-1),1349/30);
  assert.equal(new Set(timestamps).size,1350);assert.equal(chapters.size,steps.length);
});
test('export cancellation occurs between frames and retains contiguous timestamps',async()=>{
  let encoded=0;const count=await renderFixedFrames({seconds:45,cancelled:()=>encoded===7,render(){},async encode(i,t){assert.equal(t,encoded/30);encoded++;},yieldTask:()=>Promise.resolve()});
  assert.equal(count,7);
});
test('encoder failures stop rendering subsequent frames',async()=>{
  let rendered=0;await assert.rejects(renderFixedFrames({seconds:45,render(){rendered++;},encode(){throw Error('codec failure');}}),/codec failure/);assert.equal(rendered,1);
});
