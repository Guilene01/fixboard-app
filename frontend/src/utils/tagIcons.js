import {
  Boxes,
  Container,
  Workflow,
  Layers,
  Cloud,
  Network,
  Activity,
  Terminal,
  GitBranch,
  Shield,
  Settings2,
  Code2,
  Tag as TagIcon,
} from 'lucide-react';

const TAG_ICONS = {
  Kubernetes: Boxes,
  Docker: Container,
  'CI/CD': Workflow,
  Terraform: Layers,
  AWS: Cloud,
  Networking: Network,
  'Monitoring/Observability': Activity,
  Linux: Terminal,
  Git: GitBranch,
  Security: Shield,
  Ansible: Settings2,
  Python: Code2,
};

export function getTagIcon(tagName) {
  return TAG_ICONS[tagName] || TagIcon;
}
