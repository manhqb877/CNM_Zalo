import { Bot, CheckCircle2, Code2, MessageCircle, Sparkles, Users, type LucideIcon } from 'lucide-react';

import { AvatarCluster } from '../molecules/avatar-cluster';
import type { LoginScreenMockData } from '../login.types';

interface LoginHeroProps {
  data: LoginScreenMockData;
}

export function LoginHero({ data }: LoginHeroProps) {
  return (
    <section className="zync-reveal-up mx-auto w-full max-w-2xl text-center lg:mx-0 lg:text-left">
      <div className="inline-flex items-center gap-2 rounded-full border border-teal-100 bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#0F766E] shadow-sm backdrop-blur">
        <Sparkles size={15} aria-hidden />
        Secure developer workspace
      </div>

      <h1 className="font-ui-title mt-6 text-balance text-[clamp(2.8rem,5.6vw,5.6rem)] leading-[0.96] text-[#06283D]">
        {data.headline.map((line, index) => (
          <span key={line} className={index === data.headline.length - 1 ? 'block bg-[linear-gradient(135deg,#0F766E,#11BFA8,#082F49)] bg-clip-text text-transparent' : 'block'}>
            {line}
          </span>
        ))}
      </h1>

      <p className="font-ui-content mx-auto mt-6 max-w-[52ch] text-lg leading-8 text-slate-600 lg:mx-0">
        {data.subtitle}
      </p>

      <div className="mt-8 flex justify-center lg:justify-start">
        <AvatarCluster
          members={data.members}
          extraMembersLabel={data.extraMembersLabel}
          caption={data.bottomCaption}
        />
      </div>

      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        <HeroFeature icon={MessageCircle} title="Real-time chat" />
        <HeroFeature icon={Users} title="Dev communities" />
        <HeroFeature icon={Bot} title="AI catch-up" />
      </div>

      <div className="mt-5 hidden rounded-[1.7rem] border border-white bg-white/75 p-4 text-left shadow-sm backdrop-blur md:block">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#DDFBF5] text-[#0F766E]">
              <Code2 size={21} aria-hidden />
            </span>
            <div>
              <p className="text-sm font-black text-[#082F49]">#typescript-help</p>
              <p className="text-xs font-semibold text-slate-500">12 câu trả lời mới, 1 digest sẵn sàng</p>
            </div>
          </div>
          <CheckCircle2 className="text-[#0F766E]" size={22} aria-hidden />
        </div>
      </div>
    </section>
  );
}

function HeroFeature({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-white bg-white/75 p-3 text-left shadow-sm backdrop-blur">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#DDFBF5] text-[#0F766E]">
        <Icon size={19} aria-hidden />
      </span>
      <span className="text-sm font-black text-[#082F49]">{title}</span>
    </div>
  );
}
