import * as THREE from 'three';
import { mergeStaticMeshes } from './merge-static.js';
import { normalizeSubjectName } from '../recording-utils.js';

// Metres. Bow is -Z. Local origin sits at the design waterline.
export function createCargoShip(initialName='HORIZON') {
  const ship = new THREE.Group();
  const material = (color, metalness=.15, roughness=.65) => new THREE.MeshStandardMaterial({color,metalness,roughness});
  const navy=material('#172f3c'), red=material('#a34332'), deck=material('#687a73'), white=material('#e2e2d2'), steel=material('#a2aca5',.5), dark=material('#20353a'), orange=material('#ed7136');
  const glass=material('#213f51',.5,.2);glass.emissive.set('#527e83');glass.emissiveIntensity=.16;
  function box(w,h,d,m,x,y,z,parent=ship){const obj=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);obj.position.set(x,y,z);parent.add(obj);return obj;}
  function cylinder(rt,rb,h,m,x,y,z,parent=ship){const obj=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,12),m);obj.position.set(x,y,z);parent.add(obj);return obj;}
  const stations=[[-78,.12],[-72,3.7],[-61,8.7],[-43,11.5],[-22,12],[31,12],[52,11.2],[65,8.5],[69,7.5]];
  function hullBand(top,bottom,upperWidth,lowerWidth,m){
    const v=[],idx=[];
    for(const [z,w] of stations)v.push(-w*upperWidth,top,z,w*upperWidth,top,z,-w*lowerWidth,bottom,z,w*lowerWidth,bottom,z);
    for(let i=0;i<stations.length-1;i++){const a=i*4,b=a+4;idx.push(a,b,a+2,a+2,b,b+2,a+1,a+3,b+1,a+3,b+3,b+1,a,a+1,b,a+1,b+1,b);}
    idx.push(0,2,1,1,2,3);const a=(stations.length-1)*4;idx.push(a,a+1,a+2,a+1,a+3,a+2);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();m.side=THREE.DoubleSide;ship.add(new THREE.Mesh(g,m));
  }
  hullBand(8.5,.1,1,.98,navy);hullBand(.12,-7,.98,.66,red);
  // Visible deck follows the hull taper.
  const dv=[],di=[];for(const [z,w] of stations)dv.push(-w,8.6,z,w,8.6,z);
  for(let i=0;i<stations.length-1;i++){let a=i*2;di.push(a,a+2,a+1,a+1,a+2,a+3);}
  const dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.Float32BufferAttribute(dv,3));dg.setIndex(di);dg.computeVertexNormals();deck.side=THREE.DoubleSide;ship.add(new THREE.Mesh(dg,deck));
  // Repeated fittings use instancing to keep the ship inexpensive to draw.
  const postMatrices=[],railMatrices=[];const dummy=new THREE.Object3D();
  const push=(array,x,y,z,sx,sy,sz,ry=0)=>{dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(0,ry,0);dummy.updateMatrix();array.push(dummy.matrix.clone());};
  for(let side of [-1,1])for(let i=1;i<stations.length;i++){
    const [z1,w1]=stations[i-1],[z2,w2]=stations[i];const length=Math.hypot(z2-z1,w2-w1),steps=Math.ceil(length/3);
    for(let j=0;j<steps;j++){const t=j/steps;push(postMatrices,side*THREE.MathUtils.lerp(w1,w2,t),9.2,THREE.MathUtils.lerp(z1,z2,t),.085,1.2,.085);}
    for(const y of [9,9.7])push(railMatrices,side*(w1+w2)/2,y,(z1+z2)/2,.065,.065,length,Math.atan2(side*(w2-w1),z2-z1));
  }
  function instances(matrices,geometry,m){const inst=new THREE.InstancedMesh(geometry,m,matrices.length);matrices.forEach((matrix,i)=>inst.setMatrixAt(i,matrix));ship.add(inst);return inst;}
  instances(postMatrices,new THREE.BoxGeometry(1,1,1),steel);instances(railMatrices,new THREE.BoxGeometry(1,1,1),steel);
  // One generated corrugation texture; container colours are per instance.
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#e5e6df';ctx.fillRect(0,0,256,128);
  for(let i=0;i<32;i++){ctx.fillStyle='#adb3ad';ctx.fillRect(i*8,3,2,122);ctx.fillStyle='#f4f5e9';ctx.fillRect(i*8+2,3,1,122);}
  ctx.strokeStyle='#64726b';ctx.lineWidth=5;ctx.strokeRect(2,2,252,124);ctx.fillStyle='#f2f0e1';ctx.font='bold 15px sans-serif';ctx.fillText('HORIZON',57,72);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  const cm=new THREE.MeshStandardMaterial({map:texture,roughness:.8,metalness:.1});
  const crates=[],palette=['#d86844','#547c7a','#d8bc7b','#a5b3a7','#53657f','#a44c3f'];
  for(let bay=0;bay<7;bay++)for(let col=0;col<7;col++){
    const levels=2+((bay+col)%3===0?2:1);
    for(let level=0;level<levels;level++)crates.push({x:(col-3)*2.52,y:10+level*2.72,z:-48+bay*12.4,color:palette[(bay*7+col*3+level)%palette.length]});
  }
  const containers=new THREE.InstancedMesh(new THREE.BoxGeometry(2.4,2.6,11.9),cm,crates.length);
  crates.forEach((c,i)=>{dummy.position.set(c.x,c.y,c.z);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();containers.setMatrixAt(i,dummy.matrix);containers.setColorAt(i,new THREE.Color(c.color));});ship.add(containers);
  // Aft accommodation block, stepped decks, bridge glazing and roof instruments.
  for(let level=0;level<5;level++){
    const y=10+level*2.9,w=level===4?21:17;
    box(w,2.7,13,white,0,y,49);box(w+1,.25,14,steel,0,y+1.45,49);
    if(level<4)for(let j=0;j<7;j++){box(1,.8,.06,glass,-6.6+j*2.2,y+.1,42.46);box(.06,.8,1,glass,-8.52,y+.1,45+j*1.4);box(.06,.8,1,glass,8.52,y+.1,45+j*1.4);}
  }
  box(20.7,1.4,.12,glass,0,21.9,42.43);box(.12,1.4,12,glass,-10.55,21.9,49);box(.12,1.4,12,glass,10.55,21.9,49);
  for(let i=-5;i<=5;i++)box(.12,1.5,.2,white,i*1.8,21.9,42.3);
  const funnel=box(4.8,8,5.4,navy,0,18.5,60);box(4.9,1.6,5.5,orange,0,20,60);box(5,.6,5.6,dark,0,22.7,60);
  cylinder(.22,.35,9,steel,0,28.5,50);box(8,.18,.25,steel,0,31,50);
  const radar=new THREE.Group();radar.position.set(0,26,48);ship.add(radar);box(4,.35,.6,white,0,0,0,radar);
  for(const x of [-5,5]){cylinder(.12,.18,5,steel,x,26,52);cylinder(.65,.65,.55,white,x,27,52);}
  for(const side of [-1,1]){
    const boat=box(2.2,1.8,6.5,orange,side*11,14,53);boat.rotation.z=side*.12;
    for(const z of [49,57]){box(.15,5,.15,steel,side*10,15,z);box(3,.15,.15,steel,side*11,17.4,z);}
    for(let i=0;i<6;i++)box(.65,.17,12,white,side*9.6,9.3+i*1.2,49+i*.05);
  }
  cylinder(.16,.4,12,white,0,14.4,-66);box(6,.12,.16,steel,0,18,-66);
  for(const side of [-1,1])for(const z of [-64,-59,37,63]){cylinder(.5,.6,.7,dark,side*(Math.abs(z)>60?4.5:9),9.1,z);}
  // A real rotating propeller sits beneath the stern.
  const propeller=new THREE.Group();propeller.position.set(0,-4,68);ship.add(propeller);
  const hub=cylinder(.7,.7,1.5,steel,0,0,0,propeller);hub.rotation.x=Math.PI/2;
  for(let i=0;i<4;i++){const blade=box(.65,3.6,.2,material('#95805a',.7),0,0,0,propeller);blade.rotation.z=i*Math.PI/2;blade.rotation.y=.3;}
  box(.4,4,3.2,navy,0,-3.7,70);
  // Hull name plates, generated locally.
  const plate=document.createElement('canvas');plate.width=1024;plate.height=128;const pc=plate.getContext('2d');pc.fillStyle='#e9eee2';pc.font='500 80px sans-serif';pc.textAlign='center';pc.fillText('H O R I Z O N',512,92);
  const nameTexture=new THREE.CanvasTexture(plate);nameTexture.colorSpace=THREE.SRGBColorSpace;
  const nameMaterial=new THREE.MeshBasicMaterial({map:nameTexture,transparent:true,side:THREE.DoubleSide,depthWrite:false});
  for(const side of [-1,1]){const name=new THREE.Mesh(new THREE.PlaneGeometry(28,3.5),nameMaterial);name.position.set(side*12.05,4.5,-21);name.rotation.y=side*Math.PI/2;ship.add(name);}
  // Navigation lamps remain visible after sunset.
  for(const [x,color] of [[-10.7,'#ff4034'],[10.7,'#63ef99']])box(.3,.3,.3,new THREE.MeshBasicMaterial({color}),x,23,43);
  box(.3,.4,.3,new THREE.MeshBasicMaterial({color:'#fff3c4'}),0,32.8,50);
  ship.userData.containerCount=crates.length;
  mergeStaticMeshes(ship,new Set([radar,propeller]));
  function setName(value){
    const name=normalizeSubjectName(value);pc.clearRect(0,0,plate.width,plate.height);pc.fillStyle='#e9eee2';pc.textAlign='center';pc.textBaseline='middle';
    let size=80;pc.font='500 '+size+'px "Microsoft YaHei",sans-serif';while(pc.measureText(name).width>960&&size>18){size--;pc.font='500 '+size+'px "Microsoft YaHei",sans-serif';}pc.fillText(name,512,68);nameTexture.needsUpdate=true;
    ctx.fillStyle='#e5e6df';ctx.fillRect(0,0,256,128);for(let i=0;i<32;i++){ctx.fillStyle='#adb3ad';ctx.fillRect(i*8,3,2,122);ctx.fillStyle='#f4f5e9';ctx.fillRect(i*8+2,3,1,122);}ctx.strokeStyle='#64726b';ctx.lineWidth=5;ctx.strokeRect(2,2,252,124);
    ctx.fillStyle='#f2f0e1';ctx.textAlign='center';let labelSize=15;ctx.font='bold '+labelSize+'px "Microsoft YaHei",sans-serif';while(ctx.measureText(name).width>225&&labelSize>7){labelSize--;ctx.font='bold '+labelSize+'px "Microsoft YaHei",sans-serif';}ctx.fillText(name,128,72);texture.needsUpdate=true;ship.userData.subjectName=name;return name;
  }
  setName(initialName);
  return {ship,propeller,radar,setName};
}
