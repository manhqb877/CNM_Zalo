# Zync Server

Backend real-time messaging cho Zync Platform.

## 1. Tong quan

Server cung cap:
- REST API (auth, users, friends, conversations, messages, upload, posts)
- Socket.IO gateway cho giao tiep real-time
- Kafka workers de xu ly bat dong bo
- Redis cho cache, rate limit, presence, idempotency
- MongoDB la noi luu tru du lieu chinh

## 2. Cong nghe

| Nhom | Cong nghe |
|------|-----------|
| Runtime | Node.js 20 |
| Language | TypeScript |
| HTTP Framework | Express |
| Realtime | Socket.IO |
| Database | MongoDB + Mongoose |
| Cache / PubSub | Redis + ioredis |
| Queue | Kafka (kafkajs) |
| Validation | Zod |
| Test | Jest + Supertest |

## 3. Kien truc

Mo hinh: Scaled Modular Monolith (huong microservices).

- `src/modules/*`: moi domain nam trong mot module rieng
- `src/shared/*`: middleware, logger, error handling dung chung
- `src/infrastructure/*`: ket noi MongoDB, Redis, Kafka
- `src/socket/gateway.ts`: dang ky event Socket.IO
- `src/workers/*`: consumer cac topic Kafka

Luong xu ly tong quat:

1. Client goi REST hoac gui socket event.
2. Server xac thuc JWT va validate payload.
3. Service xu ly business logic.
4. Redis duoc dung cho cache/rate-limit/presence/idempotency.
5. Du lieu duoc ghi MongoDB, va mot so su kien day sang Kafka.
6. Worker tieu thu topic de xu ly bat dong bo.

## 4. Cau truc thu muc

```text
apps/server/
  src/
    app.ts
    main.ts
    infrastructure/
      database.ts
      redis.ts
      kafka.ts
    modules/
      auth/
      users/
      friends/
      groups/
      conversations/
      messages/
      upload/
    shared/
      errors/
      middleware/
      logger.ts
    socket/
      gateway.ts
    workers/
      message.worker.ts
      notification.worker.ts
  tests/
    unit/
    integration/
    load/
  scripts/
    seed.ts
```

## 5. Chay local

Chay tai root monorepo:

```bash
npm install
npm run docker:up
npm run dev:server
```

Mac dinh server chay tai `http://localhost:3000`.

Health check:

```bash
curl http://localhost:3000/health
```

## 6. Bien moi truong quan trong

Doc file `.env.example` o root. Cac bien can chu y:

- `PORT`
- `MONGODB_URI`
- `REDIS_URL`
- `KAFKA_ENABLED`, `KAFKA_BROKERS`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `OTP_HARDCODE`, `OTP_HARDCODE_VALUE`
- `OTP_RATE_LIMIT_MAX`, `OTP_RATE_LIMIT_WINDOW_SECONDS`
- `CLOUDINARY_*`
- `SMTP_*`
- `RESEND_API_KEY`, `RESEND_FROM`

Dev de test OTP nhieu lan:
- Dat `OTP_RATE_LIMIT_MAX=100`
- Dat `OTP_RATE_LIMIT_WINDOW_SECONDS=3600`

Neu can test OTP email nhanh khong verify domain Resend:
- Dat `OTP_EMAIL_PROVIDER=smtp`
- Dat `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`
- Dat `SMTP_USER=<gmail_that>`, `SMTP_PASS=<gmail_app_password>`, `SMTP_FROM=<gmail_that>`

OTP email mac dinh gui qua SMTP. Neu can Resend API, dat `OTP_EMAIL_PROVIDER=resend`
va them `RESEND_API_KEY`.

## 7.1 Seed data de test friends + messages + groups

Chay tai root monorepo:

```bash
npm run seed:qa --workspace=apps/server
```

Script se tao bo tai khoan test co:
- Quan he ban be (`accepted`, `pending`, `blocked`)
- Lich su chat 1-1
- Nhom chat va message status (`sent/delivered/read`)

## 7. Cac ky thuat quan trong

1. JWT Access + Refresh
- Access token han ngan (15 phut), refresh token han dai (7 ngay).
- Refresh token luu qua cookie http-only o flow web.

2. OTP va rate limiting
- OTP co gioi han tan suat theo IP va identifier.
- Redis luu key OTP va key rate limit theo TTL.

3. Idempotency cho gui tin
- Client gui `idempotencyKey`.
- Server check Redis truoc khi ghi DB de tranh gui trung do retry.

4. Cache co TTL
- Friends list, conversations, typing, presence deu su dung TTL cu the trong Redis.

5. Realtime cross-instance
- Socket.IO ket hop Redis adapter de fan-out event tren nhieu instance.

6. Kafka de tach ghi du lieu
- Event message duoc day vao topic `raw-messages`.
- Worker tieu thu va persist batch vao MongoDB.

## 8. Quy uoc phat trien

- Khong dat rate limit trong controller, chi dat o middleware.
- Error handling thong nhat qua `src/shared/errors`.
- Han che `any`, uu tien TypeScript strict.
- Them test unit/integration khi mo rong module.
