// World-space samples survive movement of the ship and floating render origin.
export class WakeHistory {
  constructor({spacing=2.5,lifetime=65,capacity=520}={}) { Object.assign(this,{spacing,lifetime,capacity});this.clear(); }
  clear(){this.samples=[];this.previous=null;this.remainder=0;}
  record(x,z,time,strength=1){
    if(!this.previous){this.previous={x,z,time};return 0;}
    const prev=this.previous,dx=x-prev.x,dz=z-prev.z,length=Math.hypot(dx,dz);
    this.previous={x,z,time};
    if(length<1e-6)return 0;
    const nx=-dz/length,nz=dx/length;let count=0;
    for(let distance=this.spacing-this.remainder;distance<=length+1e-7;distance+=this.spacing){
      const t=Math.min(distance/length,1);
      this.samples.push({x:prev.x+dx*t,z:prev.z+dz*t,nx,nz,born:prev.time+(time-prev.time)*t,strength});count++;
    }
    this.remainder=(this.remainder+length)%this.spacing;
    if(this.samples.length>this.capacity)this.samples.splice(0,this.samples.length-this.capacity);
    return count;
  }
  prune(time){let i=0;while(i<this.samples.length&&time-this.samples[i].born>=this.lifetime)i++;if(i)this.samples.splice(0,i);}
}
