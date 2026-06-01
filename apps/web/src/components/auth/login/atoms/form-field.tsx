import type { ReactNode } from 'react';
import { CheckCircle2, KeyRound, Mail, User, UserCircle } from 'lucide-react';

interface FormFieldProps {
  label: string;
  type: 'tel' | 'password' | 'text';
  placeholder: string;
  value: string;
  disabled?: boolean;
  showPassword?: boolean;
  error?: string;
  onChange: (value: string) => void;
  rightNode?: ReactNode;
}

function FieldIcon({ label, type }: { label: string; type: 'tel' | 'password' | 'text' }) {
  const normalized = label.toLowerCase();

  if (normalized.includes('otp')) {
    return <CheckCircle2 size={18} strokeWidth={2.1} aria-hidden />;
  }

  if (type === 'password') {
    return <KeyRound size={18} strokeWidth={2.1} aria-hidden />;
  }

  if (normalized.includes('username')) {
    return <UserCircle size={18} strokeWidth={2.1} aria-hidden />;
  }

  if (normalized.includes('tên')) {
    return <User size={18} strokeWidth={2.1} aria-hidden />;
  }

  return <Mail size={18} strokeWidth={2.1} aria-hidden />;
}

export function FormField({
  label,
  type,
  placeholder,
  value,
  disabled,
  error,
  onChange,
  rightNode,
}: FormFieldProps) {
  return (
    <div className="group">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="text-xs font-black uppercase tracking-[0.13em] text-slate-500">
          {label}
        </label>
        {rightNode}
      </div>

      <div
        className={`relative flex min-h-12 items-center gap-3 rounded-[var(--radius-card)] border bg-[var(--surface)] px-4 transition duration-200 ${
          error
            ? 'border-red-200 shadow-[0_0_0_4px_rgba(239,68,68,0.08)]'
            : 'border-border-soft group-focus-within:border-border-strong group-focus-within:shadow-[0_0_0_4px_var(--ring-soft)]'
        } ${disabled ? 'bg-slate-50 opacity-70' : ''}`}
      >
        <span className={`shrink-0 ${error ? 'text-red-500' : 'text-text-tertiary group-focus-within:text-accent'}`}>
          <FieldIcon label={label} type={type} />
        </span>

        <input
          type={type === 'password' ? 'password' : type}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-12 w-full bg-transparent text-[15px] font-semibold text-text-primary outline-none placeholder:text-text-tertiary disabled:cursor-not-allowed"
        />
      </div>

      {error ? <p className="mt-1.5 text-xs font-semibold text-red-600">{error}</p> : null}
    </div>
  );
}
