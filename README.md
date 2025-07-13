# Gemini Backend Clone

A comprehensive backend system that clones Google Gemini's functionality with user authentication, real-time chat, AI integration, and subscription management.

## 🚀 Features

- **User Authentication** - JWT-based auth with refresh tokens
- **Real-time Chat** - WebSocket-powered chat rooms with typing indicators
- **AI Integration** - Google Gemini API for intelligent responses
- **Subscription System** - Stripe-powered billing with multiple tiers
- **Rate Limiting** - Redis-based rate limiting with subscription-aware quotas
- **Admin Panel** - Comprehensive admin controls and analytics
- **Real-time Notifications** - Socket.io for instant updates
- **Database Management** - PostgreSQL with Prisma ORM
- **Caching** - Redis for session management and performance
- **Monitoring** - Comprehensive logging and error handling

## 🏗️ Architecture

### Tech Stack
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Real-time**: Socket.io
- **AI**: Google Gemini API
- **Payments**: Stripe
- **Authentication**: JWT
- **Logging**: Winston
- **Validation**: Express Validator
- **Containerization**: Docker

### Project Structure
```
src/
├── config/          # Database and Redis configuration
├── controllers/     # Route handlers (organized in routes/)
├── middleware/      # Authentication, rate limiting, error handling
├── routes/          # API route definitions
├── services/        # Business logic (Gemini, Socket.io)
├── utils/           # Utilities (logger, validators)
└── index.ts         # Application entry point
```

## 🔧 Setup & Installation

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Stripe Account
- Google Gemini API Key

### Environment Variables
Copy `.env.example` to `.env` and configure:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://username:password@localhost:5432/gemini_backend"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key

# Google Gemini
GOOGLE_GEMINI_API_KEY=your-gemini-api-key

# Stripe
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
```

### Installation Steps

1. **Clone and Install**
```bash
npm install
```

2. **Database Setup**
```bash
# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# (Optional) Open Prisma Studio
npm run prisma:studio
```

3. **Development**
```bash
npm run dev
```

4. **Production Build**
```bash
npm run build
npm start
```

### Docker Deployment
```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build manually
npm run docker:build
npm run docker:run
```

## 🚀 Deployment

### Environment Setup
1. Set up PostgreSQL and Redis instances
2. Configure environment variables
3. Set up Stripe webhooks
4. Deploy using Docker or your preferred platform

### Database Migrations
```bash
# Production migration
npx prisma migrate deploy
```

### Monitoring
- Health check: `GET /health`
- Logs location: `logs/` directory
- Admin dashboard: `/api/admin/dashboard`

## 🧪 Testing

Run the test suite:
```bash
npm test
npm run test:watch
```
