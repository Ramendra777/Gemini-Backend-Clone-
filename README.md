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

## 📚 API Documentation

### Authentication Endpoints
```
POST /api/auth/register    # User registration
POST /api/auth/login       # User login
POST /api/auth/refresh     # Refresh access token
POST /api/auth/logout      # Logout user
```

### Chat Endpoints
```
GET    /api/chat                    # Get user's chat rooms
POST   /api/chat                    # Create new chat room
GET    /api/chat/:id                # Get chat room details
GET    /api/chat/:id/messages       # Get chat messages
POST   /api/chat/:id/messages       # Send message
POST   /api/chat/:id/ai-chat        # AI chat interaction
POST   /api/chat/:id/join           # Join chat room
POST   /api/chat/:id/leave          # Leave chat room
```

### User Endpoints
```
GET    /api/users/profile           # Get user profile
PUT    /api/users/profile           # Update profile
PUT    /api/users/password          # Change password
GET    /api/users/stats             # Get user statistics
DELETE /api/users/account           # Delete account
```

### Subscription Endpoints
```
GET    /api/subscriptions           # Get current subscription
GET    /api/subscriptions/plans     # Get available plans
POST   /api/subscriptions/checkout  # Create Stripe checkout
POST   /api/subscriptions/webhook   # Stripe webhook handler
DELETE /api/subscriptions/cancel    # Cancel subscription
```

### Admin Endpoints
```
GET    /api/admin/dashboard         # Admin dashboard stats
GET    /api/admin/users             # Get all users
PUT    /api/admin/users/:id/status  # Update user status
PUT    /api/admin/users/:id/role    # Update user role
GET    /api/admin/chat-rooms        # Get all chat rooms
PUT    /api/admin/chat-rooms/:id/deactivate  # Deactivate room
```

## 🔌 WebSocket Events

### Client to Server
```javascript
// Authentication
socket.emit('join_room', { chatRoomId: 'room_id' });
socket.emit('leave_room', { chatRoomId: 'room_id' });

// Messaging
socket.emit('send_message', { 
  chatRoomId: 'room_id', 
  content: 'Hello!',
  type: 'TEXT'
});

// AI Chat
socket.emit('ai_chat', {
  chatRoomId: 'room_id',
  message: 'What is AI?',
  context: [/* conversation history */]
});

// Typing indicators
socket.emit('typing_start', { chatRoomId: 'room_id' });
socket.emit('typing_stop', { chatRoomId: 'room_id' });
```

### Server to Client
```javascript
// Room events
socket.on('joined_room', (data) => {});
socket.on('left_room', (data) => {});

// Messages
socket.on('new_message', (message) => {});
socket.on('ai_response', (response) => {});

// Typing
socket.on('user_typing', (user) => {});
socket.on('user_stop_typing', (user) => {});

// Errors
socket.on('error', (error) => {});
socket.on('ai_error', (error) => {});
```

## 💳 Subscription Plans

| Plan | Price | Messages/Month | Features |
|------|-------|----------------|----------|
| Free | $0 | 50 | Basic chat, Standard support |
| Basic | $9.99 | 500 | Unlimited rooms, Priority support |
| Premium | $19.99 | 2,000 | Advanced AI, Custom prompts |
| Enterprise | $49.99 | Unlimited | All features, Team management |

## 🛡️ Security Features

- **JWT Authentication** with refresh token rotation
- **Rate Limiting** with Redis-based storage
- **Input Validation** with express-validator
- **Password Hashing** with bcrypt (12 rounds)
- **CORS Protection** with configurable origins
- **Helmet.js** for security headers
- **SQL Injection Protection** via Prisma ORM

## 📊 Monitoring & Logging

- **Winston Logger** with file rotation
- **Request Logging** with Morgan
- **Error Tracking** with stack traces
- **API Usage Metrics** stored in database
- **Health Check** endpoint at `/health`

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

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📞 Support

For support and questions:
- Create an issue in the repository
- Check the API documentation
- Review the logs for debugging

---

Built with ❤️ for Kuvaka Tech Assignment