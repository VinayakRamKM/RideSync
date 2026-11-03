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
