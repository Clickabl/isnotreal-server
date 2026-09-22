import { submissionCatalog } from '@isnotreal/application';
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
export function feedbackBody(
  query: Readonly<Record<string, string | undefined>>,
  reasons: readonly { code: string; label: string }[],
): string {
  const id = /^[1-9]\d{0,19}$/.test(query.entity ?? '') ? query.entity! : '';
  const type = submissionCatalog.some((item) => item.code === query.type)
    ? query.type!
    : 'incorrect-information';
  return `<p class="eyebrow">One place to be heard</p><h1>Feedback & corrections.</h1><p class="lede">Evidence corrections go to the evidence inbox, product issues to the product inbox, and abuse or privacy concerns to the safety inbox. Every submission receives a reference. Nothing publishes automatically.</p>
  <form data-feedback-form class="card" aria-describedby="feedback-privacy">
  <label for="report-type">What do you need help with?</label><select id="report-type" name="submissionType">${submissionCatalog.map((item) => `<option value="${item.code}" data-queue="${item.queue}" data-help="${escape(item.help)}"${item.code === type ? ' selected' : ''}>${escape(item.label)}</option>`).join('')}</select><p id="category-help" class="muted" aria-live="polite"></p>
  <div class="grid"><div><label for="report-entity">Entity ID <span class="muted">(optional)</span></label><input id="report-entity" name="entityPublicId" inputmode="numeric" pattern="[1-9][0-9]{0,19}" maxlength="20" value="${id}" aria-describedby="entity-help"><small id="entity-help">Use the reference on an evidence page. Leave blank for general feedback.</small></div>
  <div><label for="report-reason">Reason <span class="muted">(optional)</span></label><select id="report-reason" name="proposedReasonCode"><option value="">Let the editor classify it</option>${reasons.map((reason) => `<option value="${escape(reason.code)}">${escape(reason.code + ' · ' + reason.label)}</option>`).join('')}</select></div></div>
  <label for="report-message">What should we know?</label><textarea id="report-message" name="narrative" minlength="3" maxlength="10000" rows="7" required aria-describedby="feedback-privacy"></textarea>
  <label for="report-sources">Public source links <span class="muted">(optional, one per line)</span></label><textarea id="report-sources" name="sources" maxlength="45000" rows="4" placeholder="https://…" aria-describedby="sources-help"></textarea><small id="sources-help">Up to 20 HTTP(S) links. The form does not download or open these links.</small>
  <p id="feedback-privacy" class="notice">Do not include passwords, API keys, private addresses, victims’ identities or material hidden by redactions. Reports are visible to authorized editors, not published as comments.</p>
  <button type="submit" class="primary">Send for review</button><p data-form-status role="status" aria-live="polite" tabindex="-1"></p><noscript>JavaScript is required to send this form. Public evidence pages remain readable without it.</noscript>
  </form><script src="/assets/feedback.js" defer></script>`;
}
export function editorBody(): string {
  return `<p class="eyebrow">Authorized editors only</p><h1>Review workspace.</h1><p class="lede">Review reports, inspect import exceptions and check publication blockers. Your access token stays in this tab’s memory and is cleared when you lock, reload or leave.</p>
  <section data-editor-root aria-label="Editor workspace"><form data-editor-login class="card"><label for="editor-token">Editor access token</label><input id="editor-token" name="token" type="password" minlength="32" autocomplete="off" spellcheck="false" required aria-describedby="editor-security"><p id="editor-security">Never paste database credentials or a publication signing key here. Use the scoped editor token configured on your server.</p><button class="primary">Unlock workspace</button></form></section>
  <p data-editor-status role="status" aria-live="polite" tabindex="-1"></p><script src="/assets/editor.js" defer></script>`;
}
export function helpBody(): string {
  return `<p class="eyebrow">Help</p><h1>Know what the extension is doing.</h1><div class="grid"><section class="card"><h2>Nothing is filtered</h2><p>Check that filtering, at least one cause, and specific reasons are enabled. Grant website permission and check the dataset’s last successful update. An empty or expired cache is not complete coverage.</p><a href="/download">Installation and updates</a></section><section class="card"><h2>A match is wrong</h2><p>Open the evidence page, then use Feedback & corrections. Include the public account or source only when relevant. A matching name alone is not reliable identity evidence.</p><a href="/report?type=wrong-identifier">Report an identity mismatch</a></section><section class="card"><h2>A website will not open</h2><p>The block page offers a temporary exact-site exception, a remembered exception, and reviewed alternatives. Remembered choices can be removed in extension settings.</p><a href="/report?type=bug-report">Report a technical issue</a></section><section class="card"><h2>Privacy or accessibility</h2><p>Use the same review form for private-information exposure, abuse or an accessibility barrier. Avoid repeating the sensitive information itself.</p><a href="/report?type=abuse-report">Contact the safety inbox</a><br><a href="/report?type=accessibility-feedback">Report an accessibility barrier</a></section></div>`;
}
