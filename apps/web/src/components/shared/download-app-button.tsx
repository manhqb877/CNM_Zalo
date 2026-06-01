'use client';

import { useEffect, useState } from 'react';
import { Smartphone, X } from 'lucide-react';

type DownloadAppButtonVariant = 'primary' | 'secondary' | 'ghost';

interface DownloadAppButtonProps {
  variant?: DownloadAppButtonVariant;
  className?: string;
}

const variantClasses: Record<DownloadAppButtonVariant, string> = {
  primary: 'zync-soft-button',
  secondary: 'zync-soft-button-secondary',
  ghost: 'zync-soft-button-ghost',
};

const androidInstallUrl =
  process.env.NEXT_PUBLIC_ANDROID_BUILD_URL ??
  'https://expo.dev/accounts/binhdev_mobile/projects/zync-mobile/builds';

const androidInstallQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(androidInstallUrl)}`;

export function DownloadAppButton({
  variant = 'primary',
  className = '',
}: DownloadAppButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const classes = [
    variantClasses[variant],
    'min-h-11 px-5 py-2.5 text-sm',
    className,
  ].filter(Boolean).join(' ');

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  return (
    <>
      <button type="button" className={classes} onClick={() => setIsOpen(true)}>
        <Smartphone className="h-4 w-4" aria-hidden />
        <span>Cài app Android</span>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Cài app Android">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Đóng"
            onClick={() => setIsOpen(false)}
          />

          <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-[0_26px_80px_-30px_rgba(8,47,73,0.55)]">
            <button
              type="button"
              className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-[#082F49]"
              aria-label="Đóng"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>

            <div className="flex items-start gap-3 pr-10">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#DDFBF5] text-[#0F766E]">
                <Smartphone className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-base font-black text-[#082F49]">Quét QR để cài app</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                  Mở camera trên Android và quét mã này.
                </p>
              </div>
            </div>

            <img
              src={androidInstallQrUrl}
              alt="QR cài app Android ZYNC"
              className="mx-auto mt-5 h-56 w-56 rounded-xl border border-slate-200 bg-white p-2"
            />

            <a
              href={androidInstallUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#082F49] px-4 text-sm font-black text-white transition hover:bg-[#0F766E]"
            >
              Mở link cài đặt
            </a>
          </div>
        </div>
      ) : null}
    </>
  );
}
