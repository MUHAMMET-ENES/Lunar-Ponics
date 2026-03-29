# LUNAR-PONICS Alpha-1

Production-oriented **React + Vite** dashboard for the **LUNAR-PONICS** hackathon mission: a **deterministic 90-day polyculture simulation** with aerospace theming, Recharts visualizations, and a **NASA payload economics** hero metric (`saved via in-situ resource production` at **$X.XXM** with cost basis **$1.2M/kg to LEO**).

**Legacy Commander:** Ali Qushji · **Facility:** TUA Station  

---

## Stack

| Piece        | Choice                          |
|-------------|----------------------------------|
| Build tool  | [Vite](https://vitejs.dev/) 6    |
| UI          | React 18                         |
| Charts      | [Recharts](https://recharts.org/) |
| QR          | [qrcode](https://www.npmjs.com/package/qrcode) (runtime PNG, terminal green) |
| Determinism | Mulberry32 PRNG (in-app, no extra package) |

---

## Repository layout

```
tua-project/
├── index.html
├── package.json
├── vite.config.js
├── README.md
├── Ali Qushji.html              # source copy of mission debrief (optional)
├── public/
│   └── mission-debrief.html     # CLASSIFIED mission debrief (served at /mission-debrief.html)
├── tuahackathoncode.js          # original standalone reference (optional)
└── src/
    ├── main.jsx
    ├── App.jsx                  # main application + dynamic QR
    ├── App.css                  # QR cyber-frame (#00FF41)
    └── assets/
        └── README.txt
```

---

## Prerequisites

- **Node.js** 18+ (20 LTS recommended)
- **npm** (bundled with Node)

---

## Local development

```bash
cd tua-project
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

---

## Production build

```bash
npm run build
```

Output is written to `dist/`. Preview locally:

```bash
npm run preview
```

---

## Deployment (Vercel)

1. Push this folder to **GitHub / GitLab / Bitbucket** (or use the Vercel CLI).
2. In [Vercel](https://vercel.com/), **Import** the repository.
3. Vercel will detect **Vite**:  
   - **Build command:** `npm run build`  
   - **Output directory:** `dist`
4. Deploy. **No catch-all rewrite** is required: the React app lives at `/`, and the static **mission debrief** page is served at **`/mission-debrief.html`** (from `public/`).

**CLI (optional):**

```bash
npm i -g vercel
cd tua-project
vercel
```

---

## Mission debrief page & QR

- **Page:** `public/mission-debrief.html` is copied to the site root at build time. Open **`https://<your-deployment>/mission-debrief.html`** (or `http://localhost:5173/mission-debrief.html` in dev).
- **QR:** The classified report modal generates a QR code (via `qrcode`) whose target URL is **`${window.location.origin}` + base path + `mission-debrief.html`**, so scanning from a phone opens the debrief on the **same host** as the dashboard (works on Vercel after deploy).
- **Custom URL (optional):** Set `VITE_MISSION_DEBRIEF_URL` in a `.env` file (e.g. `https://yourdomain.com/mission-debrief.html`) if the QR must always point somewhere other than the current origin.

---

## Simulation notes

- **Mulberry32** seeded streams keep crop and environment series **reproducible** for a given disaster state.
- **Payload saved** is derived from aggregate biomass and the **$1.2M/kg** LEO cost basis shown in the UI; it remains the **primary headline** in the NASA economics strip and in the mission report modal.

---

## License

Hackathon / educational use unless your team assigns another license.
