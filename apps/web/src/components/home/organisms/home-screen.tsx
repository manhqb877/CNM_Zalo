import Link from 'next/link';
import {
  Bell,
  Bot,
  CheckCircle2,
  Code2,
  MessageCircle,
  Search,
  SendHorizontal,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';

import { HomeCta } from '../atoms/home-cta';
import { HomeFeatureCard } from '../molecules/home-feature-card';
import type { HomeScreenProps } from '../home.types';
import { DownloadAppButton } from '@/components/shared/download-app-button';
import { ZyncLogo } from '@/components/shared/zync-logo';

export function HomeScreen({ data }: HomeScreenProps) {
  return (
    <main className="min-h-screen overflow-hidden bg-[#F4FAFB] text-[#082F49]">
      <div className="absolute inset-x-0 top-0 h-[620px] bg-[linear-gradient(180deg,#E6FAF7_0%,#F4FAFB_72%,rgba(244,250,251,0)_100%)]" aria-hidden />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(15,118,110,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(15,118,110,0.055)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(180deg,black,transparent_70%)]" aria-hidden />

      <header className="fixed left-0 right-0 top-0 z-40">
        <div className="zync-page-container py-3">
          <div className="flex items-center justify-between gap-4 rounded-full border border-white/80 bg-white/80 px-4 py-3 shadow-[0_18px_55px_-38px_rgba(8,47,73,0.65)] backdrop-blur-xl">
            <Link href="/" aria-label="ZYNC home">
              <ZyncLogo size="sm" />
            </Link>

            <nav className="hidden items-center gap-7 lg:flex">
              {data.navItems.map((item) => (
                <a key={item.id} href={item.href} className="text-sm font-semibold text-slate-600 transition hover:text-[#0F766E]">
                  {item.label}
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <Link href="/auth" className="hidden rounded-full px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 sm:inline-flex">
                {data.navAuthLabel}
              </Link>
              <Link href="/auth" className="inline-flex min-h-10 items-center rounded-full bg-[#082F49] px-5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#0F766E]">
                {data.navPrimaryLabel}
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="zync-page-container relative pb-14 pt-28 lg:pt-32">
        <section className="grid min-h-[calc(100vh-8rem)] items-center gap-12 py-10 lg:grid-cols-[1.02fr_0.98fr] lg:py-14">
          <div className="zync-reveal-left">
            <p className="inline-flex items-center gap-2 rounded-full border border-teal-100 bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#0F766E] shadow-sm backdrop-blur">
              <Sparkles size={15} aria-hidden />
              {data.releaseLabel}
            </p>

            <h1 className="font-ui-title mt-6 max-w-[13ch] text-balance text-[clamp(3rem,6.6vw,6.4rem)] leading-[0.95] text-[#06283D]">
              {data.title}{' '}
              <span className="bg-[linear-gradient(135deg,#0F766E_0%,#11BFA8_55%,#082F49_100%)] bg-clip-text text-transparent">
                {data.titleAccent}
              </span>
            </h1>

            <p className="font-ui-content mt-6 max-w-[55ch] text-balance text-lg leading-8 text-slate-600">
              {data.subtitle}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <HomeCta label={data.ctaPrimary} href="/auth" variant="primary" />
              <HomeCta label={data.ctaSecondary} href="#features" variant="secondary" />
              <DownloadAppButton variant="secondary" />
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {data.metrics.map((metric) => (
                <div key={metric.id} className="rounded-3xl border border-white bg-white/75 p-4 shadow-sm backdrop-blur">
                  <p className="font-ui-title text-2xl text-[#0F766E]">{metric.value}</p>
                  <p className="mt-1 text-sm font-bold text-[#082F49]">{metric.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{metric.description}</p>
                </div>
              ))}
            </div>
          </div>

          <HeroProductPreview />
        </section>

        <section id="features" className="py-14">
          <SectionHeading
            eyebrow="Core features"
            title="Một workspace gọn cho chat, cộng đồng và tri thức developer"
            description="ZYNC giữ các tương tác quan trọng ở cùng một nơi: tin nhắn, bài viết, nhóm, thông báo và AI support."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.features.map((feature) => (
              <HomeFeatureCard key={feature.id} item={feature} />
            ))}
          </div>
        </section>

        <section className="grid gap-6 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <SectionHeading
              eyebrow="Why ZYNC"
              title="Ít nhiễu hơn, nhiều context hơn"
              description="Thay vì tách rời chat, post và reminder, ZYNC gom mọi thứ thành một luồng làm việc dễ theo dõi cho cộng đồng kỹ thuật."
              align="left"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.benefits.map((benefit) => (
              <div key={benefit} className="flex gap-3 rounded-3xl border border-teal-100 bg-white/75 p-4 shadow-sm backdrop-blur">
                <CheckCircle2 className="mt-0.5 shrink-0 text-[#0F766E]" size={20} aria-hidden />
                <p className="text-sm font-semibold leading-6 text-slate-700">{benefit}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="use-cases" className="py-14">
          <SectionHeading
            eyebrow="Use cases"
            title="Dùng cho nhóm học, team dự án và cộng đồng theo stack"
            description="Từ lớp học nhỏ đến cộng đồng mở, ZYNC giúp trao đổi nhanh mà vẫn giữ được tri thức về sau."
          />
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {data.useCases.map((item, index) => (
              <article key={item.id} className="rounded-[1.75rem] border border-white bg-[#082F49] p-6 text-white shadow-[0_24px_70px_-45px_rgba(8,47,73,0.9)]">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-teal-300/20 text-sm font-black text-teal-100">
                  0{index + 1}
                </span>
                <h3 className="font-ui-title mt-6 text-xl">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="community" className="grid gap-8 rounded-[2rem] border border-teal-100 bg-white/80 p-6 shadow-sm backdrop-blur md:p-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-[#DDFBF5] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[#0F766E]">
              <Users size={15} aria-hidden />
              Community
            </p>
            <h2 className="font-ui-title mt-5 text-balance text-[clamp(2rem,4vw,3.2rem)] leading-tight text-[#06283D]">
              {data.communityTitle}
            </h2>
            <p className="font-ui-content mt-4 max-w-[58ch] text-base leading-8 text-slate-600">
              {data.communitySubtitle}
            </p>
          </div>
          <CommunityBoard />
        </section>

        <section id="ai-support" className="grid gap-8 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <AiPanel highlights={data.aiHighlights} />
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-[#DDFBF5] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[#0F766E]">
              <Bot size={15} aria-hidden />
              AI support
            </p>
            <h2 className="font-ui-title mt-5 text-balance text-[clamp(2rem,4vw,3.2rem)] leading-tight text-[#06283D]">
              {data.aiTitle}
            </h2>
            <p className="font-ui-content mt-4 max-w-[58ch] text-base leading-8 text-slate-600">
              {data.aiSubtitle}
            </p>
          </div>
        </section>

        <section className="mb-8 rounded-[2rem] bg-[#082F49] px-6 py-10 text-white shadow-[0_30px_90px_-55px_rgba(8,47,73,0.9)] md:px-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="font-ui-title max-w-[17ch] text-balance text-[clamp(2rem,4vw,3.4rem)] leading-tight">
                {data.ctaBlockTitle}
              </h2>
              <p className="mt-4 max-w-[60ch] text-base leading-8 text-slate-300">{data.ctaBlockSubtitle}</p>
            </div>
            <Link href="/auth" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-black text-[#082F49] transition hover:-translate-y-0.5 hover:bg-[#DDFBF5]">
              {data.ctaBlockButton}
              <ArrowRightIcon />
            </Link>
          </div>
        </section>

        <footer className="flex flex-col gap-4 border-t border-slate-200 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ZyncLogo size="sm" />
            <p className="text-sm font-semibold text-slate-500">{data.footerCopyright}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {data.footerLinks.map((item) => (
              <a key={item.id} href={item.href} className="rounded-full px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-white hover:text-[#0F766E]">
                {item.label}
              </a>
            ))}
          </div>
        </footer>
      </div>
    </main>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
}: {
  eyebrow: string;
  title: string;
  description: string;
  align?: 'center' | 'left';
}) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-2xl'}>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0F766E]">{eyebrow}</p>
      <h2 className="font-ui-title mt-3 text-balance text-[clamp(2rem,4vw,3.2rem)] leading-tight text-[#06283D]">{title}</h2>
      <p className="font-ui-content mt-4 text-base leading-8 text-slate-600">{description}</p>
    </div>
  );
}

function HeroProductPreview() {
  return (
    <aside className="zync-reveal-right zync-reveal-delay-1 relative">
      <div className="rounded-[2rem] border border-white bg-white/80 p-3 shadow-[0_30px_90px_-52px_rgba(8,47,73,0.9)] backdrop-blur">
        <div className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-[#F8FCFD]">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#EF4444]" />
              <span className="h-3 w-3 rounded-full bg-[#F59E0B]" />
              <span className="h-3 w-3 rounded-full bg-[#10B981]" />
            </div>
            <div className="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500 sm:flex">
              <Search size={14} aria-hidden />
              semantic search
            </div>
          </div>

          <div className="grid min-h-[520px] md:grid-cols-[0.75fr_1.45fr_0.9fr]">
            <div className="hidden border-r border-slate-200 bg-white/70 p-4 md:block">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Spaces</p>
              {['Frontend Vietnam', 'AI builders', 'Backend guild'].map((item, index) => (
                <div key={item} className={`mt-3 rounded-2xl p-3 ${index === 0 ? 'bg-[#DDFBF5] text-[#0F766E]' : 'bg-white text-slate-600'}`}>
                  <p className="text-sm font-black">{item}</p>
                  <p className="mt-1 text-xs opacity-70">{index === 0 ? '24 messages mới' : 'Đang hoạt động'}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-[#082F49]">#react-performance</p>
                  <p className="text-xs font-semibold text-slate-500">128 members đang theo dõi</p>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">Live</span>
              </div>

              <div className="mt-5 flex-1 space-y-4">
                <ChatBubble name="Mai" text="Có cách nào giảm re-render khi context đổi liên tục không?" />
                <ChatBubble name="Duy" text="Tách provider theo domain + memo selector. Mình gửi snippet nhé." own />
                <div className="rounded-2xl border border-teal-100 bg-white p-4">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#0F766E]">
                    <Code2 size={15} aria-hidden />
                    snippet
                  </div>
                  <pre className="mt-3 overflow-hidden rounded-2xl bg-[#082F49] p-4 text-xs leading-6 text-teal-50">{'const value = useMemo(() => ({\n  user,\n  updateUser\n}), [user])'}</pre>
                </div>
                <ChatBubble name="ZYNC AI" text="Tóm tắt: nên tách context, dùng memo và kiểm tra component đang subscribe quá rộng." ai />
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2">
                <span className="flex-1 text-sm font-semibold text-slate-400">Viết phản hồi...</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0F766E] text-white">
                  <SendHorizontal size={18} aria-hidden />
                </span>
              </div>
            </div>

            <div className="hidden border-l border-slate-200 bg-white/70 p-4 lg:block">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">AI catch-up</p>
              <div className="mt-4 rounded-3xl bg-[#082F49] p-4 text-white">
                <div className="flex items-center gap-2 text-sm font-black text-teal-100">
                  <Sparkles size={16} aria-hidden />
                  3 điểm chính
                </div>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
                  <li>Context re-render đang là vấn đề chính.</li>
                  <li>Đã có snippet tối ưu provider.</li>
                  <li>Cần follow-up benchmark sau khi sửa.</li>
                </ul>
              </div>
              <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-black text-[#082F49]">
                  <Bell size={16} aria-hidden />
                  Reminder
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">Nhắc Duy gửi benchmark vào 16:00.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ChatBubble({ name, text, own, ai }: { name: string; text: string; own?: boolean; ai?: boolean }) {
  return (
    <div className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[84%] rounded-3xl px-4 py-3 ${own ? 'bg-[#0F766E] text-white' : ai ? 'bg-[#E8FAF5] text-[#07544B]' : 'bg-white text-slate-700 shadow-sm'}`}>
        <p className="text-xs font-black opacity-70">{name}</p>
        <p className="mt-1 text-sm leading-6">{text}</p>
      </div>
    </div>
  );
}

function CommunityBoard() {
  const items = [
    { icon: MessageCircle, title: 'Hỏi đáp nhanh', text: 'Thread ngắn, rõ context, dễ follow-up.' },
    { icon: Users, title: 'Nhóm theo chủ đề', text: 'Frontend, backend, mobile, AI và career.' },
    { icon: Zap, title: 'Thông báo đúng lúc', text: 'Theo dõi nội dung quan trọng, giảm spam.' },
  ];

  return (
    <div className="grid gap-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.title} className="flex gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#DDFBF5] text-[#0F766E]">
              <Icon size={20} aria-hidden />
            </span>
            <div>
              <h3 className="font-ui-title text-base text-[#082F49]">{item.title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">{item.text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AiPanel({ highlights }: { highlights: string[] }) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
      <div className="rounded-[1.5rem] bg-[#082F49] p-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-300/20 text-teal-100">
              <Bot size={22} aria-hidden />
            </span>
            <div>
              <p className="text-sm font-black">ZYNC AI</p>
              <p className="text-xs font-semibold text-slate-400">Assistant cho cộng đồng</p>
            </div>
          </div>
          <span className="rounded-full bg-teal-300/20 px-3 py-1 text-xs font-black text-teal-100">Active</span>
        </div>
        <div className="mt-6 space-y-3">
          {highlights.map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-2xl bg-white/8 px-4 py-3 text-sm font-semibold text-slate-200">
              <CheckCircle2 className="text-teal-200" size={18} aria-hidden />
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
