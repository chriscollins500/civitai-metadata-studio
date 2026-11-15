// Reviewed SDK dependency overrides: synthetic loopback and in-memory OAuth only.
import runTest from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as fs from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';

const test = (name, fn) => runTest(name, { timeout: 20_000 }, fn);
const require = createRequire(import.meta.url);
const sdkRequire = createRequire(require.resolve('@modelcontextprotocol/client'));
// Use real import conditions for ESM, not require.resolve()'s CJS target.
const load = async (name, mode) => mode === 'cjs' ? sdkRequire(name) : import(name);
const wait = ms => new Promise(r => setTimeout(r, ms));
async function bounded(promise, ms = 10000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Fixture deadline exceeded')), ms); })]); }
  finally { clearTimeout(timer); }
}
async function server(t, handler) {
  const faults = [], sockets = new Set();
  const s = createServer((req,res) => Promise.resolve().then(() => handler(req,res)).catch(e => { faults.push(e); res.destroy(e); }));
  s.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  s.listen(0, '127.0.0.1'); await once(s, 'listening');
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(r => s.close(r)); assert.deepEqual(faults, []); });
  return new URL(`http://127.0.0.1:${s.address().port}`);
}
async function body(req) { let text = ''; for await (const b of req) text += b; return JSON.parse(text); }
async function fragments(res, text) {
  const bytes = Buffer.from(text);
  for (let i=0; i<bytes.length; i+=3) { if (res.destroyed) return; res.write(bytes.subarray(i,i+3)); await new Promise(r => setImmediate(r)); }
}
const vector = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const request = { jsonrpc:'2.0', id:7, method:'ping' };
const result = { jsonrpc:'2.0', id:7, result:{ text:'Mañana 雪 🐈' } };
const tool = { name:'fixture_tool', description:'Local synthetic transport fixture', inputSchema:{type:'object'} };
function rpc(msg) {
  const result = msg.method === 'initialize' ? {protocolVersion:msg.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'isolated-sse-fixture',version:'1.0.0'}} : msg.method === 'tools/list' ? {tools:[tool]} : {};
  return {jsonrpc:'2.0',id:msg.id,result};
}

test('SDK dependency overrides are exact, scoped, installed, and deduplicated', async () => {
  const pins = { eventsource: '5.1.5', 'eventsource-parser': '4.1.3', 'pkce-challenge': '6.0.0' };
  const read = async url => JSON.parse(await fs.readFile(url, 'utf8'));
  const manifest = await read(new URL('../package.json', import.meta.url));
  const lock = await read(new URL('../package-lock.json', import.meta.url));
  assert.deepEqual(manifest.overrides, { '@modelcontextprotocol/client': pins });
  for (const [name, version] of Object.entries(pins)) {
    const entries = Object.entries(lock.packages).filter(([path]) => path.endsWith('/' + name));
    assert.equal(entries.length, 1, name + ' must not have duplicate versions');
    assert.equal(entries[0][0], 'node_modules/' + name);
    assert.equal(entries[0][1].version, version);
    assert.equal(entries[0][1].dev, true);
    const installed = await read(new URL('../node_modules/' + name + '/package.json', import.meta.url));
    assert.equal(installed.version, version);
  }
});

for (const mode of ['esm','cjs']) {
  const sdk = await load('@modelcontextprotocol/client', mode);
  const parser = await load('eventsource-parser', mode);
  const {EventSourceParserStream} = await load('eventsource-parser/stream', mode);
  const pkce = await load('pkce-challenge', mode);
  const es = await load('eventsource', mode);

  test(`${mode}: SDK and all public dependency entry points load`, () => {
    for (const key of ['Client','SSEClientTransport','StreamableHTTPClientTransport','startAuthorization','exchangeAuthorization','refreshAuthorization']) assert.equal(typeof sdk[key], 'function', key);
    assert.equal(typeof es.EventSource,'function'); assert.equal(typeof parser.createParser,'function');
    assert.equal(typeof EventSourceParserStream,'function'); assert.equal(typeof pkce.default,'function');
  });

  test(`${mode}: parser preserves fragmented CRLF, Unicode, multiline data, IDs, retry, comments`, () => {
    const events=[], retries=[], comments=[], errors=[];
    const p = parser.createParser({onEvent:e=>events.push(e),onRetry:n=>retries.push(n),onComment:c=>comments.push(c),onError:e=>errors.push(e)});
    const text = ': fixture\r\nretry: 125\r\nid: abc\r\nevent: custom\r\ndata: 雪\r\ndata: second 🐈\r\n\r\n';
    for(let i=0;i<text.length;i+=3) p.feed(text.slice(i,i+3));
    assert.deepEqual(events,[{id:'abc',event:'custom',data:'雪\nsecond 🐈'}]);
    assert.deepEqual(retries,[125]); assert.deepEqual(comments,['fixture']); assert.deepEqual(errors,[]);
    p.feed('id: forbidden\0id\ndata: next\n\n'); assert.equal(events[1].id,undefined);
  });

  test(`${mode}: parser retains the first event after empty chunks and split leading BOMs`, () => {
    for (const chunks of [['', '\uFEFF', 'data: first\n\n'], ['', '\xEF', '\xBB', '\xBF', 'data: first\n\n']]) {
      const events = [], errors = [];
      const p = parser.createParser({ onEvent: e => events.push(e), onError: e => errors.push(e) });
      for (const chunk of chunks) p.feed(chunk);
      assert.deepEqual(events.map(e => e.data), ['first']);
      assert.deepEqual(errors, []);
    }
  });

  test(`${mode}: parser reports complete unknown fields and invalid retry without losing subsequent events`, () => {
    const events=[], errors=[];
    const p = parser.createParser({onEvent:e=>events.push(e),onError:e=>errors.push(e)});
    p.feed('unknown: value\nretry: nope\ndata: recovered\n\n');
    assert.deepEqual(errors.map(e=>e.type),['unknown-field','invalid-retry']); assert.equal(events[0].data,'recovered');
  });

  test(`${mode}: parser rejects oversized partial data, terminates, and resets safely`, () => {
    const events=[], errors=[];
    const p = parser.createParser({maxBufferSize:32,onEvent:e=>events.push(e),onError:e=>errors.push(e)});
    p.feed('data: '+ 'x'.repeat(80));
    assert.equal(errors[0].type,'max-buffer-size-exceeded'); assert.throws(()=>p.feed('\n\n'),/terminated|buffer/i);
    p.reset(); p.feed('data: ok\n\n'); assert.equal(events[0].data,'ok');
  });

  test(`${mode}: public parser stream handles byte-split UTF-8 and rejects oversized buffers`, async () => {
    const bytes = Buffer.from('id: utf8\ndata: Mañana 雪 🐈\n\n');
    const source = new ReadableStream({start(c){for(let i=0;i<bytes.length;i++)c.enqueue(bytes.subarray(i,i+1));c.close();}});
    const events = await Array.fromAsync(source.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream()));
    assert.equal(events[0].data,'Mañana 雪 🐈'); assert.equal(events[0].id,'utf8');
    const bad = new ReadableStream({start(c){c.enqueue('data: '+'x'.repeat(100));c.close();}});
    await assert.rejects(Array.fromAsync(bad.pipeThrough(new EventSourceParserStream({maxBufferSize:32}))), /buffer size/i);
  });

  test(`${mode}: PKCE RFC 7636 vector and rejection of a wrong challenge`, async () => {
    assert.equal(await pkce.generateChallenge(vector),challenge);
    assert.equal(await pkce.verifyChallenge(vector,challenge),true);
    assert.equal(await pkce.verifyChallenge(vector,challenge+'x'),false);
  });

  test(`${mode}: PKCE defaults, boundary lengths, randomness and SHA-256 independently agree`, async () => {
    const seen = new Set();
    for(const length of [undefined,43,64,128,...Array(12).fill(43)]) {
      const pair = await pkce.default(length);
      assert.equal(pair.code_verifier.length,length??43); assert.match(pair.code_verifier,/^[A-Za-z0-9._~-]+$/);
      assert.equal(pair.code_challenge,createHash('sha256').update(pair.code_verifier).digest('base64url'));
      assert.equal(pair.code_challenge.length,43); assert.equal(pair.code_challenge_method,'S256'); assert.ok(!seen.has(pair.code_verifier)); seen.add(pair.code_verifier);
    }
    for(const length of [42,129]) { let rejected=false; try {await pkce.default(length);} catch {rejected=true;} assert.ok(rejected); }
  });

  test(`${mode}: actual SDK OAuth PKCE authorization, token exchange and refresh work without external networking`, async () => {
    const issuer = new URL('https://issuer.example.test');
    const metadata = {issuer:issuer.href,authorization_endpoint:new URL('/authorize',issuer).href,token_endpoint:new URL('/token',issuer).href,
      response_types_supported:['code'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none']};
    const clientInformation={client_id:'isolated-public-client'};
    const redirectUrl=new URL('http://127.0.0.1:19999/callback');
    const {authorizationUrl,codeVerifier} = await sdk.startAuthorization(issuer,{metadata,clientInformation,redirectUrl,state:'synthetic-state',scope:'read offline_access',resource:new URL('https://resource.example.test/mcp')});
    const params=authorizationUrl.searchParams;
    assert.equal(params.get('code_challenge'),createHash('sha256').update(codeVerifier).digest('base64url'));
    assert.equal(params.get('code_challenge_method'),'S256'); assert.equal(params.get('state'),'synthetic-state'); assert.equal(params.get('prompt'),'consent');
    assert.equal(params.get('client_id'),clientInformation.client_id); assert.equal(params.get('redirect_uri'),redirectUrl.href);
    assert.equal(params.get('scope'),'read offline_access'); assert.equal(params.get('resource'),'https://resource.example.test/mcp');
    const calls=[];
    const fetchFn=async (url,init)=>{assert.equal(String(url),metadata.token_endpoint);assert.equal(init.method,'POST');
      calls.push(new URLSearchParams(init.body)); return Response.json({access_token:'synthetic-access',token_type:'Bearer',expires_in:120});};
    const prepared=sdk.prepareAuthorizationCodeRequest('synthetic-code',codeVerifier,redirectUrl);
    assert.equal(prepared.get('code_verifier'),codeVerifier);
    const token=await sdk.exchangeAuthorization(issuer,{metadata,clientInformation,authorizationCode:'synthetic-code',codeVerifier,redirectUri:redirectUrl,fetchFn});
    assert.equal(token.access_token,'synthetic-access');assert.equal(calls[0].get('code_verifier'),codeVerifier);assert.equal(calls[0].get('client_id'),clientInformation.client_id);
    const refresh=await sdk.refreshAuthorization(issuer,{metadata,clientInformation,refreshToken:'synthetic-refresh',scope:'read',fetchFn});
    assert.equal(refresh.refresh_token,'synthetic-refresh');assert.equal(refresh.scope,'read');assert.equal(calls[1].get('grant_type'),'refresh_token');
    await assert.rejects(sdk.exchangeAuthorization(issuer,{metadata:{...metadata,token_endpoint:'http://insecure.example.test/token'},clientInformation,authorizationCode:'x',codeVerifier,redirectUri:redirectUrl,fetchFn}),/https|secure/i);
    assert.equal(calls.length,2);
  });

  test(`${mode}: actual legacy SSE MCP client completes initialize and tools/list over loopback`, async t => {
    let stream; const received=[];
    const url=await server(t,async(req,res)=>{
      if(req.method==='GET' && req.url==='/sse') {stream=res;res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.write('event: endpoint\ndata: /messages\n\n');return;}
      assert.equal(req.url,'/messages');const msg=await body(req);received.push(msg);res.writeHead(202);res.end();
      if(msg.id!==undefined) await fragments(stream,`data: ${JSON.stringify(rpc(msg))}\n\n`);
    });
    const transport=new sdk.SSEClientTransport(new URL('/sse',url));
    const client=new sdk.Client({name:'isolated-client',version:'1.0.0'});t.after(()=>client.close());
    await bounded(client.connect(transport)); const tools=await bounded(client.listTools());
    assert.deepEqual(tools.tools,[tool]);assert.ok(received.some(m=>m.method==='initialize'));assert.ok(received.some(m=>m.method==='notifications/initialized'));
    await client.close();
  });

  test(`${mode}: legacy SSE recovers from malformed JSON and preserves Unicode fragments`, async t=>{
    let stream;
    const url=await server(t,async(req,res)=>{
      if(req.method==='GET'){stream=res;res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('event: endpoint\ndata: /messages\n\n');return;}
      assert.deepEqual(await body(req),request);res.writeHead(202);res.end();await fragments(stream,`data: not-json\n\ndata: ${JSON.stringify(result)}\n\n`);
    });
    const transport=new sdk.SSEClientTransport(new URL('/sse',url));t.after(()=>transport.close());
    const errors=[];transport.onerror=e=>errors.push(e);const message=new Promise(r=>{transport.onmessage=r;});
    await bounded(transport.start());await transport.send(request);assert.deepEqual(await bounded(message),result);assert.equal(errors.length,1);await transport.close();
  });

  test(`${mode}: legacy SSE rejects cross-origin endpoint injection`, async t=>{
    const url=await server(t,(_req,res)=>{res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('event: endpoint\ndata: https://outside.example.test/messages\n\n');});
    const transport=new sdk.SSEClientTransport(new URL('/sse',url));t.after(()=>transport.close());transport.onerror=()=>{};
    await assert.rejects(bounded(transport.start()),/origin/i);await transport.close();
  });

  test(`${mode}: legacy SSE exposes HTTP status and performs exactly one authorized 401 refresh`, async t=>{
    let gets=0,refreshes=0,token='before';const headers=[];
    const url=await server(t,(req,res)=>{gets++;headers.push(req.headers.authorization);if(gets===1){res.writeHead(401,{'WWW-Authenticate':'Bearer'});res.end();return;}
      res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('event: endpoint\ndata: /messages\n\n');});
    const transport=new sdk.SSEClientTransport(new URL('/sse',url),{authProvider:{token:async()=>token,onUnauthorized:async({response})=>{assert.equal(response.status,401);refreshes++;token='after';return 'AUTHORIZED';}}});
    t.after(()=>transport.close());transport.onerror=()=>{};await bounded(transport.start());assert.equal(gets,2);assert.equal(refreshes,1);assert.deepEqual(headers,['Bearer before','Bearer after']);await transport.close();
  });

  test(`${mode}: legacy SSE stops after repeated 401 and preserves status code`, async t=>{
    let gets=0,refreshes=0;
    const url=await server(t,(_req,res)=>{gets++;res.writeHead(401,{'WWW-Authenticate':'Bearer'});res.end();});
    const transport=new sdk.SSEClientTransport(new URL('/sse',url),{authProvider:{token:()=>undefined,onUnauthorized:async()=>{refreshes++;return 'AUTHORIZED';}}});
    t.after(()=>transport.close());const errors=[];transport.onerror=e=>errors.push(e);
    await assert.rejects(bounded(transport.start()),/401|non-200|unauthor/i);assert.equal(gets,2);assert.equal(refreshes,1);assert.ok(errors.length);await transport.close();
  });

  test(`${mode}: SDK legacy SSE reconnects and stops retrying after close`, async t=>{
    let gets=0;
    const url=await server(t,(_req,res)=>{gets++;res.writeHead(200,{'Content-Type':'text/event-stream'});
      res.write('retry: 30\nevent: endpoint\ndata: /messages\n\n');
      if(gets===1)res.end('id: saved-17\ndata: {"jsonrpc":"2.0","method":"fixture/first"}\n\n');
      else res.write('data: {"jsonrpc":"2.0","method":"fixture/reconnected"}\n\n');});
    const transport=new sdk.SSEClientTransport(new URL('/sse',url));t.after(()=>transport.close());transport.onerror=()=>{};
    const reconnected=new Promise(r=>{transport.onmessage=m=>{if(m.method==='fixture/reconnected')r(m);};});
    await bounded(transport.start());await bounded(reconnected);assert.equal(gets,2);
    // Do not lock in the SDK's known reconnect-header limitation. The direct
    // EventSource test below independently requires Last-Event-ID preservation.
    await transport.close();await wait(90);assert.equal(gets,2);
  });

  test(`${mode}: EventSource itself preserves Last-Event-ID on reconnect and stops on close`, async t=>{
    let gets=0;const ids=[];
    const url=await server(t,(req,res)=>{gets++;ids.push(req.headers['last-event-id']);res.writeHead(200,{'Content-Type':'text/event-stream'});
      if(gets===1)res.end('retry: 30\nid: direct-17\ndata: first\n\n');else res.write('data: resumed\n\n');});
    const source=new es.EventSource(url);t.after(()=>source.close());
    const resumed=new Promise(resolve=>{source.onmessage=e=>{if(e.data==='resumed')resolve();};});
    await bounded(resumed);assert.deepEqual(ids,[undefined,'direct-17']);source.close();await wait(90);assert.equal(gets,2);
  });

  test(`${mode}: actual Streamable HTTP MCP client completes initialize and tools/list using streamed responses`, async t=>{
    const received=[];
    const url=await server(t,async(req,res)=>{if(req.method==='GET'){res.writeHead(405);res.end();return;}assert.equal(req.method,'POST');const msg=await body(req);received.push(msg);
      if(msg.id===undefined){res.writeHead(202);res.end();return;}
      res.writeHead(200,{'Content-Type':'text/event-stream'});await fragments(res,`retry: 40\ndata: ${JSON.stringify(rpc(msg))}\n\n`);res.end();});
    const transport=new sdk.StreamableHTTPClientTransport(new URL('/mcp',url));const client=new sdk.Client({name:'isolated-client',version:'1.0.0'});t.after(()=>client.close());
    await bounded(client.connect(transport));assert.deepEqual((await bounded(client.listTools())).tools,[tool]);assert.equal(received.filter(m=>m.method==='tools/list').length,1);await client.close();
  });

  test(`${mode}: Streamable HTTP handles malformed frames, Unicode, event IDs, retry and completion`, async t=>{
    const url=await server(t,async(req,res)=>{assert.deepEqual(await body(req),request);res.writeHead(200,{'Content-Type':'text/event-stream'});
      await fragments(res,`: keepalive\nretry: 23\nid: token-17\ndata: not-json\n\nid: token-18\ndata: ${JSON.stringify(result)}\n\n`);res.end();});
    const transport=new sdk.StreamableHTTPClientTransport(new URL('/mcp',url));t.after(()=>transport.close());const errors=[],tokens=[];
    transport.onerror=e=>errors.push(e);
    const message=new Promise(r=>{transport.onmessage=r;});
    let streamEnded;
    const ended=new Promise(resolve=>{streamEnded=resolve;});
    await transport.start();
    await transport.send(request,{onresumptiontoken:x=>tokens.push(x),onRequestStreamEnd:streamEnded});
    assert.deepEqual(await bounded(message),result);await bounded(ended);assert.deepEqual(tokens,['token-17','token-18']);assert.equal(errors.length,1);await transport.close();
  });

  test(`${mode}: Streamable HTTP request cancellation terminates a pending SSE reader`, async t=>{
    const url=await server(t,async(req,res)=>{await body(req);res.writeHead(200,{'Content-Type':'text/event-stream'});res.flushHeaders();res.write(': pending\n\n');});
    const transport=new sdk.StreamableHTTPClientTransport(new URL('/mcp',url));t.after(()=>transport.close());const controller=new AbortController();const errors=[];transport.onerror=e=>errors.push(e);
    await transport.start();await bounded(transport.send(request,{requestSignal:controller.signal}));controller.abort();await wait(25);await transport.close();assert.deepEqual(errors,[]);
  });
}
