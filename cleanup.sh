#!/usr/bin/env bash
set -euo pipefail

# =====================================================================
# EKS Cluster Cleanup — Ridgeline SRE Lab
# Tears down everything cluster-setup.sh created, in reverse order.
# Safe to re-run: every step tolerates "already gone" resources.
#
# Run app-level teardown first (see fixboard/DEPLOYMENT.md's Teardown
# section) so PVC-backed EBS volumes and EFS access points are released
# through their CSI drivers while those drivers are still installed —
# deleting the drivers/StorageClasses here first can orphan volumes.
# =====================================================================

CLUSTER_NAME="ridgeline-fixboard"
REGION="us-east-1"
EFS_FS_NAME="${CLUSTER_NAME}-efs"

echo "==> Step 1: Deleting StorageClasses efs-sc and gp3"
kubectl delete storageclass efs-sc --ignore-not-found
kubectl delete storageclass gp3 --ignore-not-found

echo "==> Step 2: Uninstalling AWS Load Balancer Controller"
helm uninstall aws-load-balancer-controller -n kube-system --ignore-not-found 2>/dev/null || true

echo "==> Step 3: Deleting EFS and EBS CSI driver add-ons"
aws eks delete-addon \
  --cluster-name "${CLUSTER_NAME}" \
  --addon-name aws-efs-csi-driver \
  --region "${REGION}" 2>/dev/null || echo "  aws-efs-csi-driver already removed or cluster gone"

aws eks delete-addon \
  --cluster-name "${CLUSTER_NAME}" \
  --addon-name aws-ebs-csi-driver \
  --region "${REGION}" 2>/dev/null || echo "  aws-ebs-csi-driver already removed or cluster gone"

echo "==> Step 4: Deleting EFS mount targets and filesystem"
EFS_ID=$(aws efs describe-file-systems --region "${REGION}" \
  --query "FileSystems[?Name=='${EFS_FS_NAME}'].FileSystemId" --output text)

if [ -n "${EFS_ID}" ]; then
  MOUNT_TARGETS=$(aws efs describe-mount-targets --file-system-id "${EFS_ID}" --region "${REGION}" \
    --query "MountTargets[].MountTargetId" --output text)
  for MT in ${MOUNT_TARGETS}; do
    echo "  Deleting mount target ${MT}"
    aws efs delete-mount-target --mount-target-id "${MT}" --region "${REGION}"
  done
  echo "  Waiting for mount targets to clear before deleting filesystem..."
  sleep 20
  echo "  Deleting EFS filesystem ${EFS_ID}"
  aws efs delete-file-system --file-system-id "${EFS_ID}" --region "${REGION}" 2>/dev/null \
    || echo "  Filesystem deletion failed — mount targets may still be draining, re-run this script in a minute"
else
  echo "  No EFS filesystem named ${EFS_FS_NAME} found — skipping"
fi

echo "==> Step 5: Removing IAM service accounts (and their IAM roles)"
eksctl delete iamserviceaccount \
  --cluster "${CLUSTER_NAME}" \
  --region "${REGION}" \
  --namespace kube-system \
  --name efs-csi-controller-sa 2>/dev/null || echo "  efs-csi-controller-sa already gone"

eksctl delete iamserviceaccount \
  --cluster "${CLUSTER_NAME}" \
  --region "${REGION}" \
  --namespace kube-system \
  --name ebs-csi-controller-sa 2>/dev/null || echo "  ebs-csi-controller-sa already gone"

eksctl delete iamserviceaccount \
  --cluster "${CLUSTER_NAME}" \
  --region "${REGION}" \
  --namespace kube-system \
  --name aws-load-balancer-controller 2>/dev/null || echo "  aws-load-balancer-controller SA already gone"

echo "==> Step 6: Deleting core add-ons (vpc-cni, kube-proxy, coredns)"
for ADDON in coredns kube-proxy vpc-cni; do
  aws eks delete-addon --cluster-name "${CLUSTER_NAME}" --addon-name "${ADDON}" \
    --region "${REGION}" 2>/dev/null || echo "  ${ADDON} already removed"
done

echo "==> Step 7: Deleting the EKS cluster (this also removes nodegroups, VPC if eksctl-managed, and the OIDC provider)"
eksctl delete cluster --name "${CLUSTER_NAME}" --region "${REGION}" --wait

echo "==> Step 8: Confirming OIDC provider is gone"
REMAINING=$(aws iam list-open-id-connect-providers \
  --query "OpenIDConnectProviderList[?contains(Arn, '${CLUSTER_NAME}')].Arn" --output text)
if [ -n "${REMAINING}" ]; then
  echo "  Found leftover OIDC provider(s), deleting manually:"
  for ARN in ${REMAINING}; do
    echo "    ${ARN}"
    aws iam delete-open-id-connect-provider --open-id-connect-provider-arn "${ARN}"
  done
else
  echo "  No leftover OIDC providers."
fi

echo "==> Cleanup complete."