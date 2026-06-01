export function hasCompletedOnboardingProfile(user: any | null | undefined): boolean {
  if (!user) return false;

  const hasSkills = Array.isArray(user.skills) && user.skills.length > 0;
  const hasInterests = Array.isArray(user.interests) && user.interests.length > 0;
  const hasDevRole = typeof user.devRole === 'string' && user.devRole.trim().length > 0;

  return user.onboardingCompleted === true || hasSkills || hasInterests || hasDevRole;
}

export function getPostAuthRoute(user: any | null | undefined) {
  return hasCompletedOnboardingProfile(user) ? '/(tabs)/home' : '/(auth)/onboarding';
}
