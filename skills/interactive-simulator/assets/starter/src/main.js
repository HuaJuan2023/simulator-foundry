import './style.css';
import { createOcean } from './simulators/ocean.js';
import { createSceneRecorder } from './recorder.js';
import { createDemoTour } from './demo-tour.js';
import { normalizeSubjectName,formatDuration } from './recording-utils.js';

// Each simulator owns its scene and lifecycle; the shell stays shared.
const cargoMode = new URLSearchParams(location.search).get('scene') !== 'ocean';
const simulators = [{ id: 'ocean', title: '海洋实验室', create: createOcean }, { id: 'cargo', title: '远洋货轮', create: createOcean }];
const defaults = { knots: 18, heading: 0, view: 'follow', wake: true, drag: true, weather: 'clear', sunrise: 6, sunset: 18, height: 1.2, wind: 7, chop: 0.55, time: 17.6, speed: 1, quality: 'auto', foam: true, objects: true, grid: false, rain: false };
const presets = {
  sunset: { height: 1.2, wind: 7, chop: 0.55, time: 17.6, rain: false, weather: 'clear' },
  calm: { height: 0.35, wind: 3, chop: 0.2, time: 11, rain: false, weather: 'clear' },
  storm: { height: 2.8, wind: 17, chop: 0.9, time: 14, rain: true, weather: 'rain' },
  night: { height: 0.7, wind: 5, chop: 0.4, time: 0.5, rain: false, weather: 'clear' }
};
const nameKey='simulation-lab.'+(cargoMode?'cargo':'ocean')+'.name';
let storedName;try{storedName=localStorage.getItem(nameKey);}catch{}
const state = { ...defaults, subjectName:normalizeSubjectName(storedName,cargoMode?'HORIZON':'Ocean Lab') };
let lastSubjectName=null,recorder=null,tour=null,activeAutomatic=false,lastNavigation={knots:18,heading:0,distance:0};
document.querySelector('#app').innerHTML = `
  <main class="lab">
    <div id="viewport" aria-label="可交互的三维海洋模拟场景"></div>
    <div class="vignette"></div>
    <header class="topbar"><a class="brand" href="./"><span class="brand-icon">≈</span><span>SIMULATION<span class="brand-sub">LAB / 实时模拟实验室</span></span></a><select id="experiment" aria-label="选择模拟器"><option value="cargo">002 / 远洋货轮</option><option value="ocean">001 / 海洋实验室</option></select><div class="top-right"><span class="live-dot"></span><span>实时渲染</span><span class="divider"></span><span id="fps">— FPS</span><button id="help" class="icon-button" aria-label="操作说明" title="操作说明">?</button></div></header>
    <section class="intro"><div class="eyebrow">${cargoMode ? 'EXPERIMENT 002 <span> / </span> OPEN OCEAN VOYAGE' : 'EXPERIMENT 001 <span> / </span> FLUID & LIGHT'}</div><h1>${cargoMode ? 'Blue Passage<span>远洋货轮 · 航行模拟</span>' : 'Ocean Lab<span id="subject-intro">海洋实验室</span>'}</h1><p>${cargoMode ? '<span id="subject-intro">HORIZON</span><br>穿越风浪，驶向地平线。' : '风掠过水面，光落进深海。<br>一片由数学驱动的海洋。'}</p><div class="coordinates">${cargoMode ? '150 M CLASS · 24 M BEAM<span>程序化集装箱货轮 / 虚拟航程</span>' : '24° 28′ N &nbsp; 122° 06′ E <span>虚拟观测站</span>'}</div></section>
    <aside class="panel" aria-label="模拟参数"><div class="panel-heading"><div><span class="eyebrow">CONTROL ROOM</span><h2>${cargoMode ? "航行控制" : "环境控制"}</h2></div><button id="collapse" class="icon-button" aria-label="收起或展开参数" aria-expanded="true">−</button></div><div class="panel-content"><form id="subject-form" class="subject-form"><label for="subject-name">${cargoMode?"主体名称 / 船名":"主体名称 / 实验名"}</label><div><input id="subject-name" type="text" maxlength="48" autocomplete="off" placeholder="输入名称"><button type="submit">应用</button></div><small>最多 24 个字符，支持中文；在此浏览器保留</small></form>
      ${cargoMode ? `<div class="voyage-controls"><div class="section-label">航行计划 <span id="subject-tag">HORIZON</span></div>${slider("knots","目标航速",0,26,.5,"kn")}${slider("heading","目标航向",0,359,1,"°")}<div class="quality-row view-row"><label for="view">相机视角</label><select id="view"><option value="follow">自由环绕 / 跟船</option><option value="bridge">驾驶台</option><option value="top">空中俯瞰</option><option value="port">左舷追踪</option><option value="sky">日月观测</option></select></div></div>` : ""}
      <div class="section-label">场景预设 <span>01 — 04</span></div><div class="presets"><button data-preset="sunset" class="active">◒ <span>落日余晖</span></button><button data-preset="calm">☀ <span>晴日静海</span></button><button data-preset="storm">☂ <span>风暴来临</span></button><button data-preset="night">☾ <span>月下涟漪</span></button></div>
      <div class="quality-row weather-row"><label for="weather">天气</label><select id="weather"><option value="clear">晴朗</option><option value="cloudy">阴天</option><option value="fog">海雾</option><option value="rain">风雨</option></select></div><div class="section-label parameter-heading">海况参数 <span>LIVE</span></div>
      ${slider('height', '波浪振幅', 0.1, 3.5, 0.05, 'm')}
      ${slider('wind', '风速', 0, 20, 0.5, 'm/s')}
      ${slider('chop', '波峰锐度', 0, 1, 0.01, '')}
      ${slider('time', '当前时刻', 0, 23.9, 0.1, '')}
      <div class="sun-times">${slider('sunrise', '日出时间', 4, 9, 0.1, '')}${slider('sunset', '日落时间', 16, 21, 0.1, '')}</div>
      ${slider('speed', '时间流速', 0.1, 2, 0.1, '×')}
      <div class="switches">${toggle("drag", "允许拖动物体")}${toggle('foam', '浪花与白沫')}${cargoMode ? toggle('wake', '航迹与船艏浪') : toggle('objects', '漂浮物与浮标')}${toggle('rain', '降雨')}${toggle('grid', '线框观察')}</div>
      <div class="quality-row"><label for="quality">渲染精度</label><select id="quality"><option value="auto">自适应</option><option value="high">高精度</option><option value="low">节能</option></select></div>
      ${cargoMode ? '<button id="face-sun" class="reset">☼ 船首朝向日月</button>' : ''}<button id="reset" class="reset">↺ &nbsp; 重置实验</button>
    </div></aside>
    <div class="scene-label"><span class="live-dot"></span><span id="scene-name">落日余晖</span><span class="scene-line"></span><span>${cargoMode ? "TRANSOCEANIC VOYAGE" : "PROCEDURAL OCEAN"}</span></div>
    <footer class="bottom"><div class="telemetry"><div><span>${cargoMode ? "SPEED / 实际航速" : "WAVE HEIGHT"}</span><strong id="wave-stat">${cargoMode ? "18.0 <small>kn</small>" : "2.40 <small>m</small>"}</strong></div><div><span>${cargoMode ? "HEADING / 实际航向" : "WIND SPEED"}</span><strong id="wind-stat">${cargoMode ? "000 <small>°</small>" : "7.0 <small>m/s</small>"}</strong></div><div><span>${cargoMode ? "DISTANCE / 累计航程" : "LOCAL TIME"}</span><strong id="time-stat">${cargoMode ? "0.000 <small>nm</small>" : "17:18"}</strong></div><div class="engine-info"><span>${cargoMode ? "VESSEL / 船名" : "SIMULATION MODEL"}</span><strong id="subject-stat">${cargoMode ? "HORIZON" : "Gerstner <small>波场</small>"}</strong></div></div><div class="actions"><button id="record-open" title="录屏与自动演示">● <span>录制</span></button><button id="audio" aria-pressed="false" title="切换合成环境音">♫ <span>环境音</span></button><button id="sky-focus" title="观测太阳或月亮">☼ <span>日月</span></button><button id="camera" title="重置相机">◎ <span>归位</span></button><button id="pause" aria-pressed="false">Ⅱ <span>暂停</span></button><button id="capture" title="保存当前画面">↗ <span>截图</span></button></div></footer>
    <div class="hint">拖动物体移动 <span>·</span> 拖动空白环视 <span>·</span> 右键平移 <span>·</span> 滚轮缩放 <span>·</span> 空格暂停 <span>·</span> H 隐藏面板</div>
    <div id="record-hud" hidden><span class="record-dot"></span><span id="record-timer">00:00</span><span id="record-chapter">自由操作</span><button id="record-stop-hud">结束并保存</button><div id="record-progress"></div></div>
    <div id="toast" role="status"></div>
    <dialog id="record-dialog" class="record-dialog"><button id="close-record" class="dialog-close" aria-label="关闭视频工作台">×</button><div class="eyebrow">VIDEO STUDIO</div><h2>录屏与自动演示</h2><p>手动录制原始场景；自动导出叠加名称、参数与章节字幕。</p><div class="studio-settings"><label for="record-resolution">视频尺寸</label><select id="record-resolution"><option value="720">1280 × 720</option><option value="1080">1920 × 1080</option></select><label for="demo-duration">自动演示时长</label><select id="demo-duration"><option value="45">45 秒 · 快速</option><option value="90" selected>90 秒 · 完整</option></select><label class="record-audio-label"><input id="record-audio" type="checkbox" checked> 录入合成环境音</label></div><div class="record-buttons"><button id="record-start">● 开始录屏</button><button id="demo-start">▷ 自动演示并录屏</button><button id="record-stop" disabled>结束并保存</button></div><p class="studio-hint">自动演示以固定 30 fps 逐帧导出，不受实时帧率影响，生成时间可能长于视频时长。展示航行、视角、物体移动、日月、天气、海浪、线框和暂停。结束后恢复原来的参数、位置与视角。录制期间请保持页面可见；手动录屏最长 5 分钟。</p><p id="record-status" role="status">就绪 · 视频编码格式由浏览器支持情况决定</p><section id="record-result" hidden><video id="record-preview" controls playsinline preload="metadata"></video><div class="record-result-row"><span id="record-file-info"></span><a id="record-download" download>下载视频</a></div></section></dialog>
    <dialog id="help-dialog"><button id="close-help" aria-label="关闭说明">×</button><div class="eyebrow">WELCOME TO THE LAB</div><h2>让海洋按你的方式流动</h2><p>鼠标左键拖动旋转视角，右键拖动平移，滚轮缩放；所有预设视角均可继续自由调整。触屏支持单指旋转、双指缩放。货轮场景支持跟船环绕、驾驶台、空中俯瞰和左舷追踪。</p><p>开启「允许拖动物体」后，拖动货轮、浮标或木桶即可调整位置；拖动海面空白区域环视。「当前时刻」可连续观察全天变化，「日出时间」「日落时间」控制昼夜边界。「日月」按钮可对准当前可见的太阳或月亮。天气选单可切换晴朗、阴天、海雾与风雨。空格键暂停，H 键隐藏参数。点击「环境音」启用实时合成的风声与海浪声，截图可保存纯场景 PNG。</p><p class="muted">这是基于 Gerstner 波的视觉模拟。船体随波近似起伏，航速渐变、转向平滑；尾流记录实际经过的位置，逐步扩散、消散，包含随波面起伏的泡沫与船艏飞溅。虚拟航程不对应真实航线，不用于航海。</p></dialog>
  </main>`;
function slider(id, label, min, max, step, unit) { return `<label class="slider-label" for="${id}"><span>${label}</span><output id="${id}-value"></output></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${defaults[id]}" data-unit="${unit}">`; }
function toggle(id, label) { return `<label class="switch"><span>${label}</span><input id="${id}" type="checkbox" ${defaults[id] ? 'checked' : ''}><span class="track"></span></label>`; }
let ocean;
document.title = cargoMode ? 'Blue Passage · 远洋货轮模拟' : 'Ocean Lab · 实时模拟实验室';
document.getElementById('experiment').value = cargoMode ? 'cargo' : 'ocean';
document.getElementById('experiment').onchange = e => { location.search = '?scene=' + e.target.value; };
try { ocean = simulators[cargoMode ? 1 : 0].create(document.querySelector('#viewport'), state, { cargo: cargoMode }); }
catch (e) { document.querySelector('#viewport').innerHTML = `<div class="error"><h2>无法启动三维渲染</h2><p>请使用支持 WebGL 2 的浏览器，并开启硬件加速。</p></div>`; console.error(e); }
function update() {
  if(state.subjectName!==lastSubjectName){ocean?.setSubjectName(state.subjectName);const intro=document.getElementById('subject-intro');if(intro)intro.textContent=state.subjectName;document.getElementById('subject-stat').textContent=state.subjectName;const tag=document.getElementById('subject-tag');if(tag)tag.textContent=state.subjectName;document.getElementById('subject-name').value=state.subjectName;lastSubjectName=state.subjectName;}
  for (const id of (cargoMode ? ['height', 'wind', 'chop', 'time', 'speed', 'sunrise', 'sunset', 'knots', 'heading'] : ['height', 'wind', 'chop', 'time', 'speed', 'sunrise', 'sunset'])) {
    const input = document.getElementById(id); input.value = state[id];
    input.style.setProperty('--fill', `${(state[id] - input.min) / (input.max - input.min) * 100}%`);
    document.getElementById(`${id}-value`).textContent = ['time','sunrise','sunset'].includes(id) ? timeString(state[id]) : `${state[id].toFixed(id === 'chop' ? 2 : 1)} ${input.dataset.unit}`;
  }
  for (const id of ['foam', cargoMode ? 'wake' : 'objects', 'grid', 'rain', 'drag']) document.getElementById(id).checked = state[id];
  document.getElementById('weather').value = state.weather;
  document.getElementById('quality').value = state.quality;
  if (cargoMode) document.getElementById('view').value = state.view;
  if (!cargoMode) { document.getElementById('wave-stat').innerHTML = `${(state.height * 2).toFixed(2)} <small>m</small>`;
  document.getElementById('wind-stat').innerHTML = `${state.wind.toFixed(1)} <small>m/s</small>`;
  document.getElementById('time-stat').textContent = timeString(state.time); }
  ocean?.update();
}
function timeString(h) { const m = Math.round(h * 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
function custom() { document.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('active')); document.getElementById('scene-name').textContent = '自定义海况'; }
for (const id of (cargoMode ? ['height', 'wind', 'chop', 'time', 'speed', 'sunrise', 'sunset', 'knots', 'heading'] : ['height', 'wind', 'chop', 'time', 'speed', 'sunrise', 'sunset'])) document.getElementById(id).addEventListener('input', e => { state[id] = Number(e.target.value); custom(); update(); });
for (const id of ['foam', cargoMode ? 'wake' : 'objects', 'grid', 'rain', 'drag']) document.getElementById(id).addEventListener('change', e => { state[id] = e.target.checked; if(id==='rain')state.weather=state.rain?'rain':'clear'; custom(); update(); });
if (cargoMode) {
  document.getElementById('view').onchange = e => { state.view = e.target.value; ocean?.setView(state.view); };
  window.addEventListener('ocean-navigation', e => {
    const { knots, heading, distance } = e.detail;lastNavigation={knots,heading,distance};
    document.getElementById('wave-stat').innerHTML = `${knots.toFixed(1)} <small>kn</small>`;
    document.getElementById('wind-stat').innerHTML = `${(Math.round(heading)%360).toString().padStart(3,'0')} <small>°</small>`;
    document.getElementById('time-stat').innerHTML = `${distance.toFixed(3)} <small>nm</small>`;
    document.getElementById('viewport').dataset.distanceNm = distance.toFixed(6);
  });
}
document.getElementById('weather').onchange = e => { state.weather=e.target.value;state.rain=state.weather==='rain';custom();update(); };
window.addEventListener('ocean-selection', e => toast(e.detail));
document.getElementById('quality').addEventListener('change', e => { state.quality = e.target.value; update(); });
function setPreset(id) { Object.assign(state, presets[id]);state.view='follow';if(cargoMode)ocean?.faceSun();else ocean?.resetCamera(); document.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('active', b.dataset.preset === id)); document.getElementById('scene-name').textContent = document.querySelector(`[data-preset="${id}"] span`).textContent; update(); }
document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => setPreset(b.dataset.preset)));
let paused = false;
function setPaused(value) { paused = value; ocean?.setPaused(paused); const b = document.getElementById('pause'); b.innerHTML = `${paused ? '▶' : 'Ⅱ'} <span>${paused ? '继续' : '暂停'}</span>`; b.setAttribute('aria-pressed', paused); }
function pause(){setPaused(!paused);}
document.getElementById('pause').onclick = pause;
document.getElementById('camera').onclick = () => { state.view='follow';ocean?.resetCamera();update(); };
if(cargoMode)document.getElementById('face-sun').onclick=()=>{ocean?.faceSun();update();};
document.getElementById('sky-focus').onclick = () => { state.view=state.view==='sky'?'follow':'sky';ocean?.setView(state.view);if(cargoMode)document.getElementById('view').value=state.view; };
document.getElementById('reset').onclick = () => { const name=state.subjectName;Object.assign(state, defaults,{subjectName:name}); if (paused) pause(); setPreset('sunset'); ocean?.resetVoyage?.(); ocean?.resetCamera(); toast('实验参数已重置'); };
document.getElementById('collapse').onclick = () => { const p = document.querySelector('.panel'); p.classList.toggle('collapsed'); document.getElementById('collapse').textContent = p.classList.contains('collapsed') ? '+' : '−'; document.getElementById('collapse').setAttribute('aria-expanded', !p.classList.contains('collapsed')); };
document.getElementById('capture').onclick = () => { ocean?.capture(); toast('已保存海洋场景'); };
document.getElementById('audio').onclick = async () => { try { const on = await ocean?.toggleAudio(); document.getElementById('audio').classList.toggle('active', !!on); document.getElementById('audio').setAttribute('aria-pressed', !!on); toast(on ? '环境音已开启' : '环境音已关闭'); } catch { toast('当前浏览器无法启用音频'); } };
document.getElementById('help').onclick = () => document.getElementById('help-dialog').showModal();
document.getElementById('close-help').onclick = () => document.getElementById('help-dialog').close();
window.addEventListener('keydown', e => { if(activeAutomatic)return;if (/INPUT|SELECT|BUTTON/.test(e.target.tagName) || document.querySelector('dialog[open]')) return; if (e.code === 'Space') { e.preventDefault(); pause(); } if (e.key.toLowerCase() === 'h') document.querySelector('.lab').classList.toggle('hide-ui'); });
let toastTimer;
function toast(message) { const el = document.getElementById('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400); }
window.addEventListener('ocean-fps', e => { document.getElementById('fps').textContent = `${e.detail} FPS`; });
window.addEventListener('pagehide', e => { if (!e.persisted){tour?.dispose();recorder?.dispose();ocean?.dispose();} });
if(cargoMode)ocean?.faceSun();update();

// Shared subject identity and a recording studio independent of the active simulator.
document.getElementById('subject-form').onsubmit=e=>{e.preventDefault();state.subjectName=normalizeSubjectName(document.getElementById('subject-name').value,cargoMode?'HORIZON':'Ocean Lab');try{localStorage.setItem(nameKey,state.subjectName);}catch{}update();toast('名称已更新');};
const studio=document.getElementById('record-dialog'),recordStatus=document.getElementById('record-status');
document.getElementById('record-open').onclick=()=>studio.showModal();
document.getElementById('close-record').onclick=()=>studio.close();
function lockStudio(busy){
  document.getElementById('experiment').disabled=busy;
  for(const id of ['record-start','demo-start','record-resolution','demo-duration','record-audio'])document.getElementById(id).disabled=busy;
  document.getElementById('record-stop').disabled=!busy||recorder?.state!=='recording';
  for(const el of document.querySelectorAll('.panel input,.panel select,.panel button,.actions button'))if(!['collapse','record-open'].includes(el.id))el.disabled=activeAutomatic&&busy;
}
async function stopRecording(){if(!recorder)return;const finished=recorder.stop();tour?.stop();await finished;}
if(ocean){
  recorder=createSceneRecorder({ocean,
    getInfo:()=>({name:state.subjectName,telemetry:(cargoMode?lastNavigation.knots.toFixed(1)+' kn  ·  '+Math.round(lastNavigation.heading)+'°  ·  ':'')+'波浪 '+(state.height*2).toFixed(1)+' m  ·  '+timeString(state.time)+'  ·  '+({clear:'晴朗',cloudy:'阴天',fog:'海雾',rain:'风雨'}[state.weather])+(paused?'  ·  暂停':'')}),
    onStatus(info){const busy=['starting','recording','stopping'].includes(info.state);if(!busy){if(tour?.active||activeAutomatic)tour?.stop();activeAutomatic=false;}lockStudio(busy);document.getElementById('record-stop-hud').disabled=info.state!=='recording';document.getElementById('record-hud').hidden=!busy;document.getElementById('record-timer').textContent=formatDuration(info.elapsed);document.getElementById('record-chapter').textContent=info.chapter;document.getElementById('record-progress').style.width=info.progress===null?'0%':(info.progress*100)+'%';recordStatus.textContent=info.state==='recording'?'录制中 · '+formatDuration(info.elapsed)+' · '+info.chapter:info.state==='stopping'?'正在封装视频…':info.state==='starting'?'正在准备录制…':info.state==='ready'?'视频已生成，可以预览或重新下载':info.state==='error'?'录制失败，可重新尝试':'就绪';},
    onReady(result){document.getElementById('record-preview').src=result.url;const link=document.getElementById('record-download');link.href=result.url;link.download=result.filename;document.getElementById('record-file-info').textContent=formatDuration(result.duration)+' · '+(result.blob.size/1048576).toFixed(1)+' MB · '+(result.mime.includes('mp4')?'MP4':'WebM')+(result.withAudio?' · 含环境音':' · 无声');document.getElementById('record-result').hidden=false;if(!studio.open)studio.showModal();recorder.download();toast('视频已生成，可预览并下载');},
    onError(error){tour?.stop();toast(error.message||'录制失败');recordStatus.textContent=error.message||'录制失败';}
  });
  tour=createDemoTour({ocean,state,cargo:cargoMode,update,setPaused,onChapter:chapter=>recorder.setChapter(chapter.title,chapter.progress),onComplete:()=>stopRecording()});
  async function beginRecording(automatic){
    try{activeAutomatic=automatic;const size=document.getElementById('record-resolution').value;await recorder.start({auto:automatic,withAudio:document.getElementById('record-audio').checked,width:size==='1080'?1920:1280,height:size==='1080'?1080:720});if(automatic)tour.start(Number(document.getElementById('demo-duration').value),paused,true);studio.close();if(automatic)void recorder.runExport(Number(document.getElementById('demo-duration').value));}
    catch(error){activeAutomatic=false;lockStudio(false);tour?.stop();recordStatus.textContent=error.message;toast(error.message);}
  }
  document.getElementById('record-start').onclick=()=>beginRecording(false);
  document.getElementById('demo-start').onclick=()=>beginRecording(true);
  document.getElementById('record-stop').onclick=stopRecording;
  document.getElementById('record-stop-hud').onclick=stopRecording;
  if(!recorder.supported){document.getElementById('record-start').disabled=true;document.getElementById('demo-start').disabled=true;recordStatus.textContent='当前浏览器不支持录屏，请使用新版 Edge 或 Chrome。';}
}
document.querySelector('.brand').addEventListener('click',e=>{if(recorder&&['starting','recording','stopping'].includes(recorder.state)){e.preventDefault();toast('请先结束并保存录制');}});
