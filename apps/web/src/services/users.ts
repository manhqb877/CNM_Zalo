import { apiClient } from './api';

export interface MeUser {
  _id: string;
  username?: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  bio?: string;
  devRole?: string;
  skills?: string[];
  interests?: string[];
  githubUrl?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  onboardingCompleted?: boolean;
  createdAt?: string;
  globalViolationCount?: number;
  trustScore?: number;
  toastNotifications?: boolean;
  allowSearchProfile?: boolean;
  allowFriendRequest?: boolean;
  showOnlineStatus?: boolean;
  isOnline?: boolean;
  lastSeenAt?: string | null;
}

export interface PublicUserProfile {
  _id: string;
  username?: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  devRole?: string;
  skills?: string[];
  interests?: string[];
  githubUrl?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  emailMasked?: string;
  friendCount: number;
  mutualFriends: number;
  createdAt?: string;
}

export interface UpdateMyProfilePayload {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  devRole?: string;
  skills?: string[];
  interests?: string[];
  githubUrl?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  onboardingCompleted?: boolean;
}

export async function fetchMyProfile(): Promise<MeUser> {
  const { data } = await apiClient.get<{ success: boolean; user: MeUser }>('/api/users/me');
  return data.user;
}

export async function updateMyProfile(payload: UpdateMyProfilePayload): Promise<MeUser> {
  const { data } = await apiClient.patch<{ success: boolean; user: MeUser }>('/api/users/me', payload);
  return data.user;
}

/** Lấy profile công khai của user khác (masked PII + friend count + mutual friends) */
export async function fetchUserProfile(userId: string): Promise<PublicUserProfile> {
  const { data } = await apiClient.get<{ success: boolean; user: PublicUserProfile }>(`/api/users/${userId}`);
  return data.user;
}

/** Đếm tổng số bạn bè (của user hiện tại) */
export async function fetchFriendsCount(): Promise<number> {
  const { data } = await apiClient.get<{ success: boolean; count: number }>('/api/friends/count');
  return data.count;
}

/**
 * Upload avatar lên AWS S3 qua server (POST /api/users/me/avatar).
 * Gửi multipart/form-data với field "avatar".
 * @param file File ảnh từ input[type=file]
 * @param onProgress Callback tiến trình (0-100)
 * @returns URL S3 của avatar mới
 */
export async function uploadAvatar(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('avatar', file);

    const apiUrl = (process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000').replace(/\/$/, '');

    // Lấy access token từ cookie để gửi kèm (nếu dùng httpOnly cookie thì XHR tự gửi credentials)
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiUrl}/api/users/me/avatar`);
    xhr.withCredentials = true; // gửi httpOnly cookie

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText) as { success: boolean; avatarUrl: string };
          if (result.success && result.avatarUrl) {
            resolve(result.avatarUrl);
          } else {
            reject(new Error('Upload avatar thất bại'));
          }
        } catch {
          reject(new Error('Phản hồi không hợp lệ từ server'));
        }
        return;
      }

      try {
        const parsed = JSON.parse(xhr.responseText) as { error?: string };
        reject(new Error(parsed.error ?? `Upload thất bại (${xhr.status})`));
      } catch {
        reject(new Error(`Upload thất bại (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('Lỗi kết nối khi upload avatar'));
    xhr.send(formData);
  });
}