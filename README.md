# NRI Institute Authentication Portal

This project implements a secure authentication portal for NRI Institute of Technology with:

- Separate Student and Admin login experiences
- Pre-authorized student registration flow
- Email verification with secure tokens
- JWT-based authentication and role checks
- Protected frontend routes and backend APIs
- MySQL schema for users, authorized students, student profiles, and email verification
- Secure password hashing with bcrypt
- Rate limiting and validation

## Stack

- Node.js + Express
- MySQL 8+
- bcryptjs
- JWT
- Nodemailer (optional SMTP-based email sending)
- Plain frontend served by Express

## Prerequisites

- MySQL server running locally or in the cloud
- Node.js 18+
- npm

## Setup

1. Create a MySQL database and user.
2. Copy `.env.example` to `.env` and update credentials.
3. Install dependencies:

```bash
npm install
```

4. Initialize the database schema and seed the admin account:

```bash
npm run init-db
```

5. Start the server:

```bash
npm start
```

The app will run on http://localhost:5000.

## Default admin account

- Email: `admin@nri.edu`
- Password: `Admin@123`

You can change these values in `.env` before running the seed script.

## Routes

- `/student/login`
- `/student/register`
- `/admin/login`
- `/student/dashboard`
- `/admin/dashboard`

## Notes

- Public student registration is restricted to pre-authorized emails and roll numbers.
- Admin registration is intentionally not public.
- Students must verify their college email before their account becomes active.
- All protected APIs validate JWTs and roles on the backend.

## MySQL schema

The database tables are created automatically by the init script:

- `users`
- `authorized_students`
- `student_profiles`
- `email_verifications`

## Security

- Password hashes are never returned via API responses.
- JWT secret is taken from environment variables.
- Raw SQL uses parameterized queries only.
- Login and registration endpoints are rate limited.
- Unauthorized access to admin APIs is blocked via backend role checks.

## License

This is a learning/demo project for secure portal authentication.
