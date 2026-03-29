LUNAR-PONICS Alpha-1 — asset folder

The mission report modal QR is generated at runtime (npm package `qrcode`) and opens:
  /mission-debrief.html
  (static file: public/mission-debrief.html — same content as Ali Qushji.html)

Optional: set VITE_MISSION_DEBRIEF_URL in .env if the QR must point to an absolute URL
different from the current deployment (e.g. a custom domain).

The previous mission-qr.png file is no longer used by the app; you may delete it.
