import type {
  AlternativeDirectory,
  PublicEntityDirectory,
  PublicEntityProfile,
} from '@isnotreal/application';

export type WebRouteResult =
  | { readonly kind: 'redirect'; readonly status: 302 | 308; readonly location: string }
  | { readonly kind: 'html'; readonly status: 200 | 404; readonly html: string }
  | { readonly kind: 'bad-gateway'; readonly status: 502 };

export interface PublicWebDependencies {
  readonly entities: PublicEntityDirectory;
  readonly alternatives: AlternativeDirectory;
}

export function createPublicWebsite(deps: PublicWebDependencies) {
  return async (pathname: string): Promise<WebRouteResult | null> => {
    if (pathname === '/' || pathname === '/index.html') {
      return { kind: 'html', status: 200, html: renderHomePage() };
    }
    if (pathname === '/privacy') {
      return { kind: 'html', status: 200, html: renderPrivacyPage() };
    }
    if (pathname === '/how-it-works') {
      return { kind: 'html', status: 200, html: renderHowItWorksPage() };
    }

    const alternativeMatch = /^\/go-to-alt\/(\d+)\/?$/.exec(pathname);
    if (alternativeMatch) {
      const publicId = alternativeMatch[1];
      if (!publicId) return notFound();
      const alternative = await deps.alternatives.preferred(publicId, 'general', 'domain');
      if (!alternative?.destinationUrl) return notFound();
      if (!alternative.destinationUrl.startsWith('https://')) {
        return { kind: 'bad-gateway', status: 502 };
      }
      return { kind: 'redirect', status: 302, location: alternative.destinationUrl };
    }

    const idMatch = /^\/(\d+)\/?$/.exec(pathname);
    if (idMatch) {
      const publicId = idMatch[1];
      if (!publicId) return notFound();
      const entity = await deps.entities.byPublicId(publicId);
      return entity ? { kind: 'redirect', status: 308, location: `/${entity.slug}` } : notFound();
    }

    const slugMatch = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(pathname);
    if (slugMatch) {
      const slug = slugMatch[1];
      if (!slug) return notFound();
      const entity = await deps.entities.bySlug(slug);
      return entity ? { kind: 'html', status: 200, html: renderEntityPage(entity) } : notFound();
    }

    return null;
  };
}

export const createPublicRouteResolver = createPublicWebsite;

function renderHomePage(): string {
  return page(
    'isnotreal.click',
    `<main class="home">
      <section class="hero">
        <p class="eyebrow">Choose what reaches you.</p>
        <h1>Filter the feed.<br><span>Keep the receipts.</span></h1>
        <p class="lede">A browser extension that can hide or replace content from accounts and sites matching the causes you choose. Every match points back to a specific, reviewable reason.</p>
        <div class="actions">
          <a class="button primary" href="#install">Get the extension</a>
          <a class="button" href="/how-it-works">How it works</a>
        </div>
      </section>
      <section class="cause-grid" aria-label="Available cause packs">
        ${causeCard('Israel / Palestine', 'Statements, campaigns, contracts, boycott designations, ceasefire advocacy and humanitarian support.')}
        ${causeCard('Epstein-related records', 'Released-record matches stay distinct from allegations or findings. Exact source links matter.')}
        ${causeCard('Trump / MAGA', 'Documented endorsements, campaign roles, self-identification and other attributable activity.')}
        ${causeCard('Russia / Ukraine', 'Sanctions, state or military relationships, business activity, statements and humanitarian support.')}
      </section>
      <section class="install" id="install">
        <p class="eyebrow">Install</p>
        <h2>Browser builds are being prepared.</h2>
        <p>Chrome, Firefox and Safari releases will appear here when their signed packages or store listings are ready. The site will not pretend an unavailable build is downloadable.</p>
        <div class="platforms"><span>Chrome</span><span>Firefox</span><span>Safari</span></div>
      </section>
      <section class="principles">
        <h2>Local choices, public evidence.</h2>
        <p>Your enabled causes and reason choices belong in your browser. Encountered accounts do not need to be sent to the server for ordinary filtering. The website holds the fuller evidence trail and corrections.</p>
      </section>
    </main>`,
  );
}

function renderEntityPage(entity: PublicEntityProfile): string {
  const reasons = entity.reasons.length
    ? entity.reasons
        .map(
          (reason) =>
            `<article class="reason"><h3>${escapeHtml(reason.label)}</h3><p>${escapeHtml(reason.summary)}</p>${reason.sources
              .map(
                (source) =>
                  `<a rel="noopener noreferrer" href="${escapeAttribute(source.url)}">${escapeHtml(source.title)}</a>`,
              )
              .join('')}</article>`,
        )
        .join('')
    : '<p>No published reasons are currently attached to this entity.</p>';

  return page(
    entity.name,
    `<main class="entity">
      <a class="back" href="/">← isnotreal.click</a>
      <p class="eyebrow">${escapeHtml(entity.kind)}</p>
      <h1>${escapeHtml(entity.name)}</h1>
      <section><h2>Why this appears</h2>${reasons}</section>
      <section class="correction"><h2>Something wrong?</h2><p>Evidence can change. Use the public submission endpoint or correction flow to flag an incorrect identifier, changed position, or missing context.</p></section>
    </main>`,
  );
}

function renderHowItWorksPage(): string {
  return page(
    'How it works',
    `<main class="entity"><a class="back" href="/">← isnotreal.click</a><p class="eyebrow">How it works</p><h1>Small local lists. Full public receipts.</h1>
    <section><h2>1. Pick causes</h2><p>Causes are independent. You can enable only the subjects and specific reason types you care about.</p></section>
    <section><h2>2. The extension matches locally</h2><p>Compact publications contain stable identifiers, entity IDs and reason codes. Evidence pages remain on the website instead of bloating the browser database.</p></section>
    <section><h2>3. Choose the behavior</h2><p>Hide matching content, replace it with an explanation banner, or reveal an individual item. Domain blocking can offer reviewed alternatives without loading the blocked site first.</p></section>
    <section><h2>4. Inspect the evidence</h2><p>Entity pages show the specific reasons and sources behind a match. Corrections and changed positions can be submitted for review.</p></section></main>`,
  );
}

function renderPrivacyPage(): string {
  return page(
    'Privacy',
    `<main class="entity"><a class="back" href="/">← isnotreal.click</a><p class="eyebrow">Privacy</p><h1>Filtering preferences stay local by default.</h1><p>The extension architecture is designed so routine account matching happens against locally stored cause publications. Cause selections and encountered accounts do not need to be transmitted for ordinary filtering.</p><p>Opening an evidence page, submitting a correction, or requesting server-hosted content necessarily makes a normal web request to isnotreal.click.</p></main>`,
  );
}

function causeCard(title: string, body: string): string {
  return `<article class="cause"><span>Optional cause</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></article>`;
}

function notFound(): WebRouteResult {
  return {
    kind: 'html',
    status: 404,
    html: page(
      'Not found',
      '<main class="entity"><a class="back" href="/">← isnotreal.click</a><h1>That page is not real.</h1><p>The URL did not resolve to a published entity or page.</p></main>',
    ),
  };
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b0b0d"><title>${escapeHtml(title)}</title><meta name="description" content="Choose what reaches you. Source-backed browser filtering with local cause controls."><style>${styles}</style></head><body><header><a class="brand" href="/">is<span>not</span>real.click</a><nav><a href="/how-it-works">How it works</a><a href="/privacy">Privacy</a></nav></header>${body}<footer><strong>isnotreal.click</strong><span>Local choices. Public evidence.</span></footer></body></html>`;
}

const styles = `
:root{color-scheme:dark;--bg:#0b0b0d;--panel:#151519;--text:#f5f2ea;--muted:#aaa7a0;--line:#2c2c32;--hot:#ff4d67;--gold:#f5c451;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 70% -10%,#2a1820 0,transparent 34rem),var(--bg);color:var(--text)}a{color:inherit}header,footer,main{width:min(1120px,calc(100% - 40px));margin:auto}header{height:76px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}header nav{display:flex;gap:24px}header nav a,.back{color:var(--muted);text-decoration:none}.brand{font-weight:900;letter-spacing:-.04em;text-decoration:none;font-size:1.2rem}.brand span{color:var(--hot)}.hero{padding:10vw 0 7vw;max-width:900px}.eyebrow{text-transform:uppercase;letter-spacing:.16em;color:var(--gold);font-size:.75rem;font-weight:800}.hero h1,.entity h1{font-size:clamp(3.3rem,9vw,7.5rem);line-height:.88;letter-spacing:-.07em;margin:.2em 0}.hero h1 span{color:var(--hot)}.lede{font-size:clamp(1.1rem,2vw,1.45rem);line-height:1.55;color:var(--muted);max-width:720px}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:32px}.button{padding:14px 20px;border:1px solid var(--line);border-radius:999px;text-decoration:none;font-weight:750}.primary{background:var(--text);color:var(--bg)}.cause-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.cause,.reason,.install,.principles,.entity section{background:linear-gradient(145deg,#18181d,#111114);border:1px solid var(--line);border-radius:22px;padding:28px}.cause span{font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.12em}.cause h2{font-size:1.7rem;margin:.5em 0}.cause p,.install p,.principles p,.entity p{color:var(--muted);line-height:1.6}.install,.principles{margin-top:14px;padding:48px}.install h2,.principles h2,.entity h2{font-size:clamp(1.8rem,4vw,3.2rem);letter-spacing:-.04em}.platforms{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}.platforms span{border:1px solid var(--line);border-radius:999px;padding:9px 14px;color:var(--muted)}.entity{max-width:900px;padding:70px 0}.entity h1{font-size:clamp(3rem,8vw,6rem);margin-bottom:60px}.entity section{margin:14px 0}.reason{margin-top:12px}.reason h3{margin-top:0}.reason a{display:block;color:var(--gold);margin-top:12px;overflow-wrap:anywhere}footer{border-top:1px solid var(--line);margin-top:80px;padding:34px 0 60px;display:flex;justify-content:space-between;color:var(--muted)}@media(max-width:700px){header nav{display:none}.cause-grid{grid-template-columns:1fr}.install,.principles{padding:28px}.hero{padding:80px 0 55px}footer{flex-direction:column;gap:8px}}`;

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
