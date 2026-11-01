import * as THREE from 'three';
import { WakeHistory } from './wake-history.js';

export function createWake(scene, heightAt) {
  const history=new WakeHistory();
  const lanes=3,across=5,capacity=history.capacity;
  const positions=new Float32Array(capacity*lanes*across*3),uv=new Float32Array(capacity*lanes*across*2),alphas=new Float32Array(capacity*lanes*across);
  const indices=[];
  for(let lane=0;lane<lanes;lane++)for(let row=0;row<capacity-1;row++)for(let col=0;col<across-1;col++){
    const a=(lane*capacity+row)*across+col,b=a+across;indices.push(a,b,a+1,a+1,b,b+1);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aAlpha',new THREE.BufferAttribute(alphas,1).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(indices);
  const uniforms={uTime:{value:0},uDay:{value:1}};
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms,
    vertexShader:`attribute float aAlpha;varying vec2 vUv;varying float vAlpha;void main(){vUv=uv;vAlpha=aAlpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float uTime,uDay;varying vec2 vUv;varying float vAlpha;
      float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){float edge=pow(max(0.,1.-abs(vUv.x*2.-1.)),.6);float n=noise(vUv*vec2(9.,1.2)+vec2(uTime*.12,-uTime*.25));float a=vAlpha*edge*smoothstep(.18,.68,n)*.72;if(a<.012)discard;gl_FragColor=vec4(mix(vec3(.18,.3,.39),vec3(.8,.92,.91),uDay),a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=1;scene.add(mesh);
  // Bow spray is actual short-lived geometry, emitted only as the hull moves.
  const particleCount=500,particles=Array.from({length:particleCount},()=>({born:-100}));
  const pp=new Float32Array(particleCount*3),pa=new Float32Array(particleCount),ps=new Float32Array(particleCount);
  const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(pp,3).setUsage(THREE.DynamicDrawUsage));pg.setAttribute('aAlpha',new THREE.BufferAttribute(pa,1).setUsage(THREE.DynamicDrawUsage));pg.setAttribute('aSize',new THREE.BufferAttribute(ps,1));
  let cursor=0,emissionDistance=0;
  const pm=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uDay:uniforms.uDay},vertexShader:`attribute float aAlpha,aSize;varying float vAlpha;void main(){vAlpha=aAlpha;vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(aSize*180./max(1.,-p.z),1.,8.);gl_Position=projectionMatrix*p;}`,fragmentShader:`uniform float uDay;varying float vAlpha;void main(){float r=length(gl_PointCoord-.5)*2.;float a=(1.-smoothstep(.2,1.,r))*vAlpha;if(a<.01)discard;gl_FragColor=vec4(mix(vec3(.24,.4,.5),vec3(.85,.95,.95),uDay),a);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include')});
  const spray=new THREE.Points(pg,pm);spray.frustumCulled=false;spray.renderOrder=2;scene.add(spray);
  function record(x,z,heading,time,strength=1){
    const radians=heading*Math.PI/180,sin=Math.sin(radians),cos=Math.cos(radians);
    const old=history.previous;
    const sternX=x-sin*65,sternZ=z+cos*65;
    const moved=old?Math.hypot(sternX-old.x,sternZ-old.z):0;
    history.record(sternX,sternZ,time,strength);
    emissionDistance+=moved;
    const bursts=Math.min(24,Math.floor(emissionDistance/1.2));emissionDistance%=1.2;
    for(let b=0;b<bursts;b++)for(const side of [-1,1]){
      const p=particles[cursor++%particleCount];const jitter=Math.random();
      Object.assign(p,{x:x+sin*72+cos*side*3,z:z-cos*72+sin*side*3,born:time,vx:cos*side*(1+jitter*2)-sin*2,vz:sin*side*(1+jitter*2)+cos*2,vy:2+jitter*3,life:.9+jitter*.5});
      ps[(cursor-1)%particleCount]=1+jitter*1.6;
    }
    pg.attributes.aSize.needsUpdate=true;
  }
  function update(time,travel,day,enabled,wind){
    history.prune(time);mesh.visible=spray.visible=enabled;uniforms.uTime.value=time;uniforms.uDay.value=day;
    const samples=history.samples,n=samples.length;
    alphas.fill(0);
    for(let lane=0;lane<lanes;lane++)for(let row=0;row<capacity;row++){
      const s=samples[Math.min(row,n-1)];if(!s)break;
      const age=Math.max(0,time-s.born),fade=Math.pow(Math.max(0,1-age/history.lifetime),1.6),side=lane===0?0:lane===1?-1:1;
      const spread=side*(10+age*2.1),width=lane===0?5+age*.38:1.5+age*.07;
      for(let col=0;col<across;col++){
        const i=(lane*capacity+row)*across+col,u=col/(across-1),lateral=spread+(u*2-1)*width;
        const wx=s.x+s.nx*lateral+age*wind*.018,wz=s.z+s.nz*lateral;
        positions[i*3]=wx-travel.x;positions[i*3+1]=heightAt(wx,wz)+.13+Math.sin(age*2-col)*.05;positions[i*3+2]=wz-travel.y;
        uv[i*2]=u;uv[i*2+1]=s.born*.7;alphas[i]=row<n&&row>0?fade*Math.min(s.strength,1.2)*(lane===0?.8:.65):0;
      }
    }
    geometry.attributes.position.needsUpdate=true;geometry.attributes.uv.needsUpdate=true;geometry.attributes.aAlpha.needsUpdate=true;
    for(let i=0;i<particleCount;i++){
      const p=particles[i],age=time-p.born,alive=age>=0&&age<p.life;
      pa[i]=alive?(1-age/p.life)*.7:0;
      if(alive){const wx=p.x+p.vx*age,wz=p.z+p.vz*age;pp[i*3]=wx-travel.x;pp[i*3+1]=heightAt(wx,wz)+.3+p.vy*age-3.8*age*age;pp[i*3+2]=wz-travel.y;}
    }
    pg.attributes.position.needsUpdate=true;pg.attributes.aAlpha.needsUpdate=true;
    return n;
  }
  return {record,update,history,clear(){history.clear();particles.forEach(p=>p.born=-100);emissionDistance=0;},dispose(){geometry.dispose();material.dispose();pg.dispose();pm.dispose();scene.remove(mesh,spray);}};
}
