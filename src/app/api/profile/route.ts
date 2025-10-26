import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json(
        { error: "Wallet address required" },
        { status: 400 }
      );
    }

    // Run all queries in parallel for better performance
    const [pixelStats, guessStats, prizeStats, participatedImages, recentPixels, recentGuesses] = await Promise.all([
      // Get total pixels revealed by user
      query<any>(
        `SELECT COUNT(*) as total_pixels_revealed
         FROM revealed_pixels
         WHERE revealed_by = ?`,
        [address]
      ),

      // Get guess statistics
      query<any>(
        `SELECT 
          COUNT(*) as total_guesses,
          SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct_guesses
         FROM guesses
         WHERE wallet_address = ?`,
        [address]
      ),

      // Get total prizes won
      query<any>(
        `SELECT 
          SUM(i.pool_amount) as total_prizes_won
         FROM images i
         WHERE i.winner_address = ? AND i.status = 'completed'`,
        [address]
      ),

      // Get images user participated in - OPTIMIZED with aggregated subqueries
      query<any>(
        `SELECT 
          i.id, i.filename, i.original_name, i.answer, 
          i.status, i.pool_amount, i.winner_address, i.updated_at, i.onchain_game_id,
          COALESCE(rp_count.user_pixels, 0) as user_pixels,
          COALESCE(g_count.user_guesses, 0) as user_guesses,
          COALESCE(g_count.user_correct_guesses, 0) as user_correct_guesses
         FROM images i
         LEFT JOIN (
           SELECT image_id, COUNT(*) as user_pixels
           FROM revealed_pixels
           WHERE revealed_by = ?
           GROUP BY image_id
         ) rp_count ON i.id = rp_count.image_id
         LEFT JOIN (
           SELECT image_id, 
                  COUNT(*) as user_guesses,
                  SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as user_correct_guesses
           FROM guesses
           WHERE wallet_address = ?
           GROUP BY image_id
         ) g_count ON i.id = g_count.image_id
         WHERE rp_count.user_pixels > 0 OR g_count.user_guesses > 0
         ORDER BY i.updated_at DESC
         LIMIT 50`,
        [address, address]
      ),

      // Get recent pixel reveals
      query<any>(
        `SELECT rp.pixel_index, rp.revealed_at, i.filename, i.original_name, i.id as image_id
         FROM revealed_pixels rp
         JOIN images i ON rp.image_id = i.id
         WHERE rp.revealed_by = ?
         ORDER BY rp.revealed_at DESC
         LIMIT 20`,
        [address]
      ),

      // Get recent guesses
      query<any>(
        `SELECT g.guess_text, g.is_correct, g.created_at, i.filename, i.original_name, i.id as image_id, i.answer
         FROM guesses g
         JOIN images i ON g.image_id = i.id
         WHERE g.wallet_address = ?
         ORDER BY g.created_at DESC
         LIMIT 20`,
        [address]
      )
    ]);

    // Calculate prizes (won vs claimed - for now all are auto-claimed in demo)
    const totalPrizesWon = parseFloat(prizeStats[0]?.total_prizes_won || "0");

    return NextResponse.json({
      success: true,
      stats: {
        totalPixelsRevealed: pixelStats[0]?.total_pixels_revealed || 0,
        totalGuesses: guessStats[0]?.total_guesses || 0,
        correctGuesses: guessStats[0]?.correct_guesses || 0,
        totalPrizesWon: totalPrizesWon.toFixed(8),
        totalPrizesClaimed: totalPrizesWon.toFixed(8), // Demo: auto-claimed
        totalPrizesUnclaimed: "0.00000000", // Demo: always 0
      },
      participatedImages: participatedImages || [],
      recentPixels: recentPixels || [],
      recentGuesses: recentGuesses || [],
    });
  } catch (error) {
    console.error("Profile API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch profile data" },
      { status: 500 }
    );
  }
}
