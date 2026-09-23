import { getSession } from "@/lib/session";
import { getUploadedAvatarImage } from "@/lib/user-avatar";

export const runtime = "nodejs";

/**
 * The signed-in user's uploaded picture as a real image response, so pages
 * reference a short URL (getUserAvatar's avatarImageUrl) instead of
 * carrying the whole data URI in every render. The URL includes a hash of
 * the image, so it can be cached for good and changes when the picture does.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.whopUserId) return new Response("Unauthorized", { status: 401 });

  const image = await getUploadedAvatarImage(session.whopUserId);
  if (!image) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
