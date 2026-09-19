# Deploying setjeka-erp

Production stack: `postgres` + `backend` (NestJS) + `frontend` (Next.js
standalone) + `nginx` (TLS termination + reverse proxy), orchestrated by
`docker-compose.prod.yml` at the repo root. No domain yet — nginx serves a
self-signed cert over the VPS's raw IP.

## First-time setup on a fresh host

```bash
# 1. Get the code onto the host (see the repo root for how — git clone once
#    a remote is pushed, or scp/rsync in the meantime).
cd /opt/setjeka-erp

# 2. Environment
cp deploy/.env.example .env
# edit .env: set POSTGRES_PASSWORD, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
# FRONTEND_ORIGIN (the https://<ip-or-domain> nginx will serve on)

# 3. Self-signed TLS cert (see deploy/nginx.conf's header comment for why
#    nginx terminates TLS directly rather than a Caddy proxy in front of it)
mkdir -p deploy/certs
openssl req -x509 -newkey rsa:2048 -keyout deploy/certs/site.key \
  -out deploy/certs/site.crt -days 3650 -nodes -subj "/CN=<VPS_IP_or_domain>"

# 4. Build and start
docker compose -f docker-compose.prod.yml up -d --build

# 5. Migrations run automatically on backend container start (see
#    backend/Dockerfile's CMD) — confirm with:
docker compose -f docker-compose.prod.yml logs backend | grep -i migrat

# 6. Seed the admin account (one-off — there's no self-registration)
docker compose -f docker-compose.prod.yml exec backend sh -c \
  "SEED_ADMIN_PASSWORD='<choose-a-password>' npx tsx prisma/seed.ts"
```

Then visit `https://<vps-ip>` (the browser will warn about the self-signed
cert — expected until a real domain + Let's Encrypt cert replaces it).

## Redeploying after a code change

```bash
git pull   # once a remote exists
docker compose -f docker-compose.prod.yml up -d --build
```

`backend`'s container re-runs `prisma migrate deploy` on every start — safe
and idempotent (applies only pending migrations).

## Notes

- Compliance document uploads persist in the `vendor_documents` named
  volume (mounted at `/data/vendor-documents` in the backend container),
  not in the image — they survive rebuilds/redeploys.
- `NEXT_PUBLIC_API_URL` is baked into the frontend at **build** time (Next
  inlines `NEXT_PUBLIC_*` vars into the client bundle) as `/api` — matching
  nginx's `/api/` → `backend:4000` proxy rule. If nginx's routing ever
  changes, the frontend image needs a rebuild, not just a restart.
- SharePoint sync for compliance documents is not built yet — needs an
  Azure AD app registration (tenant/client id+secret, target site+drive)
  before it can be added; local disk storage (above) is the only backing
  store today.
