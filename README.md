# FixBoard

A troubleshooting Q&A board for DevOps/Cloud/SRE/Platform Engineering
students. Posts capture full problem context — environment, logs,
architecture — so answers become a searchable, reusable knowledge base
instead of one-off chat messages.

This is a teaching project with two parts: run it locally with Docker
Compose first to understand the app, then deploy the same app to Kubernetes
(Amazon EKS) to practice the platform-engineering side — storage classes,
IRSA, ingress, secrets management, custom domains. Both paths run the exact
same backend/frontend images; only the infrastructure underneath changes.

## Stack

- **Backend:** Node.js + Express + PostgreSQL ([backend/](backend))
- **Frontend:** React (Vite build), served as a static bundle via Nginx ([frontend/](frontend))
- **Local orchestration:** Docker Compose
- **Kubernetes orchestration:** Amazon EKS, ALB Ingress, EBS (Postgres), EFS (uploads), AWS Secrets Manager

## Table of contents

- [Part 1 — Local development (Docker Compose)](#part-1--local-development-docker-compose)
- [Part 2 — Kubernetes deployment (Amazon EKS)](#part-2--kubernetes-deployment-amazon-eks)
  - [Architecture](#architecture)
  - [Prerequisites](#prerequisites)
  - [Configuration variables](#configuration-variables)
  - [Files, in apply order](#files-in-apply-order)
  - [Secrets (AWS Secrets Manager)](#secrets-aws-secrets-manager)
  - [Custom domain + HTTPS](#custom-domain--https)
  - [Rebuilding and redeploying the frontend](#rebuilding-and-redeploying-the-frontend)
  - [Verifying a deployment](#verifying-a-deployment)
  - [Gotchas hit deploying this](#gotchas-hit-deploying-this-fix-once-know-for-next-time)
  - [Teardown](#teardown)
- [End-to-end flow this was verified against](#end-to-end-flow-this-was-verified-against)

---

## Part 1 — Local development (Docker Compose)

Requirements: Docker + Docker Compose.

```bash
docker compose up --build
```

That's it — no manual setup required. This brings up three services:

| Service    | URL                     | What it is                          |
|------------|--------------------------|--------------------------------------|
| frontend   | http://localhost:8090    | The web app                          |
| backend    | http://localhost:3000    | The API (migrations + seed run automatically on boot) |
| postgres   | localhost:5432           | Database (not needed directly)       |

Open **http://localhost:8090** and log in with a seeded test account:

| Role       | Email                     | Password      |
|------------|----------------------------|---------------|
| Student    | `test@fixboard.dev`        | `password123` |
| Instructor | `instructor@fixboard.dev`  | `password123` |

These are local-only seed accounts with no real data behind them — safe to
publish, and reset every time you run `docker compose down -v`.

To stop everything: `docker compose down`. To also wipe the database and
uploaded files: `docker compose down -v`.

### Configuring it

Defaults are baked into `docker-compose.yml`, so the command above works
with zero configuration. To override anything (ports, credentials, JWT
secret), copy the env file and edit it:

```bash
cp .env.example .env
```

`docker compose` picks up `.env` automatically. See `.env.example` for
every variable.

**Note:** `FRONTEND_PORT` and `POSTGRES_PORT` are read at container
*start* time, but `BACKEND_PORT` is also baked into the frontend's
JavaScript bundle at *build* time (Vite inlines it as the API base URL).
If you change `BACKEND_PORT`, rebuild: `docker compose up --build`.

### Architecture notes

- **File uploads** land on a named Docker volume (`uploads_data`) mounted
  into the backend container at `/app/uploads`, and are served back out
  under `/uploads/*`. The backend only ever treats this as "a writable
  directory it was handed" — swapping it for an EFS-backed PVC at the
  Kubernetes stage is a volume-mount change, not a code change.
- **Soft delete:** instructor deletes (of posts or comments) set a
  `deleted_at` timestamp rather than removing rows. This sidesteps
  cascade edge cases (a deleted comment with replies, a deleted post's
  attachments/notifications) while keeping the FK graph intact. Deleted
  rows are simply filtered out of every read query.
- **Notifications** are a minimal unread-count model, not an inbox: a row
  is written when someone comments on your post (not when you comment on
  your own), the frontend polls `GET /notifications/unread-count` for the
  nav badge, and opening My Posts marks everything read.

### Repo layout

```
backend/    Express API — see backend/README.md for endpoints, schema, local (non-Docker) run instructions
frontend/   React app — see frontend/README.md for local (non-Docker) dev instructions
docker-compose.yml
.env.example
setup.sh / cleanup.sh          EKS cluster + add-on bootstrap and teardown (Part 2)
ns.yml, cfmap.yml, *.yaml       Kubernetes manifests (Part 2)
```

For day-to-day frontend/backend development (hot reload, debugging one
service in isolation) see the README in each subdirectory — Compose is
the "run the whole thing like production" path, not the dev loop.

---

## Part 2 — Kubernetes deployment (Amazon EKS)

FixBoard running on Amazon EKS: an ALB in front of a static frontend and an
Express backend, Postgres on EBS, and shared file uploads on EFS, with
credentials sourced from AWS Secrets Manager and a custom domain over
HTTPS. This documents the manifests in this repo, the order they go on in,
and the infrastructure gaps that had to be closed to make them actually
work — not just the happy path.

### Architecture

```
                   <your-domain> (Route53 alias)
                                 |
                    ALB (fixboard-ingress), :443 + :80->443 redirect
                          ACM cert: <your-domain>
                                 |
                        frontend-service (:80)
                        /              \
              frontend pod          frontend pod
              (nginx: serves         (nginx proxies
               the SPA, and          /api/* -> backend-service,
               proxies /api/*)       stripping the prefix)
                                 |
                        backend-service (:3000, ClusterIP)
                        /              \
              backend pod            backend pod
                    |
              postgres-service (headless) -> postgres-0 (StatefulSet, EBS/gp3)
              fixboard-uploads-pvc (EFS, RWX, mounted by both backend pods)
```

The ALB only ever routes to `frontend-service`. The backend is not exposed
outside the cluster — nginx inside the frontend container reverse-proxies
`/api/*` to `backend-service`, stripping the prefix, because the backend's
own routes (`/auth`, `/posts`, `/tags`, `/notifications`, `/uploads`,
`/health` — see `backend/src/app.js`) have no `/api` prefix of their own,
and `/posts` specifically collides with this SPA's own `/posts/new` and
`/posts/:id` client-side routes. Routing through a distinct `/api/*` prefix
sidesteps that collision entirely. See `frontend/nginx.conf` and
`frontend/Dockerfile` (`VITE_API_URL` build arg, default `/api`).

Secrets aren't static YAML either: `fixboard-db-credentials` and
`fixboard-backend-secrets` are Kubernetes Secrets, but their *content*
comes from AWS Secrets Manager via the Secrets Store CSI Driver, which
syncs the values in on pod mount. See
[Secrets (AWS Secrets Manager)](#secrets-aws-secrets-manager) below.

### Prerequisites

`setup.sh` in this directory bootstraps most of this on a fresh cluster
(cluster + node group, OIDC, core add-ons, AWS Load Balancer Controller,
EFS CSI + StorageClass, EBS CSI + StorageClass, and a readiness checklist)
— read it before running it, and edit the config block at the top
(`CLUSTER_NAME`, `REGION`, node sizing) for your own AWS account.
`cleanup.sh` tears the same things down in reverse order.

Beyond what `setup.sh` covers, this deployment also needs:

| Component | How it's set up |
|---|---|
| ECR repos `fixboard-backend`, `fixboard-frontend` | `aws ecr create-repository` |
| Secrets Store CSI Driver + AWS provider | Helm (`secrets-store-csi-driver`, `syncSecret.enabled=true`, `tokenRequests[0].audience=sts.amazonaws.com`) + `kubectl apply` of the AWS provider DaemonSet — see [Secrets](#secrets-aws-secrets-manager) |
| `fixboard-secrets-sa` IRSA service account | `eksctl create iamserviceaccount`, namespace `fixboard`, an IAM policy scoped to just the two secret ARNs below (not a blanket `secretsmanager:*`) |
| ACM certificate for your domain | `aws acm request-certificate` (DNS validation) — see [Custom domain + HTTPS](#custom-domain--https) |
| Route53 alias record | your subdomain → the ALB, in your hosted zone |

### Configuration variables

Every command below uses these — set them once for your own AWS account
and domain before following along:

```bash
export CLUSTER_NAME="ridgeline-fixboard"     # must match setup.sh
export REGION="us-east-1"
export ACCOUNT_ID="<your-aws-account-id>"     # aws sts get-caller-identity
export DOMAIN="fixboard.<your-domain.tld>"    # a subdomain you control in Route53
export HOSTED_ZONE_ID="<your-route53-hosted-zone-id>"   # aws route53 list-hosted-zones
```

### Files, in apply order

| # | File | Creates |
|---|---|---|
| 1 | `ns.yml` | `fixboard` namespace |
| 2 | `db-credentials-secretproviderclass.yaml` | `SecretProviderClass/fixboard-db-credentials-spc` — syncs `Secret/fixboard-db-credentials` from Secrets Manager |
| 3 | `backend-secrets-secretproviderclass.yaml` | `SecretProviderClass/fixboard-backend-secrets-spc` — syncs `Secret/fixboard-backend-secrets` from Secrets Manager |
| 4 | `cfmap.yml` | `ConfigMap/fixboard-backend-config` (`NODE_ENV`, `PORT`, `UPLOADS_DIR`, `JWT_EXPIRES_IN`) |
| 5 | `storage-class-gp3.yaml` | `StorageClass/gp3` for Postgres's volume |
| 6 | `postgres-statefulset.yaml` | `StatefulSet/postgres` (1 replica, EBS-backed) |
| 7 | `postgres-service.yaml` | headless `Service/postgres-service` |
| 8 | `uploads-pvc.yaml` | `PersistentVolumeClaim/fixboard-uploads-pvc` (EFS, RWX) |
| 9 | `backend-deployment.yaml` | `Deployment/backend` (2 replicas) |
| 10 | `backend-service.yaml` | `Service/backend-service` (ClusterIP, internal only) |
| 11 | `frontend-deployment.yaml` | `Deployment/frontend` (2 replicas) |
| 12 | `frontend-service.yaml` | `Service/frontend-service` |
| 13 | `fixboard-ingress.yaml` | `Ingress/fixboard-ingress` → provisions the ALB, host `$DOMAIN`, HTTP→HTTPS redirect |

`storage-class-efs.yaml` is not in this list — it's applied once as part of
cluster setup (`setup.sh`), not per-deployment; re-applying it fails if its
`fileSystemId` doesn't match the cluster's existing `efs-sc` exactly
(`StorageClass.parameters` are immutable after creation).

The `SecretProviderClass` objects (items 2–3) don't create the Kubernetes
Secret by themselves — the Secret only appears once a pod that references
it in both `envFrom` *and* a CSI volume mount actually starts (see
`postgres-statefulset.yaml` / `backend-deployment.yaml`, and the Secrets
section below). Apply them before the workloads that mount them regardless,
so the sync happens on first pod start rather than requiring a restart.

**Before applying `backend-deployment.yaml` / `frontend-deployment.yaml`**,
replace the placeholder image references with your own ECR repo
(`$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/fixboard-backend:v1` etc.), and
in `fixboard-ingress.yaml` replace the placeholder `host` and
`certificate-arn` with your own domain and ACM certificate ARN.

```bash
kubectl apply -f ns.yml
kubectl apply -f db-credentials-secretproviderclass.yaml
kubectl apply -f backend-secrets-secretproviderclass.yaml
kubectl apply -f cfmap.yml
kubectl apply -f storage-class-gp3.yaml
kubectl apply -f postgres-statefulset.yaml
kubectl apply -f postgres-service.yaml
kubectl apply -f uploads-pvc.yaml
kubectl apply -f backend-deployment.yaml
kubectl apply -f backend-service.yaml
kubectl apply -f frontend-deployment.yaml
kubectl apply -f frontend-service.yaml
kubectl apply -f fixboard-ingress.yaml
```

### Secrets (AWS Secrets Manager)

Credentials live in AWS Secrets Manager, not in YAML:

- `fixboard/db-credentials` — `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `fixboard/backend-secrets` — `JWT_SECRET`, `DATABASE_URL` (the password inside
  `DATABASE_URL` must match `POSTGRES_PASSWORD` above — update both together)

```bash
aws secretsmanager create-secret --name fixboard/db-credentials --region "$REGION" \
  --secret-string '{"POSTGRES_USER":"fixboard","POSTGRES_PASSWORD":"<choose-a-strong-password>","POSTGRES_DB":"fixboard"}'

aws secretsmanager create-secret --name fixboard/backend-secrets --region "$REGION" \
  --secret-string '{"JWT_SECRET":"<generate-with-openssl-rand-base64-32>","DATABASE_URL":"postgres://fixboard:<same-password-as-above>@postgres-service.fixboard.svc.cluster.local:5432/fixboard"}'
```

The **Secrets Store CSI Driver** (Helm, `syncSecret.enabled=true`) plus its
**AWS provider** (DaemonSet) read these via the `fixboard-secrets-sa` IRSA
service account (a policy scoped to just these two secret ARNs — not a
blanket `secretsmanager:*`). Each `SecretProviderClass`'s `secretObjects`
block tells the driver to also materialize a same-named, same-shape
Kubernetes `Secret` — so `postgres-statefulset.yaml` and
`backend-deployment.yaml` still consume config via ordinary
`envFrom: secretRef`, unchanged from a plain-YAML-Secret setup. What's
different is *only* the pod spec: each has `serviceAccountName:
fixboard-secrets-sa` and an extra CSI volume mount (`/mnt/secrets-store`,
unused by the app — its only job is to trigger the sync).

Install the driver + provider once per cluster:

```bash
helm repo add secrets-store-csi-driver https://kubernetes-sigs.github.io/secrets-store-csi-driver/charts
helm upgrade --install csi-secrets-store secrets-store-csi-driver/secrets-store-csi-driver \
  --namespace kube-system \
  --set syncSecret.enabled=true \
  --set "tokenRequests[0].audience=sts.amazonaws.com"   # required — see Gotcha 4

kubectl apply -f https://raw.githubusercontent.com/aws/secrets-store-csi-driver-provider-aws/main/deployment/aws-provider-installer.yaml
```

Then the IRSA service account, scoped to just the two secrets:

```bash
DB_ARN=$(aws secretsmanager describe-secret --secret-id fixboard/db-credentials --region "$REGION" --query ARN --output text)
BACKEND_ARN=$(aws secretsmanager describe-secret --secret-id fixboard/backend-secrets --region "$REGION" --query ARN --output text)

aws iam create-policy --policy-name fixboard-secrets-manager-read --policy-document "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Effect\": \"Allow\",
    \"Action\": [\"secretsmanager:GetSecretValue\", \"secretsmanager:DescribeSecret\"],
    \"Resource\": [\"$DB_ARN\", \"$BACKEND_ARN\"]
  }]
}"

eksctl create iamserviceaccount \
  --cluster "$CLUSTER_NAME" --region "$REGION" \
  --namespace fixboard --name fixboard-secrets-sa \
  --attach-policy-arn "arn:aws:iam::$ACCOUNT_ID:policy/fixboard-secrets-manager-read" \
  --approve
```

**To rotate/update a secret:** update the value in Secrets Manager
(`aws secretsmanager put-secret-value`), then either wait for the driver's
poll interval or force an immediate resync with
`kubectl rollout restart deployment/backend statefulset/postgres -n fixboard`.
The synced `Secret` objects are labeled
`secrets-store.csi.k8s.io/managed: "true"` — don't hand-edit them, and
don't `kubectl apply` a static Secret with the same name; it'll fight with
the driver's sync.

### Custom domain + HTTPS

`fixboard-ingress.yaml` sets:

- `spec.rules[0].host: $DOMAIN`
- `alb.ingress.kubernetes.io/listen-ports: '[{"HTTP":80},{"HTTPS":443}]'`
- `alb.ingress.kubernetes.io/certificate-arn` — the ACM cert ARN for `$DOMAIN`
- `alb.ingress.kubernetes.io/ssl-redirect: "443"` — makes the Load Balancer
  Controller add a redirect action on the :80 listener instead of serving
  plaintext there

One-time setup, not re-run by any manifest here:

```bash
# 1. Request the cert (DNS validation)
CERT_ARN=$(aws acm request-certificate --domain-name "$DOMAIN" \
  --validation-method DNS --region "$REGION" --query CertificateArn --output text)

# 2. Add the CNAME validation record ACM gives you to your hosted zone
RECORD=$(aws acm describe-certificate --certificate-arn "$CERT_ARN" --region "$REGION" \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord')
# ... create that CNAME in $HOSTED_ZONE_ID via `aws route53 change-resource-record-sets` ...
aws acm wait certificate-validated --certificate-arn "$CERT_ARN" --region "$REGION"

# 3. Point the domain at the ALB (alias record, not CNAME — Route53-specific,
#    no extra DNS lookup at request time). Needs the ALB's own hosted-zone ID,
#    not your Route53 zone ID:
ALB_DNS=$(kubectl get ingress fixboard-ingress -n fixboard -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
aws elbv2 describe-load-balancers --region "$REGION" \
  --query "LoadBalancers[?DNSName=='$ALB_DNS'].CanonicalHostedZoneId"
# ... create an alias A record for $DOMAIN -> $ALB_DNS using that hosted-zone ID,
#     in $HOSTED_ZONE_ID, via `aws route53 change-resource-record-sets` ...
```

If the ALB is ever deleted and recreated (e.g. by deleting and reapplying
the Ingress), the alias record must be repointed at the new ALB's DNS name
— it isn't stable across Ingress recreation.

### Rebuilding and redeploying the frontend

```bash
aws ecr get-login-password --region "$REGION" | \
  docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

docker build -t "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/fixboard-frontend:v2" ./frontend
docker push "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/fixboard-frontend:v2"
```

Then bump the tag in `frontend-deployment.yaml` and `kubectl apply` it —
don't just re-push the same tag. `imagePullPolicy` isn't set (defaults to
`IfNotPresent`), so a node that already pulled `v1` won't notice a
same-tag repush; a new tag forces a real pull. `kubectl rollout status
deployment/frontend -n fixboard` confirms the new pods are up before you
test.

### Verifying a deployment

```bash
kubectl get pods -n fixboard                       # everything 1/1 Running
kubectl get pvc -n fixboard                         # both Bound
kubectl get ingress fixboard-ingress -n fixboard     # ADDRESS populated (~2-3 min after apply)
kubectl get secret fixboard-db-credentials -n fixboard -o jsonpath='{.metadata.labels}'
                                                     # secrets-store.csi.k8s.io/managed: "true"

curl "https://$DOMAIN/"                             # 200, the SPA
curl "https://$DOMAIN/api/health"                   # {"ok":true} — proves the nginx proxy reaches the backend
curl -I "http://$DOMAIN/"                           # 301 -> https://$DOMAIN:443/
```

If `/api/health` returns the SPA's `index.html` instead of JSON, the
running frontend image predates the `/api` proxy fix — see the rebuild
steps above. If a pod mounting a `SecretProviderClass` is stuck in
`ContainerCreating`, check `kubectl describe pod` for `FailedMount` —
see Gotcha 4.

### Gotchas hit deploying this (fix once, know for next time)

1. **EBS CSI driver isn't installed by default.** Without it, `gp3` has no
   provisioner and Postgres's PVC sits `Pending` forever. `setup.sh`
   installs it, but if you're doing this by hand:
   ```bash
   eksctl create iamserviceaccount \
     --cluster "$CLUSTER_NAME" --namespace kube-system \
     --name ebs-csi-controller-sa \
     --attach-policy-arn arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy \
     --approve

   aws eks create-addon --cluster-name "$CLUSTER_NAME" \
     --addon-name aws-ebs-csi-driver \
     --service-account-role-arn <role-arn-from-the-stack-above> \
     --resolve-conflicts OVERWRITE
   ```
   Use `--resolve-conflicts OVERWRITE` — the addon and the standalone
   `iamserviceaccount` both try to own the same `ServiceAccount` object,
   and the addon fails with `ConfigurationConflict` otherwise.

2. **EFS mount target security group blocked NFS from the nodes.** The
   `efs-sc` PVC would bind, but pods mounting it (`uploads-pvc.yaml`) hung
   on `FailedMount: DeadlineExceeded`. The EFS mount targets' security
   group only allowed traffic from itself — nothing opened port 2049 to
   the EKS cluster security group. `setup.sh` opens this automatically now;
   if doing it by hand:
   ```bash
   aws ec2 authorize-security-group-ingress \
     --group-id <efs-mount-target-sg> \
     --protocol tcp --port 2049 \
     --source-group <eks-cluster-sg>
   ```
   Check both IDs with `aws efs describe-mount-targets` /
   `aws eks describe-cluster --query cluster.resourcesVpcConfig.clusterSecurityGroupId`
   before assuming they're already open.

3. **The frontend's API base URL is baked in at image build time**
   (`VITE_API_URL`, Vite). An image built without the fix has it hardcoded
   to `http://localhost:3000` with no `/api` proxy in `nginx.conf`, so the
   ALB serves the SPA but every API call the browser makes 404s/CORS-fails.
   `frontend/Dockerfile` defaults `VITE_API_URL=/api`, and
   `frontend/nginx.conf` proxies `/api/` to `backend-service`. **Any
   change to `frontend/nginx.conf` or the `VITE_API_URL` build arg
   requires rebuilding and repushing the image** — editing the YAML alone
   does nothing, since it's baked into the image.

4. **Secrets Store CSI Driver's default Helm install can't authenticate to
   AWS.** Pods mounting a `SecretProviderClass` fail with `FailedMount:
   CSI token error: serviceAccount.tokens not provided - ensure
   tokenRequests is configured in CSIDriver spec`. The driver needs a
   projected service-account token scoped to `sts.amazonaws.com` to do
   IRSA's `AssumeRoleWithWebIdentity`, and the chart doesn't set that by
   default — the install command above already includes the fix
   (`tokenRequests[0].audience=sts.amazonaws.com`). If you installed
   without it, this field is mutable in place, no reinstall needed:
   ```bash
   helm upgrade csi-secrets-store secrets-store-csi-driver/secrets-store-csi-driver \
     -n kube-system --reuse-values \
     --set "tokenRequests[0].audience=sts.amazonaws.com"
   ```
   Pods already stuck on `FailedMount` recover on their own once this
   lands — no need to delete/recreate them.

### Teardown

```bash
kubectl delete -f fixboard-ingress.yaml
kubectl delete -f frontend-service.yaml -f frontend-deployment.yaml
kubectl delete -f backend-service.yaml -f backend-deployment.yaml
kubectl delete -f uploads-pvc.yaml
kubectl delete -f postgres-service.yaml -f postgres-statefulset.yaml
kubectl delete -f storage-class-gp3.yaml
kubectl delete -f cfmap.yml
kubectl delete -f backend-secrets-secretproviderclass.yaml -f db-credentials-secretproviderclass.yaml
kubectl delete -f ns.yml
```

The ALB, EBS volume, and EFS access point are AWS resources the relevant
controllers clean up in response to the deletes above — give the Ingress
delete a minute before deleting anything else, so the Load Balancer
Controller has a chance to deprovision the ALB itself rather than leaving
it orphaned. The Route53 alias record for `$DOMAIN` does *not* get cleaned
up automatically — if the ALB is gone, that record points at a dead target
until you delete it or repoint it manually. The ACM certificate, the
`fixboard-secrets-manager-read` IAM policy, the two Secrets Manager
entries, and the `fixboard-secrets-sa` / EBS / EFS IRSA roles are
account-level resources outside this namespace's teardown — remove them
separately if you're decommissioning the whole app, not just the
namespace. Run `cleanup.sh` afterward to tear down the cluster itself.

---

## End-to-end flow this was verified against

Signup (student) → browse dashboard → filter by tag → create a post with
an architecture image and a log file → a second student comments on it →
original poster sees an unread badge on My Posts → opens the post, marks
a comment as the solution → an instructor deletes a test post and a test
comment. Verified both locally (Docker Compose) and on EKS (custom domain
over HTTPS, secrets from Secrets Manager).
