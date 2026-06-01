# Zync Web

Web client cua Zync Platform, xay dung bang Next.js App Router.

## 1. Tong quan

Ung dung web phuc vu:
- Dang nhap dang ky (OTP, password, Google)
- Landing page, home dashboard, friends dashboard
- Tich hop API backend qua axios
- Tich hop socket de mo rong real-time

## 2. Cong nghe

| Nhom | Cong nghe |
|------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| UI | React 18 |
| Styling | Tailwind CSS |
| State | Zustand |
| HTTP Client | Axios |
| Realtime client | socket.io-client |
| Test | Jest + Testing Library |

## 3. Kien truc frontend

Kien truc theo huong tach lop ro rang:

- `src/app/*`: route va page level (App Router)
- `src/components/*`: UI theo Atomic Design (atoms/molecules/organisms)
- `src/hooks/*`: custom hooks cho state va interaction logic
- `src/services/*`: lop giao tiep API va socket

Muc tieu:
- Tach business logic ra khoi component view
- Tai su dung UI qua Atomic Design
- Don gian hoa doi endpoint qua service layer

## 4. Cau truc thu muc

```text
apps/web/
  src/
    app/
      page.tsx
      layout.tsx
      globals.css
      auth/
      home/
      friends/
    components/
      auth/
      home/
      friends/
      home-dashboard/
    hooks/
      use-login-form.ts
      use-home-dashboard.ts
      use-friends-dashboard.ts
    services/
      api.ts
      auth.ts
      friends.ts
      upload.ts
      socket.ts
  public/
  next.config.mjs
  tailwind.config.js
```

## 5. Chay local

Chay tai root monorepo:

```bash
npm install
npm run dev:web
```

Mac dinh web chay tai `http://localhost:3001`.

Yeu cau backend dang chay tai `http://localhost:3000` de cac API hoat dong day du.

## 6. Bien moi truong can thiet

Dat trong `.env` o root monorepo:

- `NEXT_PUBLIC_API_URL=http://localhost:3000`
- `NEXT_PUBLIC_WS_URL=ws://localhost:3000`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID=<google-client-id>`

## 7. Cac ky thuat quan trong

1. App Router
- Dinh tuyen bang thu muc `src/app`.
- Moi route co page rieng, de mo rong SSR/streaming sau nay.

2. Atomic Design
- UI duoc chia nho thanh atoms, molecules, organisms.
- Giam duplicate code va de scale giao dien.

3. Service layer
- Toan bo call backend gom trong `src/services`.
- Tranh de component goi truc tiep axios tung noi.

4. Hook layer
- Custom hooks gom state, action va loading/error handling.
- View component tap trung render.

5. Token handling
- Access token duoc quan ly phu hop flow dang nhap cua app.
- Cac request can bao ve duoc gui qua lop service de gan auth header nhat quan.

## 8. Quy uoc phat trien

- Uu tien TypeScript ro type, tranh `any`.
- Giu component nho va de test.
- Khi them feature moi, cap nhat du ca 3 lop: route, hook, service.
- Dong bo contract API voi backend truoc khi merge.
