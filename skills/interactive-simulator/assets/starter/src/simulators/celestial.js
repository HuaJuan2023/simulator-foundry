const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v-a)/(b-a),0,1); return t*t*(3-2*t); };

// A synthetic 24-hour sky. Sunrise and sunset are explicit controls, not real ephemerides.
export function celestialState(hour, sunrise = 6, sunset = 18) {
  hour = ((hour % 24) + 24) % 24;
  const daylight = sunset-sunrise;
  const elapsed = (hour-sunrise+24)%24;
  const phase = elapsed <= daylight
    ? elapsed/daylight*Math.PI
    : Math.PI+(elapsed-daylight)/(24-daylight)*Math.PI;
  const direction = p => ({x:-Math.cos(p), y:Math.sin(p)*.65, z:-Math.sin(p)*Math.sqrt(1-.65**2)});
  const sun = direction(phase), moon = direction(phase+Math.PI);
  return {sun, moon, daylight:smooth(-.09,.12,sun.y), sunVisible:sun.y>-.02, moonVisible:moon.y>-.02, phase};
}
