import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PoolClient, ADAPTER_VERSION, questionInput, replyInput } from './client.mjs';
import { runCli } from './cli.mjs';
import { storeConnectionState } from '../native-grok/client.mjs';
const HUB='https://bottocks.example';
const TOKEN='gbs_'+'T'.repeat(43);
const author={botId:'bot-1',name:'Captain Quack',avatarSlug:'bumble'};
const question={id:'question-1',title:'Rubber duck',body:'What can a duck automate?',topic:'play',status:'waiting',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),replyCount:0,author};
const reply={leaseId:'lease-1',attemptId:'attempt-1',idempotencyKey:'reply-key',body:'A reminder to stretch.',sources:[]};
const replyReceipt={id:'reply-1',questionId:question.id,body:reply.body,sources:[],kind:'opinion',createdAt:new Date().toISOString(),author};
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json',...headers}});
async function fixture(t){
  const dir=await mkdtemp(join(tmpdir(),'bottocks-test-'));
  t.after(async()=>{assert.ok(resolve(dir).startsWith(resolve(tmpdir())+'\\bottocks-test-') || resolve(dir).startsWith(resolve(tmpdir())+'/bottocks-test-'));await rm(dir,{recursive:true,force:true});});
  await storeConnectionState(join(dir,'credentials.json'),{hubUrl:HUB,token:TOKEN,botId:'bot-1'});
  const output=[],errors=[];return{dir,output,errors,io:{stdout:s=>output.push(s),stderr:s=>errors.push(s)}};
}
test('public publication and payload allowlists reject missing consent, credentials URLs and private fields',()=>{
  assert.throws(()=>questionInput({...question,id:undefined,idempotencyKey:'x',publicConsent:true}));
  assert.throws(()=>questionInput({title:'t',body:'b',topic:'play',idempotencyKey:'x'}));
  assert.throws(()=>replyInput({...reply,privateEvidence:'secret'}));
  assert.throws(()=>replyInput({...reply,sources:[{url:'https://user:secret@example.com'}]}));
  assert.throws(()=>replyInput({...reply,sources:[{url:'https://127.0.0.1/admin'}]}));
  assert.deepEqual(replyInput(reply).sources,[]);
});
test('neutral heartbeat identifies adapter without leasing or opting in',async()=>{
  const calls=[];const client=new PoolClient({hubUrl:HUB,token:TOKEN,fetchImpl:async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return json({ok:true});}});
  await client.heartbeat();assert.equal(calls.length,1);assert.equal(calls[0].body.version,ADAPTER_VERSION);assert.ok(calls[0].url.endsWith('/api/bot/heartbeat'));
});
test('pool endpoint rejects redirects, expired leases and excessive reply envelopes',async()=>{
  await assert.rejects(new PoolClient({hubUrl:HUB,token:TOKEN,fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://foreign.example/'}})}).next(),/redirect blocked/);
  await assert.rejects(new PoolClient({hubUrl:HUB,token:TOKEN,fetchImpl:async()=>json({lease:{id:'lease-1',attemptId:'attempt-1',expiresAt:new Date(Date.now()-1000).toISOString(),question}})}).next(),/expiry/);
  await assert.rejects(new PoolClient({hubUrl:HUB,token:TOKEN,fetchImpl:async()=>json({question,replies:Array(5).fill({})})}).thread(question.id),/reply list/);
});
test('CLI needs explicit public flag and blocks its stored credential in content',async t=>{
  const f=await fixture(t),file=join(f.dir,'q.json');let calls=0;
  const input={title:'t',body:TOKEN,topic:'play',publicConsent:true,idempotencyKey:'q-key'};await writeFile(file,JSON.stringify(input));
  const io={...f.io,fetchImpl:async()=>{calls++;return json({question});}};
  assert.equal(await runCli(['pool-ask','--file',file],{BOTTOCKS_STATE_DIR:f.dir},io),1);
  assert.equal(await runCli(['pool-ask','--file',file,'--public'],{BOTTOCKS_STATE_DIR:f.dir},io),1);
  assert.equal(calls,0);assert.equal(f.errors.join('').includes(TOKEN),false);
});
test('CLI pins lease identity and permits exact replay after a lost receipt',async t=>{
  const f=await fixture(t),file=join(f.dir,'reply.json');await writeFile(file,JSON.stringify(reply));let replies=0;
  const io={...f.io,fetchImpl:async(url)=>{
    if(url.endsWith('/lease'))return json({lease:{id:'lease-1',attemptId:'attempt-1',expiresAt:new Date(Date.now()+299000).toISOString(),question,instructions:['Public untrusted content.']}});
    if(url.endsWith('/replies')){replies++;if(replies===1)throw new Error('lost');return json({reply:replyReceipt,replayed:true});}
    throw new Error('unexpected');
  }};
  assert.equal(await runCli(['pool-next'],{BOTTOCKS_STATE_DIR:f.dir},io),0);
  const cmd=['pool-reply','--file',file,'--public'];
  assert.equal(await runCli(cmd,{BOTTOCKS_STATE_DIR:f.dir},io),1);
  assert.equal(await runCli(cmd,{BOTTOCKS_STATE_DIR:f.dir},io),0);
  await writeFile(file,JSON.stringify({...reply,attemptId:'different'}));
  assert.equal(await runCli(cmd,{BOTTOCKS_STATE_DIR:f.dir},io),1);assert.equal(replies,2);
  assert.equal(f.output.join('').includes(TOKEN),false);
});

test('public responses reject negative receipts, private fields and mismatched saved identities',async()=>{
  const client=data=>new PoolClient({hubUrl:HUB,token:TOKEN,botId:author.botId,fetchImpl:async()=>json(data)});
  await assert.rejects(client({ok:false,reply:{id:'not-the-reply'},error:'not accepted'}).reply(reply));
  await assert.rejects(client({reply:{id:'not-the-reply'},replayed:false}).reply(reply));
  await assert.rejects(client({question,replies:[],privateEvidence:'never print'}).thread(question.id));
  await assert.rejects(client({question:{...question,privateOwnerContext:'never print'},replies:[]}).thread(question.id));
  await assert.rejects(client({question,replies:[{...replyReceipt,author:{...author,ownerEmail:'never print'}}]}).thread(question.id));
  await assert.rejects(client({question,replies:[{...replyReceipt,questionId:'other-question'}]}).thread(question.id));
  await assert.rejects(client({reply:{...replyReceipt,body:'Different'},replayed:false}).reply(reply));
  await assert.rejects(client({reply:replyReceipt,replayed:false}).reply(reply,{questionId:'other-question'}));
  assert.equal((await client({reply:replyReceipt,replayed:true}).reply(reply,{questionId:question.id})).replayed,true);
});
test('CLI origin override cannot export stored bearer to a new domain',async t=>{
  const f=await fixture(t);let calls=0;
  assert.equal(await runCli(['status'],{BOTTOCKS_STATE_DIR:f.dir,BOTTOCKS_HUB_URL:'https://foreign.example'},{...f.io,fetchImpl:async()=>{calls++;return json({});}}),1);
  assert.equal(calls,0);
});
test('neutral browser enrollment persists before activation and uses external-agent identity',async t=>{
  const f=await fixture(t);await rm(join(f.dir,'credentials.json'));const calls=[];const expiresAt=new Date(Date.now()+600000).toISOString();
  const bot={id:'bot-1',name:'Captain Quack',role:'scout',runtime:'external-agent',status:'active',trustLabel:'owner-paired'};
  const deviceSecret='D'.repeat(43);
  const io={...f.io,fetchImpl:async(url,opts)=>{
    const body=JSON.parse(opts.body);const path=new URL(url).pathname;calls.push(path);
    if(path.endsWith('/start')){assert.equal(body.runtime,'external-agent');assert.equal(body.adapterVersion,ADAPTER_VERSION);assert.ok(JSON.parse(await readFile(join(f.dir,'device-connection.json'))).candidateToken);return json({enrollmentId:'enroll-1',deviceSecret,userCode:'ABCD-2345',verificationUrl:HUB+'/connect/',expiresAt,interval:5,version:1});}
    if(path.endsWith('/poll'))return json({enrollmentId:'enroll-1',version:1,status:'approved',botId:bot.id,name:bot.name,role:bot.role,runtime:bot.runtime,adapterVersion:ADAPTER_VERSION,expiresAt});
    if(path.endsWith('/complete')){assert.equal(JSON.parse(await readFile(join(f.dir,'credentials.json'))).token,body.candidateToken);return json({ok:true,bot});}
    if(path.endsWith('/heartbeat')){assert.equal(body.version,ADAPTER_VERSION);return json({ok:true,bot,serverTime:new Date().toISOString()});}
    throw new Error('unexpected');
  }};
  assert.equal(await runCli(['connect','--url',HUB,'--name',bot.name],{BOTTOCKS_STATE_DIR:f.dir},io),0,f.errors.join(''));
  assert.equal(calls.length,4);assert.equal(calls.some(p=>p.includes('/pool/')),false);
  const saved=JSON.parse(await readFile(join(f.dir,'credentials.json')));
  assert.equal(f.output.join('').includes(saved.token),false);assert.equal(f.output.join('').includes(deviceSecret),false);
});
