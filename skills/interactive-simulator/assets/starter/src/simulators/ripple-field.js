import * as THREE from 'three';

// Damped 2D wave equation, integrated on a local world-space height field.
// RG stores height and vertical velocity. Reprojection preserves old waves when the origin shifts.
export function createRippleField(renderer, resolution=256) {
  if(!renderer.extensions.has('EXT_color_buffer_float'))return null;
  const extent=896,cell=extent/resolution,center=new THREE.Vector2(),oldCenter=new THREE.Vector2();
  const options={type:THREE.HalfFloatType,format:THREE.RGBAFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,stencilBuffer:false};
  let source=new THREE.WebGLRenderTarget(resolution,resolution,options),destination=source.clone();
  const from=Array.from({length:8},()=>new THREE.Vector4()),to=Array.from({length:8},()=>new THREE.Vector4());
  const uniforms={uState:{value:source.texture},uTexel:{value:1/resolution},uExtent:{value:extent},uCell:{value:cell},uShift:{value:new THREE.Vector2()},uCenter:{value:center},uDt:{value:0},uCount:{value:0},uFrom:{value:from},uTo:{value:to}};
  const material=new THREE.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`uniform sampler2D uState;uniform float uTexel,uExtent,uCell,uDt;uniform vec2 uShift,uCenter;uniform int uCount;uniform vec4 uFrom[8],uTo[8];varying vec2 vUv;
      vec2 read(vec2 uv){if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return vec2(0.);return texture2D(uState,uv).rg;}
      float brush(vec2 p,vec2 a,vec2 b,float width){vec2 ab=b-a;float t=clamp(dot(p-a,ab)/max(dot(ab,ab),.001),0.,1.);vec2 d=p-a-ab*t;float q=dot(d,d)/(width*width);return (1.-q)*exp(-q);}
      void main(){vec2 uv=vUv+uShift;vec2 state=read(uv);float lap=(read(uv+vec2(uTexel,0.)).x+read(uv-vec2(uTexel,0.)).x+read(uv+vec2(0.,uTexel)).x+read(uv-vec2(0.,uTexel)).x-4.*state.x)/(uCell*uCell);
        float velocity=(state.y+256.*lap*uDt)*exp(-uDt*.16);float height=state.x+velocity*uDt;
        vec2 p=uCenter+(vUv-.5)*uExtent;
        for(int i=0;i<8;i++){if(i>=uCount)break;float movement=min(length(uTo[i].xy-uFrom[i].xy),20.);height+=movement*.008*(brush(p,uFrom[i].xy,uTo[i].xy,7.)+brush(p,uFrom[i].zw,uTo[i].zw,5.)*.8);}
        float boundary=smoothstep(0.,.06,min(min(vUv.x,vUv.y),min(1.-vUv.x,1.-vUv.y)));
        gl_FragColor=vec4(clamp(height,-1.2,1.2)*boundary,velocity*boundary,0.,1.);
      }`});
  const scene=new THREE.Scene(),camera=new THREE.Camera(),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);scene.add(quad);
  let previous=null,queue=[];
  function clear(){const target=renderer.getRenderTarget(),color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();renderer.setClearColor(0,0);for(const t of [source,destination]){renderer.setRenderTarget(t);renderer.clear();}renderer.setRenderTarget(target);renderer.setClearColor(color,alpha);previous=null;queue=[];}
  clear();
  return {
    center,extent,cell,
    get texture(){return source.texture;},
    record(x,z,heading){const r=heading*Math.PI/180,s=Math.sin(r),c=Math.cos(r);const pose=new THREE.Vector4(x-s*65,z+c*65,x+s*72,z-c*72);if(previous&&Math.hypot(pose.x-previous.x,pose.y-previous.y)>.025){queue.push({from:previous.clone(),to:pose.clone()});if(queue.length>32)queue.shift();}previous=pose;},
    update(dt,x,z){
      oldCenter.copy(center);if(Math.abs(x-center.x)>extent*.2||Math.abs(z-center.y)>extent*.2)center.set(Math.round(x/cell)*cell,Math.round(z/cell)*cell);
      if(dt<=0&&!queue.length&&center.equals(oldCenter))return;
      const target=renderer.getRenderTarget(),steps=Math.max(1,Math.ceil(Math.min(dt,.8)/.1));
      const batch=queue.splice(0,8);batch.forEach((b,i)=>{from[i].copy(b.from);to[i].copy(b.to);});
      for(let i=0;i<steps;i++){
        uniforms.uState.value=source.texture;uniforms.uDt.value=Math.min(dt,.8)/steps;uniforms.uCount.value=i===0?batch.length:0;
        uniforms.uShift.value.copy(i===0?center:oldCenter).sub(oldCenter).divideScalar(extent);
        renderer.setRenderTarget(destination);renderer.render(scene,camera);[source,destination]=[destination,source];
      }
      renderer.setRenderTarget(target);
    },
    clear,
    dispose(){source.dispose();destination.dispose();quad.geometry.dispose();material.dispose();}
  };
}
