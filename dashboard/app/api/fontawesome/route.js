const FA_CSS_URL = "https://cdn.niceatc.com.br/FontAwesome/css/all.css";

export async function GET() {
  const res = await fetch(FA_CSS_URL);
  if (!res.ok) {
    return new Response("/* fontawesome unavailable */", {
      status: 502,
      headers: { "Content-Type": "text/css" },
    });
  }

  const css = await res.text();
  const rewritten = css.replace(
    /url\(["']?\.\.\/webfonts\/(.*?)["']?\)/g,
    "url(/api/fontawesome-font?file=$1)",
  );

  return new Response(rewritten, {
    status: 200,
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
