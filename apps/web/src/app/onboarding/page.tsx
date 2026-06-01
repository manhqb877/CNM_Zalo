'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Code2,
  GraduationCap,
  Briefcase,
  UserCircle,
  Link2,
  Globe,
  ChevronRight,
  ChevronLeft,
  Rocket,
  CheckCircle2,
  Zap,
  MessageSquare,
  PenLine,
  Search,
  Home,
  Sparkles,
} from 'lucide-react';
import { apiClient } from '@/services/api';
import { PageLoading } from '@/components/shared/page-loading';
import { ButtonSpinner } from '@/components/shared/loading-system';
import { getAccessToken } from '@/utils/auth-token';

const SKILL_TAGS = [
  'javascript', 'typescript', 'react', 'nextjs', 'vue', 'angular', 'svelte',
  'nodejs', 'express', 'nestjs', 'python', 'django', 'fastapi',
  'java', 'spring', 'go', 'rust', 'c-sharp', 'dotnet',
  'react-native', 'flutter', 'swift', 'kotlin',
  'postgresql', 'mongodb', 'redis', 'mysql',
  'docker', 'kubernetes', 'aws', 'gcp', 'azure',
  'graphql', 'rest-api', 'grpc',
  'git', 'ci-cd', 'testing', 'security',
  'ai-ml', 'data-science', 'blockchain', 'web3',
];

const INTEREST_TAGS = [
  'frontend', 'backend', 'fullstack', 'mobile', 'devops', 'cloud',
  'ai-ml', 'data', 'security', 'blockchain', 'gamedev', 'embedded',
  'open-source', 'career', 'startup', 'freelance',
];

const DEV_ROLES = [
  { value: 'developer', label: 'Developer', Icon: Code2 },
  { value: 'student', label: 'Sinh viên IT', Icon: GraduationCap },
  { value: 'mentor', label: 'Mentor', Icon: UserCircle },
  { value: 'recruiter', label: 'Recruiter', Icon: Briefcase },
  { value: 'other', label: 'Khác', Icon: UserCircle },
];

const STEP_META = [
  {
    id: 1,
    label: 'Hồ sơ',
    title: 'Giới thiệu nhanh về bạn',
    description: 'Thêm vai trò, bio và một vài thông tin cơ bản để cộng đồng dễ nhận diện hơn.',
  },
  {
    id: 2,
    label: 'Kỹ năng',
    title: 'Chọn kỹ năng & mối quan tâm',
    description: 'Hồ sơ rõ hơn sẽ giúp đề xuất channel, mentor và nội dung phù hợp hơn với bạn.',
  },
  {
    id: 3,
    label: 'Liên kết',
    title: 'Liên kết social & portfolio',
    description: 'Đây là lớp tin cậy để bạn showcase công việc và kết nối chất lượng hơn.',
  },
];

export default function OnboardingPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <OnboardingPageContent />
    </Suspense>
  );
}

function OnboardingPageContent() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/auth');
    }
  }, [router]);

  const [devRole, setDevRole] = useState('developer');
  const [bio, setBio] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [githubUrl, setGithubUrl] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');

  const activeStep = STEP_META[step - 1];
  const progressWidth = `${(step / STEP_META.length) * 100}%`;
  const totalLinks = [githubUrl, portfolioUrl, linkedinUrl].filter(Boolean).length;

  const handleNext = () => setStep((s) => Math.min(s + 1, STEP_META.length));
  const handlePrev = () => setStep((s) => Math.max(s - 1, 1));
  const toggleSkill = (skill: string) =>
    setSkills((prev) => prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]);
  const toggleInterest = (interest: string) =>
    setInterests((prev) => prev.includes(interest) ? prev.filter((s) => s !== interest) : [...prev, interest]);

  const handleFinish = async () => {
    try {
      setIsSubmitting(true);
      await apiClient.patch('/api/users/me', {
        devRole,
        bio,
        skills,
        interests,
        githubUrl: githubUrl || undefined,
        portfolioUrl: portfolioUrl || undefined,
        linkedinUrl: linkedinUrl || undefined,
        onboardingCompleted: true,
      });
      // Hien man hinh hoan thanh thay vi redirect thang
      setShowCompletion(true);
    } catch (error) {
      console.error('Failed to save onboarding data', error);
      alert('Có lỗi xảy ra, vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoToExplore = () => {
    // Redirect den Explore voi skills filter
    const skillsParam = skills.slice(0, 5).join(',');
    if (skillsParam) {
      router.push(`/explore?skills=${encodeURIComponent(skillsParam)}`);
    } else {
      router.push('/explore');
    }
  };

  const handleGoHome = () => {
    router.push('/home');
  };

  return (
    <div className="zync-page-shell min-h-screen px-4 py-8 sm:py-10">
      <div className="zync-page-container">
        {showCompletion ? (
          /* Man hinh hoan thanh onboarding */
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="zync-soft-card zync-soft-card-elevated mb-8 rounded-[2rem] p-8 sm:p-12">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-accent-light mx-auto">
                <Sparkles className="h-10 w-10 text-accent" />
              </div>
              <h1 className="font-ui-title mb-3 text-3xl text-text-primary">
                Chúc mừng bạn!
              </h1>
              <p className="font-ui-content mx-auto max-w-md text-base leading-7 text-text-secondary">
                Hồ sơ của bạn đã được lưu thành công. Giờ đây bạn có thể khám phá cộng đồng developer và kết nối với những người cùng chí hướng.
              </p>
              {skills.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {skills.slice(0, 5).map((skill) => (
                    <span key={skill} className="rounded-full border border-accent bg-accent-light px-3 py-1 text-xs text-accent-strong">
                      {skill}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <h2 className="font-ui-title mb-6 text-xl text-text-primary">
              Bạn muốn làm gì tiếp theo?
            </h2>

            <div className="grid w-full max-w-lg gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleGoToExplore}
                className="zync-soft-card zync-soft-card-elevated flex flex-col items-center gap-3 rounded-[1.8rem] p-6 text-center transition hover:shadow-lg"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-light">
                  <Search className="h-7 w-7 text-accent" />
                </div>
                <div>
                  <p className="font-ui-title text-base text-text-primary">Khám phá Developer</p>
                  <p className="font-ui-meta mt-1 text-xs text-text-secondary">
                    Tìm developer cùng tech stack với bạn
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={handleGoHome}
                className="zync-soft-card zync-soft-card-elevated flex flex-col items-center gap-3 rounded-[1.8rem] p-6 text-center transition hover:shadow-lg"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-hover">
                  <Home className="h-7 w-7 text-text-secondary" />
                </div>
                <div>
                  <p className="font-ui-title text-base text-text-primary">Về Trang chủ</p>
                  <p className="font-ui-meta mt-1 text-xs text-text-secondary">
                    Khám phá tính năng chat và cộng đồng
                  </p>
                </div>
              </button>
            </div>
          </div>
        ) : (
        <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          {/* Left panel */}
          <section className="zync-soft-card zync-soft-card-elevated rounded-[2rem] p-6 sm:p-8">
            <span className="zync-soft-kicker flex items-center gap-1.5">
              <Rocket className="h-3.5 w-3.5" />
              Developer Onboarding
            </span>
            <h1 className="font-ui-title mt-5 max-w-[14ch] text-balance text-[clamp(2.1rem,4vw,3.6rem)] leading-[1.02] text-text-primary">
              Chào mừng đến với ZYNC!
            </h1>
            <p className="font-ui-content mt-4 max-w-[46ch] text-base leading-8 text-text-secondary">
              Nơi kết nối cộng đồng Developer Việt Nam. Hoàn thành hồ sơ để nhận đề xuất channel và mentor phù hợp với bạn.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <span className="zync-soft-badge flex items-center gap-1.5 text-sm"><Zap className="h-3.5 w-3.5" />AI DevMentor</span>
              <span className="zync-soft-badge flex items-center gap-1.5 text-sm"><MessageSquare className="h-3.5 w-3.5" />Real-time Chat</span>
              <span className="zync-soft-badge flex items-center gap-1.5 text-sm"><PenLine className="h-3.5 w-3.5" />Community Posts</span>
            </div>

            <div className="mt-8 rounded-[1.6rem] p-5 zync-soft-card-muted">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-ui-meta text-[0.72rem] uppercase tracking-[0.18em] text-accent-strong">Tiến trình</p>
                  <p className="font-ui-title mt-2 text-xl text-text-primary">{activeStep?.title}</p>
                </div>
                <span className="zync-soft-badge zync-soft-badge-active">Bước {step}/3</span>
              </div>
              <p className="font-ui-content mt-3 text-sm leading-7 text-text-secondary">{activeStep?.description}</p>
              <div className="mt-6">
                <div className="zync-soft-progress">
                  <span className="zync-soft-progress-bar" style={{ width: progressWidth }} />
                </div>
              </div>
              <div className="mt-6 zync-soft-stepper">
                {STEP_META.map((item) => (
                  <span key={item.id} className={`zync-soft-step ${item.id === step ? 'zync-soft-step-active' : ''}`}>
                    {item.id < step ? <CheckCircle2 className="mr-1 inline h-3 w-3 text-accent" /> : null}
                    {item.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { value: skills.length, label: 'Kỹ năng' },
                { value: interests.length, label: 'Sở thích' },
                { value: totalLinks, label: 'Liên kết' },
              ].map(({ value, label }) => (
                <div key={label} className="rounded-[1.4rem] border border-border bg-white/55 px-4 py-4">
                  <p className="font-ui-title text-[1.8rem] leading-none text-accent-strong">{value}</p>
                  <p className="font-ui-meta mt-2 text-[0.68rem] uppercase tracking-[0.18em] text-text-tertiary">{label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Right panel – Form */}
          <section className="zync-soft-card rounded-[2rem] p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-ui-meta text-[0.72rem] uppercase tracking-[0.18em] text-accent-strong">Thiết lập hồ sơ</p>
                <h2 className="font-ui-title mt-2 text-[clamp(1.5rem,3vw,2.2rem)] text-text-primary">{activeStep?.title}</h2>
              </div>
              <span className="zync-soft-badge">Bước {step}</span>
            </div>
            <p className="font-ui-content mt-3 text-sm leading-7 text-text-secondary">{activeStep?.description}</p>

            {/* Step 1: Profile */}
            {step === 1 && (
              <div className="mt-8 space-y-6">
                <div>
                  <label className="font-ui-meta mb-3 block text-[0.72rem] uppercase tracking-[0.18em] text-text-tertiary">Vai trò của bạn</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {DEV_ROLES.map(({ value, label, Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setDevRole(value)}
                        className={`flex items-center gap-2 rounded-[1rem] border px-3 py-2.5 text-sm font-medium transition ${
                          devRole === value
                            ? 'border-accent bg-accent-light text-accent-strong shadow-sm'
                            : 'border-border bg-white/75 text-text-secondary hover:border-accent'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="font-ui-meta mb-2 block text-[0.72rem] uppercase tracking-[0.18em] text-text-tertiary">Giới thiệu bản thân</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Nói ngắn gọn bạn đang xây dựng gì, quan tâm điều gì, và cần tìm mentor hay community nào..."
                    className="zync-soft-textarea"
                  />
                </div>

                <div className="rounded-[1.4rem] p-5 zync-soft-card-muted">
                  <p className="font-ui-meta flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.18em] text-accent-strong">
                    <Zap className="h-3.5 w-3.5" />
                    Gợi ý
                  </p>
                  <p className="font-ui-content mt-3 text-sm leading-7 text-text-secondary">
                    Bio ngắn, vai trò rõ ràng và link social đầy đủ sẽ giúp profile của bạn được đề xuất nhiều hơn.
                  </p>
                </div>
              </div>
            )}

            {/* Step 2: Skills & Interests */}
            {step === 2 && (
              <div className="mt-8 space-y-8">
                <div>
                  <label className="font-ui-meta mb-3 flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.18em] text-text-tertiary">
                    <Code2 className="h-3.5 w-3.5" />
                    Kỹ năng lập trình
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {SKILL_TAGS.map((skill) => (
                      <button
                        key={skill}
                        type="button"
                        onClick={() => toggleSkill(skill)}
                        className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                          skills.includes(skill)
                            ? 'border border-transparent bg-text-primary text-white shadow-sm'
                            : 'border border-border bg-white/75 text-text-secondary hover:border-accent hover:text-text-primary'
                        }`}
                      >
                        {skill}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="font-ui-meta mb-3 flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.18em] text-text-tertiary">
                    <Rocket className="h-3.5 w-3.5" />
                    Lĩnh vực quan tâm
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {INTEREST_TAGS.map((interest) => (
                      <button
                        key={interest}
                        type="button"
                        onClick={() => toggleInterest(interest)}
                        className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                          interests.includes(interest)
                            ? 'border border-transparent bg-text-primary text-white shadow-sm'
                            : 'border border-border bg-white/75 text-text-secondary hover:border-accent hover:text-text-primary'
                        }`}
                      >
                        {interest}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Links */}
            {step === 3 && (
              <div className="mt-8 space-y-6">
                <div className="grid gap-5 lg:grid-cols-2">
                  <div>
                    <label className="font-ui-meta mb-2 flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.18em] text-text-tertiary">
                      <Link2 className="h-3.5 w-3.5" />
                      GitHub
                    </label>
                    <input
                      type="url"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/username"
                      className="zync-soft-input"
                    />
                  </div>

                  <div>
                    <label className="font-ui-meta mb-2 flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.18em] text-text-tertiary">
                      <Link2 className="h-3.5 w-3.5" />
                      LinkedIn
                    </label>
                    <input
                      type="url"
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      placeholder="https://linkedin.com/in/username"
                      className="zync-soft-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-ui-meta mb-2 flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.18em] text-text-tertiary">
                    <Globe className="h-3.5 w-3.5" />
                    Portfolio / Website cá nhân
                  </label>
                  <input
                    type="url"
                    value={portfolioUrl}
                    onChange={(e) => setPortfolioUrl(e.target.value)}
                    placeholder="https://yourwebsite.com"
                    className="zync-soft-input"
                  />
                </div>

                <div className="rounded-[1.4rem] p-5 zync-soft-card-muted">
                  <p className="font-ui-meta flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.18em] text-accent-strong">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Lớp tin cậy
                  </p>
                  <p className="font-ui-content mt-3 text-sm leading-7 text-text-secondary">
                    Bạn có thể bỏ qua bước này, nhưng việc thêm link sẽ giúp người khác review nhanh hơn và tạo kết nối chất lượng hơn.
                  </p>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
              {step > 1 ? (
                <button onClick={handlePrev} className="zync-soft-button-ghost flex items-center gap-1.5 px-5 py-2.5 text-sm">
                  <ChevronLeft className="h-4 w-4" />
                  Quay lại
                </button>
              ) : <div />}

              {step < 3 ? (
                <button onClick={handleNext} className="zync-soft-button flex items-center gap-1.5 px-6 py-2.5 text-sm">
                  Tiếp theo
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button onClick={handleFinish} disabled={isSubmitting} className="zync-soft-button flex items-center gap-2 px-6 py-2.5 text-sm">
                  {isSubmitting ? <ButtonSpinner size="sm" tone="light" /> : <Rocket className="h-4 w-4" />}
                  {isSubmitting ? 'Đang lưu...' : 'Bắt đầu!'}
                </button>
              )}
            </div>
          </section>
        </div>
        )}
      </div>
    </div>
  );
}
