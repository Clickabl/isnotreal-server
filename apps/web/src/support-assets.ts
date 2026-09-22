export const feedbackScript = String.raw`(() => {
  const form = document.querySelector('[data-feedback-form]');
  if (!form) return;
  const status = form.querySelector('[data-form-status]');
  const type = form.elements.namedItem('submissionType');
  const help = document.querySelector('#category-help');
  let lastPayload = '', requestKey = null, sent = false;
  const describe = () => { help.textContent = type.selectedOptions[0].dataset.help + ' Review destination: ' + type.selectedOptions[0].dataset.queue + ' inbox.'; };
  type.addEventListener('change', describe); describe();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sent || !form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    const values = new FormData(form);
    const rawSources = String(values.get('sources') || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (rawSources.length > 20) { status.textContent = 'Use no more than 20 source links.'; status.focus(); return; }
    const sourceUrls = [];
    for (const raw of rawSources) {
      try {
        const url = new URL(raw);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 2048) throw Error('invalid');
        sourceUrls.push(url.href);
      } catch { status.textContent = 'One source link is not a valid HTTP(S) URL without credentials.'; status.focus(); return; }
    }
    const input = {
      submissionType: values.get('submissionType'), entityPublicId: String(values.get('entityPublicId') || '').trim() || null,
      proposedReasonCode: values.get('proposedReasonCode') || null, narrative: String(values.get('narrative') || '').trim(),
      sourceUrls: [...new Set(sourceUrls)],
    };
    const serialized = JSON.stringify(input);
    if (serialized !== lastPayload) { lastPayload = serialized; requestKey = crypto.randomUUID(); }
    input.clientRequestId = requestKey;
    sent = true; button.disabled = true; form.setAttribute('aria-busy', 'true'); status.textContent = 'Sending to the review inbox…';
    try {
      const response = await fetch('/api/v1/submissions', {
        method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input), signal: AbortSignal.timeout(15000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 429) throw Error('Too many submissions. Please wait ' + (response.headers.get('retry-after') || '60') + ' seconds, then retry. Your text is still here.');
        if (response.status === 409) throw Error('The request reference was already used. Edit the report before retrying.');
        if (response.status === 400) throw Error('Check the entity ID, reason and source links. Your text is still here.');
        throw Error('The review service is unavailable. Retry with the same text to avoid creating a duplicate.');
      }
      if (typeof body.id !== 'string') throw Error('No receipt was returned. Retry with the same text to check the submission safely.');
      const queue = type.selectedOptions[0].dataset.queue;
      status.textContent = 'Saved to the ' + queue + ' review inbox. Reference: ' + body.id + '. A review is still required; nothing has been published.';
      form.reset(); describe(); lastPayload = ''; requestKey = null; status.focus();
    } catch (error) {
      status.textContent = error.name === 'TimeoutError' ? 'The request timed out. Your text is still here; retrying the unchanged report will not duplicate it.' : error.message;
      status.focus();
    } finally { sent = false; button.disabled = false; form.removeAttribute('aria-busy'); }
  });
})();
`;

export const editorScript = String.raw`(() => {
  const root = document.querySelector('[data-editor-root]'), status = document.querySelector('[data-editor-status]');
  if (!root || !status) return;
  let token = '', lastActivity = Date.now(), currentView = 'inbox', pageAfter = null, generation = 0;
  const element = (tag, text = '', attributes = {}) => {
    const node = document.createElement(tag); node.textContent = text;
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };
  const announce = (text, bad = false) => { status.textContent = text; status.setAttribute('role', bad ? 'alert' : 'status'); };
  const action = (text, fn) => {
    const button = element('button', text, { type: 'button' });
    button.addEventListener('click', async () => { button.disabled = true; try { await fn(); } catch (error) { announce(error.message, true); } finally { button.disabled = false; } });
    return button;
  };
  const link = (text, url) => {
    try { const safe = new URL(url, location.origin); if (!['http:','https:'].includes(safe.protocol) || safe.username || safe.password) return element('span', 'Unavailable link');
      return element('a', text, { href: safe.href, target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer' });
    } catch { return element('span', 'Unavailable link'); }
  };
  function lock(message = 'Workspace locked.') {
    token = ''; generation++; root.replaceChildren(); pageAfter = null;
    const form = element('form', '', { class: 'card', 'data-editor-login': '' });
    const input = element('input', '', { id: 'editor-token', type: 'password', name: 'token', minlength: '32', autocomplete: 'off', required: '' });
    form.append(element('label', 'Editor access token', { for: 'editor-token' }), input, element('button', 'Unlock workspace', { class: 'primary' }));
    root.append(form); bindLogin(form); announce(message); input.focus();
  }
  async function request(path, method = 'GET', payload) {
    if (!token) throw Error('Unlock the workspace first.');
    const response = await fetch('/admin/api/v1/' + path, { method, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { Authorization: 'Bearer ' + token, ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), signal: AbortSignal.timeout(15000) });
    if (response.status === 401) { lock('Access expired or the token was not accepted.'); throw Error('Workspace locked.'); }
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(response.status === 409 ? 'Another editor changed this report. Reload before deciding again.' : response.status === 429 ? 'The review service is rate limiting requests. Wait briefly and retry.' : value.message || 'The review request failed (' + response.status + ').');
    return value;
  }
  function bindLogin(form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); if (!form.reportValidity()) return;
      const input = form.elements.namedItem('token'), button = form.querySelector('button');
      token = input.value.trim(); input.value = ''; button.disabled = true;
      try { await request('feedback/counts'); lastActivity = Date.now(); await shell(); announce('Workspace unlocked. Token is held only in this tab.'); }
      catch (error) { token = ''; announce(error.message, true); }
      finally { button.disabled = false; }
    });
  }
  const select = (id, label, options) => {
    const wrap = element('div'), field = element('select', '', { id });
    for (const [value, text] of options) field.append(element('option', text, { value }));
    wrap.append(element('label', label, { for: id }), field); return { wrap, field };
  };
  let content, queue, state;
  async function shell() {
    root.replaceChildren();
    const toolbar = element('nav', '', { 'aria-label': 'Editor sections', class: 'row' });
    for (const [view, label] of [['inbox','Reports'],['imports','Imports'],['membership','Membership'],['issues','Publication checks']]) {
      const button = action(label, async () => { currentView = view; pageAfter = null; await shell(); });
      button.setAttribute('aria-pressed', String(currentView === view)); toolbar.append(button);
    }
    toolbar.append(action('Lock workspace', () => lock())); root.append(toolbar);
    content = element('section', '', { 'aria-live': 'polite' }); root.append(content);
    if (currentView === 'inbox') {
      const controls = element('div', '', { class: 'grid' });
      queue = select('inbox-queue', 'Review inbox', [['all','All inboxes'],['safety','Safety & privacy'],['product','Product & accessibility'],['evidence','Evidence & corrections']]);
      state = select('inbox-state', 'Review state', [['open','Open reports'],['pending','Pending'],['triaged','In review'],['accepted','Accepted'],['rejected','Rejected'],['duplicate','Duplicates'],['spam','Spam'],['all','All states']]);
      controls.append(queue.wrap, state.wrap, action('Reload reports', async () => { pageAfter = null; await inbox(); })); root.insertBefore(controls, content);
      queue.field.addEventListener('change', async () => { pageAfter = null; await inbox().catch(e => announce(e.message,true)); });
      state.field.addEventListener('change', async () => { pageAfter = null; await inbox().catch(e => announce(e.message,true)); });
      await inbox();
    } else if (currentView === 'imports') await imports();
    else if (currentView === 'membership') await membership();
    else await issues();
  }
  async function inbox() {
    const version = ++generation;
    const search = new URLSearchParams({ queue: queue.field.value, state: state.field.value, limit: '30' });
    if (pageAfter) { search.set('afterId',pageAfter.id); search.set('afterDate',pageAfter.submittedAt); }
    announce('Loading reports…');
    const data = await request('feedback?' + search);
    if (version !== generation || !token) return;
    content.replaceChildren(element('h2','Report inbox'), element('p','Review decisions update the report only. They do not publish evidence or change anyone’s filters.'));
    if (!data.reports.length) content.append(element('p','No reports match these filters.', { class: 'notice' }));
    for (const report of data.reports) {
      const card = element('article','',{ class:'card', 'data-report-id':report.id });
      card.append(element('h3',report.type.replaceAll('-',' ')),element('p',report.queue + ' inbox · ' + report.state + ' · ' + new Date(report.submittedAt).toLocaleString(),{class:'muted'}),element('small','Reference: '+report.id),element('p',report.narrative,{class:'preserve-lines'}));
      if (report.entityPublicId) card.append(link('Open entity evidence', '/' + report.entityPublicId));
      const sources = element('ul'); for (const source of report.sourceUrls) { const li=element('li');li.append(link(source,source));sources.append(li); } card.append(sources);
      if (report.note) card.append(element('p','Last review: '+report.note));
      if (report.similarCount) card.append(action('Inspect '+report.similarCount+' exact-content matches',async()=>{
        const matches=await request('feedback/'+report.id+'/duplicates'); const box=element('section');
        box.append(element('h4','Possible duplicates'));
        for(const item of matches.duplicates) box.append(element('p',item.id+' · '+item.state+' · '+new Date(item.submittedAt).toLocaleString()));
        card.append(box);
      }));
      if (['pending','triaged'].includes(report.state)) {
        const note=element('textarea','',{rows:'3',maxlength:'10000',id:'note-'+report.id});
        const duplicate=element('input','',{id:'duplicate-'+report.id,placeholder:'Original report UUID',autocomplete:'off'});
        card.append(element('label','Review note',{for:note.id}),note,element('label','Original report reference (only for duplicates)',{for:duplicate.id}),duplicate);
        const row=element('div','',{class:'row'});
        for(const [next,label] of [['triaged','Mark in review'],['accepted','Accept report'],['rejected','Reject'],['duplicate','Mark duplicate'],['spam','Mark spam']]) row.append(action(label,async()=>{
          if(['rejected','duplicate','spam'].includes(next) && note.value.trim().length<3){note.focus();throw Error('Add a review note explaining this decision.');}
          const result=await request('feedback/'+report.id+'/review','POST',{state:next,expectedRevision:report.revision,note:note.value,duplicateOf:next==='duplicate'?duplicate.value.trim():null});
          card.replaceChildren(element('h3',report.type.replaceAll('-',' ')),element('p','Saved: '+result.state+' · reference '+report.id));announce('Review saved.');
        })); card.append(row);
      }
      content.append(card);
    }
    if(data.next)content.append(action('Next page',async()=>{pageAfter=data.next;await inbox();}));
    if(pageAfter)content.append(action('First page',async()=>{pageAfter=null;await inbox();}));
    announce(data.reports.length+' reports loaded.');
  }
  async function imports() {
    const data=await request('imports?limit=50'); content.replaceChildren(element('h2','Official-list imports'),element('p','Inspect identity exceptions before committing a trusted batch. A name match is not proof of account ownership.'));
    for(const batch of data.batches){const card=element('article','',{class:'card'});card.append(element('h3',batch.sourceName),element('p',batch.state+' · '+batch.rowCount+' rows · '+batch.reasonCode),action('Review batch rows',async()=>{
      const data=await request('imports/'+batch.id+'/rows?limit=100');const section=element('section');
      for(const row of data.rows){const item=element('article','',{class:'card'});item.append(element('h4',row.rawName),element('p','Identity state: '+row.resolutionState));
        for(const candidate of row.candidates){item.append(link(candidate.name,'/'+candidate.publicId));if(!['committed','rejected','skipped'].includes(row.resolutionState)) item.append(action('Confirm this identity',async()=>{await request('import-rows/'+row.id+'/approve','POST',{entityId:candidate.entityId,note:'Identity reviewed in editor workspace.'});item.append(element('p','Identity confirmed.'));}));}
        section.append(item);
      }
      card.append(section,element('p','Showing up to 100 rows. Large imports require the full batch review/export tooling; no hidden rows are implicitly approved.'));
    }));content.append(card);}
    if(!data.batches.length)content.append(element('p','No staged imports.'));announce('Imports loaded.');
  }
  async function membership() {
    const data=await request('membership-proposals?state=pending&limit=100');content.replaceChildren(element('h2','Membership proposals'));
    for(const proposal of data.proposals){const card=element('article','',{class:'card'});const note=element('textarea','',{rows:'2',id:'proposal-'+proposal.id});card.append(element('h3',proposal.entityName+' · '+proposal.reasonCode),element('p',proposal.assertionSummary),link('Inspect evidence','/'+proposal.entityPublicId),element('label','Review note',{for:note.id}),note);
      card.append(action('Approve supported proposal',async()=>{await request('membership-proposals/'+proposal.id+'/approve','POST',{note:note.value});card.replaceChildren(element('p','Proposal approved. Publication still requires the publisher.'));}),action('Reject proposal',async()=>{if(note.value.trim().length<3)throw Error('Explain why this proposal is rejected.');await request('membership-proposals/'+proposal.id+'/reject','POST',{note:note.value});card.replaceChildren(element('p','Proposal rejected.'));}));content.append(card);}
    if(!data.proposals.length)content.append(element('p','No pending proposals.'));announce('Membership proposals loaded.');
  }
  async function issues() {
    const data=await request('publication-issues?limit=100');content.replaceChildren(element('h2','Publication checks'));
    for(const issue of data.issues){const card=element('article','',{class:'card'});card.append(element('h3',issue.entityName+' · '+issue.reasonCode),element('p',issue.assertionSummary),element('p',issue.issues.join(', ')),link('Inspect record','/'+issue.entityPublicId));content.append(card);}
    if(!data.issues.length)content.append(element('p','No validation failures in the current query. This does not certify production deployment.'));announce('Publication checks loaded.');
  }
  bindLogin(root.querySelector('[data-editor-login]'));
  for(const name of ['pointerdown','keydown'])document.addEventListener(name,()=>{lastActivity=Date.now();},{passive:true});
  setInterval(()=>{if(token && Date.now()-lastActivity>10*60000)lock('Locked after ten minutes of inactivity.');},30000);
  window.addEventListener('pagehide',()=>{token='';});
})();
`;

export const supportCss = String.raw`:root{color-scheme:dark;--bg:#0b1017;--surface:#171e29;--text:#f4f6fb;--muted:#bcc6d5;--line:#465369;--accent:#ff8599;--focus:#ffd166;font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text)}main,header,footer{width:min(1152px,calc(100% - 40px));margin-inline:auto}header,footer{padding-block:24px;border-bottom:1px solid var(--line)}header{display:flex;gap:24px;align-items:center;justify-content:space-between}nav,.row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}main{padding-block:40px}a{color:var(--accent);text-underline-offset:.2em}h1{font-size:clamp(2rem,5vw,4rem);line-height:1.08;letter-spacing:-.04em}h2{font-size:1.6rem}h3{font-size:1.2rem}.lede{font-size:1.12rem;color:var(--muted);max-width:75ch}.eyebrow{text-transform:uppercase;letter-spacing:.15em;color:var(--focus);font-size:.8rem;font-weight:750}.card{border:1px solid var(--line);border-radius:16px;padding:24px;background:var(--surface);margin-block:18px;min-width:0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}label{display:block;font-weight:650;margin-block:16px 6px}input,textarea,select,button,.button{font:inherit;color:inherit;border:1px solid var(--line);border-radius:9px;max-width:100%}input,textarea,select{background:var(--bg);padding:10px 12px;width:100%;min-height:44px}textarea{resize:vertical}button,.button{background:#253246;padding:10px 16px;cursor:pointer;min-height:44px;font-weight:650;text-decoration:none}button.primary,.button.primary{background:var(--accent);color:#111720;border-color:var(--accent)}button:disabled{opacity:.55;cursor:wait}[aria-pressed=true]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}:focus-visible{outline:3px solid var(--focus);outline-offset:3px}.muted,small{color:var(--muted)}small{display:block}.notice{padding:16px;border-left:4px solid var(--focus);background:#212c3a;border-radius:6px}.preserve-lines{white-space:pre-wrap}p,li,a,small,code{overflow-wrap:anywhere}form button[type=submit]{margin-top:20px}.skip{position:absolute;left:12px;top:-100px;z-index:1000;background:var(--bg);padding:12px}.skip:focus{top:12px}[hidden]{display:none!important}@media(max-width:640px){.grid{grid-template-columns:1fr}header{align-items:flex-start;flex-direction:column}.card{padding:18px}main,header,footer{width:calc(100% - 28px)}.row>button{flex:1 1 150px}h1{overflow-wrap:anywhere}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
`;
