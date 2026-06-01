import type { CommunityMember } from '../login.types';

interface AvatarClusterProps {
  members: CommunityMember[];
  extraMembersLabel: string;
  caption: string;
}

export function AvatarCluster({ members, extraMembersLabel, caption }: AvatarClusterProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center">
        {members.map((member, index) => (
          <span
            key={member.id}
            className={`font-ui-title inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-[11px] font-bold text-text-primary shadow-sm ${member.tone}`}
            style={{ marginLeft: index === 0 ? 0 : -8 }}
            title={member.name}
          >
            {member.initials}
          </span>
        ))}
        <span className="font-ui-title -ml-2 inline-flex h-10 items-center rounded-full border border-border bg-accent-light px-3 text-xs font-semibold text-accent-strong shadow-sm">
          {extraMembersLabel}
        </span>
      </div>
      <p className="font-ui-meta text-sm text-text-secondary">{caption}</p>
    </div>
  );
}
