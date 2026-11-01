const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>t*t*(3-2*t);
export function buildDemoSteps(cargo=true){
  const steps=[
    {id:'identity',title:'主体名称与细节',values:{view:'follow',weather:'clear',rain:false,time:11,height:.35,wind:3,knots:18,heading:0,wake:true,foam:true,grid:false,objects:true,quality:'auto',sunrise:6,sunset:18,speed:1},orbit:[-1.1,-.7,200,48]},
    ...(cargo?[
      {id:'sailing',title:'远洋航行 · 实时尾流',values:{view:'port',knots:24}},
      {id:'turning',title:'航向改变 · 航迹留存',values:{view:'top',heading:70}},
      {id:'move',title:'移动主体 · 新旧航迹',values:{view:'follow'},move:true,orbit:[-.7,-.3,230,75]},
      {id:'bridge',title:'驾驶台视角',values:{view:'bridge',heading:70}},
    ]:[{id:'move',title:'移动物体 · 波面起伏',values:{view:'follow'},move:true}]),
    {id:'sunrise',title:'日出 · 自定义日出时间',values:{view:'sky',sunrise:7,sunset:19,weather:'clear',time:7.2},animate:{time:[7.2,8.2]}},
    {id:'noon',title:'晴日 · 航行与天光',values:{view:'follow',time:12}},
    {id:'sunset',title:'日落 · 迎着太阳航行',values:{view:'sky',time:18},animate:{time:[18,18.8]}},
    {id:'moon',title:'月夜 · 月面与星空',values:{view:'sky',time:19.8,height:.7}},
    {id:'cloudy',title:'阴天 · 云层与漫射光',values:{view:'follow',weather:'cloudy',rain:false,time:14},orbit:[-.8,-.5,220,60]},
    {id:'fog',title:'海雾 · 能见度变化',values:{weather:'fog'}},
    {id:'storm',title:'风雨 · 降雨与大浪',values:{weather:'rain',rain:true,height:3.2,wind:18,chop:.9}},
    {id:'waves',title:'波浪大小 · 风速与锐度',values:{weather:'clear',rain:false,view:'follow'},animate:{height:[3.2,.2],wind:[18,2],chop:[.9,.15]},orbit:[-.6,-.3,215,50]},
    {id:'wireframe',title:'线框 · 波面结构',values:{grid:true,height:1.2}},
    {id:'effects',title:cargo?'尾流与白沫开关':'漂浮物与白沫开关',values:{grid:false},effects:true},
    {id:'quality',title:'渲染精度 · 节能与高精度',values:{quality:'low'},quality:true},
    {id:'pause',title:'暂停 · 检查瞬间的波浪',values:{quality:'auto'},paused:true},
    {id:'resume',title:'继续航行 · 演示结束',values:{view:'follow',weather:'clear',rain:false,time:17.3,height:1.2,wind:7,wake:true,foam:true,objects:true,speed:1,knots:18},orbit:[-.8,-.4,235,52]},
  ];
  return steps;
}
export function demoFrame(steps,elapsed,duration){
  const fraction=Math.max(0,Math.min(elapsed/duration,1)),scaled=fraction*steps.length,index=Math.min(steps.length-1,Math.floor(scaled));
  return {step:steps[index],index,progress:fraction,local:Math.min(1,scaled-index),done:elapsed>=duration};
}
export function createDemoTour({ocean,state,cargo,update,setPaused,onChapter,onComplete}){
  const steps=buildDemoSteps(cargo);let active=false,start=0,duration=90,index=-1,saved=null,lastUI=0;
  function tick(now){
    if(!active)return;const frame=demoFrame(steps,(now-start)/1000,duration),{step,local}=frame;
    if(frame.index!==index){index=frame.index;Object.assign(state,step.values);setPaused(!!step.paused);ocean.setView(state.view);update();}
    if(step.animate)for(const [key,[a,b]]of Object.entries(step.animate))state[key]=lerp(a,b,ease(local));
    if(step.orbit)ocean.orbitCamera(lerp(step.orbit[0],step.orbit[1],ease(local)),step.orbit[2],step.orbit[3]);
    if(step.move){const t=ease(local),x=cargo?saved.scene.shipPosition[0]:saved.scene.floaters[0].x,z=cargo?saved.scene.shipPosition[2]:saved.scene.floaters[0].z;ocean.moveSubject(x+Math.sin(t*Math.PI)*65,z+t*50);}
    if(step.effects){state.foam=local>.45;if(cargo)state.wake=local>.45;else state.objects=local>.45;}
    if(step.quality)state.quality=local>.5?'high':'low';
    ocean.update();if(now-lastUI>150){update();lastUI=now;}
    onChapter?.({title:step.title,index,total:steps.length,progress:frame.progress});
    if(frame.done){active=false;onComplete?.();}
  }
  const unsubscribe=ocean.onBeforeFrame(tick);
  function restore(){if(!saved)return;for(const key of Object.keys(state))if(!(key in saved.parameters))delete state[key];Object.assign(state,saved.parameters);setPaused(saved.paused);ocean.restoreState(saved.scene);update();saved=null;index=-1;}
  return {get active(){return active;},steps,start(seconds,paused,offline=false){if(active)throw Error('自动演示正在进行');saved={parameters:{...state},scene:ocean.captureState(),paused};duration=seconds;start=offline?0:performance.now();index=-1;lastUI=0;active=true;setPaused(false);},stop(){active=false;restore();},restore,dispose(){active=false;restore();unsubscribe();}};
}
