# Incident response and rollback

## First actions

1. Preserve evidence and timestamps. Do not paste secrets into tickets/chat.
2. Decide whether the incident affects availability, data integrity, publication signing, admin access, source capture or user privacy.
3. If integrity is uncertain, stop new publications/import commits before trying to repair them.
4. Rotate the smallest affected credential/key and document the old/new boundary.

## Bad dataset publication

- stop the publisher;
- keep the previous verified artifact available;
- correct or roll back the underlying decision/import;
- publish a new higher sequence/version;
- verify clients reject replay and activate the corrected signed dataset.

## Publication signing-key compromise

- stop publishing immediately;
- revoke the compromised private key from the publisher;
- if clients do not already trust a replacement public key, ship a reviewed extension update containing the new trust key before resuming publication;
- republish clean artifacts under the replacement key;
- investigate access to historical private-key material.

## Database incident

- restrict write/admin paths at the edge;
- take a forensic backup if safe;
- restore into a separate empty target first with `ops/restore-db.sh`;
- run migrations/readiness/integrity checks before switching traffic.

## Admin credential compromise

- rotate `ADMIN_BEARER_TOKEN`;
- rotate the editor DB credential if it may have been exposed;
- review `review_events`, import events and publication history for unauthorized changes;
- keep admin routes network-restricted in addition to bearer auth.

## Abuse / DDoS

- use CDN/WAF/origin firewall controls first; the Node process is not the perimeter;
- preserve the public read path where possible while throttling public writes/admin separately;
- watch 429/503, DB saturation and disk;
- do not enable invasive per-user tracking as an emergency shortcut.

## Privacy incident

The normal extension design does not upload passive browsing history or cause selections. If logs or a future feature contain personal data, identify the exact fields, retention window, affected users/contracts and required notification obligations before public statements.

## Post-incident

Record timeline, root cause, affected versions/data, recovery verification, credential rotations, customer notifications, and a concrete prevention test/runbook change.
