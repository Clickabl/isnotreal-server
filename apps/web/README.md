# Public website and review UI

`src/index.ts` renders the shared public layout, search, download availability, causes/reasons, evidence profiles and alternatives. `src/support.ts` and `src/support-assets.ts` implement the unified report/help/editor workflow. The API runtime mounts these routes and assets with CSP and appropriate cache controls.

Public reports route to authenticated evidence/product/safety inboxes. Editor credentials stay only in tab memory. Browser tests cover receipts, error recovery, review actions, safe rendering, mobile widths and keyboard navigation. Store availability is configured rather than fabricated.
