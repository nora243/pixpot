import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    // Find next archived game to activate
    // Get games where status is 'archived' and has an onchain_game_id
    const result = await query<any[]>(
      `SELECT id, onchain_game_id, title, answer
       FROM images 
       WHERE status = 'archived' 
         AND onchain_game_id IS NOT NULL
         AND onchain_game_id > 0
       ORDER BY created_at ASC 
       LIMIT 1`
    );

    if (result.length === 0) {
      return NextResponse.json({ 
        nextGameId: null,
        message: "No archived games available to activate" 
      });
    }

    const nextGame = result[0];
    
    return NextResponse.json({ 
      nextGameId: Number(nextGame.onchain_game_id),
      databaseId: Number(nextGame.id),
      title: nextGame.title,
    });
  } catch (error) {
    console.error("Error fetching next game:", error);
    return NextResponse.json(
      { error: "Failed to fetch next game" },
      { status: 500 }
    );
  }
}
