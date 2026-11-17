# RideSync

Group ride coordination: register with email, plan a route, invite riders, and navigate together on a live Leaflet map.

## Run locally

```bash
npm install
cd client && npm install
cd ..
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

- API: `http://localhost:3001`
- Frontend: `http://localhost:5173`
- Allow browser location access to share your live position. Deployed sites must use HTTPS; localhost works over HTTP.
- Map tiles use OpenStreetMap and do not require an API key.

## Email invites

Set SMTP env vars to actually deliver mail:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

Without SMTP, invites are saved locally and you can copy the join link or open your mail app.

Optional: `JWT_SECRET`, `CLIENT_ORIGIN` (default `http://localhost:5173`).

## Deploy to Vercel, Render, and Neon

The Vercel project hosts the frontend, the Express and Socket.IO backend runs on Render, and Neon provides PostgreSQL storage. The database schema is created automatically at backend startup. The local development setup continues to use `data/db.json`. Keep the Render backend to one instance because each instance maintains an in-memory cache.

1. Push the repository to GitHub.
2. Create a Neon project and copy its pooled PostgreSQL connection string. Keep it private.
3. In Vercel, import the repository and set **Root Directory** to `client`. Use the Vite defaults (`npm run build`, output directory `dist`). The included `client/vercel.json` supports direct links to app routes.
4. In Render, create a Blueprint from the repository using `render.yaml`. Set `DATABASE_URL` to the Neon connection string and `CLIENT_ORIGIN` to your Vercel site origin, such as `https://your-project.vercel.app` (no trailing slash). Keep the generated `JWT_SECRET` private.
5. After the Render service is live, copy its HTTPS URL. In Vercel project settings, add `VITE_API_URL` with that backend URL (no trailing slash), then redeploy the frontend.
6. Open the Vercel URL over HTTPS and test registration, login, ride creation, and live location sharing.

Set `CLIENT_ORIGIN` to the exact Vercel origin so the API and Socket.IO CORS checks accept the frontend. If you use a custom domain, update `CLIENT_ORIGIN` to match it. Email delivery additionally requires the SMTP variables listed above.

The Neon adapter stores ride/user data in relational tables and persists location updates to `ridesync_members`. Existing data in local `data/db.json` is not uploaded automatically.
