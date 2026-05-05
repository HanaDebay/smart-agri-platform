# Smart Agriculture Decision Support & Automation App

A full-stack JavaScript starter app based on the SRD. It includes an Express API, MongoDB/Mongoose data models, JWT authentication, a rule-based recommendation engine, alerts, soil history, profile management, and a responsive frontend.

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- Database: MongoDB with Mongoose
- Auth: JWT and bcrypt password hashing

## Run Locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create environment file:

   ```bash
   copy .env.example .env
   ```

3. Start MongoDB locally, or set `MONGODB_URI` in `.env` to your MongoDB Atlas connection string.

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open:

   ```text
   http://localhost:5000
   ```

## Main API Routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/dashboard`
- `POST /api/soil-data`
- `GET /api/soil-data`
- `GET /api/recommendations`
- `GET /api/notifications`
- `PATCH /api/farms/:id/irrigation`
- `PUT /api/profile`

## SRD Coverage

- User registration and login
- Profile and farm data
- Manual soil parameter input
- Crop selection
- Rule-based recommendations for fertilizer, pH correction, irrigation, and biofortified crops
- Notifications for urgent or watch conditions
- Historical soil records
- Dashboard summary
- Irrigation automation placeholder with pump override API

## Next Enhancements

- Offline data capture with IndexedDB and background sync
- Weather API integration
- SMS or WhatsApp alerts for rural users
- Multi-language support
- Admin recommendation rule management
- Real IoT sensor and pump controller integration
