'use client';

interface TypingIndicatorProps {
  userNames: string[];
}

export function TypingIndicator({ userNames }: TypingIndicatorProps) {
  if (userNames.length === 0) return null;

  return (
    <div className="px-4 py-2">
      <div className="inline-flex items-center gap-2 rounded-full border border-border-light bg-bg-card px-4 py-2 shadow-sm">
        <div className="flex gap-1">
          <div className="h-2 w-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0s' }} />
          <div className="h-2 w-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0.15s' }} />
          <div className="h-2 w-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0.3s' }} />
        </div>
        <span className="font-ui-content text-xs text-text-secondary">đang gõ...</span>
      </div>
    </div>
  );
}
