/* NUQTH - Service Worker
   ------------------------------------------------------------
   الغرض:
   1) يسمح بفتح التطبيق ولوحة صاحب المشروع بدون إنترنت.
   2) يجعل الموقع صالحاً كـ PWA / لتطبيق TWA من PWABuilder.
   3) لا يخزّن أي استجابة من Supabase (بيانات العملاء تبقى بالشبكة فقط).
   ------------------------------------------------------------
   النطاق: https://<account>.github.io/mkh/
*/

const CACHE_NAME = "nuqth-app-v2";
const OFFLINE_URL = "./index.html";

// صفحات التطبيق + الأيقونات (تُحمّل مرة واحدة للتشغيل بدون إنترنت)
const PRECACHE = [
    "./",
    "./index.html",
    "./client.html",
    "./cashier.html",
    "./owner.html",
    "./manifest.json",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/maskable-512.png",
    "./icons/apple-touch-icon.png"
];

// مكتبات خارجية
const CDN_HOSTS = [
    "cdn.jsdelivr.net",
    "cdnjs.cloudflare.com",
    "fonts.googleapis.com",
    "fonts.gstatic.com"
];

// لا نخزّن أبداً استجابات الـ API (تحتوي بيانات عملاء)
const API_HOSTS = [
    "ofylogxewabdiemaifep.supabase.co"
];

self.addEventListener("install", function (event) {
    event.waitUntil((async function () {
        const cache = await caches.open(CACHE_NAME);

        for (const url of PRECACHE) {
            try {
                await cache.add(new Request(url, { cache: "reload" }));
            } catch (e) {
                // لا نفشل التثبيت إذا نقص ملف
            }
        }

        await self.skipWaiting();
    })());
});

self.addEventListener("activate", function (event) {
    event.waitUntil((async function () {
        const keys = await caches.keys();
        await Promise.all(
            keys.filter(function (k) { return k !== CACHE_NAME; })
                .map(function (k) { return caches.delete(k); })
        );
        await self.clients.claim();
    })());
});

function offlinePage() {
    return new Response(
        "<!DOCTYPE html><html lang='ar' dir='rtl'><meta charset='utf-8'>" +
        "<meta name='viewport' content='width=device-width, initial-scale=1'>" +
        "<body style='background:#0b0b0b;color:#fff;font-family:Arial;text-align:center;padding:40px'>" +
        "<h2 style='color:#d4af37'>لا يوجد اتصال بالإنترنت</h2>" +
        "<p>افتح هذه الصفحة مرة واحدة مع الإنترنت ليتم حفظها للاستخدام دون اتصال.</p>" +
        "</body></html>",
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
}

self.addEventListener("fetch", function (event) {
    const request = event.request;

    if (request.method !== "GET") return;

    let url;
    try {
        url = new URL(request.url);
    } catch (e) {
        return;
    }

    // 1) Supabase: شبكة فقط — ممنوع التخزين
    if (API_HOSTS.indexOf(url.hostname) !== -1) return;

    // 2) فتح الصفحات: الشبكة أولاً ثم النسخة المحفوظة
    if (request.mode === "navigate") {
        event.respondWith((async function () {
            let response = null;

            try {
                response = await fetch(request);
            } catch (e) {
                response = null;
            }

            // الشبكة متاحة: نحفظ نسخة ونرجّعها
            if (response && response.ok) {
                try {
                    const cache = await caches.open(CACHE_NAME);
                    cache.put(request, response.clone());
                } catch (e) {}
                return response;
            }

            // الشبكة فشلت أو رجّعت خطأ (502/503...): نستخدم النسخة المحفوظة
            const cached =
                await caches.match(request, { ignoreSearch: true }) ||
                await caches.match(OFFLINE_URL) ||
                await caches.match("./index.html");

            return cached || offlinePage();
        })());
        return;
    }

    // 3) مكتبات CDN: النسخة المحفوظة أولاً
    if (CDN_HOSTS.indexOf(url.hostname) !== -1) {
        event.respondWith((async function () {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(request);
            if (cached) return cached;

            try {
                const response = await fetch(request);
                if (response && response.ok) cache.put(request, response.clone());
                return response;
            } catch (e) {
                return cached || Response.error();
            }
        })());
        return;
    }

    // 4) ملفات الموقع الثابتة (أيقونات / manifest / صور): محفوظ ثم شبكة
    if (url.origin === self.location.origin &&
        /\.(png|jpg|jpeg|gif|svg|ico|webp|json|css|js|woff2?)$/i.test(url.pathname)) {
        event.respondWith((async function () {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(request, { ignoreSearch: true });
            if (cached) return cached;

            let response = null;
            try {
                response = await fetch(request);
            } catch (e) {
                response = null;
            }

            if (response && response.ok) {
                cache.put(request, response.clone());
                return response;
            }

            return cached || response || Response.error();
        })());
        return;
    }

    // 5) أي طلب آخر: نتركه للشبكة
});
