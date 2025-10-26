import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Get active image with pixel data and revealed pixels
export async function GET() {
  try {
    // Get the most recent active image
    const images = await query<any[]>(
      `SELECT id, width, height, pixel_data, total_pixels, revealed_pixels, status,
              hint_0, hint_1000, hint_2000, pool_amount, winner_address
       FROM images 
       WHERE status = 'active' 
       ORDER BY created_at DESC 
       LIMIT 1`
    );

    if (images.length === 0) {
      // Check if all games are completed
      const completedCount = await query<any[]>(
        `SELECT COUNT(*) as count FROM images WHERE status = 'completed'`
      );
      const archivedCount = await query<any[]>(
        `SELECT COUNT(*) as count FROM images WHERE status = 'archived'`
      );
      
      const hasCompletedGames = completedCount[0]?.count > 0;
      const hasArchivedGames = archivedCount[0]?.count > 0;
      
      if (hasCompletedGames && !hasArchivedGames) {
        return NextResponse.json({ 
          error: "No active image",
          allCompleted: true,
          message: "🏁 All games have been completed! No more images available."
        }, { status: 404 });
      }
      
      return NextResponse.json({ 
        error: "No active image",
        allCompleted: false
      }, { status: 404 });
    }

    const image = images[0];

    // Get only revealed pixels
    const revealedPixels = await query<any[]>(
      `SELECT pixel_index, revealed_by, revealed_at
       FROM revealed_pixels 
       WHERE image_id = ?
       ORDER BY pixel_index`,
      [image.id]
    );

    // Get unique participants count (people who revealed pixels)
    const participantsCount = await query<any[]>(
      `SELECT COUNT(DISTINCT revealed_by) as count
       FROM revealed_pixels
       WHERE image_id = ?`,
      [image.id]
    );

    // Get total guesses count for this image
    const guessesCount = await query<any[]>(
      `SELECT COUNT(*) as count
       FROM guesses
       WHERE image_id = ?`,
      [image.id]
    );

    // Convert pixel_data blob to base64 for transmission
    const pixelDataBase64 = image.pixel_data.toString('base64');

    // Determine which hints to show based on revealed pixels
    const hints: string[] = [];
    if (image.hint_0) hints.push(image.hint_0);
    if (image.revealed_pixels >= 1000 && image.hint_1000) hints.push(image.hint_1000);
    if (image.revealed_pixels >= 2000 && image.hint_2000) hints.push(image.hint_2000);

    return NextResponse.json({
      imageId: image.id,
      width: image.width,
      height: image.height,
      totalPixels: image.total_pixels,
      revealedPixels: image.revealed_pixels,
      status: image.status,
      poolAmount: image.pool_amount,
      winnerAddress: image.winner_address,
      participantsCount: participantsCount[0]?.count || 0,
      guessesCount: guessesCount[0]?.count || 0,
      hints: hints,
      pixelData: pixelDataBase64, // RGB data as base64
      revealed: revealedPixels.map((p) => ({
        index: p.pixel_index,
        revealedBy: p.revealed_by,
        revealedAt: p.revealed_at,
      })),
    });
  } catch (error: any) {
    console.error("Get game data error:", error);
    return NextResponse.json(
      { error: "Failed to fetch game data", details: error.message },
      { status: 500 }
    );
  }
}
