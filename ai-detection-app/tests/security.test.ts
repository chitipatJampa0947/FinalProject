import test from 'node:test';
import assert from 'node:assert/strict';
import { feedbackHandler, validateFeedback, MODEL_ID } from '../../supabase/functions/submit-feedback/handler.ts';
import { requireAdministrator } from '../src/security/adminAuthorization.ts';
import { secureFeedbackPayload, submitFeedback } from '../src/security/feedbackTransport.ts';
import { classify } from '../src/inference/contract.ts';
import { validateBackendConfig } from '../src/lib/supabaseClient.ts';
const result = { ...classify([1,2,3,4], MODEL_ID), text: 'ทดสอบข้อความ '.repeat(25) };
const payload = secureFeedbackPayload(result, 'Human');
const request = (body: unknown, origin = 'https://review.example') => new Request('https://function.invalid', {
  method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
test('backend defaults disabled; refuses secret keys, service JWTs and unsafe URLs', () => {
  assert.equal(validateBackendConfig(undefined, 'https://x.test', 'sb_publishable_example', 'site'), null);
  for (const url of ['http://x.test','https://user:pass@x.test','https://x.test/path','https://x.test?token=x'])
    assert.equal(validateBackendConfig('secure-v1',url,'sb_publishable_example','site'),null);
  assert.equal(validateBackendConfig('secure-v1','https://x.test','sb_secret_example','site'),null);
  const jwt = 'eyJ.' + btoa(JSON.stringify({role:'service_role'})) + '.fake';
  assert.equal(validateBackendConfig('secure-v1','https://x.test',jwt,'site'),null);
  assert.ok(validateBackendConfig('secure-v1','https://x.test','sb_publishable_example','site'));
});
test('feedback evidence preserves exact inference result and forces pending', () => {
  assert.equal(payload.reported_text,result.text); assert.equal(payload.status,'pending');
  assert.equal(payload.model_id,MODEL_ID); assert.equal(payload.ai_probability,result.aiProbability*100);
  assert.deepEqual(payload.probabilities,result.probs); assert.equal(payload.category,result.category);
  assert.deepEqual(validateFeedback(payload),payload);
});
test('server rejects forged fields, labels, statuses, models, probabilities and text', () => {
  const bad = [null,[],{...payload,id:'forged'},{...payload,status:'approved'}, {...payload,user_expected_label:'GPT'},
    {...payload,model_id:'old-model'},{...payload,category:'human'},{...payload,ai_probability:1000},
    {...payload,reported_text:' ' .repeat(200)},{...payload,reported_text:'x'.repeat(10001)},
    {...payload,reported_text:'x'.repeat(199)},{...payload,reported_text:'x'.repeat(200)+'\0'},
    {...payload,probabilities:{human:NaN,gpt:0,gemini:0,other:1}},
    {...payload,probabilities:{human:0,gpt:0,gemini:0,other:0}},
    {...payload,probabilities:{...payload.probabilities,extra:0}}];
  for (const p of bad) assert.throws(() => validateFeedback(p));
});
test('anonymous/unverified identities cannot pass administrator guard', async () => {
  for (const user of [null,{id:'ordinary'}]) {
    await assert.rejects(requireAdministrator({auth:{getUser:async()=>({data:{user},error:null})},rpc:async()=>({data:false,error:null})}));
  }
  await assert.rejects(requireAdministrator({auth:{getUser:async()=>({data:{user:{id:'admin'}},error:null})},rpc:async()=>({data:true,error:new Error('network')})}));
  await requireAdministrator({auth:{getUser:async()=>({data:{user:{id:'admin'}},error:null})},rpc:async()=>({data:true,error:null})});
});
test('gateway never inserts when origin, payload or CAPTCHA is invalid', async () => {
  let inserts=0,verifications=0;
  const handle=feedbackHandler({origins:['https://review.example'],verify:async()=>{verifications++;return false;},insert:async()=>{inserts++;return 'ok';}});
  assert.equal((await handle(request({payload,challenge:'token'},'https://evil.test'))).status,403);
  assert.equal((await handle(request({payload:{...payload,status:'approved'},challenge:'token'}))).status,400);
  assert.equal((await handle(request({payload,challenge:'token'}))).status,403);
  assert.equal(inserts,0); assert.equal(verifications,1);
});
test('gateway bounds raw request size including missing or forged Content-Length', async () => {
  const handle=feedbackHandler({origins:['https://review.example'],verify:async()=>true,insert:async()=>{throw new Error('must not insert');}});
  const response=await handle(request({payload,challenge:'x'.repeat(49000)}));assert.equal(response.status,413);
  assert.equal((await handle(request({payload,challenge:'x'.repeat(2049)}))).status,400);
});
test('gateway returns safe errors for verifier/db failure and server rate limit', async () => {
  const make=(verify:()=>Promise<boolean>,insert:()=>Promise<'ok'|'rate_limit'>)=>feedbackHandler({origins:['https://review.example'],verify,insert});
  assert.equal((await make(async()=>{throw new Error('secret');},async()=>'ok')(request({payload,challenge:'token'}))).status,503);
  const unavailable=await make(async()=>true,async()=>{throw new Error('secret SQL details');})(request({payload,challenge:'token'}));
  assert.equal(unavailable.status,503);assert.ok(!(await unavailable.text()).includes('secret'));
  assert.equal((await make(async()=>true,async()=>'rate_limit')(request({payload,challenge:'token'}))).status,429);
});
test('accepted anonymous feedback has hashed challenge receipt, no caller identity/status escalation', async () => {
  let saved: unknown;let hash='';
  const handle=feedbackHandler({origins:['https://review.example'],verify:async(t,h)=>t==='token'&&h==='review.example',insert:async(p,h)=>{saved=p;hash=h;return 'ok';}});
  const response=await handle(request({payload,challenge:'token'}));assert.equal(response.status,202);
  assert.deepEqual(saved,payload);assert.match(hash,/^[0-9a-f]{64}$/);assert.notEqual(hash,'token');
  assert.deepEqual(await response.json(),{accepted:true});assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://review.example');
});
test('feedback transport does not send auth sessions and isolates failure from immutable prediction', async () => {
  const before=JSON.stringify(result);
  await assert.rejects(submitFeedback({url:'https://x.test',key:'public'},payload,'token',async(_url,init)=>{
    assert.equal(init?.credentials,'omit');assert.ok(init?.signal);assert.equal(new Headers(init?.headers).get('Authorization'),null);
    return new Response('{}',{status:503});
  }));
  assert.equal(JSON.stringify(result),before);
  await assert.rejects(submitFeedback({url:'https://x.test',key:'public'},payload,'',async()=>{throw new Error('must not fetch');}));
  await assert.rejects(submitFeedback({url:'https://x.test',key:'public'},payload,'token',async()=>new Response('{}')));
  await submitFeedback({url:'https://x.test',key:'public'},payload,'token',async()=>Response.json({accepted:true},{status:202}));
});
