from pathlib import Path
import re

def write(path,text):
 p=Path(path);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text.lstrip('\n'))

# Preserve the existing database/import/catalog regression suite, updating its contracts.
p=Path('tests/postgres.integration.test.mjs');s=p.read_text()
s="import { generateKeyPairSync } from 'node:crypto';\nimport { readdir } from 'node:fs/promises';\nimport { runDeliveryChecks } from './delivery-checks.mjs';\n"+s
s=s.replace("const databaseUrl = process.env.DATABASE_URL;", "const databaseUrl = process.env.DATABASE_URL;\nconst pair = generateKeyPairSync('ed25519');\nconst signing = { keyId: 'integration-test', privateKeyPem: pair.privateKey.export({type:'pkcs8',format:'pem'}) };\n")
s=re.sub(r"assert\.deepEqual\(firstMigration\.applied, \[.*?\]\);", "assert.deepEqual(firstMigration.applied, (await readdir('db/migrations')).filter(x => /^\\\\d{4}_.*\\\\.sql$/.test(x)).sort());", s, count=1, flags=re.S)
s=s.replace("entity_id, list_kind, decision, state, policy_revision_id, decided_at", "entity_id, cause_id, list_kind, decision, state, policy_revision_id, decided_at")
s=s.replace("VALUES ($1, 'filter', 'include', 'active', $2, now())", "VALUES ($1, (SELECT id FROM causes WHERE slug='israel-palestine'), 'filter', 'include', 'active', $2, now())")
s=s.replace("compilerVersion: 'integration-test',", "compilerVersion: 'integration-test', signing,")
s=re.sub(r"published\.(full|manifest|delta)\(", r"published.\1('israel-palestine', ", s)
s=s.replace("'exampleartist'", "'178414000000001'")
s=s.replace("      const secondMigration = await applySqlMigrations", "      await runDeliveryChecks({ db, store, artifactRoot, databaseUrl, signing, publicKey: pair.publicKey, entityId, publicId, assertionId, policyRevisionId: policyRevision.rows[0].id });\n\n      const secondMigration = await applySqlMigrations")
s=re.sub(r"assert\.equal\(secondMigration\.alreadyApplied\.length, \d+\);", "assert.equal(secondMigration.alreadyApplied.length, firstMigration.applied.length);",s)
p.write_text(s)
for p in Path('tests').glob('protocol*.mjs'):
 s=p.read_text().replace('PROTOCOL_SCHEMA_VERSION = 4','PROTOCOL_SCHEMA_VERSION = 5').replace('schemaVersion: 4','schemaVersion: 5');p.write_text(s)
write('tests/compiler.test.mjs',r'''
import assert from 'node:assert/strict';
import test from 'node:test';
import { compileEntries, compileFullPublication, compilePublicationDelta } from '../packages/application/dist/index.js';
import { canonicalJson } from '../packages/protocol/dist/index.js';
const candidate=(cause='israel-palestine',identifier='1',reasonCodes=['C03'],entityId='9')=>({cause,channel:'x',list:'filter',identifier,entityId,reasonCodes});
const full=(version,candidates)=>compileFullPublication({cause:'israel-palestine',channel:'x',list:'filter',version,reasonCatalogVersion:1,generatedAt:'2026-09-20T00:00:00.000Z',expiresAt:'2026-09-22T00:00:00.000Z',candidates});
test('compiler keeps cause partitions independent and tuples minimal',()=>{
 assert.deepEqual(compileEntries([candidate(),candidate('russia-ukraine','2'),candidate('israel-palestine','1',['C05','C03'])],'israel-palestine','x','filter'),[['1','9',['C03','C05']]]);
});
test('conflicting identity in one partition cannot compile',()=>{
 assert.throws(()=>compileEntries([candidate(),candidate('israel-palestine','1',['C03'],'999')],'israel-palestine','x','filter'),/multiple entities/);
});
test('delta includes removals and upserts and rejects cross-cause input',()=>{
 const before=full('1',[candidate(),candidate('israel-palestine','2')]);
 const after=full('2',[candidate('israel-palestine','1',['C05'])]);
 const delta=compilePublicationDelta(before,after);
 assert.deepEqual(delta.added,[['1','9',['C05']]]);assert.deepEqual(delta.removed,['2']);assert.equal(delta.cause,'israel-palestine');assert.equal(delta.schemaVersion,5);
 assert.throws(()=>compilePublicationDelta(before,{...after,cause:'russia-ukraine'}),/different causes/);
});
test('canonical serialization is stable and rejects unsupported values',()=>{
 assert.equal(canonicalJson({z:1,a:{b:2,a:3}}),'{"a":{"a":3,"b":2},"z":1}');
 assert.throws(()=>canonicalJson({x:undefined}));assert.throws(()=>canonicalJson(NaN));
});
''')
write('tests/api.test.mjs',r'''
import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiRouter } from '../apps/api/dist/index.js';
const reason={code:'P03',label:'Signed example campaign',description:'Documented signature',category:'campaign',defaultList:'highlight',publicationEnabled:true,evidenceRequirement:null,campaigns:[],authoritySources:[]};
const entity={publicId:'42',slug:'example',name:'Example',kind:'person',lists:[],identifiers:[],relationships:[],reasons:[]};
const reasons={async version(){return 1;},async list(version){return !version||version===1?[reason]:[];},async byCode(code,version){return code==='P03'&&(!version||version===1)?reason:null;}};
const publications={async manifest(cause,channel,list){return {schemaVersion:5,cause,channel,list,version:'1',reasonCatalogVersion:1};},async full(cause,channel,list){return {...await this.manifest(cause,channel,list),entries:[]};},async delta(cause,channel,list){return {schemaVersion:5,code:'FULL_SYNC_REQUIRED',cause,channel,list,currentVersion:'1',currentReasonCatalogVersion:1};}};
const route=createApiRouter({entities:{async byPublicId(){return entity;},async bySlug(){return entity;},async search(){return [entity];}},reasons,publications,causes:{async list(){return [];},async bySlug(){return null;}},alternatives:{async list(){return [];},async preferred(){return null;}},submissions:{async create(input){assert.equal(new Set(input.sourceUrls).size,input.sourceUrls.length);return {id:'receipt',state:'pending'};}}});
const request=(method,pathname,query={},body=null)=>({method,pathname,query,body});
test('cause, reason, entity and cause-scoped synchronization routes',async()=>{
 assert.equal((await route(request('GET','/api/v1/causes'))).status,200);
 assert.equal((await route(request('GET','/api/v1/causes/unknown'))).status,404);
 assert.equal((await route(request('GET','/api/v1/search',{q:'a'}))).status,400);
 assert.equal((await route(request('GET','/api/v1/entities/42'))).body.publicId,'42');
 assert.equal((await route(request('GET','/api/v1/entities/slug/example'))).body.slug,'example');
 assert.equal((await route(request('GET','/api/v1/reasons/P03'))).body.reason.code,'P03');
 assert.equal((await route(request('GET','/api/v1/reasons/P99'))).status,404);
 assert.equal((await route(request('GET','/api/v1/reasons',{version:'bad'}))).status,400);
 assert.equal((await route(request('GET','/api/v1/reason-catalogs/999/compact'))).status,404);
 assert.deepEqual((await route(request('GET','/api/v1/reason-catalogs/1/compact'))).body.labels,[['P03','Signed example campaign']]);
 const base='/api/v1/causes/israel-palestine/lists/domain/filter/';
 assert.equal((await route(request('GET',base+'manifest'))).body.cause,'israel-palestine');
 assert.deepEqual((await route(request('GET',base+'full'))).body.entries,[]);
 assert.equal((await route(request('GET',base+'delta'))).status,400);
 assert.equal((await route(request('GET',base+'delta',{from:'0'}))).body.code,'FULL_SYNC_REQUIRED');
 assert.equal((await route(request('GET','/api/v1/lists/domain/filter/full'))).status,404);
});
test('public submissions are validated, deduplicated and queued',async()=>{
 for(const sourceUrls of [['javascript:alert(1)'],['file:///secret']])assert.equal((await route(request('POST','/api/v1/submissions',{}, {submissionType:'add-evidence',narrative:'Test evidence',sourceUrls}))).status,400);
 const input={submissionType:'add-evidence',narrative:'Documented update',proposedReasonCode:'P03',sourceUrls:['https://example.org/a','https://example.org/a']};
 assert.equal((await route(request('POST','/api/v1/submissions',{},input))).status,202);
 assert.equal((await route(request('POST','/api/v1/submissions',{}, {...input,proposedReasonCode:'P99'}))).status,400);
});
''')
write('tests/web-routing.test.mjs',r'''
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicWebsite } from '../apps/web/dist/index.js';
const entity={publicId:'42',slug:'example',name:'<script>alert(1)</script>',kind:'person',lists:[],identifiers:[],relationships:[],reasons:[{code:'P03',label:'Example reason',description:'Reason description',assertions:[{summary:'A documented fact',occurredOn:'2026-09-20',sources:[{url:'javascript:alert(1)',title:'Unsafe',publisher:null,retrievedAt:'2026-09-20',primary:false}]}]}]};
const entities={async byPublicId(id){return id==='42'?entity:null;},async bySlug(slug){return slug==='example'?entity:null;},async search(){return [entity];}};
const web=createPublicWebsite({entities,alternatives:{async list(){return [];},async preferred(){return null;}}});
test('real public pages and static assets render without fabricated downloads',async()=>{
 for(const path of ['/','/download','/privacy','/how-it-works','/causes','/search','/report']){const r=await web(path);assert.equal(r.kind,'html',path);assert.equal(r.status,200,path);}
 assert.match((await web('/download')).html,/Store release not yet published/);
 assert.equal((await web('/assets/site.css')).contentType,'text/css; charset=utf-8');
 assert.match((await web('/report')).html,/data-submission/);
});
test('canonical numeric URLs and no-alternative state remain usable',async()=>{
 assert.deepEqual(await web('/42'),{kind:'redirect',status:308,location:'/example'});
 assert.deepEqual(await web('/42/alternatives'),{kind:'redirect',status:308,location:'/example/alternatives'});
 assert.deepEqual(await web('/go-to-alt/42'),{kind:'redirect',status:302,location:'/example/alternatives'});
 assert.equal((await web('/999')).status,404);
});
test('entity evidence escapes HTML and refuses unsafe source schemes',async()=>{
 const r=await web('/example');assert.match(r.html,/&lt;script&gt;/);assert.match(r.html,/A documented fact/);assert.doesNotMatch(r.html,/<script>alert|href="javascript:/);
});
''')
write('tests/delivery-checks.mjs',r'''
import assert from 'node:assert/strict';
import { verify, createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonicalJson } from '../packages/protocol/dist/index.js';
import { PgSqlExecutor, applySqlMigrations, PostgresPublishedArtifactReader, publishCurrentState } from '../packages/persistence/dist/runtime.js';
import { startNodeApiRuntime } from '../apps/api/dist/runtime.js';

export async function runDeliveryChecks({db,store,artifactRoot,databaseUrl,signing,publicKey,entityId,publicId,assertionId,policyRevisionId}) {
 const reader=new PostgresPublishedArtifactReader(db,store);
 const cause='israel-palestine';
 const manifest=await reader.manifest(cause,'domain-subdomains','filter');
 const {signature,...unsigned}=manifest;
 assert.equal(signature.keyId,signing.keyId);
 assert.equal(verify(null,Buffer.from(canonicalJson(unsigned)),publicKey,Buffer.from(signature.value,'base64')),true);
 assert.equal(verify(null,Buffer.from(canonicalJson({...unsigned,cause:'russia-ukraine'})),publicKey,Buffer.from(signature.value,'base64')),false);
 const bytes=await store.get(manifest.full.url.slice('/data/'.length));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.full.sha256);
 assert.equal(bytes.length,manifest.full.byteSize);
 const dict=await store.get(manifest.dictionary.url.slice('/data/'.length));
 assert.equal(createHash('sha256').update(dict).digest('hex'),manifest.dictionary.sha256);
 assert.equal(JSON.parse(dict).catalogVersion,manifest.reasonCatalogVersion);
 await assert.rejects(publishCurrentState(db,store,{cause,compilerVersion:'test',sourceRevision:'unsigned'}),/signing key/);
 const c=await db.query(`INSERT INTO causes(slug,name,description) VALUES('test-isolation','Synthetic test cause','Test only') RETURNING id::text`);
 const otherId=c.rows[0].id;
 await db.query("INSERT INTO reason_causes(reason_code,cause_id) VALUES('C03',$1)",[otherId]);
 const decision=await db.query(`INSERT INTO membership_decisions(entity_id,cause_id,list_kind,decision,state,policy_revision_id,decided_at) VALUES($1,$2,'filter','include','active',$3,now()) RETURNING id::text`,[entityId,otherId,policyRevisionId]);
 await db.query(`INSERT INTO membership_decision_reasons(decision_id,reason_code,assertion_id) VALUES($1,'C03',$2)`,[decision.rows[0].id,assertionId]);
 const other=await publishCurrentState(db,store,{cause:'test-isolation',compilerVersion:'test',sourceRevision:'isolation',signing});
 assert.equal((await reader.manifest(cause,'domain-subdomains','filter')).version,manifest.version);
 assert.equal((await reader.manifest('test-isolation','domain-subdomains','filter')).version,other.version);
 const next=await publishCurrentState(db,store,{cause,compilerVersion:'test',sourceRevision:'next',signing});
 assert.equal((await reader.manifest('test-isolation','domain-subdomains','filter')).version,other.version);
 assert.equal((await reader.manifest(cause,'domain-subdomains','filter')).version,next.version);
 // Context-only or contradictory sources never satisfy supporting evidence counts.
 await db.query("UPDATE assertion_source_links SET stance='context' WHERE assertion_id=$1",[assertionId]);
 const gate=await db.query('SELECT valid_for_publication,issues FROM membership_reason_validation WHERE decision_id=$1',[decision.rows[0].id]);
 assert.equal(gate.rows[0].valid_for_publication,false);assert.ok(gate.rows[0].issues.includes('insufficient-sources'));
 await db.query("UPDATE assertion_source_links SET stance='supports' WHERE assertion_id=$1",[assertionId]);
 await db.query("UPDATE membership_decision_reasons SET last_verified_at=now()-interval '181 days' WHERE decision_id=$1",[decision.rows[0].id]);
 assert.equal((await db.query('SELECT valid_for_publication FROM membership_reason_validation WHERE decision_id=$1',[decision.rows[0].id])).rows[0].valid_for_publication,false);
 await db.query('UPDATE membership_decision_reasons SET last_verified_at=now() WHERE decision_id=$1',[decision.rows[0].id]);
 const runtime=await startNodeApiRuntime({databaseUrl,artifactRoot,port:0});
 const origin=`http://127.0.0.1:${runtime.port}`;
 try {
  for(const path of ['/healthz','/readyz','/','/download','/causes','/causes/israel-palestine','/privacy','/search?q=Example','/report','/example-company']) {
   const response=await fetch(origin+path);assert.equal(response.status,200,path);
  }
  const numeric=await fetch(origin+'/'+publicId,{redirect:'manual'});assert.equal(numeric.status,308);assert.equal(numeric.headers.get('location'),'/example-company');
  const css=await fetch(origin+'/assets/site.css');assert.match(css.headers.get('content-type'),/text\/css/);assert.ok((await css.text()).includes('--accent'));
  assert.equal((await fetch(origin+'/assets/site.css',{headers:{'If-None-Match':css.headers.get('etag')}})).status,304);
  const head=await fetch(origin+'/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  assert.doesNotMatch(head.headers.get('content-security-policy'),/unsafe-inline/);
  const admin=await fetch(origin+'/admin/api/v1/submissions');assert.equal(admin.status,404);assert.equal(admin.headers.get('access-control-allow-origin'),null);
  assert.equal((await fetch(origin+'/api/v1/causes/epstein-records/lists/domain/filter/manifest')).status,503);
  const raw=await fetch(origin+manifest.full.url);assert.equal(raw.status,200);assert.match(raw.headers.get('cache-control'),/immutable/);
  assert.equal((await fetch(origin+'/data/not-a-publication.json')).status,404);
  const submitted=await fetch(origin+'/api/v1/submissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({submissionType:'incorrect-information',narrative:'Integration correction fixture',sourceUrls:['https://example.org/source']})});
  assert.equal(submitted.status,202);assert.ok((await submitted.json()).id);
 } finally {await runtime.close();}
 await checkOps(databaseUrl);
 console.log('DELIVERY VERIFIED: cause isolation, signatures, supporting evidence, HTTP pages/assets/forms, and restricted runtime grants');
}

async function checkOps(databaseUrl) {
 const parsed=new URL(databaseUrl);
 if(!['127.0.0.1','localhost'].includes(parsed.hostname)||!parsed.pathname.endsWith('_test'))throw new Error('Ops tests require a disposable loopback _test database');
 for(const file of ['db-bootstrap','db-grants','db-shell','server-doctor','backup-db','restore-db']) {
  const syntax=spawnSync('bash',['-n',`ops/${file}.sh`],{encoding:'utf8'});assert.equal(syntax.status,0,syntax.stderr);
 }
 const suffix=String(process.pid),dbName=`isnotreal_ops_test_${suffix}`;
 const owner=`inr_owner_${suffix}`,app=`inr_app_${suffix}`,editor=`inr_editor_${suffix}`;
 const passwords=[randomBytes(24).toString('hex'),randomBytes(24).toString('hex'),randomBytes(24).toString('hex')];
 const env={...process.env,PG_ADMIN_URL:databaseUrl,ISNOTREAL_DB_NAME:dbName,ISNOTREAL_OWNER_ROLE:owner,ISNOTREAL_APP_ROLE:app,ISNOTREAL_EDITOR_ROLE:editor,ISNOTREAL_OWNER_PASSWORD:passwords[0],ISNOTREAL_APP_PASSWORD:passwords[1],ISNOTREAL_EDITOR_PASSWORD:passwords[2]};
 const run=(file,extra={},args=[])=>{const result=spawnSync('bash',[`ops/${file}.sh`,...args],{env:{...env,...extra},encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout.trim();};
 const admin=PgSqlExecutor.create({connectionString:databaseUrl});let ownerDb,appDb;
 const target=new URL(databaseUrl);target.pathname='/'+dbName;
 try {
  run('db-bootstrap');run('db-bootstrap');
  const ownerUrl=new URL(target);ownerUrl.username=owner;ownerUrl.password=passwords[0];
  ownerDb=PgSqlExecutor.create({connectionString:ownerUrl.href});await applySqlMigrations(ownerDb,'db/migrations');
  run('db-grants',{PG_ADMIN_DB_URL:target.href});
  const appUrl=new URL(target);appUrl.username=app;appUrl.password=passwords[1];
  appDb=PgSqlExecutor.create({connectionString:appUrl.href});await appDb.query('SELECT count(*) FROM entities');
  await assert.rejects(appDb.query("UPDATE reason_definitions SET label='Not allowed' WHERE code='P03'"),/permission denied/);
  await assert.rejects(appDb.query('DELETE FROM review_events'),/permission denied/);
  await assert.rejects(appDb.query('CREATE TABLE forbidden(id int)'),/permission denied/);
  const inserted=await appDb.query(`INSERT INTO community_submissions(submission_type,narrative) VALUES('add-evidence','Test submission') RETURNING id::text,submitted_at`);
  assert.ok(inserted.rows[0].id);
  const backupDir=await mkdtemp(join(tmpdir(),'inr-backup-test-'));
  try {const file=run('backup-db',{DATABASE_URL:ownerUrl.href,BACKUP_DIR:backupDir});assert.ok(file.endsWith('.dump'));}
  finally{await rm(backupDir,{recursive:true,force:true});}
 } finally {
  await appDb?.close();await ownerDb?.close();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  for(const role of [app,editor,owner])await admin.query(`DROP ROLE IF EXISTS "${role}"`);
  await admin.close();
 }
}
''')
