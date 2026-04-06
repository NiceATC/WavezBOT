const IMGBB_UPLOAD_URL = "https://api.imgbb.com/1/upload";

export async function uploadToImgbb(buffer, title) {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    throw new Error("IMGBB_API_KEY not set");
  }

  const body = new URLSearchParams({
    key: apiKey,
    image: buffer.toString("base64"),
    name: title || "profile",
  });

  const res = await fetch(IMGBB_UPLOAD_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = await res.json().catch(() => null);
  const link = payload?.data?.display_url ?? payload?.data?.url ?? null;
  if (!res.ok || !link) {
    const msg =
      payload?.error?.message ?? payload?.error ?? "ImgBB upload failed";
    throw new Error(String(msg));
  }

  return link;
}
