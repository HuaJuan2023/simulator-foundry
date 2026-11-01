export function celestialComposition(direction,{radius=260,eye=30,subjectHeight=7}={}){
  const horizontal=Math.hypot(direction.x,direction.z)||1;
  const subjectAngle=Math.atan2(subjectHeight-eye,radius),lightAngle=Math.asin(direction.y);
  const angle=(subjectAngle+lightAngle)/2;
  return {position:[-direction.x/horizontal*radius,eye,-direction.z/horizontal*radius],
    targetHeight:eye+Math.tan(angle)*radius,fov:68,subjectAngle,lightAngle,angle};
}
