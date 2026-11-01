import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCargoShip } from './cargo-ship.js';
import { celestialState } from './celestial.js';
import { createWake } from './wake.js';
import { createRippleField } from './ripple-field.js';
import { mergeStaticMeshes } from './merge-static.js';
import { celestialComposition } from './camera-composition.js';
const WAVE_COMPONENTS=Array.from({length:8},(_,i)=>{const angle=.65+Math.sin(i*2.4)*.9,k=.065*1.88**i;return {dx:Math.cos(angle),dz:Math.sin(angle),k,a:.42*.6**i,c:Math.sqrt(9.81*k)};});

const waveGLSL = `
uniform float uTime, uHeight, uWind, uChop;
void surface(vec2 p, out vec3 result, out vec3 normal) {
  result = vec3(p.x, 0.0, p.y);
  vec3 dx=vec3(1.,0.,0.), dz=vec3(0.,0.,1.);
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float angle = .65 + sin(fi * 2.4) * .9;
    vec2 dir = vec2(cos(angle), sin(angle));
    float k = .065 * pow(1.88, fi);
    float a = uHeight * .42 * pow(.6, fi);
    float phase = dot(dir, p) * k - uTime * sqrt(9.81 * k) * (.35 + uWind * .065);
    float s=sin(phase), c=cos(phase);
    result.y += a * s;
    result.xz += dir * uChop * a * c;
    dx.y += a*k*dir.x*c; dz.y += a*k*dir.y*c;
    dx.xz -= dir*uChop*a*k*dir.x*s;
    dz.xz -= dir*uChop*a*k*dir.y*s;
  }
  normal=normalize(cross(dz,dx));
}
`;
const skyGLSL = `
uniform vec3 uSun,uMoon,uLight;
uniform float uDay, uStorm, uCloudiness, uFog;
float hash(vec2 p) { vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z); }
float noise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p) { float v=0., a=.5; for(int i=0;i<3;i++){ v+=a*noise(p);p=p*2.03+13.2;a*=.5;} return v; }
vec3 skyColor(vec3 d) {
  float y=max(d.y,0.0);
  float sunset=pow(1.0-clamp(abs(uSun.y)*3.,0.,1.),2.)*smoothstep(-.12,.05,uSun.y);
  vec3 top=mix(vec3(.008,.016,.043),vec3(.095,.21,.29),uDay);
  vec3 horizon=mix(vec3(.035,.065,.105),vec3(.48,.60,.65),uDay);
  horizon=mix(horizon,vec3(.84,.53,.35),sunset*.8);
  vec3 col=mix(horizon,top,pow(y,.45));
  float sd=max(dot(d,uSun),0.);
  col+=vec3(1.,.59,.25)*pow(sd,12.)*sunset*.65;
  col+=vec3(1.,.72,.48)*pow(sd,100.)*sunset*1.3;
  
  float sunUp=smoothstep(-.025,.005,uSun.y);
  float sunDisk=smoothstep(cos(.014),cos(.0115),dot(d,uSun))*sunUp;
  col+=vec3(1.,.56,.16)*pow(sd,100.)*.35*sunUp;
  col+=mix(vec3(7.,2.5,.7),vec3(7.,6.5,4.4),smoothstep(0.,.3,uSun.y))*sunDisk;
  float md=dot(d,uMoon),moonUp=smoothstep(-.025,.005,uMoon.y)*(1.-uDay);
  col+=vec3(.2,.3,.5)*pow(max(md,0.),350.)*.35*moonUp;
  if(md>cos(.018)){
    vec3 tangent=normalize(cross(vec3(0,1,0),uMoon));
    vec3 vertical=cross(uMoon,tangent);
    vec2 uv=vec2(dot(d,tangent),dot(d,vertical))/.016;
    float radius=length(uv),disc=1.-smoothstep(.95,1.,radius);
    float relief=.7+.15*noise(uv*16.)+.12*noise(uv*39.);
    relief-=.18*exp(-dot(uv-vec2(-.3,.2),uv-vec2(-.3,.2))*16.);
    relief-=.13*exp(-dot(uv-vec2(.35,-.35),uv-vec2(.35,-.35))*30.);
    col=mix(col,vec3(.85,.9,1.)*relief*1.7,disc*moonUp);
  }

  col=mix(col,mix(vec3(.11,.15,.19),vec3(.33,.39,.41),pow(1.-y,2.)),uCloudiness*.8);
  col=mix(col,mix(vec3(.08,.12,.17),vec3(.57,.65,.66),uDay),uFog*.65);
  return col;
}
`;

export function createOcean(container, state, { cargo = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.1, Math.sqrt(1600000/(container.clientWidth*container.clientHeight))));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.;
  const gl=renderer.getContext(),debugInfo=gl.getExtension('WEBGL_debug_renderer_info');
  const gpu=debugInfo?gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  container.dataset.gpu=gpu;
  const softwareGPU=/swiftshader|llvmpipe|software/i.test(gpu);
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, container.clientWidth / container.clientHeight, .2, 6000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .045;
  controls.minDistance = cargo ? 12 : 3; controls.maxDistance = cargo ? 620 : 155;
  controls.maxPolarAngle = Math.PI * .485;
  controls.minPolarAngle = .12;
  controls.enablePan = true; controls.screenSpacePanning=true; controls.panSpeed=.65;
  const shipPosition = new THREE.Vector3();
  let viewMode = state.view || 'follow';
  const followedPosition=new THREE.Vector3();
  function resetCamera() { if(state.view==='sky')state.view='follow';if(cargo){viewMode=state.view||'follow';setView(viewMode);}else{viewMode='follow';controls.enabled=true;camera.position.set(37, 15, 47); controls.target.set(0, 1, -10); controls.update();} }
  function setView(mode){
    const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;
    controls.maxPolarAngle=mode==='sky'?Math.PI*.95:Math.PI*.495;
    viewMode=mode;if(!cargo){controls.enabled=true;camera.position.set(37,15,47);controls.target.set(0,1,-10);controls.update();return;}
    camera.fov=52;
    const views={follow:[65,27,200],top:[0,240,30],port:[-175,36,45],bridge:[0,25,40]};
    const heading=(state.heading||0)*Math.PI/180;
    const p=views[mode]||views.follow;camera.position.set(...p).applyAxisAngle(new THREE.Vector3(0,1,0),-heading).add(shipPosition);
    controls.target.copy(shipPosition).add(new THREE.Vector3(0,mode==='bridge'?23:6,mode==='bridge'?-130:0).applyAxisAngle(new THREE.Vector3(0,1,0),-heading));
    if(mode==='sky'){
      const c=celestialState(state.time,state.sunrise,state.sunset),d=c.sunVisible?c.sun:c.moon;
      const composition=celestialComposition(d);
      camera.position.fromArray(composition.position).add(shipPosition);
      controls.target.copy(shipPosition).setY(composition.targetHeight);camera.fov=composition.fov;
    }
    camera.updateProjectionMatrix();
    controls.enabled=true;controls.minDistance=mode==='bridge'?1:12;followedPosition.copy(shipPosition);controls.update();
  }
  function faceSun(){const c=celestialState(state.time,state.sunrise,state.sunset),d=c.sunVisible?c.sun:c.moon;state.heading=(Math.atan2(d.x,-d.z)*180/Math.PI+360)%360;actualHeading=state.heading;state.view='follow';setView('follow');emitNavigation();}
  resetCamera();
  const uniforms = {
    uTime: { value: 0 }, uHeight: { value: state.height }, uWind: { value: state.wind }, uChop: { value: state.chop },
    uSun: { value: new THREE.Vector3() }, uDay: { value: 1 }, uStorm: { value: 0 }, uFoam: { value: 1 }, uGrid: { value: 0 },
    uTravel:{value:new THREE.Vector2()},uRipple:{value:null},uRippleCenter:{value:new THREE.Vector2()},uRippleExtent:{value:896},uRippleCell:{value:3.5},uRippleEnabled:{value:0},uMoon:{value:new THREE.Vector3()},uLight:{value:new THREE.Vector3()},uDetail:{value:1},uCloudiness:{value:0},uFog:{value:0}
  };
  const seaMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `${waveGLSL}
      uniform vec2 uTravel,uRippleCenter;uniform sampler2D uRipple;uniform float uRippleExtent,uRippleCell,uRippleEnabled;
      varying vec3 vWorld, vNormal;
      void main() {
        vec2 p=position.xz+uTravel;
        vec3 pos, normal; surface(p,pos,normal);
        vec2 ruv=(p-uRippleCenter)/uRippleExtent+.5;
        if(uRippleEnabled>.5&&all(greaterThan(ruv,vec2(.01)))&&all(lessThan(ruv,vec2(.99)))){
          float texel=uRippleCell/uRippleExtent;
          pos.y+=texture2D(uRipple,ruv).r;
          float dx=(texture2D(uRipple,ruv+vec2(texel,0.)).r-texture2D(uRipple,ruv-vec2(texel,0.)).r)/(2.*uRippleCell);
          float dz=(texture2D(uRipple,ruv+vec2(0.,texel)).r-texture2D(uRipple,ruv-vec2(0.,texel)).r)/(2.*uRippleCell);
          normal=normalize(normal+vec3(-dx,0.,-dz));
        }
        pos.xz-=uTravel;vNormal=normal;vWorld=pos;
        gl_Position=projectionMatrix*viewMatrix*vec4(pos,1.);
      }`,
    fragmentShader: `${waveGLSL}${skyGLSL}
      uniform float uFoam, uGrid;
      uniform vec2 uTravel;
      uniform float uDetail;
      varying vec3 vWorld, vNormal;
      void main() {
        vec3 view=normalize(cameraPosition-vWorld);
        float dist=length(cameraPosition-vWorld);
        vec2 p=vWorld.xz+uTravel;
        // Evaluate the spectrum per pixel: interpolated vertex normals alias short
        // waves into flat patches. Filter unresolved wavelengths before shading.
        vec2 slope=vec2(0.);float compression=0.;
        float footprint=max(length(fwidth(p)),.02);
        for(int i=0;i<8;i++){
          float fi=float(i),angle=.65+sin(fi*2.4)*.9;
          vec2 dir=vec2(cos(angle),sin(angle));float k=.065*pow(1.88,fi);
          float a=uHeight*.42*pow(.6,fi),phase=dot(dir,p)*k-uTime*sqrt(9.81*k)*(.35+uWind*.065);
          float bandLimit=1.-smoothstep(.5,2.2,k*footprint);
          slope+=dir*a*k*cos(phase)*bandLimit;
          compression+=a*k*sin(phase)*bandLimit;
        }
        vec2 smallP=p+vec2(noise(p*.047+uTime*.013),noise(p*.061-uTime*.017))*3.;
        vec2 micro=vec2(noise(smallP*.72+vec2(uTime*.2,0.)),noise(smallP*1.17-vec2(0.,uTime*.16)))-.5;
        float fade=1.-smoothstep(80.,550.,dist);
        vec3 n=normalize(vec3(-slope.x,1.,-slope.y)+(vNormal-vec3(0.,1.,0.))*.18+vec3(micro.x,0.,micro.y)*(.06+uWind*.012)*fade);
        vec3 reflection=reflect(-view,n);
        float fresnel=.025+.975*pow(1.-max(dot(n,view),0.),4.5);
        vec3 deep=mix(vec3(.007,.045,.067),vec3(.008,.065,.085),uDay);
        vec3 shallow=mix(vec3(.01,.09,.12),vec3(.018,.16,.18),uDay);
        float crest=clamp(vWorld.y/uHeight*.5+.5,0.,1.);
        vec3 water=mix(deep,shallow,crest*.7);
        water*=.55+max(dot(n,uLight),0.)*.55;
        vec3 col=mix(water,skyColor(reflection),fresnel);
        vec3 halfVector=normalize(view+uLight);
        float rough=.13+uWind*.003,alpha=rough*rough;
        float ndh=max(dot(n,halfVector),0.);
        float denom=ndh*ndh*(alpha*alpha-1.)+1.;
        float sparkle=alpha*alpha/(3.14159*denom*denom+.00001);
        col+=mix(vec3(.36,.52,.9),vec3(1.,.72,.44),uDay)*min(sparkle*.06,4.)*max(uLight.y,.03)*(1.-uStorm*.9);
        // Sparse foam breaks up at crests instead of covering the whole surface.
        float turbulence=noise(p*.32+vec2(uTime*.18));
        float foam=smoothstep(.25,.62,compression*uChop)*smoothstep(.55,.8,turbulence)*uFoam;
        col=mix(col,mix(vec3(.12,.2,.25),vec3(.76,.85,.8),uDay),foam*.8);
        // Procedural light filaments suggest near-surface caustic scattering.
        float caustic=0.;if(dist<90.&&uDetail>.5)caustic=pow(1.-abs(sin(p.x*.7+sin(p.y*.8+uTime*.4))*sin(p.y*.63+cos(p.x*.6-uTime*.3))),18.);
        col+=vec3(.025,.1,.09)*caustic*max(uLight.y,0.)*(1.-fresnel)*exp(-dist*.035);
        vec2 grid=abs(fract(p*.2-.5)-.5)/max(fwidth(p*.2),vec2(.001));
        float line=1.-min(min(grid.x,grid.y),1.);
        col=mix(col,vec3(.25,.76,.65),line*uGrid*.65);
        float fog=1.-exp(-dist*(.0008+uFog*.007));
        col=mix(col,skyColor(normalize(vec3(view.x,.025,-view.z))),fog);
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const seaGeometry = new THREE.PlaneGeometry(2400, 2400, 256, 256);
  // Redistribute vertices near the observation area for detailed waves and a long horizon.
  const positions = seaGeometry.attributes.position;
  for (let i=0;i<positions.count;i++) { const x=positions.getX(i)/1200, y=positions.getY(i)/1200; positions.setXYZ(i,Math.sign(x)*Math.pow(Math.abs(x),1.6)*2400,0,-Math.sign(y)*Math.pow(Math.abs(y),1.6)*2400); }
  seaGeometry.computeBoundingSphere();
  const sea = new THREE.Mesh(seaGeometry, seaMaterial); sea.frustumCulled = false; scene.add(sea);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4500,48,24),new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms,
    vertexShader:`varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*viewMatrix*vec4(position+cameraPosition,1.);}`,
    fragmentShader:`uniform float uTime;${skyGLSL}varying vec3 vDirection;
    void main(){vec3 d=normalize(vDirection);vec3 col=skyColor(d);
      if(d.y>.015){vec2 cp=d.xz/(d.y+.16)*2.8+vec2(uTime*.006,0.);float cloud=fbm(cp);float mask=smoothstep(.55-uCloudiness*.25,.77-uCloudiness*.15,cloud)*smoothstep(.01,.15,d.y);vec3 cc=mix(vec3(.06,.09,.15),mix(vec3(.87,.75,.59),vec3(.65,.73,.76),clamp(uSun.y*3.,0.,1.)),uDay);col=mix(col,cc,mask*(.55+uCloudiness*.45));
      vec2 sp=floor(d.xz/(d.y+.3)*700.);float stars=step(.998,hash(sp))*pow(max(0.,1.-uDay),3.)*smoothstep(.06,.3,d.y);col+=vec3(stars*.65);}
      gl_FragColor=vec4(col,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  })); sky.frustumCulled=false; scene.add(sky);
  const ambient = new THREE.HemisphereLight(0xb5d6df,0x17333b,2); scene.add(ambient);
  const sunlight = new THREE.DirectionalLight(0xffd4a1,3); scene.add(sunlight);
  const floatGroup = new THREE.Group(); scene.add(floatGroup);
  const mat = (c,rough=.5,metal=0) => new THREE.MeshStandardMaterial({color:c,roughness:rough,metalness:metal});
  const orange=mat('#c75d30'), ivory=mat('#d9d6be'), dark=mat('#183239'), metal=mat('#69797c',.28,.8), wood=mat('#816d46');
  function mesh(g,m,parent,x=0,y=0,z=0){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);parent.add(o);return o;}
  function box(w,h,d,m,parent,x=0,y=0,z=0){return mesh(new THREE.BoxGeometry(w,h,d),m,parent,x,y,z);}
  function cylinder(r1,r2,h,m,parent,x=0,y=0,z=0){return mesh(new THREE.CylinderGeometry(r1,r2,h,24),m,parent,x,y,z);}
  const floaters=[];
  // Navigation buoy, built from geometry: collar, cage, ladder, solar panels and beacon.
  function buoy(x,z,scale=1){
    const g=new THREE.Group();g.scale.setScalar(scale);floatGroup.add(g);
    cylinder(1.35,1.05,.9,orange,g,0,.1);cylinder(1.02,1.35,.26,ivory,g,0,.68);
    cylinder(.6,.83,.9,orange,g,0,1.23);cylinder(.56,.61,.22,ivory,g,0,1.7);
    cylinder(.075,.1,4.5,metal,g,0,3.8);
    for(let i=0;i<4;i++){const a=i*Math.PI/2;const leg=cylinder(.035,.035,2.4,metal,g,Math.cos(a)*.52,2.9,Math.sin(a)*.52);leg.rotation.z=Math.cos(a)*.1;leg.rotation.x=Math.sin(a)*.1;}
    const ring=mesh(new THREE.TorusGeometry(.55,.035,8,32),metal,g,0,3.75);ring.rotation.x=Math.PI/2;
    for(let i=0;i<7;i++)box(.45,.035,.04,ivory,g,.05,1.9+i*.26,.57);
    const panel=box(1.25,.07,.8,mat('#173649',.2,.5),g,.85,3.6);panel.rotation.z=-.32;
    for(let i=0;i<5;i++)box(.012,.01,.75,metal,panel,-.5+i*.25,.045);
    cylinder(.25,.25,.15,dark,g,0,4.2);cylinder(.17,.17,.38,mat('#b5d99d'),g,0,4.45);cylinder(.26,.17,.16,dark,g,0,4.72);
    const beacon=mesh(new THREE.SphereGeometry(.13,12,8),new THREE.MeshBasicMaterial({color:'#ddfbb8'}),g,0,4.48);
    const flag=box(.75,.45,.02,orange,g,.4,5.1);
    floaters.push({g,x,z,kind:'buoy',beacon,flag});return g;
  }
  buoy(cargo?-57:-9,cargo?-88:-10,cargo?1.5:1);buoy(cargo?85:31,cargo?-168:-58,cargo?1.2:.7);
  // Small survey boat with a tapered hull, deck fittings and two antennae.
  const boat=new THREE.Group();floatGroup.add(boat);
  const outline=new THREE.Shape();outline.moveTo(0,-3.3);outline.quadraticCurveTo(-1.5,-2.1,-1.5,.5);outline.lineTo(-1.2,2.6);outline.lineTo(1.2,2.6);outline.lineTo(1.5,.5);outline.quadraticCurveTo(1.5,-2.1,0,-3.3);
  const hullGeo=new THREE.ExtrudeGeometry(outline,{depth:.8,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.15,bevelThickness:.15});hullGeo.rotateX(Math.PI/2);
  mesh(hullGeo,ivory,boat,0,.7);box(2.5,.12,3.8,wood,boat,0,.82,.35);
  box(1.9,1.2,1.8,ivory,boat,0,1.45,.25);const glass=mat('#233e48',.13,.4);
  box(1.65,.7,.025,glass,boat,0,1.58,-.665);box(.025,.65,1.45,glass,boat,-.962,1.58,.25);box(.025,.65,1.45,glass,boat,.962,1.58,.25);
  box(2.15,.14,2.05,orange,boat,0,2.12,.25);cylinder(.035,.035,2.1,metal,boat,-.6,3.1,.6);cylinder(.025,.025,1.5,metal,boat,.6,2.85,.65);
  cylinder(.32,.32,.22,ivory,boat,-.6,3.6,.6);
  for(const side of [-1,1]){for(let i=0;i<5;i++)cylinder(.025,.025,.65,metal,boat,side*1.27,1.1,-1.4+i*.8);box(.035,.035,3.6,metal,boat,side*1.27,1.43,.2);for(let i=0;i<3;i++){const tire=mesh(new THREE.TorusGeometry(.23,.09,8,16),dark,boat,side*1.47,.35,-.8+i*1.1);tire.rotation.y=Math.PI/2;}}
  const lifering=mesh(new THREE.TorusGeometry(.32,.09,8,24),orange,boat,0,1.6,1.19);
  box(.65,.7,.5,dark,boat,0,.9,2.6);
  if(!cargo)floaters.push({g:boat,x:6,z:-5,kind:'boat'});else{boat.visible=false;}
  for(const [x,z] of (cargo?[[-40,25],[65,-40],[28,-120]]:[[-17,7],[18,-22],[3,-29]])){
    const g=new THREE.Group();floatGroup.add(g);const barrel=cylinder(.52,.52,1.35,wood,g);barrel.rotation.z=Math.PI/2;
    for(const side of [-.47,.47]){const r=mesh(new THREE.TorusGeometry(.52,.035,8,24),metal,g,side);r.rotation.y=Math.PI/2;}
    floaters.push({g,x,z,kind:'barrel'});
  }
  for(const f of floaters)mergeStaticMeshes(f.g,new Set([f.flag,f.beacon].filter(Boolean)));
  const vessel=cargo?createCargoShip(state.subjectName):null;
  if(vessel)scene.add(vessel.ship);
  const ripple=vessel?createRippleField(renderer,softwareGPU?128:256):null;
  if(ripple){uniforms.uRippleEnabled.value=1;uniforms.uRipple.value=ripple.texture;uniforms.uRippleCenter.value=ripple.center;uniforms.uRippleExtent.value=ripple.extent;uniforms.uRippleCell.value=ripple.cell;}
  container.dataset.rippleEnabled=String(!!ripple);
  const wake=vessel?createWake(scene,heightAt):null;
  const savedFloaters=floaters.map(f=>({x:f.x,z:f.z}));
  let actualKnots=state.knots||0,actualHeading=state.heading||0,distance=0,navElapsed=0;
  const travel=uniforms.uTravel.value;
  // An absolute wave offset and a local ship keep long voyages numerically stable.
  function resetVoyage(){actualKnots=state.knots||0;actualHeading=state.heading||0;distance=0;selected=null;selection.visible=false;wake?.clear();ripple?.clear();travel.set(0,0);shipPosition.set(0,0,0);floaters.forEach((f,i)=>Object.assign(f,savedFloaters[i]));emitNavigation();}
  function emitNavigation(){window.dispatchEvent(new CustomEvent('ocean-navigation',{detail:{knots:actualKnots,heading:actualHeading,distance:distance/1852}}));}
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),dragPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0),hit=new THREE.Vector3();
  const roots=[...floaters.map(f=>f.g),...(vessel?[vessel.ship]:[])];
  const selection=new THREE.Mesh(new THREE.RingGeometry(.96,1,72),new THREE.MeshBasicMaterial({color:'#bde6c9',side:THREE.DoubleSide,transparent:true,opacity:.65,depthWrite:false}));selection.rotation.x=-Math.PI/2;selection.visible=false;scene.add(selection);
  let dragging=null,selected=null,moved=false;const dragOffset=new THREE.Vector3();
  function pointerRay(event){const r=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);}
  function down(event){
    if(exporting||event.button!==0||state.drag===false)return;pointerRay(event);
    const intersect=raycaster.intersectObjects(roots.filter(r=>r.visible&&r.parent.visible),true)[0];if(!intersect)return;
    let root=intersect.object;while(root.parent&&!roots.includes(root))root=root.parent;
    if(!roots.includes(root)||!raycaster.ray.intersectPlane(dragPlane,hit))return;
    selected=dragging=root;moved=false;dragOffset.copy(root.position).sub(hit);controls.enabled=false;renderer.domElement.setPointerCapture(event.pointerId);renderer.domElement.style.cursor='grabbing';
    window.dispatchEvent(new CustomEvent('ocean-selection',{detail:root===vessel?.ship?'远航号 · 拖动可调整位置':'海面物体 · 拖动可调整位置'}));
  }
  function move(event){if(!dragging)return;pointerRay(event);if(!raycaster.ray.intersectPlane(dragPlane,hit))return;hit.add(dragOffset);moved=true;
    if(dragging===vessel?.ship){shipPosition.set(THREE.MathUtils.clamp(hit.x,-500,500),0,THREE.MathUtils.clamp(hit.z,-500,500));wake?.record(shipPosition.x+travel.x,shipPosition.z+travel.y,actualHeading,time,1.1);ripple?.record(shipPosition.x+travel.x,shipPosition.z+travel.y,actualHeading);}
    else{const f=floaters.find(f=>f.g===dragging);f.x=hit.x+travel.x;f.z=hit.z+travel.y;}
    container.dataset.objectX=hit.x.toFixed(2);container.dataset.objectZ=hit.z.toFixed(2);
  }
  function up(event){if(!dragging)return;dragging=null;controls.enabled=true;renderer.domElement.style.cursor='grab';if(renderer.domElement.hasPointerCapture(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId);}
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',up);
  const rainCount=2400,rainPositions=new Float32Array(rainCount*3);
  let seed=82;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  for(let i=0;i<rainCount;i++){rainPositions[i*3]=(random()-.5)*160;rainPositions[i*3+1]=random()*70;rainPositions[i*3+2]=(random()-.5)*160;}
  const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPositions,3));
  const rain=new THREE.Points(rainGeo,new THREE.PointsMaterial({color:'#a7c2c9',size:.11,transparent:true,opacity:.45,depthWrite:false}));scene.add(rain);
  let time=0,paused=false,raf,disposed=false,frames=0,cpuTotal=0,fpsTime=performance.now(),last=performance.now(),audio=null;
  let autoRatio=Math.min(devicePixelRatio,1,Math.sqrt((softwareGPU?650000:1600000)/(container.clientWidth*container.clientHeight))),slowFrames=0;
  function heightAt(x,z){let h=0;for(const w of WAVE_COMPONENTS)h+=state.height*w.a*Math.sin((w.dx*x+w.dz*z)*w.k-time*w.c*(.35+state.wind*.065));return h;}

  function update(){
    uniforms.uHeight.value=state.height;uniforms.uWind.value=state.wind;uniforms.uChop.value=state.chop;
    uniforms.uFoam.value=state.foam?1:0;uniforms.uGrid.value=state.grid?1:0;uniforms.uStorm.value=state.rain?1:0;
    uniforms.uCloudiness.value=state.rain?1:state.weather==='cloudy'?.8:state.weather==='fog'?.3:0;
    uniforms.uFog.value=state.weather==='fog'?1:0;
    const celestial=celestialState(state.time,state.sunrise,state.sunset);
    uniforms.uSun.value.set(celestial.sun.x,celestial.sun.y,celestial.sun.z);
    uniforms.uMoon.value.set(celestial.moon.x,celestial.moon.y,celestial.moon.z);
    const day=celestial.daylight;uniforms.uDay.value=day;
    uniforms.uLight.value.copy(day>.45?uniforms.uSun.value:uniforms.uMoon.value);
    sunlight.position.copy(uniforms.uLight.value).multiplyScalar(100);
    sunlight.color.set(day>.5?'#ffdfb1':'#9db9ef');sunlight.intensity=(.3+day*2.6)*(state.rain?.25:1);
    ambient.intensity=(.28+day*1.65)*(state.rain?.65:1);ambient.color.set(day>.5?'#bed6df':'#5577a4');
    container.dataset.sunAltitude=(Math.asin(celestial.sun.y)*180/Math.PI).toFixed(2);
    container.dataset.moonAltitude=(Math.asin(celestial.moon.y)*180/Math.PI).toFixed(2);
    floatGroup.visible=state.objects;rain.visible=state.rain;
    if(viewMode!==state.view)setView(state.view);
    if(state.drag===false){selected=null;selection.visible=false;}
    const ratio=state.quality==='low'?.6:state.quality==='high'?Math.min(devicePixelRatio,1.5):autoRatio;
    if(!exporting&&!liveSize&&renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);
    uniforms.uDetail.value=(state.quality==='low'||(state.quality==='auto'&&autoRatio<.8))?0:1;
    audio?.update(state.wind,state.height,paused);
  }
  const beforeFrames=new Set(),afterFrames=new Set();let exporting=false,exportSize=null,liveSize=null;
  function animate(now){
    if(disposed)return;if(!exporting)raf=requestAnimationFrame(animate);
    for(const callback of beforeFrames)callback(now);
    const dt=Math.min((now-last)/1000,1);last=now;
    const simDt=paused?0:dt*state.speed;
    time+=simDt;uniforms.uTime.value=time;
    if(vessel){
      actualKnots=THREE.MathUtils.lerp(actualKnots,state.knots,1-Math.exp(-simDt*.22));if(Math.abs(actualKnots-state.knots)<.005)actualKnots=state.knots;
      const turn=((state.heading-actualHeading+540)%360)-180;actualHeading=(actualHeading+THREE.MathUtils.clamp(turn,-simDt*4,simDt*4)+360)%360;
      const radians=THREE.MathUtils.degToRad(actualHeading),advance=actualKnots*.514444*simDt;
      travel.x+=Math.sin(radians)*advance;travel.y-=Math.cos(radians)*advance;distance+=advance;
      const px=shipPosition.x+travel.x,pz=shipPosition.z+travel.y;
      const bow=heightAt(px+Math.sin(radians)*48,pz-Math.cos(radians)*48),stern=heightAt(px-Math.sin(radians)*48,pz+Math.cos(radians)*48);
      const port=heightAt(px-Math.cos(radians)*10,pz-Math.sin(radians)*10),starboard=heightAt(px+Math.cos(radians)*10,pz+Math.sin(radians)*10);
      vessel.ship.position.copy(shipPosition);vessel.ship.position.y=(bow+stern+port+starboard)*.25;
      vessel.ship.rotation.set(0,-radians,0);vessel.ship.rotateX((stern-bow)/96);vessel.ship.rotateZ((starboard-port)/20*.5);
      vessel.propeller.rotation.z+=simDt*actualKnots*.4;vessel.radar.rotation.y+=simDt*.65;
      wake.record(px,pz,actualHeading,time,Math.min(1.2,actualKnots/15));ripple?.record(px,pz,actualHeading);
      navElapsed+=dt;if(navElapsed>.2){emitNavigation();navElapsed=0;}
    }
    for(const f of floaters){
      const h=heightAt(f.x,f.z),span=f.kind==='boat'?1.6:.7;
      f.g.position.set(f.x-travel.x,h+(f.kind==='barrel'?.15:0),f.z-travel.y);
      f.g.rotation.set((heightAt(f.x,f.z+span)-heightAt(f.x,f.z-span))/(2*span),f.kind==='boat'?-.28:0,-(heightAt(f.x+span,f.z)-heightAt(f.x-span,f.z))/(2*span));
      if(f.beacon)f.beacon.visible=Math.sin(time*2.8)>-.3;
      if(f.flag)f.flag.rotation.y=Math.sin(time*3)*.15;
    }
    if(ripple){ripple.update(simDt,shipPosition.x+travel.x,shipPosition.z+travel.y);uniforms.uRipple.value=ripple.texture;}
    if(wake){container.dataset.wakeSamples=String(wake.update(time,travel,uniforms.uDay.value,state.wake,state.wind));const first=wake.history.samples[0];container.dataset.wakeOldest=first?`${first.x.toFixed(2)},${first.z.toFixed(2)}`:'';}
    if(cargo){const delta=shipPosition.clone().sub(followedPosition);camera.position.add(delta);controls.target.add(delta);followedPosition.copy(shipPosition);}
    if(selected){selection.visible=selected.visible&&selected.parent.visible;selection.position.copy(selected.position);selection.position.y+=cargo&&selected===vessel?.ship?1.8:1;const r=selected===vessel?.ship?16:2.6;selection.scale.set(r,selected===vessel?.ship?80:r,1);}
    if(state.rain&&!paused){for(let i=0;i<rainCount;i++){rainPositions[i*3+1]-=dt*28*state.speed;rainPositions[i*3]+=dt*state.wind*.7*state.speed;if(rainPositions[i*3+1]<-2)rainPositions[i*3+1]=65;if(rainPositions[i*3]>80)rainPositions[i*3]=-80;}rainGeo.attributes.position.needsUpdate=true;}
    controls.update();const renderStart=performance.now();renderer.render(scene,camera);const renderMs=performance.now()-renderStart;cpuTotal+=renderMs;container.dataset.renderMs=renderMs.toFixed(1);container.dataset.foreground=String(document.hasFocus());container.dataset.drawCalls=String(renderer.info.render.calls);container.dataset.pixelRatio=renderer.getPixelRatio().toFixed(2);frames++;
    for(const callback of afterFrames)callback(renderer.domElement,now);container.dataset.camera=JSON.stringify({position:camera.position.toArray(),target:controls.target.toArray()});
    if(now-fpsTime>1000){const fps=Math.round(frames*1000/(now-fpsTime));window.dispatchEvent(new CustomEvent('ocean-fps',{detail:fps}));if(state.quality==='auto'&&!document.hidden){slowFrames=fps<28?slowFrames+1:0;if(slowFrames>=3&&autoRatio>.4){autoRatio=Math.max(.4,autoRatio-.12);update();slowFrames=0;}}frames=0;cpuTotal=0;fpsTime=now;}
  }
  const resize=()=>{if(exporting||liveSize)return;camera.aspect=container.clientWidth/container.clientHeight;camera.updateProjectionMatrix();renderer.setSize(container.clientWidth,container.clientHeight);};
  window.addEventListener('resize',resize);
  update();raf=requestAnimationFrame(animate);
  return {
    update,resetCamera,setView,resetVoyage,faceSun,
    setSubjectName(name){vessel?.setName(name);},
    captureStream(fps,width,height){liveSize={ratio:renderer.getPixelRatio()};renderer.setPixelRatio(1);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();return renderer.domElement.captureStream(fps);},
    endLiveCapture(){if(!liveSize)return;renderer.setPixelRatio(liveSize.ratio);liveSize=null;resize();},
    beginExport(width,height){exporting=true;controls.enableRotate=controls.enablePan=controls.enableZoom=false;cancelAnimationFrame(raf);exportSize={width:container.clientWidth,height:container.clientHeight,ratio:renderer.getPixelRatio()};renderer.setPixelRatio(1);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();},
    renderExportFrame(index,fps){last=(index-1)*1000/fps;animate(index*1000/fps);return renderer.domElement;},
    endExport(){if(!exporting)return;exporting=false;controls.enableRotate=controls.enablePan=controls.enableZoom=true;renderer.setPixelRatio(exportSize.ratio);renderer.setSize(exportSize.width,exportSize.height,false);camera.aspect=exportSize.width/exportSize.height;camera.updateProjectionMatrix();last=performance.now();raf=requestAnimationFrame(animate);},
    onFrame(callback){afterFrames.add(callback);return()=>afterFrames.delete(callback);},
    onBeforeFrame(callback){beforeFrames.add(callback);return()=>beforeFrames.delete(callback);},
    orbitCamera(angle,radius,height){if(viewMode!=='follow')return;controls.target.copy(shipPosition).add(new THREE.Vector3(0,cargo?8:1,0));camera.position.set(Math.sin(angle)*radius,height,Math.cos(angle)*radius).applyAxisAngle(new THREE.Vector3(0,1,0),-actualHeading*Math.PI/180).add(shipPosition);controls.update();},
    moveSubject(x,z){if(vessel){shipPosition.set(x,0,z);wake?.record(x+travel.x,z+travel.y,actualHeading,time,1.1);ripple?.record(x+travel.x,z+travel.y,actualHeading);}else{floaters[0].x=x+travel.x;floaters[0].z=z+travel.y;}},
    captureState(){return {shipPosition:shipPosition.toArray(),travel:travel.toArray(),actualHeading,actualKnots,distance,time,viewMode,fov:camera.fov,camera:camera.position.toArray(),target:controls.target.toArray(),floaters:floaters.map(f=>({x:f.x,z:f.z})),wake:wake?{samples:wake.history.samples.map(s=>({...s})),previous:wake.history.previous?{...wake.history.previous}:null,remainder:wake.history.remainder}:null};},
    restoreState(saved){shipPosition.fromArray(saved.shipPosition);travel.fromArray(saved.travel);actualHeading=saved.actualHeading;actualKnots=saved.actualKnots;distance=saved.distance;time=saved.time;uniforms.uTime.value=time;viewMode=saved.viewMode;camera.fov=saved.fov||52;camera.updateProjectionMatrix();controls.maxPolarAngle=viewMode==='sky'?Math.PI*.95:Math.PI*.495;camera.position.fromArray(saved.camera);controls.target.fromArray(saved.target);floaters.forEach((f,i)=>Object.assign(f,saved.floaters[i]));selected=null;selection.visible=false;wake?.clear();ripple?.clear();if(wake&&saved.wake){wake.history.samples=saved.wake.samples.map(s=>({...s}));wake.history.previous=saved.wake.previous?{...saved.wake.previous}:null;wake.history.remainder=saved.wake.remainder;}controls.enabled=true;followedPosition.copy(shipPosition);if(controls.enabled)controls.update();emitNavigation();},
    async recordingAudio(){if(!audio)audio=createAmbientAudio();const stream=await audio.startRecording();audio.update(state.wind,state.height,paused);return {stream,stop(){audio.stopRecording();audio.update(state.wind,state.height,paused);}};},
    setPaused(value){paused=value;audio?.update(state.wind,state.height,paused);},
    capture(){renderer.render(scene,camera);const a=document.createElement('a');a.download=`${cargo?"cargo-voyage":"ocean-lab"}-${Date.now()}.png`;a.href=renderer.domElement.toDataURL('image/png');a.click();},
    async toggleAudio(){if(!audio)audio=createAmbientAudio();const enabled=await audio.toggle();audio.update(state.wind,state.height,paused);return enabled;},
    dispose(){disposed=true;beforeFrames.clear();afterFrames.clear();wake?.dispose();ripple?.dispose();cancelAnimationFrame(raf);window.removeEventListener('resize',resize);renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('pointerup',up);renderer.domElement.removeEventListener('pointercancel',up);controls.dispose();audio?.dispose();const geometries=new Set(),materials=new Set(),textures=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{materials.add(m);Object.values(m).forEach(v=>{if(v?.isTexture)textures.add(v);});});});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();}
  };
}

function createAmbientAudio(){
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  const master=ctx.createGain(),recordGain=ctx.createGain(),destination=ctx.createMediaStreamDestination();master.gain.value=0;recordGain.gain.value=0;master.connect(ctx.destination);recordGain.connect(destination);
  const buffer=ctx.createBuffer(1,ctx.sampleRate*8,ctx.sampleRate),data=buffer.getChannelData(0);let brown=0;
  for(let i=0;i<data.length;i++){brown=(brown+.02*(Math.random()*2-1))/1.02;data[i]=brown*3.5;}
  const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;
  const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=650;source.connect(filter);filter.connect(master);filter.connect(recordGain);source.start();
  const swell=ctx.createOscillator(),swellGain=ctx.createGain(),recordSwell=ctx.createGain();swell.frequency.value=.11;swellGain.gain.value=0;recordSwell.gain.value=0;swell.connect(swellGain);swell.connect(recordSwell);swellGain.connect(master.gain);recordSwell.connect(recordGain.gain);swell.start();let enabled=false,recording=false;
  return {async toggle(){await ctx.resume();enabled=!enabled;return enabled;},async startRecording(){await ctx.resume();recording=true;return destination.stream;},stopRecording(){recording=false;},update(w,h,paused){const level=.12+w*.006+h*.01;master.gain.setTargetAtTime(enabled&&!paused?level:0,ctx.currentTime,.3);recordGain.gain.setTargetAtTime(recording&&!paused?level:0,ctx.currentTime,.3);filter.frequency.setTargetAtTime(300+w*45,ctx.currentTime,.4);swellGain.gain.setTargetAtTime(enabled&&!paused?.025:0,ctx.currentTime,.3);recordSwell.gain.setTargetAtTime(recording&&!paused?.025:0,ctx.currentTime,.3);},dispose(){source.stop();swell.stop();destination.stream.getTracks().forEach(t=>t.stop());ctx.close();}};
}
