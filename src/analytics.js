/**
 * analytics.js — VELOUR Tracking Layer
 *
 * Covers:
 *  1. Meta Pixel (browser-side)      — ViewContent, AddToCart, Purchase
 *  2. Meta Conversions API (CAPI)     — server-side dedup, higher match rate
 *  3. Google Tag Manager              — dataLayer push (GA4 via GTM)
 *  4. TikTok Pixel                    — ViewContent, AddToCart, PlaceAnOrder
 *  5. Snapchat Pixel                  — VIEW_CONTENT, ADD_CART, PURCHASE
 *
 * Usage:
 *   import { track } from './analytics';
 *   track.viewProduct(product);
 *   track.addToCart(product, qty);
 *   track.purchase(product, qty, total, customerData);
 *
 * Setup:
 *   - Inject Pixel/GTM base snippets in index.html (see README section below)
 *   - Fill TRACKING object in data.js with real IDs & tokens
 *   - CAPI calls require a server proxy (Netlify/Vercel function) to protect your token
 */

import { TRACKING, STORE } from "./data";

/* ─── Helpers ──────────────────────────────────────────────────────── */
const hasPixel = () => typeof window !== "undefined" && typeof window.fbq === "function";
const hasGTM   = () => typeof window !== "undefined" && Array.isArray(window.dataLayer);
const hasTT    = () => typeof window !== "undefined" && typeof window.ttq !== "undefined";
const hasSnap  = () => typeof window !== "undefined" && typeof window.snaptr === "function";

/** SHA-256 hash for CAPI PII hashing (phone/email) */
async function sha256(str) {
  if (!str) return "";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str.trim().toLowerCase()));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Generate a unique event ID for deduplication between Pixel and CAPI */
function genEventId() {
  return `vl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/* ─── Meta Pixel ───────────────────────────────────────────────────── */
const pixel = {
  viewContent(product, eventId) {
    if (!hasPixel()) return;
    window.fbq("track", "ViewContent", {
      content_ids:  [String(product.id)],
      content_name: product.name,
      content_type: "product",
      value:        product.price / 100,   // adjust if prices are already in major units
      currency:     STORE.currency,
    }, { eventID: eventId });
  },

  addToCart(product, qty, eventId) {
    if (!hasPixel()) return;
    window.fbq("track", "AddToCart", {
      content_ids:  [String(product.id)],
      content_name: product.name,
      content_type: "product",
      value:        (product.price * qty) / 100,
      currency:     STORE.currency,
      num_items:    qty,
    }, { eventID: eventId });
  },

  purchase(product, qty, total, eventId) {
    if (!hasPixel()) return;
    window.fbq("track", "Purchase", {
      content_ids:  [String(product.id)],
      content_name: product.name,
      content_type: "product",
      value:        total / 100,
      currency:     STORE.currency,
      num_items:    qty,
    }, { eventID: eventId });
  },

  initiateCheckout(product, eventId) {
    if (!hasPixel()) return;
    window.fbq("track", "InitiateCheckout", {
      content_ids:  [String(product.id)],
      content_name: product.name,
      value:        product.price / 100,
      currency:     STORE.currency,
    }, { eventID: eventId });
  },
};

/* ─── Meta Conversions API ─────────────────────────────────────────── */
/**
 * CAPI sends events server-to-server to Meta, bypassing ad blockers.
 * To use: deploy a serverless proxy (Netlify / Vercel / Cloudflare Workers)
 * that forwards to https://graph.facebook.com/v19.0/{pixel_id}/events
 * and set CAPI_ENDPOINT below to your proxy URL.
 *
 * Without a proxy, this call is CORS-blocked from the browser.
 * For a quick test, set CAPI_ENDPOINT to a Make/n8n webhook.
 */
const CAPI_ENDPOINT = "/api/capi"; // your serverless proxy route

async function capiSend(eventName, product, qty, total, customer, eventId) {
  if (!TRACKING.CAPI_TOKEN || TRACKING.CAPI_TOKEN.startsWith("YOUR_")) return;

  const [hashedPhone, hashedName] = await Promise.all([
    sha256(customer?.phone),
    sha256(customer?.name),
  ]);

  const payload = {
    pixelId:    TRACKING.CAPI_PIXEL,
    accessToken: TRACKING.CAPI_TOKEN,
    data: [{
      event_name:       eventName,
      event_time:       Math.floor(Date.now() / 1000),
      event_id:         eventId,
      event_source_url: window.location.href,
      action_source:    "website",
      user_data: {
        ph:  hashedPhone  || undefined,
        fn:  hashedName   || undefined,
        client_user_agent: navigator.userAgent,
        fbp: getCookie("_fbp"),
        fbc: getCookie("_fbc"),
      },
      custom_data: {
        content_ids:  [String(product.id)],
        content_name: product.name,
        content_type: "product",
        value:        (total ?? product.price) / 100,
        currency:     STORE.currency,
        num_items:    qty ?? 1,
      },
    }],
  };

  try {
    await fetch(CAPI_ENDPOINT, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("[VELOUR CAPI] Failed to send event:", err.message);
  }
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? match[2] : undefined;
}

/* ─── Google Tag Manager dataLayer ────────────────────────────────── */
const gtm = {
  push(event, data = {}) {
    if (!hasGTM()) return;
    window.dataLayer.push({ event, ...data });
  },

  viewItem(product) {
    this.push("view_item", {
      ecommerce: {
        currency: STORE.currency,
        value:    product.price / 100,
        items: [{
          item_id:   String(product.id),
          item_name: product.name,
          price:     product.price / 100,
          quantity:  1,
        }],
      },
    });
  },

  addToCart(product, qty) {
    this.push("add_to_cart", {
      ecommerce: {
        currency: STORE.currency,
        value:    (product.price * qty) / 100,
        items: [{
          item_id:   String(product.id),
          item_name: product.name,
          price:     product.price / 100,
          quantity:  qty,
        }],
      },
    });
  },

  purchase(product, qty, total, transactionId) {
    this.push("purchase", {
      ecommerce: {
        transaction_id: transactionId,
        currency:       STORE.currency,
        value:          total / 100,
        items: [{
          item_id:   String(product.id),
          item_name: product.name,
          price:     product.price / 100,
          quantity:  qty,
        }],
      },
    });
  },

  beginCheckout(product) {
    this.push("begin_checkout", {
      ecommerce: {
        currency: STORE.currency,
        value:    product.price / 100,
        items: [{
          item_id:   String(product.id),
          item_name: product.name,
          price:     product.price / 100,
          quantity:  1,
        }],
      },
    });
  },
};

/* ─── TikTok Pixel ─────────────────────────────────────────────────── */
const tiktok = {
  viewContent(product) {
    if (!hasTT()) return;
    window.ttq.track("ViewContent", {
      content_id:   String(product.id),
      content_name: product.name,
      content_type: "product",
      value:        product.price / 100,
      currency:     STORE.currency,
    });
  },
  addToCart(product, qty) {
    if (!hasTT()) return;
    window.ttq.track("AddToCart", {
      content_id:   String(product.id),
      content_name: product.name,
      content_type: "product",
      value:        (product.price * qty) / 100,
      currency:     STORE.currency,
      quantity:     qty,
    });
  },
  placeAnOrder(product, qty, total) {
    if (!hasTT()) return;
    window.ttq.track("PlaceAnOrder", {
      content_id:   String(product.id),
      content_name: product.name,
      value:        total / 100,
      currency:     STORE.currency,
      quantity:     qty,
    });
  },
};

/* ─── Snapchat Pixel ────────────────────────────────────────────────── */
const snap = {
  viewContent(product) {
    if (!hasSnap()) return;
    window.snaptr("track", "VIEW_CONTENT", {
      price: product.price / 100,
      currency: STORE.currency,
      item_ids: [String(product.id)],
    });
  },
  addCart(product, qty) {
    if (!hasSnap()) return;
    window.snaptr("track", "ADD_CART", {
      price:    (product.price * qty) / 100,
      currency: STORE.currency,
      item_ids: [String(product.id)],
    });
  },
  purchase(product, qty, total) {
    if (!hasSnap()) return;
    window.snaptr("track", "PURCHASE", {
      price:    total / 100,
      currency: STORE.currency,
      item_ids: [String(product.id)],
      number_items: qty,
    });
  },
};

/* ─── Unified Track API ─────────────────────────────────────────────── */
export const track = {
  /** Called when a product card enters viewport or is scrolled to */
  viewProduct(product) {
    const eventId = genEventId();
    pixel.viewContent(product, eventId);
    gtm.viewItem(product);
    tiktok.viewContent(product);
    snap.viewContent(product);
    capiSend("ViewContent", product, 1, product.price, null, eventId);
  },

  /** Called when user taps "Order Now" / opens checkout modal */
  beginCheckout(product) {
    const eventId = genEventId();
    pixel.initiateCheckout(product, eventId);
    gtm.beginCheckout(product);
    capiSend("InitiateCheckout", product, 1, product.price, null, eventId);
  },

  /** Called when user changes quantity or selects variant */
  addToCart(product, qty) {
    const eventId = genEventId();
    pixel.addToCart(product, qty, eventId);
    gtm.addToCart(product, qty);
    tiktok.addToCart(product, qty);
    snap.addCart(product, qty);
    capiSend("AddToCart", product, qty, product.price * qty, null, eventId);
  },

  /** Called on successful order submission */
  purchase(product, qty, total, customer) {
    const eventId = genEventId();
    const txId    = `vl_${Date.now()}`;
    pixel.purchase(product, qty, total, eventId);
    gtm.purchase(product, qty, total, txId);
    tiktok.placeAnOrder(product, qty, total);
    snap.purchase(product, qty, total);
    capiSend("Purchase", product, qty, total, customer, eventId);
  },
};

/* ─── GTM / Pixel Snippet Injector (call once from main.jsx) ──────── */
export function injectTracking() {
  if (typeof window === "undefined") return;

  // Google Tag Manager
  if (TRACKING.GTM_ID && !TRACKING.GTM_ID.startsWith("GTM-XXXXXXX")) {
    window.dataLayer = window.dataLayer || [];
    const s = document.createElement("script");
    s.innerHTML = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${TRACKING.GTM_ID}');`;
    document.head.appendChild(s);
  }

  // Meta Pixel
  if (TRACKING.PIXEL_ID && !TRACKING.PIXEL_ID.startsWith("YOUR_")) {
    const s = document.createElement("script");
    s.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${TRACKING.PIXEL_ID}');fbq('track','PageView');`;
    document.head.appendChild(s);
  }

  // TikTok Pixel
  if (TRACKING.TT_PIXEL && !TRACKING.TT_PIXEL.startsWith("YOUR_")) {
    const s = document.createElement("script");
    s.innerHTML = `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${TRACKING.TT_PIXEL}');ttq.page();}(window,document,'ttq');`;
    document.head.appendChild(s);
  }
}
