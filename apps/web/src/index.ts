import type {
  AlternativeDirectory,
  PublicEntityDirectory,
  PublicEntityProfile,
  ReasonCatalogReader,
} from '@isnotreal/application';

interface Cause {
  slug: string;
  name: string;
  description: string;
  reasons: readonly { code: string; label: string; description: string }[];
  coverage?: {
    state: 'available' | 'unavailable';
    channels: readonly string[];
    generatedAt: string | null;
    expiresAt: string | null;
  };
}
export interface PublicWebDependencies {
  readonly entities: PublicEntityDirectory;
  readonly alternatives: AlternativeDirectory;
  readonly causes?: {
    list(): Promise<readonly Cause[]>;
    bySlug(slug: string): Promise<Cause | null>;
  };
  readonly reasons?: ReasonCatalogReader;
  readonly downloads?: Readonly<Record<string, string>>;
}
export type WebRouteResult =
  | { kind: 'redirect'; status: 302 | 308; location: string }
  | { kind: 'html'; status: 200 | 404; html: string }
  | { kind: 'asset'; status: 200; body: string; contentType: string }
  | { kind: 'bad-gateway'; status: 502 };

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
const link = (url: string, label: string) =>
  `<a href="${escape(url)}" rel="noopener noreferrer" referrerpolicy="no-referrer">${escape(label)}</a>`;
const fallbackCauses: readonly Cause[] = [
  {
    slug: 'israel-palestine',
    name: 'Israel / Palestine',
    description:
      'Named campaigns, public statements, documented contracts and humanitarian support.',
    reasons: [],
  },
  {
    slug: 'epstein-records',
    name: 'Epstein-related records',
    description: 'A verified document mention is not an allegation or finding of wrongdoing.',
    reasons: [],
  },
  {
    slug: 'trump-maga',
    name: 'Trump / MAGA',
    description: 'Attributable endorsements and specific public activity, not inferred beliefs.',
    reasons: [],
  },
  {
    slug: 'russia-ukraine',
    name: 'Russia / Ukraine',
    description:
      'Documented state relationships, sanctions, business activity and humanitarian support.',
    reasons: [],
  },
];
function layout(title: string, body: string, path = '/'): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>${escape(title)} · isnotreal.click</title><meta name="description" content="Some people are not real. At least not in your feed. A browser extension that makes them disappear, with receipts."><link rel="canonical" href="https://isnotreal.click${escape(path)}"><link rel="stylesheet" href="/assets/site.css"><script src="/assets/site.js" defer></script></head><body><a class="skip" href="#main">Skip to content</a><header><a class="brand" href="/">is<span>not</span>real.click</a><nav aria-label="Main"><a href="/search">Search</a><a href="/causes">Causes</a><a href="/download">Get the extension</a></nav></header><main id="main">${body}</main><footer><strong>Local choices. Public evidence.</strong><nav aria-label="Footer"><a href="/how-it-works">How it works</a><a href="/privacy">Privacy</a><a href="/report">Feedback & corrections</a></nav><small>Coverage depends on verified identifiers and the browser features available. No claim of wrongdoing follows from a document mention alone.</small></footer></body></html>`;
}
const html = (
  title: string,
  body: string,
  path = '/',
  status: 200 | 404 = 200,
): WebRouteResult => ({ kind: 'html', status, html: layout(title, body, path) });
const missing = (): WebRouteResult =>
  html(
    'Not found',
    '<h1>That page is not real.</h1><p>No published record matched this address.</p><a class="button" href="/search">Search the directory</a>',
    '/',
    404,
  );
function reasonBlock(entity: PublicEntityProfile): string {
  return (
    entity.reasons
      .map(
        (reason) =>
          `<article class="card"><span class="tag">${escape(reason.code)}</span><h3>${escape(reason.label)}</h3><p>${escape(reason.description)}</p>${reason.assertions
            .map(
              (a) =>
                `<section class="evidence"><p>${escape(a.summary)}</p><small>${a.occurredOn ? escape(a.occurredOn) : 'Event date not established'}</small><ul>${a.sources
                  .map((source) => {
                    const url = safeUrl(source.url);
                    return `<li>${url ? link(url, source.title || source.url) : 'Source address unavailable'}<small>${escape(source.publisher ?? 'Publisher not specified')} · ${source.primary ? 'Primary record' : 'Reporting / supporting source'} · Checked ${escape(source.retrievedAt)}</small></li>`;
                  })
                  .join('')}</ul></section>`,
            )
            .join('')}</article>`,
      )
      .join('') ||
    '<p class="notice">No published evidence is currently shown. Missing evidence is not a positive or negative judgment.</p>'
  );
}
function searchForm(q = ''): string {
  return `<form action="/search" method="get" class="search"><label for="q">Find a person, company or service</label><div class="row"><input id="q" name="q" type="search" minlength="2" maxlength="200" value="${escape(q)}" placeholder="Search names, not rumors" required><button>Search</button></div></form>`;
}

export function createPublicWebsite(deps: PublicWebDependencies) {
  return async (
    pathname: string,
    query: Readonly<Record<string, string | undefined>> = {},
  ): Promise<WebRouteResult | null> => {
    if (pathname === '/assets/site.css')
      return { kind: 'asset', status: 200, body: css, contentType: 'text/css; charset=utf-8' };
    if (pathname === '/assets/site.js')
      return {
        kind: 'asset',
        status: 200,
        body: script,
        contentType: 'text/javascript; charset=utf-8',
      };
    if (pathname === '/assets/admin.js')
      return {
        kind: 'asset',
        status: 200,
        body: adminScript,
        contentType: 'text/javascript; charset=utf-8',
      };
    if (pathname === '/robots.txt')
      return {
        kind: 'asset',
        status: 200,
        body: 'User-agent: *\nDisallow: /admin/\nDisallow: /admin-console\nDisallow: /api/\nDisallow: /report\n',
        contentType: 'text/plain; charset=utf-8',
      };
    if (pathname === '/admin-console') {
      return html(
        'Editor console',
        `<p class="eyebrow">Restricted editor surface</p><h1>Review the queue.</h1><p>This page contains no privileged data until an editor supplies the admin bearer token. Keep the token in this browser session only.</p><div id="admin-app"><form id="admin-login" class="card"><label for="admin-token">Admin bearer token</label><input id="admin-token" type="password" autocomplete="off" required><button type="submit">Open moderation console</button><p id="admin-status" role="status" aria-live="polite"></p></form></div><script src="/assets/admin.js" defer></script>`,
        pathname,
      );
    }
    if (pathname === '/' || pathname === '/index.html') {
      const causes = deps.causes ? await deps.causes.list() : fallbackCauses;
      return html(
        'Some people are not real.',
        `<section class="hero"><p class="eyebrow">Out of feed, out of mind</p><h1>Some people<br><span>are not real.</span></h1><p class="lede">At least, not anymore. Not in your feed, not in your tabs, not getting your clicks. Pick who you’re done with, and isnotreal makes them vanish from your browser. Poof.</p><div class="row"><a class="button primary" href="/download">Make them not real</a><a class="button" href="/how-it-works">How it works</a></div></section>${searchForm()}<section><div class="section-title"><h2>Pick your dealbreakers.</h2><a href="/causes">All causes →</a></div><div class="grid">${causes.map((c) => `<a class="card cause" href="/causes/${escape(c.slug)}"><small>Off until you say so</small><h3>${escape(c.name)}</h3><p>${escape(c.description)}</p><span>${c.coverage?.state === 'available' ? `${c.reasons.length} reason definitions · published coverage` : c.reasons.length ? `${c.reasons.length} definitions · coverage unavailable` : 'Definitions being prepared'}</span></a>`).join('')}</div></section><section class="card"><h2>We bring receipts.</h2><p>Whenever someone gets blocked, click their block box to see exactly why, with links to the proof.</p><p><strong>Are we missing someone?</strong> <a href="/report?type=new-entity">Spill the tea →</a></p></section>`,
      );
    }
    if (pathname === '/download') {
      const stores = [
        ['chromium', 'Chrome / Chromium', 'chromewebstore.google.com'],
        ['firefox', 'Firefox', 'addons.mozilla.org'],
        ['safari', 'Safari', 'apps.apple.com'],
      ];
      return html(
        'Make them not real',
        `<p class="eyebrow">Get the extension</p><h1>Install the<br><span>disappearing act.</span></h1><p class="lede">Pick your browser. Store releases are on the way; we’ll put the real install buttons here the moment they’re approved.</p><div class="grid">${stores
          .map(([key, name, host]) => {
            const candidate = safeUrl(deps.downloads?.[key!]);
            const ready = candidate && new URL(candidate).hostname === host;
            return `<article class="card" data-platform="${escape(key!)}"><span class="tag">${escape(name!)}</span><h2>${escape(name!)}</h2>${ready ? `<a class="button primary" href="${escape(candidate)}" rel="noreferrer">Install from the official store</a>` : '<p class="notice">Store release not yet published.</p>'}<p>Updates install themselves, and new block lists show up on their own.</p></article>`;
          })
          .join(
            '',
          )}</div><section class="card"><h2>Developer installation</h2><p>Build the companion repository with <code>npm run package</code>, then load <code>build/chromium</code> from the browser’s extension developer page. A publisher trust key must be included for real data synchronization.</p><p>Domain blocking needs website permissions. Safari only covers Safari webpages, not native TikTok, Instagram or other apps. Browser-store distribution and Safari’s signed Apple wrapper remain separate release gates.</p></section>`,
        pathname,
      );
    }
    if (pathname === '/search') {
      const q = (query.q ?? '').trim().slice(0, 200);
      const results = q.length >= 2 ? await deps.entities.search(q, 50) : [];
      return html(
        'Search',
        `<h1>Look it up.</h1>${searchForm(q)}${q.length >= 2 ? `<p role="status">${results.length} result${results.length === 1 ? '' : 's'}${results.length === 50 ? ' (showing the first 50)' : ''}</p><div class="grid">${results.map((e) => `<a class="card" href="/${escape(e.slug)}"><small>${escape(e.kind)}</small><h2>${escape(e.name)}</h2><span>Inspect reasons and sources →</span></a>`).join('') || '<p>Nobody by that name yet. Know something we don’t? <a href="/report?type=new-entity">Tell us.</a></p>'}</div>` : '<p>Enter at least two characters.</p>'}<a href="/report?type=new-entity">Suggest a missing record</a>`,
        pathname,
      );
    }
    if (pathname === '/causes') {
      const causes = deps.causes ? await deps.causes.list() : fallbackCauses;
      return html(
        'Causes',
        `<h1>Choose your<br><span>unreal people.</span></h1><p class="lede">Nothing’s on until you turn it on. We don’t pick your battles for you, and new causes never sneak themselves in.</p><div class="grid">${causes.map((c) => `<article class="card"><h2><a href="/causes/${escape(c.slug)}">${escape(c.name)}</a></h2><p>${escape(c.description)}</p></article>`).join('')}</div>`,
        pathname,
      );
    }
    const causeMatch = /^\/causes\/([a-z0-9-]+)\/?$/.exec(pathname);
    if (causeMatch) {
      const c = deps.causes
        ? await deps.causes.bySlug(causeMatch[1]!)
        : fallbackCauses.find((x) => x.slug === causeMatch[1]);
      if (!c) return missing();
      return html(
        c.name,
        `<p class="eyebrow">Optional cause</p><h1>${escape(c.name)}</h1><p class="lede">${escape(c.description)}</p><p class="${c.coverage?.state === 'available' ? 'muted' : 'notice'}">${c.coverage?.state === 'available' ? `Published channels: ${escape(c.coverage.channels.join(', ') || 'none')}` : 'Coverage is not currently published. An empty result must not be read as comprehensive.'}</p>${c.reasons.length ? c.reasons.map((r) => `<article class="card"><span class="tag">${escape(r.code)}</span><h2><a href="/reasons/${escape(r.code)}">${escape(r.label)}</a></h2><p>${escape(r.description)}</p></article>`).join('') : '<p class="notice">No published reason definitions are available yet. This is not comprehensive coverage.</p>'}`,
        pathname,
      );
    }
    const reasonMatch = /^\/reasons\/([A-Z][A-Z0-9_-]{1,15})$/.exec(pathname);
    if (reasonMatch) {
      const r = await deps.reasons?.byCode(reasonMatch[1]!);
      if (!r) return missing();
      return html(
        r.label,
        `<p class="eyebrow">${escape(r.code)} · Evidence standard</p><h1>${escape(r.label)}</h1><p>${escape(r.description)}</p><section class="card"><h2>What qualifies</h2><p>${escape(r.evidenceRequirement?.publicCriteria ?? 'No qualification criteria published.')}</p><h2>What does not qualify</h2><p>${escape(r.evidenceRequirement?.exclusionCriteria ?? 'No exclusions published.')}</p>${!r.publicationEnabled ? '<p class="notice">This reason is not enabled for publication.</p>' : ''}</section><section><h2>Authority sources</h2><ul>${
          r.authoritySources
            .map((s) => {
              const url = safeUrl(s.url);
              return `<li>${url ? link(url, s.title) : 'Source unavailable'}</li>`;
            })
            .join('') || '<li>Evidence is evaluated per record.</li>'
        }</ul></section>`,
        pathname,
      );
    }
    if (pathname === '/report') {
      const reasons = (await deps.reasons?.list()) ?? [];
      const id = /^[1-9]\d{0,19}$/.test(query.entity ?? '') ? query.entity! : '';
      const types = [
        'add-evidence',
        'incorrect-information',
        'changed-position',
        'wrong-identifier',
        'missing-identifier',
        'company-relationship',
        'suggest-alternative',
        'new-entity',
        'product-feedback',
        'bug-report',
        'accessibility-feedback',
        'abuse-report',
      ];
      const labels: Record<string, string> = {
        'new-entity': 'Someone you’re missing',
        'add-evidence': 'More receipts on someone already listed',
        'incorrect-information': 'You got something wrong',
        'changed-position': 'They changed their tune',
        'wrong-identifier': 'Wrong account or website',
        'missing-identifier': 'Another account or website of theirs',
        'company-relationship': 'Who owns who',
        'suggest-alternative': 'A better alternative',
        'product-feedback': 'Feedback on isnotreal',
        'bug-report': 'Something’s broken',
        'accessibility-feedback': 'Accessibility problem',
        'abuse-report': 'Someone is abusing this form',
      };
      const selected = query.type && types.includes(query.type) ? query.type : 'new-entity';
      return html(
        'Spill the tea',
        `<p class="eyebrow">Are we missing someone?</p><h1>Spill<br><span>the tea.</span></h1><p class="lede">Tell us who, link their profile, and bring the receipts. We check every tip before anyone gets blocked.</p><form data-submission><input type="hidden" name="entityPublicId" value="${id}"><label for="type">What’s this about?</label><select id="type" name="submissionType">${types.map((t) => `<option value="${t}"${selected === t ? ' selected' : ''}>${escape(labels[t] ?? t)}</option>`).join('')}</select><label for="notes">Who is it, and what did they do?</label><textarea id="notes" name="narrative" minlength="3" maxlength="10000" rows="5" required></textarea><label for="profile">Link to their profile</label><input id="profile" name="profileUrl" type="url" placeholder="https://x.com/…, https://instagram.com/…, their website"><label for="evidence">Link to the receipts</label><input id="evidence" name="evidenceUrl" type="url" placeholder="The article, post, filing or document that shows it"><label for="sources">More links (optional, one per line)</label><textarea id="sources" name="sources" rows="3" placeholder="https://…"></textarea><label for="reason">Which cause? (optional)</label><select id="reason" name="proposedReasonCode"><option value="">Not sure, you pick</option>${reasons.map((r) => `<option value="${escape(r.code)}">${escape(r.label)}</option>`).join('')}</select><p class="muted">No home addresses, phone numbers or private stuff. We block people, we don’t dox them.</p><button type="submit">Send it</button><p id="form-status" role="status" aria-live="polite"></p><noscript>JavaScript is needed to submit this form. The evidence directory can be read without it.</noscript></form>`,
        pathname,
      );
    }
    if (pathname === '/privacy' || pathname === '/how-it-works') {
      const privacy = pathname === '/privacy';
      return html(
        privacy ? 'Privacy' : 'How it works',
        privacy
          ? `<p class="eyebrow">Privacy</p><h1>Your choices stay local by default.</h1><section class="card"><h2>Ordinary matching</h2><p>Matching uses downloaded identifiers in the browser. It does not require uploading each encountered account or page.</p><h2>Requests you choose</h2><p>Opening evidence, using online alternatives and submitting a report contact this service. Cause-specific downloads can reveal which dataset you requested. Your IP address is necessarily visible to the server/network delivering it.</p><h2>No invented anonymity promises</h2><p>This application adds no advertising analytics. Hosting/proxy access logs depend on the deployment configuration and need a retention policy before public launch. Local overrides are not sent as telemetry.</p></section>`
          : `<p class="eyebrow">How it works</p><h1>Small local lists.<br>Full public receipts.</h1><div class="grid"><article class="card"><h2>1. Choose causes</h2><p>Select causes and individual criteria. Disabled causes have no local filtering effect.</p></article><article class="card"><h2>2. Match identifiers</h2><p>Known account IDs and exact or subtree domains resolve locally. Unknown identities are not guessed.</p></article><article class="card"><h2>3. Choose an action</h2><p>Website rules can stop requests before loading the target. Supported X, TikTok, Instagram and YouTube web feeds are matched locally after you grant website access. You control hide/replace behavior, exceptions and alternatives.</p></article><article class="card"><h2>4. Check the evidence</h2><p>The directory exposes the reason, date and source. A new signed dataset delivers corrections without reinstalling extension code.</p></article></div>`,
        pathname,
      );
    }
    const alt = /^\/go-to-alt\/([1-9]\d{0,19})\/?$/.exec(pathname);
    if (alt) {
      const entity = await deps.entities.byPublicId(alt[1]!);
      if (!entity) return missing();
      const option = await deps.alternatives.preferred(entity.publicId, 'general', 'domain');
      const url = safeUrl(option?.destinationUrl);
      if (!url || option?.entity.lists.includes('filter'))
        return { kind: 'redirect', status: 302, location: `/${entity.slug}/alternatives` };
      const target = new URL(url);
      if (
        target.protocol !== 'https:' ||
        target.hostname === 'isnotreal.click' ||
        target.hostname.endsWith('.isnotreal.click') ||
        option?.entity.publicId === entity.publicId
      )
        return { kind: 'bad-gateway', status: 502 };
      return { kind: 'redirect', status: 302, location: target.href };
    }
    const entityRoute = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/alternatives)?\/?$/.exec(pathname);
    if (entityRoute) {
      const key = entityRoute[1]!;
      const numeric = /^[1-9]\d{0,19}$/.test(key);
      const entity = numeric
        ? await deps.entities.byPublicId(key)
        : await deps.entities.bySlug(key);
      if (!entity) return missing();
      if (numeric)
        return {
          kind: 'redirect',
          status: 308,
          location: `/${entity.slug}${entityRoute[2] ?? ''}`,
        };
      if (entityRoute[2]) {
        const options = await deps.alternatives.list(entity.publicId, null, 'domain');
        return html(
          `Alternatives to ${entity.name}`,
          `<a href="/${escape(entity.slug)}">← Evidence page</a><h1>Alternatives to<br>${escape(entity.name)}</h1><p>Curated substitutes, not a claim of universal ethical approval. The generic website route cannot know private extension settings.</p><div class="grid">${
            options
              .map((o) => {
                const url = safeUrl(o.destinationUrl);
                return `<article class="card"><h2><a href="/${escape(o.entity.slug)}">${escape(o.entity.name)}</a></h2><p>${escape(o.rationale ?? 'No explanation published.')}</p><small>${escape(o.contextKey)}</small>${url ? `<p>${link(url, 'Visit alternative →')}</p>` : ''}</article>`;
              })
              .join('') ||
            '<p class="notice">No verified alternative is available yet. We will not send you to an unverified destination.</p>'
          }</div><a href="/report?entity=${entity.publicId}&type=suggest-alternative">Suggest an alternative</a>`,
          pathname,
        );
      }
      return html(
        entity.name,
        `<p class="eyebrow">${escape(entity.kind)} · Record ${escape(entity.publicId)}</p><h1>${escape(entity.name)}</h1><div class="row"><a class="button" href="/${escape(entity.slug)}/alternatives">See alternatives</a><a class="button" href="/report?entity=${entity.publicId}">Submit evidence or a correction</a></div><section><h2>Documented reasons</h2>${reasonBlock(entity)}</section><section class="card"><h2>Verified identifiers</h2><ul>${entity.identifiers.map((i) => `<li><strong>${escape(i.kind)}</strong> <code>${escape(i.value)}</code> <small>${escape(i.matchScope)}</small></li>`).join('') || '<li>No platform/domain identifiers verified yet. A name alone cannot be matched by the extension.</li>'}</ul></section><section class="card"><h2>Relationships</h2><ul>${entity.relationships.map((r) => `<li>${escape(r.direction + ' · ' + r.relationshipType)}: <a href="/${escape(r.entity.slug)}">${escape(r.entity.name)}</a></li>`).join('') || '<li>No verified relationships shown.</li>'}</ul><p>Relationships do not automatically transfer another entity’s factual claims.</p></section>`,
        pathname,
      );
    }
    return null;
  };
}
export const createPublicRouteResolver = createPublicWebsite;

const script = String.raw`
const ua=navigator.userAgent||'';
const detected=/Firefox\//.test(ua)?'firefox':/Safari\//.test(ua)&&!/Chrome\//.test(ua)?'safari':/Chrome\//.test(ua)?'chromium':null;
if(detected){const card=document.querySelector('[data-platform="'+detected+'"]');if(card){card.setAttribute('aria-current','true');const tag=card.querySelector('.tag');if(tag)tag.textContent=tag.textContent+' · this browser';}}
const form=document.querySelector('form[data-submission]');
if(form)form.addEventListener('submit',async(event)=>{
 event.preventDefault();if(!form.reportValidity())return;
 const button=form.querySelector('button');const status=document.querySelector('#form-status');
 const data=new FormData(form);const urls=[data.get('profileUrl'),data.get('evidenceUrl'),...String(data.get('sources')||'').split(/\r?\n/)].map(s=>String(s||'').trim()).filter(Boolean);
 try{if(urls.length>20)throw Error('Use at most 20 source URLs.');for(const text of urls){const u=new URL(text);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Use public HTTP(S) source links without credentials.');}}
 catch(error){status.textContent=error.message;return;}
 button.disabled=true;status.textContent='Submitting…';
 try{const response=await fetch('/api/v1/submissions',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({entityPublicId:data.get('entityPublicId')||null,submissionType:data.get('submissionType'),proposedReasonCode:data.get('proposedReasonCode')||null,narrative:data.get('narrative'),sourceUrls:urls})});
 if(!response.ok)throw Error(response.status===429?'Submission limit reached. Please try later.':'The submission was not accepted. Check your fields and try again.');
 const result=await response.json();status.textContent='Got it, thanks for the tea. Receipt: '+result.id;form.reset();}
 catch(error){status.textContent=error.message;}finally{button.disabled=false;}
});`;
const adminScript = String.raw`
const root=document.querySelector('#admin-app');
const key='isnotreal-admin-token';
let token=sessionStorage.getItem(key)||'';
let submissionType='';
const h=(tag,text,attrs={})=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
async function request(path,options={}){
 const response=await fetch(path,{...options,credentials:'omit',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,...(options.headers||{})}});
 if(response.status===401){sessionStorage.removeItem(key);token='';throw Error('Admin token rejected.');}
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(body.error||('Request failed: '+response.status));
 return body;
}
function action(label,run){const b=h('button',label,{type:'button'});b.addEventListener('click',async()=>{b.disabled=true;try{await run();await load();}catch(e){alert(e.message);}finally{b.disabled=false;}});return b;}
function card(title,body){const n=h('article','',{class:'card'});n.append(h('h3',title));if(body)n.append(h('p',body));return n;}
async function reviewSubmission(item,state){
 const note=prompt(state+' note',item.reviewNote||'')??'';if((state==='rejected'||state==='duplicate')&&!note.trim())return;
 await request('/admin/api/v1/submissions/'+item.id+'/review',{method:'POST',body:JSON.stringify({state,note})});
}
function submissions(items){
 const section=h('section');section.append(h('h2','Feedback & corrections'));
 if(!items.length)section.append(h('p','No pending submissions.'));
 for(const item of items){
  const n=card(item.submissionType,item.narrative);n.append(h('small','Receipt '+item.id));
  if(item.entityPublicId)n.append(h('p','Entity '+item.entityPublicId));
  if(item.duplicateCount)n.append(h('p',item.duplicateCount+' similar submission'+(item.duplicateCount===1?'':'s')+' detected'));
  for(const url of item.sourceUrls||[]){const a=h('a',url,{href:url,target:'_blank',rel:'noopener noreferrer'});n.append(a);}
  const row=h('div','',{class:'row'});for(const state of ['triaged','accepted','rejected','duplicate','spam'])row.append(action(state,()=>reviewSubmission(item,state)));n.append(row);section.append(n);
 }return section;
}
async function importRows(batchId,container){
 const data=await request('/admin/api/v1/imports/'+batchId+'/rows?limit=1000');container.replaceChildren();
 for(const row of data.rows){
  const n=card(row.rawName,row.resolutionState);const actions=h('div','',{class:'row'});
  for(const candidate of row.candidates||[])actions.append(action('Approve '+candidate.name,()=>request('/admin/api/v1/import-rows/'+row.id+'/approve',{method:'POST',body:JSON.stringify({entityId:candidate.entityId,note:'Approved from editor console'})})));
  actions.append(action('Create person',()=>request('/admin/api/v1/import-rows/'+row.id+'/create-entity',{method:'POST',body:JSON.stringify({kind:'person',note:'Created from trusted import review'})})));
  actions.append(action('Skip',()=>request('/admin/api/v1/import-rows/'+row.id+'/skip',{method:'POST',body:JSON.stringify({note:'Skipped by editor'})})));
  n.append(actions);container.append(n);
 }
}
function imports(items){
 const section=h('section');section.append(h('h2','Official imports'));
 if(!items.length)section.append(h('p','No import batches.'));
 for(const item of items){const n=card(item.sourceName,item.reasonCode+' · '+item.state+' · '+item.rowCount+' rows');const rows=h('div');
  n.append(action('Review rows',()=>importRows(item.id,rows)),action('Prepare trusted batch',()=>request('/admin/api/v1/imports/'+item.id+'/prepare',{method:'POST',body:JSON.stringify({kind:'person',note:''})})),action('Mark ready',()=>request('/admin/api/v1/imports/'+item.id+'/ready',{method:'POST',body:'{}'})),action('Commit batch',()=>request('/admin/api/v1/imports/'+item.id+'/commit',{method:'POST',body:'{}'})));
  if(item.state==='committed')n.append(action('Rollback committed batch',()=>{const note=prompt('Rollback rationale');if(!note?.trim())return Promise.reject(Error('Rollback rationale required'));return request('/admin/api/v1/imports/'+item.id+'/rollback',{method:'POST',body:JSON.stringify({note})});}));
  n.append(rows);section.append(n);}
 return section;
}
function proposals(items){
 const section=h('section');section.append(h('h2','Membership proposals'));
 if(!items.length)section.append(h('p','No pending proposals.'));
 for(const item of items){const n=card(item.entityName,item.reasonCode+' · '+item.proposedList);n.append(h('p',item.assertionSummary),action('Approve',()=>request('/admin/api/v1/membership-proposals/'+item.id+'/approve',{method:'POST',body:JSON.stringify({note:'Approved from editor console'})})),action('Reject',()=>request('/admin/api/v1/membership-proposals/'+item.id+'/reject',{method:'POST',body:JSON.stringify({note:prompt('Rejection rationale')||'Rejected by editor'})})));section.append(n);}return section;
}
function issues(items){
 const section=h('section');section.append(h('h2','Publication validation issues'));
 if(!items.length)section.append(h('p','No active publication validation issues.'));
 for(const item of items)section.append(card(item.entityName,item.reasonCode+' · '+(item.issues||[]).join(', ')));return section;
}
function sourceChanges(items){
 const section=h('section');section.append(h('h2','Official source changes'));
 if(!items.length)section.append(h('p','No unreviewed official-source changes.'));
 for(const item of items){const n=card(item.title,'Detected '+item.detectedAt);const a=h('a',item.url,{href:item.url,target:'_blank',rel:'noopener noreferrer'});n.append(a,h('p','Previous capture '+item.previousCaptureId+' → '+item.newCaptureId));const row=h('div','',{class:'row'});
  for(const state of ['reviewed','ignored'])row.append(action(state,()=>{const note=prompt(state+' note');if(!note?.trim())return Promise.reject(Error('Review note required'));return request('/admin/api/v1/source-changes/'+item.id+'/review',{method:'POST',body:JSON.stringify({state,note})});}));
  n.append(row);section.append(n);
 }return section;
}
function identifierEditor(){
 const section=h('section');section.append(h('h2','Verified identifiers'));
 const form=h('form','');const fields=[
  ['entityPublicId','Entity public ID','text'],
  ['value','Identifier value','text'],
  ['verificationAssertionId','Published verification assertion UUID','text']
 ];
 for(const [name,label,type] of fields){const id='identifier-'+name;form.append(h('label',label,{for:id}),h('input','',{id,name,type,required:'required'}));}
 const kind=h('select','',{name:'kind',id:'identifier-kind'});
 for(const value of ['domain','x','tiktok','instagram','youtube'])kind.append(h('option',value,{value}));
 form.append(h('label','Identifier kind',{for:'identifier-kind'}),kind);
 const scope=h('select','',{name:'matchScope',id:'identifier-scope'});
 scope.append(h('option','Exact',{value:'exact'}),h('option','Include subdomains (domain only)',{value:'include-subdomains'}));
 form.append(h('label','Match scope',{for:'identifier-scope'}),scope);
 const submit=h('button','Verify identifier',{type:'submit'});form.append(submit);
 form.addEventListener('submit',async(event)=>{event.preventDefault();submit.disabled=true;try{const data=Object.fromEntries(new FormData(form));await request('/admin/api/v1/identifiers/assign',{method:'POST',body:JSON.stringify(data)});form.reset();alert('Verified identifier saved.');}catch(e){alert(e.message);}finally{submit.disabled=false;}});
 section.append(h('p','Requires a published, sourced assertion belonging to the entity. The tool refuses an identifier already verified for another entity.'),form);return section;
}
async function load(){
 root.replaceChildren(h('p','Loading moderation queues…',{role:'status'}));
 try{
  const [s,i,p,v,c]=await Promise.all([
   request('/admin/api/v1/submissions?state=pending&limit=200'+(submissionType?'&type='+encodeURIComponent(submissionType):'')),
   request('/admin/api/v1/imports?limit=100'),
   request('/admin/api/v1/membership-proposals?state=pending&limit=200'),
   request('/admin/api/v1/publication-issues?limit=500'),
   request('/admin/api/v1/source-changes?state=pending&limit=200')
  ]);
  const bar=h('div','',{class:'row'});
  const filter=h('select','',{'aria-label':'Filter feedback type'});
  filter.append(h('option','All feedback types',{value:''}));
  for(const type of ['add-evidence','incorrect-information','changed-position','wrong-identifier','missing-identifier','company-relationship','suggest-alternative','new-entity','product-feedback','bug-report','accessibility-feedback','abuse-report'])filter.append(h('option',type.replaceAll('-',' '),{value:type}));
  filter.value=submissionType;filter.addEventListener('change',()=>{submissionType=filter.value;load();});
  bar.append(filter,action('Refresh',async()=>{}),action('Forget token',async()=>{sessionStorage.removeItem(key);location.reload();}));
  root.replaceChildren(bar,submissions(s.submissions),sourceChanges(c.changes),identifierEditor(),imports(i.batches),proposals(p.proposals),issues(v.issues));
 }catch(e){root.replaceChildren(card('Could not open moderation console',e.message));const b=action('Try another token',async()=>{sessionStorage.removeItem(key);location.reload();});root.append(b);}
}
const login=document.querySelector('#admin-login');
if(token){load();}else if(login)login.addEventListener('submit',(event)=>{event.preventDefault();token=document.querySelector('#admin-token').value.trim();if(!token)return;sessionStorage.setItem(key,token);load();});
`;
const css = String.raw`
:root{color-scheme:dark;--bg:#0c0d10;--panel:#17181e;--text:#f4f2ec;--muted:#b1b1bc;--line:#343540;--accent:#ff657b;--gold:#efca74;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 80% 0,#331e2b,transparent 45rem),var(--bg);color:var(--text)}a{color:inherit;text-underline-offset:4px}header,main,footer{width:min(1120px,calc(100% - 40px));margin:auto}header{display:flex;gap:20px;justify-content:space-between;align-items:center;min-height:84px;border-bottom:1px solid var(--line)}nav{display:flex;gap:20px;flex-wrap:wrap}nav a,.brand{text-decoration:none}.brand{font-size:1.3rem;font-weight:900;letter-spacing:-.06em}.brand span,h1 span{color:var(--accent)}main{min-height:65vh;padding:48px 0}h1{font-size:clamp(2.8rem,8vw,6.8rem);letter-spacing:-.065em;line-height:.99;max-width:1000px;margin:24px 0 36px;overflow-wrap:anywhere}h2{font-size:clamp(1.4rem,3vw,2rem);letter-spacing:-.035em}h3{font-size:1.4rem;line-height:1.2}.hero{padding:45px 0 64px}.eyebrow,.tag{text-transform:uppercase;letter-spacing:.12em;font-size:.78rem;color:var(--gold);font-weight:750}.lede{max-width:760px;font-size:1.3rem;line-height:1.6;color:var(--muted)}p,li{line-height:1.65}p,small,.muted{color:var(--muted)}small{display:block;font-size:.84rem;line-height:1.5}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.card{background:linear-gradient(135deg,var(--panel),#111218);border:1px solid var(--line);border-radius:20px;padding:28px;overflow-wrap:anywhere;margin:16px 0}.grid .card{margin:0}a.card{text-decoration:none}a.card:hover{border-color:var(--accent)}section{margin-top:36px}.evidence{border-top:1px solid var(--line);padding-top:14px;margin-top:16px}.evidence a{color:var(--gold)}.row,.section-title{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.section-title{justify-content:space-between}.button,button{border:1px solid var(--line);border-radius:999px;padding:13px 20px;font:inherit;font-weight:750;text-decoration:none;cursor:pointer;color:var(--text);background:var(--panel)}.primary,button{background:var(--text);color:var(--bg)}button:disabled{opacity:.55;cursor:wait}.notice{border-left:3px solid var(--gold);padding:12px 18px;background:#242119}form{max-width:800px;background:var(--panel);border:1px solid var(--line);padding:28px;border-radius:20px}label{display:block;margin:16px 0 8px;font-weight:650}input,select,textarea{width:100%;border:1px solid #5c5c69;border-radius:10px;background:#0d0e12;color:var(--text);padding:12px;font:inherit}textarea{resize:vertical}form button{margin-top:16px}.search{max-width:none;margin:16px 0 40px}.search label{margin-top:0}.search .row input{flex:1;min-width:150px}.search button{margin:0}code{font-size:.9em;overflow-wrap:anywhere}footer{border-top:1px solid var(--line);padding:32px 0 50px;display:grid;gap:18px;margin-top:40px}.skip{position:absolute;top:-100px;left:20px;padding:12px;background:var(--text);color:var(--bg);z-index:10}.skip:focus{top:10px}:focus-visible{outline:3px solid var(--gold);outline-offset:5px}#form-status{min-height:2em}@media(max-width:680px){header{align-items:flex-start;flex-direction:column;padding:20px 0}header nav{font-size:.88rem;gap:16px}.grid{grid-template-columns:1fr}.hero{padding:8px 0 28px}main{padding-top:24px}form,.card{padding:22px}.lede{font-size:1.13rem}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}@media(prefers-color-scheme:light){:root{--bg:#faf9f6;--panel:#fff;--text:#17171b;--muted:#575761;--line:#c9c9d1;--accent:#a81736;--gold:#795700}body{background:radial-gradient(ellipse at 80% 0,#f5e5eb,transparent 45rem),var(--bg)}.card{background:linear-gradient(135deg,var(--panel),#f6f6f8)}.notice{background:#fff6db}}@media(forced-colors:active){.card,.notice,button,.button,input,select,textarea{border:1px solid CanvasText}.eyebrow,.tag,.evidence a{color:LinkText}}`;
