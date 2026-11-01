#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const skill=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const assets=path.join(skill,'assets');
async function verify(){
  const manifest=JSON.parse(await fs.readFile(path.join(assets,'manifest.json'),'utf8'));
  for(const item of manifest.files){
    if(!/^(starter|quality)\//.test(item.path)||item.path.split('/').includes('..'))throw Error('Unsafe asset path');
    const file=path.join(assets,item.path),stat=await fs.lstat(file);
    if(!stat.isFile())throw Error(`Not a regular asset: ${item.path}`);
    const bytes=await fs.readFile(file),hash=createHash('sha256').update(bytes).digest('hex');
    if(hash!==item.sha256||bytes.length!==item.bytes)throw Error(`Asset checksum mismatch: ${item.path}`);
  }
  return manifest;
}
try{
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--verify'){
    const m=await verify();console.log(`Verified ${m.files.length} baseline assets (${m.version}).`);
  }else{
    if(args.length!==1||args[0].startsWith('--'))throw Error('Usage: node scaffold.mjs <empty-target-directory> | --verify');
    const target=path.resolve(args[0]),relative=path.relative(skill,target);
    if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw Error('Target must be outside the skill package.');
    const existing=await fs.lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(existing&&(!existing.isDirectory()||existing.isSymbolicLink()||(await fs.readdir(target)).length))throw Error('Target must be an absent or empty directory; nothing was overwritten.');
    const manifest=await verify();
    await fs.mkdir(target,{recursive:true});
    for(const item of manifest.files.filter(x=>x.path.startsWith('starter/'))){
      const local=item.path.slice('starter/'.length),destination=path.join(target,local);
      await fs.mkdir(path.dirname(destination),{recursive:true});
      await fs.copyFile(path.join(assets,item.path),destination,fs.constants.COPYFILE_EXCL);
    }
    console.log(JSON.stringify({created:target,baseline:manifest.version,next:['npm ci','npm test','npm run dev'],routes:['/?scene=cargo','/?scene=ocean']},null,2));
  }
}catch(error){console.error(error.message);process.exitCode=1;}
