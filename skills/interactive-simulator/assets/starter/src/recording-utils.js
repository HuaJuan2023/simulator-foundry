export function normalizeSubjectName(value, fallback='HORIZON') {
  return Array.from(String(value??'').replace(/[\u0000-\u001f\u007f]/g,'').trim()).slice(0,24).join('') || fallback;
}
export function safeFilename(value) { return normalizeSubjectName(value,'simulation').replace(/[<>:"/\\|?*]/g,'_').replace(/[. ]+$/g,'') || 'simulation'; }
export function chooseRecordingMime(supported, audio=true) {
  const candidates=audio
    ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm']
    : ['video/mp4;codecs=avc1.42E01E','video/webm;codecs=vp8','video/webm;codecs=vp9','video/webm'];
  return candidates.find(type=>supported(type)) || '';
}
export function formatDuration(seconds) { const s=Math.max(0,Math.floor(seconds));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
