# API composition root

The Node API runtime is implemented here. It exposes health/readiness, public cause/search/entity/reason/alternative/submission APIs, immutable signed publication artifacts, the public website, and an optional bearer-authenticated editor API backed by a separate editor-role database connection.

Operational controls include bounded JSON bodies, request timeouts, application concurrency backpressure, public submission throttling and no-store admin responses. Nginx/CDN/firewall controls remain the Internet perimeter.

CLI entry points also live here for migrations, publication, reason-catalog publication, source capture/watch and the trusted CCFP import.
