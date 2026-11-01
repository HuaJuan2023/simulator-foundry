// Encoding backpressure changes wall time, never the simulation clock or frame count.
export async function renderFixedFrames({seconds,fps=30,cancelled=()=>false,render,encode,yieldTask=()=>new Promise(r=>setTimeout(r,0))}){
  let count=0;
  for(let index=0;index<Math.round(seconds*fps)&&!cancelled();index++){
    render(index,index/fps);await encode(index,index/fps,1/fps);count++;
    if(index%3===0)await yieldTask();
  }
  return count;
}
