#!/usr/bin/env bash
set -euo pipefail

# =====================================================================
# EKS Cluster Setup — Ridgeline SRE Lab
# Phases: 0) Cluster  1) OIDC  2) Add-ons  3) LB Controller
#         4) EFS CSI + StorageClass  5) EBS CSI + StorageClass
#         6) Readiness checklist
# =====================================================================

# ---- Config (edit these) -------------------------------------------
CLUSTER_NAME="ridgeline-fixboard"
REGION="us-east-1"
K8S_VERSION="1.30"
NODE_TYPE="t3.medium"
NODE_MIN=2
NODE_MAX=4
NODE_DESIRED=2
EFS_FS_NAME="${CLUSTER_NAME}-efs"
# ----------------------------------------------------------------------

echo "==> Phase 0: Creating EKS cluster (${CLUSTER_NAME})"
eksctl create cluster \
  --name "${CLUSTER_NAME}" \
  --region "${REGION}" \
  --version "${K8S_VERSION}" \
  --nodegroup-name "${CLUSTER_NAME}-ng" \
  --node-type "${NODE_TYPE}" \
  --nodes "${NODE_DESIRED}" \
  --nodes-min "${NODE_MIN}" \
  --nodes-max "${NODE_MAX}" \
  --with-oidc \
  --managed

echo "==> Updating kubeconfig"
aws eks update-kubeconfig --name "${CLUSTER_NAME}" --region "${REGION}"

echo "==> Phase 1: Verifying OIDC provider association"
OIDC_URL=$(aws eks describe-cluster --name "${CLUSTER_NAME}" --region "${REGION}" \
  --query "cluster.identity.oidc.issuer" --output text)
echo "  OIDC issuer: ${OIDC_URL}"

OIDC_ID=$(echo "${OIDC_URL}" | sed 's|https://||')
EXISTING=$(aws iam list-open-id-connect-providers \
  --query "OpenIDConnectProviderList[?contains(Arn, '${OIDC_ID}')].Arn" --output text)

if [ -z "${EXISTING}" ]; then
  echo "  OIDC provider not found — associating now"
  eksctl utils associate-iam-oidc-provider --cluster "${CLUSTER_NAME}" --region "${REGION}" --approve
else
  echo "  OIDC provider already associated: ${EXISTING}"
fi

echo "==> Phase 2: Confirming core add-ons (vpc-cni, kube-proxy, coredns)"
for ADDON in vpc-cni kube-proxy coredns; do
  STATUS=$(aws eks describe-addon --cluster-name "${CLUSTER_NAME}" --addon-name "${ADDON}" \
    --region "${REGION}" --query "addon.status" --output text 2>/dev/null || echo "MISSING")
  if [ "${STATUS}" == "MISSING" ]; then
    echo "  Installing ${ADDON}"
    aws eks create-addon --cluster-name "${CLUSTER_NAME}" --addon-name "${ADDON}" --region "${REGION}"
  else
    echo "  ${ADDON}: ${STATUS}"
  fi
done

echo "==> Phase 3: Installing AWS Load Balancer Controller"
eksctl create iamserviceaccount \
  --cluster "${CLUSTER_NAME}" \
  --region "${REGION}" \
  --namespace kube-system \
  --name aws-load-balancer-controller \
  --attach-policy-arn "arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess" \
  --override-existing-serviceaccounts \
  --approve

helm repo add eks https://aws.github.io/eks-charts >/dev/null 2>&1 || true
helm repo update >/dev/null

helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName="${CLUSTER_NAME}" \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller

echo "==> Phase 4: Installing EFS CSI driver + StorageClass"

echo "  Creating EFS filesystem (if it doesn't already exist)"
EFS_ID=$(aws efs describe-file-systems --region "${REGION}" \
  --query "FileSystems[?Name=='${EFS_FS_NAME}'].FileSystemId" --output text)

if [ -z "${EFS_ID}" ]; then
  EFS_ID=$(aws efs create-file-system \
    --region "${REGION}" \
    --tags Key=Name,Value="${EFS_FS_NAME}" \
    --encrypted \
    --query "FileSystemId" --output text)
  echo "  Created EFS filesystem: ${EFS_ID}"
  sleep 15  # let it reach 'available' before mount targets
else
  echo "  Reusing existing EFS filesystem: ${EFS_ID}"
fi

VPC_ID=$(aws eks describe-cluster --name "${CLUSTER_NAME}" --region "${REGION}" \
  --query "cluster.resourcesVpcConfig.vpcId" --output text)

for SUBNET in $(aws ec2 describe-subnets --region "${REGION}" \
  --filters "Name=vpc-id,Values=${VPC_ID}" --query "Subnets[].SubnetId" --output text); do
  aws efs create-mount-target \
    --file-system-id "${EFS_ID}" \
    --subnet-id "${SUBNET}" \
    --region "${REGION}" 2>/dev/null || echo "  Mount target for ${SUBNET} likely exists already"
done

echo "  Ensuring EFS mount targets accept NFS (2049) from the cluster security group"
CLUSTER_SG=$(aws eks describe-cluster --name "${CLUSTER_NAME}" --region "${REGION}" \
  --query "cluster.resourcesVpcConfig.clusterSecurityGroupId" --output text)

MOUNT_TARGET_SGS=$(for MT in $(aws efs describe-mount-targets --file-system-id "${EFS_ID}" \
    --region "${REGION}" --query "MountTargets[].MountTargetId" --output text); do
  aws efs describe-mount-target-security-groups --mount-target-id "${MT}" \
    --region "${REGION}" --query "SecurityGroups[]" --output text
done | sort -u)

for SG in ${MOUNT_TARGET_SGS}; do
  aws ec2 authorize-security-group-ingress \
    --group-id "${SG}" --protocol tcp --port 2049 --source-group "${CLUSTER_SG}" \
    --region "${REGION}" >/dev/null 2>&1 \
    && echo "  Opened NFS (2049) on ${SG} from ${CLUSTER_SG}" \
    || echo "  NFS rule on ${SG} from ${CLUSTER_SG} already present — skipping"
done

eksctl create iamserviceaccount \
  --cluster "${CLUSTER_NAME}" \
  --region "${REGION}" \
  --namespace kube-system \
  --name efs-csi-controller-sa \
  --attach-policy-arn arn:aws:iam::aws:policy/service-role/AmazonEFSCSIDriverPolicy \
  --override-existing-serviceaccounts \
  --approve

aws eks create-addon \
  --cluster-name "${CLUSTER_NAME}" \
  --addon-name aws-efs-csi-driver \
  --region "${REGION}" \
  --service-account-role-arn "$(aws iam get-role --role-name "$(eksctl get iamserviceaccount --cluster "${CLUSTER_NAME}" --region "${REGION}" -o json | grep -o 'eksctl-[^"]*Role1[^"]*' | head -1)" --query 'Role.Arn' --output text 2>/dev/null || echo '')" \
  2>/dev/null || echo "  Add-on may already exist — continuing"

echo "==> Applying the efs-sc StorageClass"
cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: efs-sc
provisioner: efs.csi.aws.com
parameters:
  provisioningMode: efs-ap
  fileSystemId: ${EFS_ID}
  directoryPerms: "700"
EOF

echo "==> Phase 5: Installing EBS CSI driver + StorageClass"

eksctl create iamserviceaccount \
  --cluster "${CLUSTER_NAME}" \
  --region "${REGION}" \
  --namespace kube-system \
  --name ebs-csi-controller-sa \
  --attach-policy-arn arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy \
  --override-existing-serviceaccounts \
  --approve

EBS_SA_STACK="eksctl-${CLUSTER_NAME}-addon-iamserviceaccount-kube-system-ebs-csi-controller-sa"
EBS_ROLE_ARN=$(aws cloudformation describe-stacks --stack-name "${EBS_SA_STACK}" --region "${REGION}" \
  --query "Stacks[0].Outputs[?OutputKey=='Role1'].OutputValue" --output text)

EBS_ADDON_STATUS=$(aws eks describe-addon --cluster-name "${CLUSTER_NAME}" --addon-name aws-ebs-csi-driver \
  --region "${REGION}" --query "addon.status" --output text 2>/dev/null || echo "MISSING")

if [ "${EBS_ADDON_STATUS}" == "CREATE_FAILED" ]; then
  echo "  Existing aws-ebs-csi-driver addon is in CREATE_FAILED (usually a ServiceAccount"
  echo "  ownership conflict with the iamserviceaccount above) — deleting before recreating"
  aws eks delete-addon --cluster-name "${CLUSTER_NAME}" --addon-name aws-ebs-csi-driver --region "${REGION}"
  aws eks wait addon-deleted --cluster-name "${CLUSTER_NAME}" --addon-name aws-ebs-csi-driver --region "${REGION}"
  EBS_ADDON_STATUS="MISSING"
fi

if [ "${EBS_ADDON_STATUS}" == "MISSING" ]; then
  echo "  Creating aws-ebs-csi-driver addon"
  aws eks create-addon \
    --cluster-name "${CLUSTER_NAME}" \
    --addon-name aws-ebs-csi-driver \
    --region "${REGION}" \
    --service-account-role-arn "${EBS_ROLE_ARN}" \
    --resolve-conflicts OVERWRITE
  aws eks wait addon-active --cluster-name "${CLUSTER_NAME}" --addon-name aws-ebs-csi-driver --region "${REGION}"
else
  echo "  aws-ebs-csi-driver: ${EBS_ADDON_STATUS}"
fi

echo "  Applying the gp3 StorageClass"
cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
volumeBindingMode: WaitForFirstConsumer
EOF

echo "==> Phase 6: Platform readiness checklist"

check() {
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "  ${desc} ... OK"
  else
    echo "  ${desc} ... FAIL"
    FAILED=1
  fi
}

FAILED=0

check "EKS cluster nodes Ready" \
  bash -c "kubectl get nodes --no-headers | awk '{print \$2}' | grep -qv NotReady"

check "OIDC provider associated" \
  bash -c "aws iam list-open-id-connect-providers --query \"OpenIDConnectProviderList[?contains(Arn, '${OIDC_ID}')]\" --output text | grep -q ."

check "Load Balancer Controller pods Running" \
  bash -c "kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller --no-headers | awk '{print \$3}' | grep -qv -E 'Running' && exit 1 || exit 0"

check "EFS CSI driver pods Running" \
  bash -c "kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-efs-csi-driver --no-headers | awk '{print \$3}' | grep -qv -E 'Running' && exit 1 || exit 0"

check "StorageClass efs-sc present" \
  bash -c "kubectl get sc efs-sc"

check "EBS CSI driver pods Running" \
  bash -c "kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-ebs-csi-driver --no-headers | awk '{print \$3}' | grep -qv -E 'Running' && exit 1 || exit 0"

check "StorageClass gp3 present" \
  bash -c "kubectl get sc gp3"

if [ "${FAILED}" -eq 1 ]; then
  echo "    WARN: One or more checks failed - review output above before proceeding."
else
  echo "    All checks passed — cluster is ready."
fi