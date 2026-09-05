import {describe,it,expect} from 'vitest';
import {createAdapterContext} from '../types.js';
import {fetchHuggingFaceRows} from '../lib/huggingface.js';

describe('complete source captures',()=>{
 it('reads every page and retries a transient upstream error without duplicating rows',async()=>{
  let calls=0;
  const ctx=createAdapterContext({dataDir:'/tmp',fetch:(async(url:string)=>{
   calls++;
   if(calls===2)return new Response('busy',{status:502});
   const offset=Number(new URL(url).searchParams.get('offset'));
   return new Response(JSON.stringify({rows:[{row:{id:offset}}],num_rows_total:2}));
  })as typeof fetch});
  expect(await fetchHuggingFaceRows(ctx,{dataset:'test',config:'test',split:'latest',pageSize:1,maxRows:3})).toEqual([{id:0},{id:1}]);
  expect(calls).toBe(3);
 });
 it('rejects a truncated capture instead of reporting it as the complete leaderboard',async()=>{
  const ctx=createAdapterContext({dataDir:'/tmp',fetch:(async()=>new Response(JSON.stringify({rows:[{row:{id:1}}],num_rows_total:2001})))as typeof fetch});
  await expect(fetchHuggingFaceRows(ctx,{dataset:'test',config:'test',split:'latest',maxRows:2000})).rejects.toThrow('complete-snapshot limit');
 });
});
