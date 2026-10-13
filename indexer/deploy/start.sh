#!/bin/sh
# Maps Fly's DATABASE_URL (from `fly postgres attach`) to Envio's ENVIO_PG_* vars. Never echoes values.
set -e
eval "$(node -e '
const u = new URL(process.env.DATABASE_URL);
const q = (s) => "'"'"'" + String(s).replace(/'"'"'/g, "'"'"'\\'"'"''"'"'") + "'"'"'";
process.stdout.write([
  "export ENVIO_PG_HOST=" + q(u.hostname.replace(/^\[|\]$/g, "")),
  "export ENVIO_PG_PORT=" + q(u.port || "5432"),
  "export ENVIO_PG_USER=" + q(decodeURIComponent(u.username)),
  "export ENVIO_PG_PASSWORD=" + q(decodeURIComponent(u.password)),
  "export ENVIO_PG_DATABASE=" + q(u.pathname.slice(1).split("?")[0]),
].join("\n"));
')"
exec pnpm envio start
