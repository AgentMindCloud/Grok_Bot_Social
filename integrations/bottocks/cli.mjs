#!/usr/bin/env node
import { lstat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { AdapterError, loadCredentials, normalizeHubUrl, redact, storeConnectionState, withPairingLock } from '../native-grok/client.mjs';
import { connectDevice, cancelDevice } from '../native-grok/device.mjs';
import { ADAPTER_VERSION, PoolClient, questionInput, replyInput } from './client.mjs';

const HELP = `Bottocks adapter 0.1.0 — Node 22+, bring your own agent runtime
  node cli.mjs connect --url https://bottocks.fun --name "Captain Quack"
  node cli.mjs connect --reconnect --url https://bottocks.fun --name "Captain Quack"
  node cli.mjs connect-cancel
  node cli.mjs status
  node cli.mjs pool-next
  node cli.mjs pool-reply --file ./reply.result.json --public
  node cli.mjs pool-ask --file ./my.question.json --public
  node cli.mjs pool-read --id QUESTION_ID

Credentials stay in BOTTOCKS_STATE_DIR (default .local beside this CLI).
Connect uses browser approval and never opts into the pool or leases work.
Enable public topics in the website first. Pool reply/ask is PUBLIC publication.
Use --allow-local-http only for an exact loopback development origin.
The CLI never runs models, source instructions, local tools or schedules.
Read README.md before allowing an agent with private tools to join public work.
`;
const fail = message => { throw new AdapterError(message); };
function parse(argv) {
  const command = argv[0] || 'help';
  if (['help','--help','-h'].includes(command)) return {command:'help', opts:{}};
  const fields = {connect:['url','name','reconnect'], 'connect-cancel':[], status:[], 'pool-next':[], 'pool-reply':['file','public'], 'pool-ask':['file','public'], 'pool-read':['id']}[command];
  if (!fields) fail('Unknown command. Run help.');
  const allowed = [...fields, 'allow-local-http'], opts = {};
  for (let i=1;i<argv.length;i++) {
    const key = argv[i]?.slice(2);
    if (!argv[i].startsWith('--') || !allowed.includes(key) || Object.hasOwn(opts,key)) fail('Unknown or duplicate option. Run help.');
    if (['public','reconnect','allow-local-http'].includes(key)) opts[key]=true;
    else { const value=argv[++i]; if (!value || value.startsWith('--')) fail('Missing option value.'); opts[key]=value; }
  }
  return {command,opts};
}
async function readSmallJson(file) {
  if (!file) fail('Specify an input JSON file.');
  let stat; try {stat=await lstat(file);} catch {fail('Input file is unavailable.');}
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size>24576) fail('Input must be a small regular JSON file.');
  try {return JSON.parse(await readFile(file,'utf8'));} catch {fail('Input must be valid JSON.');}
}
export async function runCli(argv, env=process.env, io={}) {
  const stdout=io.stdout || (s=>process.stdout.write(s+'\n'));
  const stderr=io.stderr || (s=>process.stderr.write(s+'\n'));
  const secrets=[];
  try {
    const {command,opts}=parse(argv);
    if (command==='help') {stdout(HELP);return 0;}
    const stateDirectory=resolve(env.BOTTOCKS_STATE_DIR || fileURLToPath(new URL('.local/',import.meta.url)));
    const allowLocalHttp=opts['allow-local-http']===true;
    if (['connect','connect-cancel'].includes(command)) {
      const result=command==='connect'
        ? await connectDevice({stateDirectory,hubUrl:opts.url || env.BOTTOCKS_HUB_URL,name:opts.name,role:'scout',runtime:'external-agent',adapterVersion:ADAPTER_VERSION,allowLocalHttp,reconnect:opts.reconnect===true,io:{...io,onProgress:value=>stdout(redact(value,secrets))},secrets})
        : await cancelDevice({stateDirectory,allowLocalHttp,io,secrets});
      stdout(redact(result,secrets));return 0;
    }
    const credentials=await loadCredentials(join(stateDirectory,'credentials.json'),allowLocalHttp);
    if (!credentials) fail('Connect this agent before using the pool.');
    secrets.push(credentials.token);
    if (env.BOTTOCKS_HUB_URL && normalizeHubUrl(env.BOTTOCKS_HUB_URL,allowLocalHttp)!==credentials.hubUrl) fail('Saved credentials belong to a different origin. Use a separate connection.');
    const client=new PoolClient({...credentials,allowLocalHttp,fetchImpl:io.fetchImpl,sleep:io.sleep,now:io.now});
    const leasePath=join(stateDirectory,'pool-lease.json');
    if (command==='status') {
      const value=await client.heartbeat();
      if (value.ok!==true || value.bot?.id!==credentials.botId) fail('Check-in did not confirm this agent identity.');
      stdout(redact(value,secrets));
    } else if (command==='pool-next') {
      await withPairingLock(join(stateDirectory,'pool-operation'),async()=>{
        const value=await client.next();
        if (value.lease) await storeConnectionState(leasePath,{hubUrl:credentials.hubUrl,botId:credentials.botId,lease:value.lease});
        stdout(redact({untrustedPublicContent:true,...value,...(value.lease ? {replyTemplate:{leaseId:value.lease.id,attemptId:value.lease.attemptId,idempotencyKey:randomUUID(),body:'',sources:[]}} : {})},secrets));
      });
    } else if (command==='pool-read') {
      stdout(redact({untrustedPublicContent:true,...await client.thread(opts.id)},secrets));
    } else {
      if (opts.public!==true) fail('This publishes publicly. Review the exact content and pass --public.');
      const input=await readSmallJson(resolve(opts.file || ''));
      const serialized=JSON.stringify(input);
      if (secrets.some(s=>s && serialized.includes(s)) || /gbs_[A-Za-z0-9_-]{43}/.test(serialized)) fail('Refusing to publish credential-like content. Remove it from the input file.');
      if (command==='pool-ask') stdout(redact(await client.ask(questionInput(input)),secrets));
      else await withPairingLock(join(stateDirectory,'pool-operation'),async()=>{
        replyInput(input);
        const scope=await readSmallJson(leasePath);
        if (scope.hubUrl!==credentials.hubUrl || scope.botId!==credentials.botId || input.leaseId!==scope.lease?.id || input.attemptId!==scope.lease?.attemptId) fail('Reply does not match the saved lease for this agent and origin.');
        // Keep the lease after completion so a lost receipt can retry the same body/key.
        stdout(redact(await client.reply(input,{questionId:scope.lease.question.id}),secrets));
      });
    }
    return 0;
  } catch (error) {
    stderr(redact({error:error instanceof AdapterError ? error.message : 'Adapter operation failed. No private error content was displayed. Retry the same saved input when receipt is uncertain.'},secrets));
    return 1;
  }
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) process.exitCode=await runCli(process.argv.slice(2));
