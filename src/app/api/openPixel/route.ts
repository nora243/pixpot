import { GRID_SIZE } from "@/lib/constants";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const index = Number(body?.index);
    const walletAddress = body?.walletAddress;
    const txHash = body?.txHash; // Transaction hash from onchain reveal

    if (!Number.isInteger(index) || index < 0 || index >= GRID_SIZE * GRID_SIZE) {
      return new Response(JSON.stringify({ success: false, error: "invalid index" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!txHash) {
      return new Response(JSON.stringify({ success: false, error: "Transaction hash required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get active image with pixel data
    const images = await query<any[]>(
      `SELECT id, width, height, pixel_data FROM images WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`
    );

    if (images.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No active game" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const image = images[0];

    // Extract color from pixel_data blob first (before any DB operations)
    const pixelData = image.pixel_data;
    const pixelOffset = index * 3; // 3 bytes per pixel (RGB)
    const r = pixelData[pixelOffset];
    const g = pixelData[pixelOffset + 1];
    const b = pixelData[pixelOffset + 2];
    const color = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

    // Try to insert - will fail if pixel already revealed (UNIQUE constraint)
    try {
      await query(
        `INSERT INTO revealed_pixels (image_id, pixel_index, revealed_by, tx_hash) VALUES (?, ?, ?, ?)`,
        [image.id, index, walletAddress || null, txHash]
      );

      // Successfully inserted - this client won the race
      // Update revealed count
      await query(
        `UPDATE images SET revealed_pixels = revealed_pixels + 1 WHERE id = ?`,
        [image.id]
      );

      return new Response(
        JSON.stringify({
          success: true,
          index,
          color,
          txHash,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (insertError: any) {
      // Check if it's a duplicate key error (pixel already revealed by another user)
      if (insertError.code === 'ER_DUP_ENTRY' || insertError.errno === 1062) {
        // Pixel was already revealed by someone else - return error
        return new Response(
          JSON.stringify({
            success: false,
            alreadyRevealed: true,
            error: "Pixel was just revealed by another player",
            index,
            color,
          }),
          { 
            status: 409, // Conflict
            headers: { "Content-Type": "application/json" } 
          }
        );
      }
      // Other database error - rethrow
      throw insertError;
    }
  } catch (error: any) {
    console.error("Open pixel error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Server error", details: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
