import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Input } from '../../src/ui/Input';
import { Button } from '../../src/ui/Button';
import { GlassPanel } from '../../src/ui/GlassPanel';
import { AuthHeader } from '../../src/components/AuthHeader';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/fonts';
import api from '../../src/services/api';
import { useAuthStore } from '../../src/store/useAuthStore';
import { Sparkles } from 'lucide-react-native';

const TOTAL_STEPS = 3;

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
  { id: 'developer', label: 'Developer' },
  { id: 'student', label: 'Sinh viên IT' },
  { id: 'mentor', label: 'Mentor' },
  { id: 'recruiter', label: 'Recruiter' },
  { id: 'other', label: 'Khác' },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const updateUser = useAuthStore(state => state.updateUser);
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);

  const [devRole, setDevRole] = useState('developer');
  const [bio, setBio] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [githubUrl, setGithubUrl] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [errors, setErrors] = useState<{ bio?: string }>({});

  const toggleSkill = (skill: string) => {
    setSkills(prev => prev.includes(skill)
      ? prev.filter(s => s !== skill)
      : [...prev, skill],
    );
  };

  const toggleInterest = (interest: string) => {
    setInterests(prev => prev.includes(interest)
      ? prev.filter(s => s !== interest)
      : [...prev, interest],
    );
  };

  const validateBio = (bioValue: string): boolean => {
    if (bioValue && bioValue.length > 500) {
      setErrors(prev => ({ ...prev, bio: 'Giới thiệu không được vượt quá 500 ký tự' }));
      return false;
    }
    setErrors(prev => ({ ...prev, bio: undefined }));
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateBio(bio)) {
      return;
    }
    setStep(prev => Math.min(prev + 1, TOTAL_STEPS));
  };

  const handleBack = () => {
    setStep(prev => Math.max(prev - 1, 1));
  };

  const saveOnboarding = async (payload: Record<string, unknown>) => {
    const res = await api.patch('/users/me', payload);
    if (res.data.user) {
      updateUser(res.data.user);
    }
    router.replace('/(tabs)/home');
  };

  const handleFinish = async () => {
    if (!validateBio(bio)) {
      return;
    }

    try {
      setIsLoading(true);
      await saveOnboarding({
        devRole,
        bio,
        skills,
        interests,
        githubUrl: githubUrl || undefined,
        portfolioUrl: portfolioUrl || undefined,
        linkedinUrl: linkedinUrl || undefined,
        onboardingCompleted: true,
      });
    } catch (error: any) {
      const message = error.response?.data?.message || 'Có lỗi xảy ra khi lưu thông tin';
      Alert.alert('Lỗi', message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = async () => {
    try {
      setIsSkipping(true);
      await saveOnboarding({ onboardingCompleted: true });
    } catch (error: any) {
      const message = error.response?.data?.message || 'Có lỗi xảy ra khi bỏ qua onboarding';
      Alert.alert('Lỗi', message);
    } finally {
      setIsSkipping(false);
    }
  };

  return (
    <LinearGradient
      colors={[colors.backgroundSoft, colors.backgroundMid, colors.backgroundDeep]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <AuthHeader
              title="Hoàn thiện hồ sơ"
              subtitle={`Bước ${step}/${TOTAL_STEPS}`}
            />

            <View style={styles.welcomeSection}>
              <View style={styles.welcomeIcon}>
                <Sparkles size={28} color={colors.accent} strokeWidth={2} />
              </View>
              <Text style={styles.welcomeTitle}>Chào mừng bạn đến với Zync!</Text>
              <Text style={styles.welcomeSubtitle}>
                Hồ sơ rõ ràng giúp bạn tìm developer, mentor và cộng đồng phù hợp hơn.
              </Text>
            </View>

            <GlassPanel style={styles.formCard}>
              {step === 1 && (
                <View>
                  <Text style={styles.label}>Vai trò của bạn</Text>
                  <View style={styles.roleContainer}>
                    {DEV_ROLES.map((role) => (
                      <TouchableOpacity
                        key={role.id}
                        style={[
                          styles.roleChip,
                          devRole === role.id && styles.roleChipActive,
                        ]}
                        onPress={() => setDevRole(role.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          styles.roleText,
                          devRole === role.id && styles.roleTextActive,
                        ]}>
                          {role.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>Giới thiệu bản thân</Text>
                  <Input
                    placeholder="Bạn đang xây dựng gì, quan tâm điều gì, muốn kết nối với ai..."
                    value={bio}
                    onChangeText={(text) => {
                      setBio(text);
                      if (errors.bio) validateBio(text);
                    }}
                    onBlur={() => validateBio(bio)}
                    error={errors.bio}
                    multiline
                    numberOfLines={4}
                    style={styles.bioInput}
                  />
                </View>
              )}

              {step === 2 && (
                <View>
                  <Text style={styles.label}>Kỹ năng lập trình</Text>
                  <View style={styles.skillsContainer}>
                    {SKILL_TAGS.map((skill) => {
                      const isSelected = skills.includes(skill);
                      return (
                        <TouchableOpacity
                          key={skill}
                          style={[
                            styles.skillChip,
                            isSelected && styles.skillChipActive,
                          ]}
                          onPress={() => toggleSkill(skill)}
                          activeOpacity={0.7}
                        >
                          <Text style={[
                            styles.skillText,
                            isSelected && styles.skillTextActive,
                          ]}>
                            {skill}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.skillHint}>Đã chọn: {skills.length} kỹ năng</Text>

                  <Text style={[styles.label, styles.sectionGap]}>Lĩnh vực quan tâm</Text>
                  <View style={styles.skillsContainer}>
                    {INTEREST_TAGS.map((interest) => {
                      const isSelected = interests.includes(interest);
                      return (
                        <TouchableOpacity
                          key={interest}
                          style={[
                            styles.skillChip,
                            isSelected && styles.skillChipActive,
                          ]}
                          onPress={() => toggleInterest(interest)}
                          activeOpacity={0.7}
                        >
                          <Text style={[
                            styles.skillText,
                            isSelected && styles.skillTextActive,
                          ]}>
                            {interest}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.skillHint}>Đã chọn: {interests.length} mối quan tâm</Text>
                </View>
              )}

              {step === 3 && (
                <View>
                  <Text style={styles.label}>GitHub URL</Text>
                  <Input
                    placeholder="https://github.com/username"
                    value={githubUrl}
                    onChangeText={setGithubUrl}
                    autoCapitalize="none"
                    keyboardType="url"
                  />

                  <Text style={[styles.label, styles.linkLabel]}>LinkedIn URL</Text>
                  <Input
                    placeholder="https://linkedin.com/in/username"
                    value={linkedinUrl}
                    onChangeText={setLinkedinUrl}
                    autoCapitalize="none"
                    keyboardType="url"
                  />

                  <Text style={[styles.label, styles.linkLabel]}>Portfolio / Website</Text>
                  <Input
                    placeholder="https://yourwebsite.com"
                    value={portfolioUrl}
                    onChangeText={setPortfolioUrl}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                </View>
              )}

              <View style={styles.buttonRow}>
                {step > 1 ? (
                  <Button
                    title="Quay lại"
                    onPress={handleBack}
                    variant="outline"
                    style={styles.backButton}
                  />
                ) : (
                  <View style={styles.backButton} />
                )}
                <Button
                  title={step === TOTAL_STEPS ? 'Hoàn thành' : 'Tiếp tục'}
                  onPress={step === TOTAL_STEPS ? handleFinish : handleNext}
                  isLoading={isLoading}
                  style={styles.finishButton}
                />
              </View>
            </GlassPanel>

            <TouchableOpacity
              style={[styles.skipButton, isSkipping && styles.skipButtonDisabled]}
              onPress={handleSkip}
              disabled={isSkipping}
              activeOpacity={0.7}
            >
              <Text style={styles.skipText}>{isSkipping ? 'Đang bỏ qua...' : 'Bỏ qua bây giờ'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 8,
  },
  welcomeSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  welcomeIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.glassPanel,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: colors.glassGlow,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  welcomeTitle: {
    ...typography.h2,
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    ...typography.body,
    color: colors.textSubtle,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  formCard: {
    padding: 20,
    marginBottom: 16,
  },
  label: {
    ...typography.caption,
    color: colors.text,
    marginBottom: 12,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  sectionGap: {
    marginTop: 20,
  },
  roleContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  roleChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glassPanel,
  },
  roleChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  roleText: {
    ...typography.caption,
    color: colors.textSubtle,
    fontFamily: 'BeVietnamPro_500Medium',
  },
  roleTextActive: {
    color: colors.text,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  bioInput: {
    height: 96,
    textAlignVertical: 'top',
  },
  skillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  skillChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glassPanel,
  },
  skillChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  skillText: {
    ...typography.caption,
    color: colors.textSubtle,
    fontFamily: 'BeVietnamPro_500Medium',
  },
  skillTextActive: {
    color: colors.text,
    fontFamily: 'BeVietnamPro_600SemiBold',
  },
  skillHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  linkLabel: {
    marginTop: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 28,
  },
  backButton: {
    flex: 1,
  },
  finishButton: {
    flex: 1,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  skipButtonDisabled: {
    opacity: 0.6,
  },
  skipText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
