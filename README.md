# Zync Platform

Real-time messaging platform – Zalo Clone.

**Stack:** Node.js + Socket.IO + MongoDB + Redis + Kafka | Next.js + React Native  
**Architecture:** Scaled Modular Monolith (toward Microservices)  
**Version:** 2.0

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [API Overview](#api-overview)
- [Scripts](#scripts)
- [Development Roadmap](#development-roadmap)

---

## Features

- One-to-one and group messaging (up to 100 members)
- Real-time delivery with Socket.IO and Redis Pub/Sub
- Message status: sent, delivered, read
- Typing indicators and online presence
- Media upload via Cloudinary signed upload (no proxying through server)
- Push notifications via FCM / APNs
- JWT authentication with OTP verification
- Multi-device sync

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 LTS |
| API Framework | Express.js |
| Real-time | Socket.IO |
| Database | MongoDB 7 (Mongoose) |
| Cache / Pub-Sub | Redis 7 |
| Message Queue | Kafka (Redpanda locally) |
| Web Frontend | Next.js 14 (App Router) |
| Mobile | React Native (Expo) |
| Media Storage | Cloudinary |
| Email | Resend (SMTP relay) |
| Push Notification | FCM / APNs |
| Testing | Jest, Artillery/K6 |
| CI/CD | GitHub Actions |

---

## Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Docker Desktop (for Redis + Redpanda locally)
- Accounts on: MongoDB Atlas, Cloudinary, Resend (all free tier)

---

## Local Development Setup

### 1. Cloud services (one-time setup)

**MongoDB Atlas M0 (free)**
1. Create account at [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a free M0 cluster
3. Database Access: create a database user, note the username and password
4. Network Access: allow `0.0.0.0/0` for development
5. Connect > Drivers > copy the connection string

**Cloudinary (free – 25 credits/month)**
1. Create account at [cloudinary.com](https://cloudinary.com)
2. Dashboard > Settings > Upload > Add upload preset named `zync-media`, mode: Signed
3. Note your Cloud Name, API Key, and API Secret from the dashboard

**Resend (free – 100 emails/day)**
1. Create account at [resend.com](https://resend.com)
2. Settings > API Keys > Create API Key
3. Note the API key (starts with `re_`)

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in the following values in `.env`:

```
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/zyncdb?retryWrites=true&w=majority&appName=<appName>
CLOUDINARY_CLOUD_NAME=<your-cloud-name>
CLOUDINARY_API_KEY=<your-api-key>
CLOUDINARY_API_SECRET=<your-api-secret>
SMTP_PASS=re_<your-resend-api-key>
```

### 3. Start local infrastructure

```bash
# Starts Redis (~5MB RAM) + Redpanda/Kafka (~150MB RAM)
docker compose -f infra/docker-compose.yml up -d
```

Services available locally:

| Service | URL |
|---------|-----|
| Redis | `redis://localhost:6379` |
| Kafka (Redpanda) | `localhost:9092` |
| Redpanda Console | http://localhost:8080 |

### 4. Install dependencies

```bash
npm install
```

### 5. Start development servers

```bash
# Backend API + WebSocket server (port 3000)
npm run dev:server

# Web frontend (port 3001)
npm run dev:web
```

For LAN demo (same Wi-Fi, keep local mode unchanged):

```bash
# Backend bind to LAN
npm run dev:server:lan

# Web bind to LAN
npm run dev:web:lan

# Mobile Expo over LAN
npm run dev:mobile:lan
```

Then open web from another device via: `http://<YOUR_LAN_IP>:3001`.

### 6. Verify

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"..."}
```

---

## Environment Variables

See [.env.example](.env.example) for the full list with comments.

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB Atlas connection string | Yes |
| `REDIS_URL` | Redis URL (local: `redis://localhost:6379`) | Yes |
| `KAFKA_BROKERS` | Kafka broker address | Yes |
| `JWT_SECRET` | Access token signing key | Yes |
| `JWT_REFRESH_SECRET` | Refresh token signing key | Yes |
| `OTP_HARDCODE` | Use fixed OTP `123456` in dev | Dev only |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | Yes |
| `CLOUDINARY_API_KEY` | Cloudinary API key | Yes |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | Yes |
| `SMTP_HOST` | SMTP host (`smtp.resend.com`) | Yes |
| `SMTP_PASS` | Resend API key | Yes |

---

## Project Structure

```
zync-platform/
├── apps/
│   ├── server/        # Express API + Socket.IO + Kafka workers
│   ├── web/           # Next.js web application
│   └── mobile/        # React Native (Expo) mobile application
├── packages/
│   └── shared-types/  # TypeScript types shared across apps
└── infra/
    └── docker-compose.yml  # Redis + Redpanda (local dev)
```

---

## API Overview

All API routes are prefixed with `/api`.

| Route | Description |
|-------|-------------|
| `GET /health` | Server health check |
| `POST /api/auth/register` | Register with OTP |
| `POST /api/auth/verify-otp` | Verify OTP, receive JWT |
| `POST /api/auth/refresh` | Refresh access token |
| `POST /api/auth/logout` | Logout, revoke token |
| `GET /api/users/:id` | Get user profile |
| `GET /api/friends` | List friends |
| `POST /api/friends/request` | Send friend request |
| `GET /api/conversations` | List conversations |
| `GET /api/messages/:conversationId` | Get messages (cursor-paginated) |
| `GET /api/groups/:id` | Get group info |
| `POST /api/upload/sign` | Get Cloudinary signature for direct upload |

### Socket.IO Events

**Client to Server**

| Event | Payload |
|-------|---------|
| `send_message` | `{ conversationId, content, type, idempotencyKey }` |
| `message_read` | `{ conversationId, messageIds[] }` |
| `typing_start` | `{ conversationId }` |
| `typing_stop` | `{ conversationId }` |

**Server to Client**

| Event | Payload |
|-------|---------|
| `receive_message` | `{ messageId, senderId, content, type, mediaUrl, createdAt }` |
| `status_update` | `{ messageId, status, userId }` |
| `typing_indicator` | `{ userId, conversationId, isTyping }` |
| `user_online` | `{ userId, online, lastSeen }` |

---

## Scripts

Run from the monorepo root:

| Script | Description |
|--------|-------------|
| `npm run dev:server` | Start backend in watch mode |
| `npm run dev:server:lan` | Start backend for LAN demo (`HOST=0.0.0.0`) |
| `npm run dev:web` | Start Next.js in dev mode |
| `npm run dev:web:lan` | Start Next.js bound to LAN (`0.0.0.0:3001`) |
| `npm run dev:mobile:lan` | Start Expo in LAN mode |
| `npm run build` | Build all packages |
| `npm run test` | Run tests across all workspaces |
| `npm run typecheck` | TypeScript check across all workspaces |
| `npm run docker:up` | Start local Docker services |
| `npm run docker:down` | Stop local Docker services |
| `npm run docker:logs` | Follow Docker logs |

---

## Development Roadmap

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Foundation & Infrastructure | Complete |
| 2 | Authentication & User Management | Pending |
| 3 | Friends & Contacts | Pending |
| 4 | Group Management | Pending |
| 5 | Real-time Messaging | Pending |
| 6 | Presence & Stories | Pending |
| 7 | Push Notifications | Pending |
| 8 | Quality & Hardening | Pending |
| 9 | Observability & Production | Pending |
