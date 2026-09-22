# API and HTTP runtime

`src/index.ts` owns public JSON routing and validated report intake. `src/runtime.ts` mounts public HTML/assets, signed publications, the public API and the separately authenticated editor API. `src/request-guard.ts` provides bounded request admission and private coarse metrics. `src/feedback-admin.ts` supplies the inbox/duplicate/revision-safe review routes.

Use `DATABASE_URL` with the restricted public runtime role. Admin requires a separate `ADMIN_DATABASE_URL` and strong bearer token; signing private keys belong only in the publication CLI. Test liveness at `/healthz` and readiness at `/readyz`. `/editor` is a locked shell, not public access to the admin data.

`npm run check` and the real PostgreSQL delivery checks are required before deployment. Browser UI checks run separately through `npm run test:browser` and CI.
