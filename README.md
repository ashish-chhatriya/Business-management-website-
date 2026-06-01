# Business Management Website

Full-stack business management app.

| Layer    | Technology              | Deploy target  |
|----------|-------------------------|----------------|
| Frontend | React + Vite            | Vercel         |
| Backend  | Express + Node.js       | Render         |
| Database | PostgreSQL              | Neon           |

---

## Local Development

### Prerequisites

- Node.js 18+
- A PostgreSQL database (local or Neon)

### 1. Clone and install

```bash
git clone <your-repo-url>
cd Business-management-website

# Install root-level deps (if any)
npm install

# Install backend deps
cd backend && npm install && cd ..

# Install frontend deps
cd frontend && npm install && cd ..
```

### 2. Configure environment

Copy the example env file and fill in your values:

```bash
cp backend/.env.example backend/.env
```

**`backend/.env` variables:**

```
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=your-jwt-secret
NODE_ENV=development
PORT=5000
```

> **Never commit `.env`.** It is listed in `.gitignore`.

### 3. Run database migrations

If your project has a migration or schema file, run it against your database:

```bash
psql $DATABASE_URL -f backend/db/schema.sql   # adjust filename if needed
```

### 4. Start the servers

**Backend** (runs on port 5000 by default):

```bash
cd backend
npm run dev   # or: node server.js
```

**Frontend** (runs on port 5173 by default, proxies `/api` to backend):

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Deployment

### Database — Neon

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the connection string from the Neon dashboard.
3. Set it as `DATABASE_URL` in both Render (backend env var) and locally.
4. Run your schema/migration SQL against the Neon database once.

Neon requires SSL in production. The backend already enables SSL when
`NODE_ENV=production` — no code change needed.

---

### Backend — Render

1. Create a new **Web Service** in [Render](https://render.com).
2. Connect your GitHub repository.
3. Set the **Root Directory** to `backend`.
4. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
5. Add environment variables in the Render dashboard:
   ```
   DATABASE_URL=<your Neon connection string>
   JWT_SECRET=<your secret>
   NODE_ENV=production
   PORT=10000        # Render sets this automatically; you can omit it
   ```
6. Deploy. Note the service URL (e.g. `https://your-app.onrender.com`).

---

### Frontend — Vercel

1. Create a new project in [Vercel](https://vercel.com).
2. Connect your GitHub repository.
3. Set the **Root Directory** to `frontend`.
4. Add an environment variable:
   ```
   VITE_API_URL=https://your-app.onrender.com
   ```
5. Create (or confirm) `frontend/vercel.json` to rewrite `/api/*` requests
   to your Render backend:

   ```json
   {
     "rewrites": [
       {
         "source": "/api/:path*",
         "destination": "https://your-app.onrender.com/api/:path*"
       }
     ]
   }
   ```

   This keeps the frontend's `/api` base URL working without any code changes.

6. Deploy.

---

## API Routes

| Method | Path                           | Description                  |
|--------|--------------------------------|------------------------------|
| *      | `/api/auth`                    | Login, register, token       |
| *      | `/api/domains`                 | Domain management            |
| *      | `/api/employees`               | Employee records             |
| *      | `/api/sales`                   | Sales records                |
| *      | `/api/expenses`                | Expense records              |
| *      | `/api/purchases`               | Purchase records             |
| *      | `/api/inventory`               | Inventory management         |
| *      | `/api/attendance`              | Attendance tracking          |
| *      | `/api/salary`                  | Salary management            |
| *      | `/api/dashboard`               | Dashboard summary data       |
| *      | `/api/reports`                 | Reporting endpoints          |
| GET    | `/api/audit/logs`              | Audit log viewer             |
| GET    | `/api/settings/domain`         | Read domain settings         |
| PUT    | `/api/settings/domain`         | Update domain settings       |
| PUT    | `/api/settings/change-password`| Change user password         |

---

## Project Structure

```
Business-management-website/
├── frontend/          # Vite + React app → deploys to Vercel
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── context/
│   │   └── utils/api.js
│   └── vercel.json    # API proxy rewrite rules
├── backend/           # Express API → deploys to Render
│   ├── routes/
│   ├── middleware/
│   ├── db/
│   └── server.js
├── .gitignore
└── README.md
```

---

## Notes

- `backend/routes/inventory (1).js` is a duplicate candidate. Only
  `inventory.js` is registered in `server.js`. Do not delete the copy
  until you have verified their contents match.
- Lockfiles (`package-lock.json`) are not committed but are recommended.
  Run `npm install` in each directory before first deploy to generate them,
  then commit.
