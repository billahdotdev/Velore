# Velour — Romance & Intimacy Store
### Vite + React + Pure CSS SPA

## Quick Start
```bash
npm install && npm run dev    # http://localhost:5173
npm run build                 # → /dist (deploy this)
```

## Configuration

### Google Form (order collection)
1. Create a Google Form with 9 fields (see data.js `fields` object)
2. Get the `formResponse` URL and each `entry.XXXXXXXXX` ID
3. Paste into `src/data.js` under `STORE`

### Analytics
All tracking IDs live in `src/data.js` under `TRACKING`:
```js
PIXEL_ID   — Meta Pixel ID
GTM_ID     — Google Tag Manager container (GTM-XXXXXXX)
GA4_ID     — GA4 Measurement ID (G-XXXXXXXXXX)
CAPI_TOKEN — Meta Conversions API token (needs server proxy)
TT_PIXEL   — TikTok Pixel ID
SNAP_PIXEL — Snapchat Pixel ID
```

### Meta CAPI proxy
CAPI needs a server function to protect your token.
Set `CAPI_ENDPOINT` in `analytics.js` to your Netlify/Vercel function URL.

## Events fired
| Event | Pixel | GTM | TikTok | Snap |
|---|---|---|---|---|
| Page view | PageView | — | page() | — |
| Product visible | ViewContent | view_item | ViewContent | VIEW_CONTENT |
| Order Now tap | InitiateCheckout | begin_checkout | — | — |
| Qty change | AddToCart | add_to_cart | AddToCart | ADD_CART |
| Order submit | Purchase | purchase | PlaceAnOrder | PURCHASE |

All browser pixel + CAPI events share an `eventID` for deduplication.

## Design tokens (velour.css :root)
`--noir` `--blush` `--blush-lt` `--gold` `--cream` — Cormorant Garamond + Jost
