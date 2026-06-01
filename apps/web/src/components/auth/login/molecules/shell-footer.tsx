interface ShellFooterProps {
  brand: string;
  copyright: string;
  links: string[];
  statusLabel: string;
}

export function ShellFooter({ brand, copyright, links, statusLabel }: ShellFooterProps) {
  return (
    <footer className="relative z-10 border-t border-border-light/50 bg-surface-glass/40 backdrop-blur-xl">
      <div className="zync-page-container flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <span className="font-ui-brand text-lg font-semibold tracking-wide text-text-primary">
            {brand}
          </span>
          <span className="hidden text-text-tertiary sm:inline">|</span>
          <span className="font-ui-meta text-xs text-text-tertiary">{copyright}</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {links.map((link) => (
            <button
              key={link}
              type="button"
              className="font-ui-meta text-xs text-text-tertiary transition-colors hover:text-text-secondary"
            >
              {link}
            </button>
          ))}
          <span className="inline-flex items-center gap-2 font-ui-meta text-xs text-accent">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            {statusLabel}
          </span>
        </div>
      </div>
    </footer>
  );
}
