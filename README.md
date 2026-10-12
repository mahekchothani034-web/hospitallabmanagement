# CareLab

A React + Express starter for a diagnostic lab portal. The English-language interface includes a public landing page, test and doctor directories, contact form, patient registration, role-aware dashboards, bookings, sample tracking, and report downloads.

## Run locally

1. Install Node.js 18 or later.
2. Open the project folder in VS Code. Start the backend in one terminal:

   ```bash
   cd backend
   npm.cmd install
   npm.cmd run dev
   ```

3. Start the frontend in a second terminal:

   ```bash
   cd frontend
   npm.cmd install
   npm.cmd run dev
   ```

4. Open the Vite URL shown in the frontend terminal (usually `http://localhost:5173`).

The Express API runs on `http://localhost:4000`. Local records are stored in `database/data.json`, and uploaded reports are stored in `database/uploads/`.

## Deploy the API to Render

The repository includes `render.yaml` to configure the Express API as a free Render Web Service with a health check and generated JWT secret.

1. In Render, choose **New + → Blueprint** and connect this GitHub repository. Render reads `render.yaml` from the repository root.
2. During setup, provide the administrator email and a unique password of at least 16 characters when prompted. The password initializes the production admin account; do not put it in Git or share it in chat.
3. Review the plan and create the Blueprint. This configuration uses Render's free service plan and does not require a persistent disk.
4. After deployment, open `https://YOUR-SERVICE.onrender.com/api/health`; it should return `{"status":"ok"}`.

Production uses only the configured administrator account, not the publicly documented demo passwords. It requires `JWT_SECRET` and only accepts browser API requests from the configured Netlify site. **The free service has an ephemeral filesystem and may spin down while idle:** the JSON database and uploaded reports can be lost on restart or redeploy, and the API may take time to wake. Use it only to try the app with test data. For real patient data or durable accounts and reports, use a paid persistent disk or migrate to a managed database and private, backed-up file storage. Keep `database/data.json` and `database/uploads/` private; they contain account and patient records.

## Deploy the frontend to Netlify

The repository includes `netlify.toml` with the frontend build settings and a single-page-app fallback, so refreshing or opening the app directly will serve the React page instead of a 404.

1. Deploy this repository as a site on Netlify. Netlify will use the settings in `netlify.toml` (`frontend` as the base directory and `npm run build` as the build command).
2. In the Netlify site's environment variables, set `VITE_API_URL` to your Render API's public origin, for example `https://your-service.onrender.com` (do not add `/api` at the end). Trigger a new deploy after setting it.

Without `VITE_API_URL`, production API requests show a configuration error rather than silently calling a nonexistent Netlify `/api` route.

### Email verification for password reset

Password reset sends a 6-digit code to the registered email. Copy `backend/.env.example` to `backend/.env`, then set `SMTP_USER` to your Gmail address and `SMTP_PASS` to a Gmail App Password (create one after enabling 2-Step Verification on the Google account). Keep `.env` private; it is ignored by git. Restart the backend after changing it. Codes expire after 10 minutes and are limited to five attempts.

## Project folders

- `frontend/` — Independent React/Vite app, dependencies and build output.
- `backend/` — Independent Express API and dependencies.
- `database/` — Local JSON data and uploaded report PDFs.

## Demo accounts

All demo users use password `CareLab123!`.

| Role | Email |
| --- | --- |
| Admin | `admin@carelab.test` |
| Doctor | `doctor@carelab.test` |
| Patient | `patient@carelab.test` |
| Lab Technician | `tech@carelab.test` |
| Receptionist | `reception@carelab.test` |

New registrations create patient accounts. Receptionists can register patients and book tests; doctors can request tests for registered patients. Admins can add doctors and staff accounts, add or edit test costs, manage booking progress and results, and upload report PDFs. Technicians update sample status, enter results, and upload PDF reports. Patients can track their samples and download completed reports.

## Before production

This is a local development starter, not a production deployment. Set a strong `JWT_SECRET`, use a proper database and secure file storage, configure HTTPS and restricted CORS, add rate limiting and audit logging, and review privacy and retention requirements before using real patient information. Seed demo credentials are for local use only.
