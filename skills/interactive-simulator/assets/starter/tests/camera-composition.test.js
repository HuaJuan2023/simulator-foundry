import {test} from 'node:test';
import assert from 'node:assert/strict';
import {celestialState} from '../src/simulators/celestial.js';
import {celestialComposition} from '../src/simulators/camera-composition.js';
test('sky composition includes the ship and the visible light at dawn, noon, dusk and night',()=>{
  for(const hour of [6.1,9,12,17.6,19,0,3]){
    const c=celestialState(hour),d=c.sunVisible?c.sun:c.moon,shot=celestialComposition(d),half=shot.fov*Math.PI/360;
    assert.ok(Math.abs(shot.subjectAngle-shot.angle)<half-.03,`ship at ${hour}`);
    assert.ok(Math.abs(shot.lightAngle-shot.angle)<half-.03,`light at ${hour}`);
    assert.equal(shot.position[1],30);
    assert.ok(shot.position[0]*d.x+shot.position[2]*d.z<0);
  }
});
