import {chooseRecordingMime,formatDuration,safeFilename} from './recording-utils.js';
import {renderFixedFrames} from './fixed-frames.js';

export function createSceneRecorder({ocean,getInfo,onStatus,onReady,onError}) {
  const output=document.createElement('canvas');output.width=1280;output.height=720;
  const ctx=output.getContext('2d',{alpha:false});
  let recorder=null,stream=null,audio=null,chunks=[],started=0,lastDraw=0,url=null,metadata=null,state='idle',result=null,timeout=null;
  let chapter='自由操作',progress=null,stopPromise=null,resolveStop=null;
  let offline=null,exportElapsed=0,lastStatus=0,direct=false;
  const supported=!!(globalThis.MediaRecorder&&output.captureStream);
  function status(){onStatus?.({state,elapsed:offline?exportElapsed:started?(performance.now()-started)/1000:0,chapter,progress,mime:recorder?.mimeType||''});}
  function draw(source,now){
    if(state!=='recording'||(!offline&&now-lastDraw<1000/30-1))return;lastDraw=now;
    if(direct){if(now-lastStatus>200){status();lastStatus=now;}return;}
    const info=getInfo(),width=output.width,height=output.height;
    ctx.fillStyle='#071720';ctx.fillRect(0,0,width,height);
    const scale=Math.max(width/source.width,height/source.height),w=source.width*scale,h=source.height*scale;
    // Called synchronously after WebGL rendering, before its drawing buffer is discarded.
    ctx.drawImage(source,(width-w)/2,(height-h)/2,w,h);
    const gradient=ctx.createLinearGradient(0,0,0,height);gradient.addColorStop(0,'#04131a70');gradient.addColorStop(.5,'#04131a00');gradient.addColorStop(1,'#04131ae8');ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
    ctx.fillStyle='#bbd4c9';ctx.font='500 12px sans-serif';ctx.fillText('SIMULATION LAB  /  '+(metadata.auto?'AUTO TOUR':'LIVE RECORDING'),36,37);
    ctx.fillStyle='#f2f2e6';ctx.font='500 29px "Microsoft YaHei",sans-serif';ctx.fillText(info.name,36,76);
    ctx.textAlign='right';ctx.font='13px monospace';ctx.fillText(formatDuration(offline?exportElapsed:(now-started)/1000),width-36,38);ctx.textAlign='left';
    ctx.font='500 22px "Microsoft YaHei",sans-serif';ctx.fillText(chapter,36,height-81);
    ctx.fillStyle='#bdd0cb';ctx.font='13px "Microsoft YaHei",sans-serif';ctx.fillText(info.telemetry,36,height-49);
    if(progress!==null){ctx.fillStyle='#ffffff25';ctx.fillRect(36,height-24,width-72,2);ctx.fillStyle='#b7d7ba';ctx.fillRect(36,height-24,(width-72)*Math.min(progress,1),2);}
    if(performance.now()-lastStatus>200){status();lastStatus=performance.now();}
  }
  const unsubscribe=ocean.onFrame(draw);
  function cleanTracks(){stream?.getTracks().forEach(t=>t.stop());stream=null;ocean.endLiveCapture?.();audio?.stop();audio=null;clearTimeout(timeout);timeout=null;}
  async function start({withAudio=true,auto=false,width=1280,height=720}={}){
    if(!supported)throw Error('此浏览器不支持录屏，请使用新版 Edge 或 Chrome。');
    if(['starting','recording','stopping'].includes(state))throw Error('正在录制，请先结束当前录制。');
    output.width=width;output.height=height;direct=false;started=0;state='starting';status();chunks=[];result=null;chapter=auto?'准备自动演示':'自由操作';progress=auto?0:null;
    try{
      if(auto){
        if(!globalThis.VideoEncoder)throw Error('逐帧导出需要支持 WebCodecs 的新版 Edge / Chrome。');
        const {Output,Mp4OutputFormat,BufferTarget,CanvasSource,AudioBufferSource}=await import('mediabunny');
        const target=new BufferTarget(),mux=new Output({format:new Mp4OutputFormat(),target});
        const video=new CanvasSource(output,{codec:'avc',bitrate:6000000});mux.addVideoTrack(video,{frameRate:30});
        const sound=withAudio?new AudioBufferSource({codec:'aac',bitrate:128000}):null;if(sound)mux.addAudioTrack(sound);
        await mux.start();offline={mux,target,video,sound,cancel:false,running:false};exportElapsed=0;
        metadata={auto:true,withAudio,name:getInfo().name};state='recording';status();return;
      }
      if(withAudio)audio=await ocean.recordingAudio();
      // Capture the GPU canvas directly for live recording; avoid a synchronous
      // GPU-to-CPU copy and a second full-size 2D composition on every frame.
      direct=!!ocean.captureStream;
      stream=direct?ocean.captureStream(30,width,height):output.captureStream(30);
      audio?.stream.getAudioTracks().forEach(track=>stream.addTrack(track.clone()));
      const mimeType=chooseRecordingMime(type=>MediaRecorder.isTypeSupported(type),!!audio);
      recorder=new MediaRecorder(stream,{...(mimeType?{mimeType}:{}),videoBitsPerSecond:6000000,audioBitsPerSecond:128000});
      metadata={auto,withAudio:!!audio,name:getInfo().name};
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onerror=e=>{state='error';cleanTracks();onError?.(e.error||Error('视频编码失败'));resolveStop?.(null);resolveStop=null;status();};
      recorder.onstop=()=>{
        if(state==='error')return;
        const mime=recorder.mimeType||mimeType||'video/webm',blob=new Blob(chunks,{type:mime});
        cleanTracks();if(!blob.size){state='error';status();onError?.(Error('未捕获到画面，请录制几秒后再保存。'));resolveStop?.(null);resolveStop=null;return;}if(url)URL.revokeObjectURL(url);
        url=URL.createObjectURL(blob);const extension=mime.includes('mp4')?'mp4':'webm';
        result={url,blob,mime,filename:`${safeFilename(metadata.name)}-${auto?'自动演示':'录屏'}-${new Date().toISOString().replace(/[:.]/g,'-')}.${extension}`,duration:(performance.now()-started)/1000,withAudio:metadata.withAudio};
        state='ready';chunks=[];status();onReady?.(result);resolveStop?.(result);resolveStop=null;
      };
      started=performance.now();lastDraw=0;state='recording';recorder.start(1000);
      // Bound browser memory for unattended manual recordings.
      timeout=setTimeout(()=>stop(),5*60*1000);status();
    }catch(error){cleanTracks();state='error';status();throw error;}
  }
  function stop(){
    if(offline){offline.cancel=true;return stopPromise||Promise.resolve(null);}
    if(state==='stopping')return stopPromise;
    if(state!=='recording')return Promise.resolve(result);
    state='stopping';status();stopPromise=new Promise(resolve=>resolveStop=resolve);recorder.stop();return stopPromise;
  }
  function download(){if(!result)return;const link=document.createElement('a');link.href=result.url;link.download=result.filename;link.click();}
  async function runExport(seconds){
    if(!offline||offline.running)return;const job=offline;job.running=true;
    stopPromise=new Promise(resolve=>resolveStop=resolve);let frames=0,noise=21,low=0;
    try{
      ocean.beginExport(output.width,output.height);
      frames=await renderFixedFrames({seconds,cancelled:()=>job.cancel,
        render(i,t){exportElapsed=t;ocean.renderExportFrame(i,30);},
        async encode(i,t,dt){await job.video.add(t,dt);
        if(job.sound){
          const buffer=new AudioBuffer({numberOfChannels:1,length:1600,sampleRate:48000}),data=buffer.getChannelData(0);
          for(let n=0;n<data.length;n++){noise=(Math.imul(noise,1664525)+1013904223)>>>0;low=.94*low+.06*(noise/2147483648-1);data[n]=low*(.16+.07*Math.sin((i/30+n/48000)*.7));}
          await job.sound.add(buffer);
        }
        }});
      state='stopping';status();await job.mux.finalize();
      if(url)URL.revokeObjectURL(url);const blob=new Blob([job.target.buffer],{type:'video/mp4'});url=URL.createObjectURL(blob);
      result={url,blob,mime:'video/mp4',filename:`${safeFilename(metadata.name)}-自动演示-30fps-${Date.now()}.mp4`,duration:frames/30,withAudio:metadata.withAudio};
      state='ready';
    }catch(error){state='error';await job.mux.cancel().catch(()=>{});onError?.(error);}
    finally{ocean.endExport();offline=null;status();if(state==='ready')onReady?.(result);resolveStop?.(result);resolveStop=null;}
  }
  return {supported,start,stop,runExport,download,get state(){return state;},get result(){return result;},setChapter(title,value=null){chapter=title;progress=value;},dispose(){unsubscribe();if(offline){offline.cancel=true;}if(recorder?.state==='recording'){recorder.onstop=null;recorder.stop();}cleanTracks();if(url)URL.revokeObjectURL(url);}};
}
