const FA_FONT_BASE = "https://cdn.niceatc.com.br/FontAwesome/webfonts/";

const ALLOWED_RE = /^[a-z0-9-]+\.(woff2|woff|ttf|eot|svg)$/i;

function getContentType(fileName) {
  if (fileName.endsWith(".woff2")) return "font/woff2";
  if (fileName.endsWith(".woff")) return "font/woff";
  if (fileName.endsWith(".ttf")) return "font/ttf";
  if (fileName.endsWith(".eot")) return "application/vnd.ms-fontobject";
  if (fileName.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

export async function GET(req) {
  const url = new URL(req.url);
  const file = url.searchParams.get("file") || "";
  if (!ALLOWED_RE.test(file)) {
    return new Response("", { status: 400 });
  }

  const res = await fetch(`${FA_FONT_BASE}${file}`);
  if (!res.ok) {
    return new Response("", { status: 502 });
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": getContentType(file),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
