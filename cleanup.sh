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
CLUSTER_STACK="eksctl-${CLUSTER_NAME}-cluster"

if kubectl cluster-info --request-timeout=5s >/dev/null 2>&1; then
  KUBECTL_OK=1
else
  KUBECTL_OK=0
  echo "  NOTE: kubectl can't reach a cluster (already deleted, or kubeconfig context"
  echo "  missing/stale — eksctl removes the context as part of cluster deletion)."
  echo "  Skipping kubectl-dependent steps; AWS-side cleanup still runs below."
fi

echo "==> Step 1: Deleting StorageClasses efs-sc and gp3"
if [ "${KUBECTL_OK}" -eq 1 ]; then
  kubectl delete storageclass efs-sc --ignore-not-found
  kubectl delete storageclass gp3 --ignore-not-found
else
  echo "  Skipped (no cluster connection)"
fi

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

echo "==> Step 4: Deleting EFS mount targets and filesystem(s) in this cluster's VPC"

# Looked up by VPC membership, not by Name tag: a filesystem created with a
# different Name (by hand, or by a different script run) still blocks VPC
# deletion if its mount targets sit in this VPC, and a Name-based lookup
# would silently miss it — which is exactly what happened once already.
# Read from the CFN stack's outputs rather than `aws eks describe-cluster`
# so this still works if the cluster API resource is already gone but the
# stack is stuck DELETE_FAILED (the state a half-finished manual teardown
# leaves behind).
VPC_ID=$(aws cloudformation describe-stacks --stack-name "${CLUSTER_STACK}" --region "${REGION}" \
  --query "Stacks[0].Outputs[?OutputKey=='VPC'].OutputValue" --output text 2>/dev/null || echo "")
CLUSTER_SG=$(aws cloudformation describe-stacks --stack-name "${CLUSTER_STACK}" --region "${REGION}" \
  --query "Stacks[0].Outputs[?OutputKey=='ClusterSecurityGroupId'].OutputValue" --output text 2>/dev/null || echo "")

if [ -z "${VPC_ID}" ]; then
  echo "  Could not determine this cluster's VPC (stack already gone?) — nothing to look up EFS mount targets by."
  echo "  If a filesystem's mount targets are still blocking a leftover VPC, find them with:"
  echo "    aws efs describe-file-systems --region ${REGION}"
  echo "    aws efs describe-mount-targets --file-system-id <id> --region ${REGION}"
else
  echo "  Cluster VPC: ${VPC_ID}"
  for FS_ID in $(aws efs describe-file-systems --region "${REGION}" --query "FileSystems[].FileSystemId" --output text); do
    MOUNT_TARGETS_IN_VPC=$(aws efs describe-mount-targets --file-system-id "${FS_ID}" --region "${REGION}" \
      --query "MountTargets[?VpcId=='${VPC_ID}'].MountTargetId" --output text)
    [ -z "${MOUNT_TARGETS_IN_VPC}" ] && continue

    echo "  Filesystem ${FS_ID} has mount targets in this VPC"
    for MT in ${MOUNT_TARGETS_IN_VPC}; do
      if [ -n "${CLUSTER_SG}" ]; then
        for SG in $(aws efs describe-mount-target-security-groups --mount-target-id "${MT}" \
            --region "${REGION}" --query "SecurityGroups[]" --output text); do
          aws ec2 revoke-security-group-ingress --group-id "${SG}" --protocol tcp --port 2049 \
            --source-group "${CLUSTER_SG}" --region "${REGION}" >/dev/null 2>&1 \
            && echo "    Revoked NFS (2049) rule on ${SG} from ${CLUSTER_SG} (added by setup.sh)" || true
        done
      fi
      echo "    Deleting mount target ${MT}"
      aws efs delete-mount-target --mount-target-id "${MT}" --region "${REGION}"
    done

    echo "  Waiting for ${FS_ID}'s mount targets to clear..."
    until [ -z "$(aws efs describe-mount-targets --file-system-id "${FS_ID}" --region "${REGION}" --query 'MountTargets' --output text 2>/dev/null)" ]; do
      sleep 5
    done

    echo "  Deleting EFS filesystem ${FS_ID}"
    aws efs delete-file-system --file-system-id "${FS_ID}" --region "${REGION}" 2>/dev/null \
      || echo "  Filesystem ${FS_ID} deletion failed — check for remaining dependencies"
  done
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
if ! aws eks describe-cluster --name "${CLUSTER_NAME}" --region "${REGION}" >/dev/null 2>&1; then
  echo "  Cluster control plane already gone — nothing for eksctl to delete."
  # The cluster API resource can be gone while its CloudFormation stack is
  # still stuck DELETE_FAILED (e.g. a leftover ENI blocked it, as EFS mount
  # targets did here) — that's a real leftover worth surfacing, not silence.
  STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "${CLUSTER_STACK}" --region "${REGION}" \
    --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "")
  if [ "${STACK_STATUS}" == "DELETE_FAILED" ]; then
    echo "  But its CloudFormation stack (${CLUSTER_STACK}) is still stuck DELETE_FAILED:"
    aws cloudformation describe-stack-events --stack-name "${CLUSTER_STACK}" --region "${REGION}" \
      --query "StackEvents[?ResourceStatus=='DELETE_FAILED'].[LogicalResourceId,ResourceStatusReason]" \
      --output table 2>/dev/null || true
    echo "  Resolve the dependency named above, then retry with:"
    echo "    aws cloudformation delete-stack --stack-name ${CLUSTER_STACK} --region ${REGION}"
  elif [ -n "${STACK_STATUS}" ]; then
    echo "  Its CloudFormation stack (${CLUSTER_STACK}) still exists, status: ${STACK_STATUS}."
    echo "  Check manually: aws cloudformation describe-stacks --stack-name ${CLUSTER_STACK} --region ${REGION}"
  else
    echo "  Its CloudFormation stack is gone too — fully torn down."
  fi
elif ! eksctl delete cluster --name "${CLUSTER_NAME}" --region "${REGION}" --wait; then
  echo "  eksctl reported a failure. Checking the CloudFormation stack for the blocking resource(s):"
  aws cloudformation describe-stack-events --stack-name "${CLUSTER_STACK}" --region "${REGION}" \
    --query "StackEvents[?ResourceStatus=='DELETE_FAILED'].[LogicalResourceId,ResourceStatusReason]" \
    --output table 2>/dev/null || true
  echo "  Resolve the dependency named above (commonly a leftover ENI — EFS mount target,"
  echo "  load balancer — or a security-group rule referencing one of this stack's SGs from"
  echo "  outside the stack), then retry with:"
  echo "    aws cloudformation delete-stack --stack-name ${CLUSTER_STACK} --region ${REGION}"
  exit 1
fi

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