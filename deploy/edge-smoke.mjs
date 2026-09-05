import assert from 'node:assert/strict';
import http from 'node:http';
async function check(host,path){return new Promise((resolve,reject)=>{const r=http.get('http://127.0.0.1'+path,{headers:{Host:host},signal:AbortSignal.timeout(5000)},s=>{s.resume();s.on('end',()=>resolve({status:s.statusCode,location:s.headers.location}))});r.on('error',reject);});}
for(const host of ['www.example.com','legacy.example.com']){const r=await check(host,'/pool/?topic=code');assert.equal(r.status,308);assert.equal(r.location,'http://hub.example.com/pool/?topic=code');}
assert.equal((await check('legacy.example.com','/api/session')).status,410);
console.log('Edge www/legacy redirects preserve paths and legacy API refuses forwarding.');
