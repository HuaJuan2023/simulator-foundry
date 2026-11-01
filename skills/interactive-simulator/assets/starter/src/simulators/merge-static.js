import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export function mergeStaticMeshes(root, exclude=new Set()) {
  root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),meshes=[],batches=new Map(),disposed=new Set();
  root.traverse(child=>{
    if(!child.isMesh||child.isInstancedMesh||Array.isArray(child.material)||child.material.transparent)return;
    for(let p=child;p&&p!==root;p=p.parent)if(exclude.has(p))return;
    meshes.push(child);
  });
  for(const child of meshes){
    const g=child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,child.matrixWorld));
    if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
    const batch=batches.get(child.material)||[];batch.push(g);batches.set(child.material,batch);
    child.removeFromParent();if(!disposed.has(child.geometry)){child.geometry.dispose();disposed.add(child.geometry);}
  }
  for(const [material,geometries] of batches){const merged=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());if(merged)root.add(new THREE.Mesh(merged,material));}
}
