from pathlib import Path
import json

def write(path, text):
    p=Path(path); p.parent.mkdir(parents=True,exist_ok=True); p.write_text(text.lstrip('\n'))

write('apps/web/src/index.ts', r'''
import type { AlternativeDirectory, PublicEntityDirectory, PublicEntityProfile, ReasonCatalogReader } from '@isnotreal/application';

interface Cause { slug:string; name:string; description:string; reasons:readonly {code:string;label:string;description:string}[] }
export interface PublicWebDependencies {
  readonly entities: PublicEntityDirectory;
  readonly alternatives: AlternativeDirectory;
  readonly causes?: {list():Promise<readonly Cause[]>;bySlug(slug:string):Promise<Cause|null>};
  readonly reasons?: ReasonCatalogReader;
  readonly downloads?: Readonly<Record<string,string>>;
}
export type WebRouteResult =
  | {kind:'redirect';status:302|308;location:string}
  | {kind:'html';status:200|404;html:string}
  | {kind:'asset';status:200;body:string;contentType:string}
  | {kind:'bad-gateway';status:502};

const escape = (value:string) => value.replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] ?? c));
function safeUrl(value:string|null|undefined):string|null {
  if (!value) return null;
  try { const url=new URL(value); return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password ? url.href:null; } catch {return null;}
}
const link = (url:string,label:string) => `<a href="${escape(url)}" rel="noopener noreferrer" referrerpolicy="no-referrer">${escape(label)}</a>`;
const fallbackCauses: readonly Cause[] = [
  {slug:'israel-palestine',name:'Israel / Palestine',description:'Named campaigns, public statements, documented contracts and humanitarian support.',reasons:[]},
  {slug:'epstein-records',name:'Epstein-related records',description:'A verified document mention is not an allegation or finding of wrongdoing.',reasons:[]},
  {slug:'trump-maga',name:'Trump / MAGA',description:'Attributable endorsements and specific public activity, not inferred beliefs.',reasons:[]},
  {slug:'russia-ukraine',name:'Russia / Ukraine',description:'Documented state relationships, sanctions, business activity and humanitarian support.',reasons:[]},
];
function layout(title:string,body:string,path='/'):string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>${escape(title)} · isnotreal.click</title><meta name="description" content="Choose your filters. Inspect the evidence. A source-backed directory and browser extension."><link rel="canonical" href="https://isnotreal.click${escape(path)}"><link rel="stylesheet" href="/assets/site.css"><script src="/assets/site.js" defer></script></head><body><a class="skip" href="#main">Skip to content</a><header><a class="brand" href="/">is<span>not</span>real.click</a><nav aria-label="Main"><a href="/search">Search</a><a href="/causes">Causes</a><a href="/download">Get the extension</a></nav></header><main id="main">${body}</main><footer><strong>Local choices. Public evidence.</strong><nav aria-label="Footer"><a href="/how-it-works">How it works</a><a href="/privacy">Privacy</a><a href="/report">Submit a correction</a></nav><small>Coverage depends on verified identifiers and the browser features available. No claim of wrongdoing follows from a document mention alone.</small></footer></body></html>`;
}
const html = (title:string,body:string,path='/',status:200|404=200):WebRouteResult => ({kind:'html',status,html:layout(title,body,path)});
const missing = ():WebRouteResult => html('Not found','<h1>That page is not real.</h1><p>No published record matched this address.</p><a class="button" href="/search">Search the directory</a>','/',404);
function reasonBlock(entity:PublicEntityProfile):string {
  return entity.reasons.map(reason => `<article class="card"><span class="tag">${escape(reason.code)}</span><h3>${escape(reason.label)}</h3><p>${escape(reason.description)}</p>${reason.assertions.map(a=>`<section class="evidence"><p>${escape(a.summary)}</p><small>${a.occurredOn?escape(a.occurredOn):'Event date not established'}</small><ul>${a.sources.map(source=>{const url=safeUrl(source.url);return `<li>${url?link(url,source.title||source.url):'Source address unavailable'}<small>${escape(source.publisher??'Publisher not specified')} · ${source.primary?'Primary record':'Reporting / supporting source'} · Checked ${escape(source.retrievedAt)}</small></li>`;}).join('')}</ul></section>`).join('')}</article>`).join('') || '<p class="notice">No published evidence is currently shown. Missing evidence is not a positive or negative judgment.</p>';
}
function searchForm(q=''):string {return `<form action="/search" method="get" class="search"><label for="q">Find a person, company or service</label><div class="row"><input id="q" name="q" type="search" minlength="2" maxlength="200" value="${escape(q)}" placeholder="Search names, not rumors" required><button>Search</button></div></form>`;}

export function createPublicWebsite(deps:PublicWebDependencies) {
  return async (pathname:string,query:Readonly<Record<string,string|undefined>>={}):Promise<WebRouteResult|null> => {
    if(pathname==='/assets/site.css') return {kind:'asset',status:200,body:css,contentType:'text/css; charset=utf-8'};
    if(pathname==='/assets/site.js') return {kind:'asset',status:200,body:script,contentType:'text/javascript; charset=utf-8'};
    if(pathname==='/robots.txt') return {kind:'asset',status:200,body:'User-agent: *\nDisallow: /admin/\nDisallow: /api/\nDisallow: /report\n',contentType:'text/plain; charset=utf-8'};
    if(pathname==='/'||pathname==='/index.html') {
      const causes=deps.causes?await deps.causes.list():fallbackCauses;
      return html('Your feed. Your filters.',`<section class="hero"><p class="eyebrow">Choose what reaches you</p><h1>Filter the feed.<br><span>Keep the receipts.</span></h1><p class="lede">Find the evidence behind people and companies. Choose the causes you care about, then decide what belongs in your browser.</p><div class="row"><a class="button primary" href="/download">Get the extension</a><a class="button" href="/how-it-works">See how it works</a></div></section>${searchForm()}<section><div class="section-title"><h2>Your causes. Not a preset worldview.</h2><a href="/causes">Explore criteria →</a></div><div class="grid">${causes.map(c=>`<a class="card cause" href="/causes/${escape(c.slug)}"><small>Independently selectable</small><h3>${escape(c.name)}</h3><p>${escape(c.description)}</p><span>${c.reasons.length?`${c.reasons.length} reason definitions`:'Definitions being prepared'}</span></a>`).join('')}</div></section><section class="card"><h2>A filter is not a verdict.</h2><p>Every reason describes a specific sourced fact. A petition signature, a business contract and a document mention are different things. You can inspect the source and submit missing context.</p></section>`);
    }
    if(pathname==='/download') {
      const stores=[['chromium','Chrome / Chromium','chromewebstore.google.com'],['firefox','Firefox','addons.mozilla.org'],['safari','Safari','apps.apple.com']];
      return html('Get the extension',`<p class="eyebrow">Install & updates</p><h1>Take your choices<br>into your browser.</h1><p class="lede">Release availability is shown per browser. A development build is not a reviewed store release.</p><div class="grid">${stores.map(([key,name,host])=>{const candidate=safeUrl(deps.downloads?.[key!]);const ready=candidate&&new URL(candidate).hostname===host;return `<article class="card"><h2>${escape(name!)}</h2>${ready?`<a class="button primary" href="${escape(candidate)}" rel="noreferrer">Install from the official store</a>`:'<p class="notice">Store release not yet published.</p>'}<p>Software updates use the browser’s normal extension/app update mechanism. Filtering data updates separately.</p></article>`;}).join('')}</div><section class="card"><h2>Developer installation</h2><p>Build the companion repository with <code>npm run package</code>, then load <code>build/chromium</code> from the browser’s extension developer page. A publisher trust key must be included for real data synchronization.</p><p>Domain blocking needs website permissions. Safari only covers Safari webpages, not native TikTok, Instagram or other apps. Platform adapters and store distribution are separate release gates.</p></section>`,pathname);
    }
    if(pathname==='/search') {
      const q=(query.q??'').trim().slice(0,200);
      const results=q.length>=2?await deps.entities.search(q,50):[];
      return html('Search',`<h1>Look it up.</h1>${searchForm(q)}${q.length>=2?`<p role="status">${results.length} result${results.length===1?'':'s'}${results.length===50?' (showing the first 50)':''}</p><div class="grid">${results.map(e=>`<a class="card" href="/${escape(e.slug)}"><small>${escape(e.kind)}</small><h2>${escape(e.name)}</h2><span>Inspect reasons and sources →</span></a>`).join('')||'<p>No matching record. That does not establish a position.</p>'}</div>`:'<p>Enter at least two characters.</p>'}<a href="/report?type=new-entity">Suggest a missing record</a>`,pathname);
    }
    if(pathname==='/causes') {
      const causes=deps.causes?await deps.causes.list():fallbackCauses;
      return html('Causes',`<h1>Choose the criteria.</h1><p class="lede">Causes start off until you select them. New causes do not silently switch themselves on.</p><div class="grid">${causes.map(c=>`<article class="card"><h2><a href="/causes/${escape(c.slug)}">${escape(c.name)}</a></h2><p>${escape(c.description)}</p></article>`).join('')}</div>`,pathname);
    }
    const causeMatch=/^\/causes\/([a-z0-9-]+)\/?$/.exec(pathname);
    if(causeMatch) {
      const c=deps.causes?await deps.causes.bySlug(causeMatch[1]!):fallbackCauses.find(x=>x.slug===causeMatch[1]);
      if(!c)return missing();
      return html(c.name,`<p class="eyebrow">Optional cause</p><h1>${escape(c.name)}</h1><p class="lede">${escape(c.description)}</p>${c.reasons.length?c.reasons.map(r=>`<article class="card"><span class="tag">${escape(r.code)}</span><h2><a href="/reasons/${escape(r.code)}">${escape(r.label)}</a></h2><p>${escape(r.description)}</p></article>`).join(''):'<p class="notice">No published reason definitions are available yet. This is not comprehensive coverage.</p>'}`,pathname);
    }
    const reasonMatch=/^\/reasons\/([A-Z][A-Z0-9_-]{1,15})$/.exec(pathname);
    if(reasonMatch) {
      const r=await deps.reasons?.byCode(reasonMatch[1]!);
      if(!r)return missing();
      return html(r.label,`<p class="eyebrow">${escape(r.code)} · Evidence standard</p><h1>${escape(r.label)}</h1><p>${escape(r.description)}</p><section class="card"><h2>What qualifies</h2><p>${escape(r.evidenceRequirement?.publicCriteria??'No qualification criteria published.')}</p><h2>What does not qualify</h2><p>${escape(r.evidenceRequirement?.exclusionCriteria??'No exclusions published.')}</p>${!r.publicationEnabled?'<p class="notice">This reason is not enabled for publication.</p>':''}</section><section><h2>Authority sources</h2><ul>${r.authoritySources.map(s=>{const url=safeUrl(s.url);return `<li>${url?link(url,s.title):'Source unavailable'}</li>`;}).join('')||'<li>Evidence is evaluated per record.</li>'}</ul></section>`,pathname);
    }
    if(pathname==='/report') {
      const reasons=await deps.reasons?.list()??[];
      const id=/^[1-9]\d{0,19}$/.test(query.entity??'')?query.entity!:'';
      const types=['add-evidence','incorrect-information','changed-position','wrong-identifier','missing-identifier','company-relationship','suggest-alternative','new-entity'];
      return html('Submit evidence or a correction',`<h1>Add the missing context.</h1><p>Public submissions go to review. Include the original source, not a crowd-sourced accusation.</p><form data-submission><label for="entity">Entity ID (optional)</label><input id="entity" name="entityPublicId" value="${id}" inputmode="numeric" pattern="[0-9]*"><label for="type">What are you submitting?</label><select id="type" name="submissionType">${types.map(t=>`<option value="${t}"${query.type===t?' selected':''}>${t.replaceAll('-',' ')}</option>`).join('')}</select><label for="reason">Proposed reason (optional)</label><select id="reason" name="proposedReasonCode"><option value="">Let the editor classify it</option>${reasons.map(r=>`<option value="${escape(r.code)}">${escape(r.code+' · '+r.label)}</option>`).join('')}</select><label for="notes">What does the evidence establish?</label><textarea id="notes" name="narrative" minlength="3" maxlength="10000" rows="6" required></textarea><label for="sources">Source URLs, one per line</label><textarea id="sources" name="sources" rows="4" placeholder="https://…"></textarea><p class="muted">Do not include home addresses, private contacts, victims’ identities or information hidden by redactions.</p><button type="submit">Send for review</button><p id="form-status" role="status" aria-live="polite"></p><noscript>JavaScript is needed to submit this form. The evidence directory can be read without it.</noscript></form>`,pathname);
    }
    if(pathname==='/privacy'||pathname==='/how-it-works') {
      const privacy=pathname==='/privacy';
      return html(privacy?'Privacy':'How it works',privacy?`<p class="eyebrow">Privacy</p><h1>Your choices stay local by default.</h1><section class="card"><h2>Ordinary matching</h2><p>Matching uses downloaded identifiers in the browser. It does not require uploading each encountered account or page.</p><h2>Requests you choose</h2><p>Opening evidence, using online alternatives and submitting a report contact this service. Cause-specific downloads can reveal which dataset you requested. Your IP address is necessarily visible to the server/network delivering it.</p><h2>No invented anonymity promises</h2><p>This application adds no advertising analytics. Hosting/proxy access logs depend on the deployment configuration and need a retention policy before public launch. Local overrides are not sent as telemetry.</p></section>`:`<p class="eyebrow">How it works</p><h1>Small local lists.<br>Full public receipts.</h1><div class="grid"><article class="card"><h2>1. Choose causes</h2><p>Select causes and individual criteria. Disabled causes have no local filtering effect.</p></article><article class="card"><h2>2. Match identifiers</h2><p>Known account IDs and exact or subtree domains resolve locally. Unknown identities are not guessed.</p></article><article class="card"><h2>3. Choose an action</h2><p>Website rules can stop requests before loading the target. Feed adapters need separate platform-specific implementation and testing. You control exceptions and alternatives.</p></article><article class="card"><h2>4. Check the evidence</h2><p>The directory exposes the reason, date and source. A new signed dataset delivers corrections without reinstalling extension code.</p></article></div>`,pathname);
    }
    const alt=/^\/go-to-alt\/([1-9]\d{0,19})\/?$/.exec(pathname);
    if(alt) {
      const entity=await deps.entities.byPublicId(alt[1]!);
      if(!entity)return missing();
      const option=await deps.alternatives.preferred(entity.publicId,'general','domain');
      const url=safeUrl(option?.destinationUrl);
      if(!url||option?.entity.lists.includes('filter'))return {kind:'redirect',status:302,location:`/${entity.slug}/alternatives`};
      const target=new URL(url);
      if(target.protocol!=='https:'||target.hostname==='isnotreal.click'||target.hostname.endsWith('.isnotreal.click')||option?.entity.publicId===entity.publicId)return {kind:'bad-gateway',status:502};
      return {kind:'redirect',status:302,location:target.href};
    }
    const entityRoute=/^\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/alternatives)?\/?$/.exec(pathname);
    if(entityRoute) {
      const key=entityRoute[1]!;
      const numeric=/^[1-9]\d{0,19}$/.test(key);
      const entity=numeric?await deps.entities.byPublicId(key):await deps.entities.bySlug(key);
      if(!entity)return missing();
      if(numeric)return {kind:'redirect',status:308,location:`/${entity.slug}${entityRoute[2]??''}`};
      if(entityRoute[2]) {
        const options=await deps.alternatives.list(entity.publicId,null,'domain');
        return html(`Alternatives to ${entity.name}`,`<a href="/${escape(entity.slug)}">← Evidence page</a><h1>Alternatives to<br>${escape(entity.name)}</h1><p>Curated substitutes, not a claim of universal ethical approval. The generic website route cannot know private extension settings.</p><div class="grid">${options.map(o=>{const url=safeUrl(o.destinationUrl);return `<article class="card"><h2><a href="/${escape(o.entity.slug)}">${escape(o.entity.name)}</a></h2><p>${escape(o.rationale??'No explanation published.')}</p><small>${escape(o.contextKey)}</small>${url?`<p>${link(url,'Visit alternative →')}</p>`:''}</article>`;}).join('')||'<p class="notice">No verified alternative is available yet. We will not send you to an unverified destination.</p>'}</div><a href="/report?entity=${entity.publicId}&type=suggest-alternative">Suggest an alternative</a>`,pathname);
      }
      return html(entity.name,`<p class="eyebrow">${escape(entity.kind)} · Record ${escape(entity.publicId)}</p><h1>${escape(entity.name)}</h1><div class="row"><a class="button" href="/${escape(entity.slug)}/alternatives">See alternatives</a><a class="button" href="/report?entity=${entity.publicId}">Submit evidence or a correction</a></div><section><h2>Documented reasons</h2>${reasonBlock(entity)}</section><section class="card"><h2>Verified identifiers</h2><ul>${entity.identifiers.map(i=>`<li><strong>${escape(i.kind)}</strong> <code>${escape(i.value)}</code> <small>${escape(i.matchScope)}</small></li>`).join('')||'<li>No platform/domain identifiers verified yet. A name alone cannot be matched by the extension.</li>'}</ul></section><section class="card"><h2>Relationships</h2><ul>${entity.relationships.map(r=>`<li>${escape(r.direction+' · '+r.relationshipType)}: <a href="/${escape(r.entity.slug)}">${escape(r.entity.name)}</a></li>`).join('')||'<li>No verified relationships shown.</li>'}</ul><p>Relationships do not automatically transfer another entity’s factual claims.</p></section>`,pathname);
    }
    return null;
  };
}
export const createPublicRouteResolver=createPublicWebsite;

const script=String.raw`
const form=document.querySelector('form[data-submission]');
if(form)form.addEventListener('submit',async(event)=>{
 event.preventDefault();if(!form.reportValidity())return;
 const button=form.querySelector('button');const status=document.querySelector('#form-status');
 const data=new FormData(form);const urls=String(data.get('sources')||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 try{if(urls.length>20)throw Error('Use at most 20 source URLs.');for(const text of urls){const u=new URL(text);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Use public HTTP(S) source links without credentials.');}}
 catch(error){status.textContent=error.message;return;}
 button.disabled=true;status.textContent='Submitting…';
 try{const response=await fetch('/api/v1/submissions',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({entityPublicId:data.get('entityPublicId')||null,submissionType:data.get('submissionType'),proposedReasonCode:data.get('proposedReasonCode')||null,narrative:data.get('narrative'),sourceUrls:urls})});
 if(!response.ok)throw Error(response.status===429?'Submission limit reached. Please try later.':'The submission was not accepted. Check your fields and try again.');
 const result=await response.json();status.textContent='Received for review. Receipt: '+result.id;form.reset();}
 catch(error){status.textContent=error.message;}finally{button.disabled=false;}
});`;
const css=String.raw`
:root{color-scheme:dark;--bg:#0c0d10;--panel:#17181e;--text:#f4f2ec;--muted:#b1b1bc;--line:#343540;--accent:#ff657b;--gold:#efca74;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 80% 0,#331e2b,transparent 45rem),var(--bg);color:var(--text)}a{color:inherit;text-underline-offset:4px}header,main,footer{width:min(1120px,calc(100% - 40px));margin:auto}header{display:flex;gap:20px;justify-content:space-between;align-items:center;min-height:84px;border-bottom:1px solid var(--line)}nav{display:flex;gap:20px;flex-wrap:wrap}nav a,.brand{text-decoration:none}.brand{font-size:1.3rem;font-weight:900;letter-spacing:-.06em}.brand span,h1 span{color:var(--accent)}main{min-height:65vh;padding:48px 0}h1{font-size:clamp(2.8rem,8vw,6.8rem);letter-spacing:-.065em;line-height:.99;max-width:1000px;margin:24px 0 36px;overflow-wrap:anywhere}h2{font-size:clamp(1.4rem,3vw,2rem);letter-spacing:-.035em}h3{font-size:1.4rem;line-height:1.2}.hero{padding:45px 0 64px}.eyebrow,.tag{text-transform:uppercase;letter-spacing:.12em;font-size:.78rem;color:var(--gold);font-weight:750}.lede{max-width:760px;font-size:1.3rem;line-height:1.6;color:var(--muted)}p,li{line-height:1.65}p,small,.muted{color:var(--muted)}small{display:block;font-size:.84rem;line-height:1.5}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.card{background:linear-gradient(135deg,var(--panel),#111218);border:1px solid var(--line);border-radius:20px;padding:28px;overflow-wrap:anywhere;margin:16px 0}.grid .card{margin:0}a.card{text-decoration:none}a.card:hover{border-color:var(--accent)}section{margin-top:36px}.evidence{border-top:1px solid var(--line);padding-top:14px;margin-top:16px}.evidence a{color:var(--gold)}.row,.section-title{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.section-title{justify-content:space-between}.button,button{border:1px solid var(--line);border-radius:999px;padding:13px 20px;font:inherit;font-weight:750;text-decoration:none;cursor:pointer;color:var(--text);background:var(--panel)}.primary,button{background:var(--text);color:var(--bg)}button:disabled{opacity:.55;cursor:wait}.notice{border-left:3px solid var(--gold);padding:12px 18px;background:#242119}form{max-width:800px;background:var(--panel);border:1px solid var(--line);padding:28px;border-radius:20px}label{display:block;margin:16px 0 8px;font-weight:650}input,select,textarea{width:100%;border:1px solid #5c5c69;border-radius:10px;background:#0d0e12;color:var(--text);padding:12px;font:inherit}textarea{resize:vertical}form button{margin-top:16px}.search{max-width:none;margin:16px 0 40px}.search label{margin-top:0}.search .row input{flex:1;min-width:150px}.search button{margin:0}code{font-size:.9em;overflow-wrap:anywhere}footer{border-top:1px solid var(--line);padding:32px 0 50px;display:grid;gap:18px;margin-top:40px}.skip{position:absolute;top:-100px;left:20px;padding:12px;background:var(--text);color:var(--bg);z-index:10}.skip:focus{top:10px}:focus-visible{outline:3px solid var(--gold);outline-offset:5px}#form-status{min-height:2em}@media(max-width:680px){header{align-items:flex-start;flex-direction:column;padding:20px 0}header nav{font-size:.88rem;gap:16px}.grid{grid-template-columns:1fr}.hero{padding:8px 0 28px}main{padding-top:24px}form,.card{padding:22px}.lede{font-size:1.13rem}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`;
''')
write('apps/api/src/runtime.ts', r'''
import { Buffer } from 'node:buffer';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { PostgresAlternativeDirectory, PostgresPublicEntityDirectory, PostgresReasonCatalogReader, PostgresSubmissionWriter } from '@isnotreal/persistence';
import { PostgresModerationQueue } from '@isnotreal/persistence/moderation';
import { PostgresCauseCatalogReader } from '@isnotreal/persistence/causes';
import { FileArtifactStore, PgSqlExecutor, PostgresPublishedArtifactReader, PublicationUnavailableError } from '@isnotreal/persistence/runtime';
import { createPublicWebsite } from '@isnotreal/web';
import { createAdminRouter } from './admin.js';
import { createApiRouter } from './index.js';

export interface NodeApiRuntimeOptions {
 readonly databaseUrl:string;readonly artifactRoot:string;readonly host?:string;readonly port?:number;
 readonly maxBodyBytes?:number;readonly maxDatabaseConnections?:number;readonly adminToken?:string;
 readonly adminActorId?:string;readonly adminDatabaseUrl?:string;readonly downloads?:Readonly<Record<string,string>>;
}
export interface RunningNodeApiRuntime {readonly host:string;readonly port:number;readonly close:()=>Promise<void>}
class HttpError extends Error {constructor(readonly statusCode:number){super('Invalid request');}}
function headers(response:ServerResponse,admin=false):void {
 response.setHeader('x-content-type-options','nosniff');response.setHeader('referrer-policy','no-referrer');
 response.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
 if(!admin){response.setHeader('access-control-allow-origin','*');response.setHeader('access-control-allow-methods','GET, HEAD, POST, OPTIONS');response.setHeader('access-control-allow-headers','content-type');}
}
function send(response:ServerResponse,request:IncomingMessage,status:number,body:string|Uint8Array,type:string,cache='no-store'):void {
 response.statusCode=status;response.setHeader('content-type',type);response.setHeader('cache-control',cache);
 if(status===200&&request.method!=='POST'){
  const etag='"'+createHash('sha256').update(body).digest('hex')+'"';response.setHeader('etag',etag);
  if(request.headers['if-none-match']===etag){response.statusCode=304;response.end();return;}
 }
 response.end(request.method==='HEAD'?undefined:body);
}
const json=(response:ServerResponse,request:IncomingMessage,status:number,value:unknown,cache='no-store')=>send(response,request,status,JSON.stringify(value),'application/json; charset=utf-8',cache);
async function body(request:IncomingMessage,limit:number):Promise<unknown>{
 if(request.method==='GET'||request.method==='HEAD')return null;
 const declared=Number(request.headers['content-length']??0);if(declared>limit)throw new HttpError(413);
 const chunks:Buffer[]=[];let size=0;
 for await(const chunk of request){const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=b.length;if(size>limit)throw new HttpError(413);chunks.push(b);}
 if(!size)return null;
 if(!String(request.headers['content-type']??'').toLowerCase().startsWith('application/json'))throw new HttpError(415);
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;}catch{throw new HttpError(400);}
}
function authorized(request:IncomingMessage,token:string):boolean{
 const supplied=/^Bearer\s+(.+)$/i.exec(request.headers.authorization??'')?.[1]??'';
 const a=createHash('sha256').update(supplied).digest();const b=createHash('sha256').update(token).digest();
 return supplied.length>0&&timingSafeEqual(a,b);
}
export async function startNodeApiRuntime(options:NodeApiRuntimeOptions):Promise<RunningNodeApiRuntime>{
 const host=options.host??'127.0.0.1',port=options.port??3000,limit=options.maxBodyBytes??128*1024;
 if(!Number.isInteger(port)||port<0||port>65535||!Number.isInteger(limit)||limit<1024||limit>1024*1024)throw new Error('invalid runtime limits');
 if(options.adminToken&&(!options.adminDatabaseUrl||options.adminToken.length<32))throw new Error('Admin needs a separate editor connection and a secret of at least 32 characters');
 const db=PgSqlExecutor.create({connectionString:options.databaseUrl,maxConnections:options.maxDatabaseConnections??20});
 const adminDb=options.adminToken&&options.adminDatabaseUrl?PgSqlExecutor.create({connectionString:options.adminDatabaseUrl,maxConnections:2,applicationName:'isnotreal-editor'}):null;
 try{await db.healthCheck();if(adminDb)await adminDb.healthCheck();}catch(error){await db.close();await adminDb?.close();throw error;}
 const store=new FileArtifactStore(options.artifactRoot);
 const entities=new PostgresPublicEntityDirectory(db),alternatives=new PostgresAlternativeDirectory(db),causes=new PostgresCauseCatalogReader(db),reasons=new PostgresReasonCatalogReader(db);
 const api=createApiRouter({entities,alternatives,causes,reasons,submissions:new PostgresSubmissionWriter(db),publications:new PostgresPublishedArtifactReader(db,store)});
 const web=createPublicWebsite({entities,alternatives,causes,reasons,...(options.downloads?{downloads:options.downloads}:{})});
 const admin=adminDb?createAdminRouter({db:adminDb,moderation:new PostgresModerationQueue(adminDb)}):null;
 let submissionWindow=Date.now(),submissionCount=0;
 const server=createServer((request,response)=>{void(async()=>{
  const url=new URL(request.url??'/','http://localhost');const isAdmin=url.pathname==='/admin'||url.pathname.startsWith('/admin/');headers(response,isAdmin);
  if(isAdmin&&(!admin||!options.adminToken)){json(response,request,404,{error:'not_found'});return;}
  if(isAdmin&&!authorized(request,options.adminToken!)){response.setHeader('www-authenticate','Bearer realm="isnotreal-admin"');json(response,request,401,{error:'unauthorized'});return;}
  if(request.method==='OPTIONS'){response.statusCode=204;response.setHeader('cache-control','no-store');response.end();return;}
  if(!['GET','HEAD','POST'].includes(request.method??''))throw new HttpError(405);
  if(url.pathname==='/healthz'){json(response,request,200,{ok:true});return;}
  if(url.pathname==='/readyz'){try{await db.healthCheck();json(response,request,200,{ready:true});}catch{json(response,request,503,{ready:false});}return;}
  if(url.pathname==='/api/v1/submissions'&&request.method==='POST'){
   if(Date.now()-submissionWindow>60000){submissionCount=0;submissionWindow=Date.now();}
   if(++submissionCount>60){response.setHeader('retry-after','60');throw new HttpError(429);}
  }
  const query:Record<string,string>={};for(const [key,value] of url.searchParams)query[key]=value;
  const method=request.method==='HEAD'?'GET':request.method??'GET';
  if(isAdmin){const result=await admin!({method,pathname:url.pathname,query,body:await body(request,limit),actorId:options.adminActorId??'editor'});json(response,request,result.status,result.body);return;}
  if(method==='GET'&&url.pathname.startsWith('/data/')){
   const key=url.pathname.slice(6);
   if(!/^publications\/[a-z0-9-]+\/[1-9]\d*\/(?:dictionary\.json|(?:x|tiktok|instagram|youtube|domain|domain-subdomains)\/(?:filter|highlight)\/(?:full|manifest|from-[1-9]\d*\.delta)\.json)$/.test(key)){json(response,request,404,{error:'not_found'});return;}
   try{const bytes=await store.get(key);if(bytes.length>64*1024*1024)throw new HttpError(413);send(response,request,200,bytes,'application/json; charset=utf-8','public, max-age=31536000, immutable');}
   catch(error){if(error instanceof HttpError)throw error;json(response,request,404,{error:'not_found'});}return;
  }
  if(method==='GET'&&!url.pathname.startsWith('/api/')){
   const result=await web(url.pathname,query);
   if(result?.kind==='redirect'){response.statusCode=result.status;response.setHeader('location',result.location);response.setHeader('cache-control','no-store');response.end();return;}
   if(result?.kind==='asset'){send(response,request,200,result.body,result.contentType,'public, max-age=300');return;}
   if(result?.kind==='html'){send(response,request,result.status,result.html,'text/html; charset=utf-8',result.status===200?'public, max-age=60':'no-store');return;}
   if(result?.kind==='bad-gateway')throw new HttpError(502);
   json(response,request,404,{error:'not_found'});return;
  }
  const result=await api({method,pathname:url.pathname,query,body:await body(request,limit)});
  for(const [name,value] of Object.entries(result.headers))response.setHeader(name,value);
  json(response,request,result.status,result.body,method==='GET'&&result.status===200?'public, max-age=60':'no-store');
 })().catch((error:unknown)=>{
  const status=error instanceof HttpError?error.statusCode:error instanceof PublicationUnavailableError?503:500;
  if(!response.headersSent)json(response,request,status,{error:status===503?'publication_unavailable':status===500?'internal_error':'invalid_request'});
  else response.end();
 });});
 server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxHeadersCount=100;
 try{await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve();});});}
 catch(error){await db.close();await adminDb?.close();throw error;}
 const address=server.address();let closed=false;
 return {host,port:typeof address==='object'&&address?address.port:port,close:async()=>{if(closed)return;closed=true;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await db.close();await adminDb?.close();}};
}
''')
p=Path('apps/api/tsconfig.json'); data=json.loads(p.read_text());
if not any(x.get('path')=='../web' for x in data['references']):data['references'].append({'path':'../web'})
p.write_text(json.dumps(data,indent=2)+'\n')
p=Path('apps/api/package.json'); data=json.loads(p.read_text());data['dependencies']['@isnotreal/web']='0.0.0';p.write_text(json.dumps(data,indent=2)+'\n')
p=Path('apps/api/src/serve.ts'); s=p.read_text();s=s.replace("...(adminActorId ? { adminActorId } : {}),", "...(adminActorId ? { adminActorId } : {}),\n    ...(process.env.ADMIN_DATABASE_URL ? { adminDatabaseUrl: process.env.ADMIN_DATABASE_URL } : {}),\n    downloads: { chromium: process.env.CHROME_WEB_STORE_URL ?? '', firefox: process.env.FIREFOX_ADDON_URL ?? '', safari: process.env.SAFARI_APP_STORE_URL ?? '' },")
p.write_text(s)
