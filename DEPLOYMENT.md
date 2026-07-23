# Kubernetes Deployment

FixBoard running on Amazon EKS: an ALB in front of a static frontend and an
Express backend, Postgres on EBS, and shared file uploads on EFS. This
documents the manifests in this directory, the order they go on in, and the
infrastructure gaps that had to be closed to make them actually work — not
just the happy path.

For running the app locally, see [README.md](README.md). This file is the
Kubernetes side only.

## Architecture

```
                fixboard.gamela.shop (Route53 alias)
                                 |
                    ALB (fixboard-ingress), :443 + :80->443 redirect
                       ACM cert: fixboard.gamela.shop
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

Secrets aren't static YAML anymore either: `fixboard-db-credentials` and
`fixboard-backend-secrets` are Kubernetes Secrets, but their *content*
comes from AWS Secrets Manager via the Secrets Store CSI Driver, which
syncs the values in on pod mount. See **Secrets (AWS Secrets Manager)**
below.

## Prerequisites

Already provisioned on this cluster (`ridgeline-fixboard`, `us-east-1`,
account `885684264653`) before any manifest here is applied:

| Component | How it was set up |
|---|---|
| EKS cluster + node group | `eksctl` (outside this repo) |
| ECR repos `fixboard-backend`, `fixboard-frontend` | `aws ecr create-repository` |
| AWS Load Balancer Controller | IRSA + Helm/eksctl, using `iam_policy.json` in this directory |
| EFS filesystem + `efs-sc` StorageClass | `storage-class-efs.yaml`, filesystem `fs-05b1d4e9258731dec` |
| EBS CSI driver | `eksctl create iamserviceaccount` + `eksctl create addon aws-ebs-csi-driver` — **not installed by default**, required before `storage-class-gp3.yaml` / Postgres will provision (see Gotchas below) |
| Secrets Store CSI Driver + AWS provider | Helm (`secrets-store-csi-driver`, `syncSecret.enabled=true`, `tokenRequests[0].audience=sts.amazonaws.com`) + `kubectl apply` of the AWS provider DaemonSet — see **Secrets (AWS Secrets Manager)** below |
| `fixboard-secrets-sa` IRSA service account | `eksctl create iamserviceaccount`, namespace `fixboard`, policy `fixboard-secrets-manager-read` (scoped to the two secret ARNs only) |
| ACM certificate for `fixboard.gamela.shop` | `aws acm request-certificate` (DNS validation) — see **Custom domain + HTTPS** below |
| Route53 alias record | `fixboard.gamela.shop` → the ALB, in hosted zone `gamela.shop` (`Z03996152YWWZCAOXW900`) |

## Files, in apply order

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
| 13 | `fixboard-ingress.yaml` | `Ingress/fixboard-ingress` → provisions the ALB, host `fixboard.gamela.shop`, HTTP→HTTPS redirect |

`storage-class-efs.yaml` is not in this list — it's applied once as part of
cluster setup, not per-deployment; re-applying it fails if its
`fileSystemId` doesn't match the cluster's existing `efs-sc` exactly
(`StorageClass.parameters` are immutable after creation).

The `SecretProviderClass` objects (items 2–3) don't create the Kubernetes
Secret by themselves — the Secret only appears once a pod that references
it in both `envFrom` *and* a CSI volume mount actually starts (see
`postgres-statefulset.yaml` / `backend-deployment.yaml`, and the Secrets
section below). Apply them before the workloads that mount them regardless,
so the sync happens on first pod start rather than requiring a restart.

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

## Secrets (AWS Secrets Manager)

Credentials live in AWS Secrets Manager, not in YAML:

- `fixboard/db-credentials` — `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `fixboard/backend-secrets` — `JWT_SECRET`, `DATABASE_URL` (the password inside
  `DATABASE_URL` must match `POSTGRES_PASSWORD` above — update both together)

The **Secrets Store CSI Driver** (Helm, `syncSecret.enabled=true`) plus its
**AWS provider** (DaemonSet) read these via the `fixboard-secrets-sa` IRSA
service account (policy `fixboard-secrets-manager-read`, scoped to just
these two secret ARNs — not a blanket `secretsmanager:*`). Each
`SecretProviderClass`'s `secretObjects` block tells the driver to also
materialize a same-named, same-shape Kubernetes `Secret` — so
`postgres-statefulset.yaml` and `backend-deployment.yaml` still consume
config via ordinary `envFrom: secretRef`, unchanged from before. What
changed is *only* the pod spec: each now has `serviceAccountName:
fixboard-secrets-sa` and an extra CSI volume mount (`/mnt/secrets-store`,
unused by the app — its only job is to trigger the sync).

**To rotate/update a secret:** update the value in Secrets Manager
(`aws secretsmanager put-secret-value`), then either wait for the driver's
poll interval or force an immediate resync with
`kubectl rollout restart deployment/backend statefulset/postgres -n fixboard`.
The synced `Secret` objects are labeled
`secrets-store.csi.k8s.io/managed: "true"` — don't hand-edit them, and
don't `kubectl apply` a static Secret with the same name; it'll fight with
the driver's sync.

## Custom domain + HTTPS

`fixboard-ingress.yaml` sets:

- `spec.rules[0].host: fixboard.gamela.shop`
- `alb.ingress.kubernetes.io/listen-ports: '[{"HTTP":80},{"HTTPS":443}]'`
- `alb.ingress.kubernetes.io/certificate-arn` — the ACM cert ARN for `fixboard.gamela.shop`
- `alb.ingress.kubernetes.io/ssl-redirect: "443"` — makes the Load Balancer
  Controller add a redirect action on the :80 listener instead of serving
  plaintext there

One-time setup, not re-run by any manifest here:

```bash
# 1. Request the cert (DNS validation)
aws acm request-certificate --domain-name fixboard.gamela.shop \
  --validation-method DNS --region us-east-1

# 2. Add the CNAME validation record ACM gives you to the gamela.shop zone
#    (aws acm describe-certificate --query DomainValidationOptions), then:
aws acm wait certificate-validated --certificate-arn <arn> --region us-east-1

# 3. Point the domain at the ALB (alias record, not CNAME — Route53-specific,
#    no extra DNS lookup at request time). Needs the ALB's own hosted-zone ID,
#    not the Route53 zone ID:
aws elbv2 describe-load-balancers --query "LoadBalancers[?DNSName=='<alb-dns>'].CanonicalHostedZoneId"
```

Then an `A` record of type alias, target `<alb-dns>`, in hosted zone
`Z03996152YWWZCAOXW900` (`gamela.shop`). If the ALB is ever deleted and
recreated (e.g. by deleting and reapplying the Ingress), the alias record
must be repointed at the new ALB's DNS name — it isn't stable across
Ingress recreation.

## Gotchas hit deploying this (fix once, know for next time)

1. **EBS CSI driver isn't installed by default.** Without it, `gp3` has no
   provisioner and Postgres's PVC sits `Pending` forever. Install it first:
   ```bash
   eksctl create iamserviceaccount \
     --cluster ridgeline-fixboard --namespace kube-system \
     --name ebs-csi-controller-sa \
     --attach-policy-arn arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy \
     --approve

   aws eks create-addon --cluster-name ridgeline-fixboard \
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
   the EKS cluster security group. Fix:
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
   (`VITE_API_URL`, Vite). The image existing in ECR before this fix had
   it hardcoded to `http://localhost:3000` with no `/api` proxy in
   `nginx.conf`, so the ALB would serve the SPA but every API call the
   browser made would 404/CORS-fail. `frontend/Dockerfile` now defaults
   `VITE_API_URL=/api`, and `frontend/nginx.conf` proxies `/api/` to
   `backend-service`. **Any change to `frontend/nginx.conf` or the
   `VITE_API_URL` build arg requires rebuilding and repushing the image** —
   editing the YAML alone does nothing, since it's baked into the image.

4. **Secrets Store CSI Driver's default Helm install can't authenticate to
   AWS.** Pods mounting a `SecretProviderClass` failed with `FailedMount:
   CSI token error: serviceAccount.tokens not provided - ensure
   tokenRequests is configured in CSIDriver spec`. The driver needs a
   projected service-account token scoped to `sts.amazonaws.com` to do
   IRSA's `AssumeRoleWithWebIdentity`, and the chart doesn't set that by
   default. Fix (this field turned out to be mutable in place, no
   reinstall needed):
   ```bash
   helm upgrade csi-secrets-store secrets-store-csi-driver/secrets-store-csi-driver \
     -n kube-system --reuse-values \
     --set "tokenRequests[0].audience=sts.amazonaws.com"
   ```
   Pods already stuck on `FailedMount` recover on their own once this
   lands — no need to delete/recreate them.

## Rebuilding and redeploying the frontend

```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 885684264653.dkr.ecr.us-east-1.amazonaws.com

docker build -t 885684264653.dkr.ecr.us-east-1.amazonaws.com/fixboard-frontend:v2 ./frontend
docker push 885684264653.dkr.ecr.us-east-1.amazonaws.com/fixboard-frontend:v2
```

Then bump the tag in `frontend-deployment.yaml` and `kubectl apply` it —
don't just re-push the same tag. `imagePullPolicy` isn't set (defaults to
`IfNotPresent`), so a node that already pulled `v1` won't notice a
same-tag repush; a new tag forces a real pull. `kubectl rollout status
deployment/frontend -n fixboard` confirms the new pods are up before you
test.

## Verifying a deployment

```bash
kubectl get pods -n fixboard                       # everything 1/1 Running
kubectl get pvc -n fixboard                         # both Bound
kubectl get ingress fixboard-ingress -n fixboard     # ADDRESS populated (~2-3 min after apply)
kubectl get secret fixboard-db-credentials -n fixboard -o jsonpath='{.metadata.labels}'
                                                     # secrets-store.csi.k8s.io/managed: "true"

curl https://fixboard.gamela.shop/                  # 200, the SPA
curl https://fixboard.gamela.shop/api/health        # {"ok":true} — proves the nginx proxy reaches the backend
curl -I http://fixboard.gamela.shop/                # 301 -> https://fixboard.gamela.shop:443/
```

If `/api/health` returns the SPA's `index.html` instead of JSON, the
running frontend image predates the `/api` proxy fix — see the rebuild
steps above. If a pod mounting a `SecretProviderClass` is stuck in
`ContainerCreating`, check `kubectl describe pod` for `FailedMount` —
see Gotcha 4.

## Teardown

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
it orphaned. The Route53 alias record for `fixboard.gamela.shop` does
*not* get cleaned up automatically — if the ALB is gone, that record
points at a dead target until you delete it or repoint it manually. The
ACM certificate, the `fixboard-secrets-manager-read` IAM policy, the two
Secrets Manager entries, and the `fixboard-secrets-sa` / EBS / EFS IRSA
roles are account-level resources outside this namespace's teardown —
remove them separately if you're decommissioning the whole app, not just
the namespace.
