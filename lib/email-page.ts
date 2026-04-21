import { APP_URL, BRAND_COLOR } from "@/lib/config"

/** Renders a simple full-page result card used in email action callbacks (leave, swap). */
export function actionResultPage(
  title: string,
  description: string,
  accentColor: string,
  ctaUrl = APP_URL,
  ctaLabel = "Open LabRota",
): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — LabRota</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="background:white;border-radius:16px;padding:40px;max-width:400px;width:90%;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.1);border:1px solid #e2e8f0;">
<div style="width:48px;height:48px;border-radius:50%;background:${accentColor}15;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
</div>
<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#0f172a;">${title}</h1>
<p style="margin:0 0 24px;font-size:14px;color:#64748b;">${description}</p>
<a href="${ctaUrl}" style="display:inline-block;background:${BRAND_COLOR};color:white;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:500;">${ctaLabel}</a>
</div></body></html>`
}

export function actionErrorPage(message: string): string {
  return actionResultPage("Error", message, "#ef4444")
}
