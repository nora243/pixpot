import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { gameId, walletAddress, guess } = body;

    console.log("Verify guess request:", { gameId, walletAddress, guess });

    if (!gameId || !guess) {
      console.log("Missing gameId or guess");
      return NextResponse.json(
        { error: "Missing gameId or guess" },
        { status: 400 }
      );
    }

    // Get game from database
    console.log("Querying database for gameId:", gameId);
    const games = await query<any[]>(
      `SELECT id, answer, admin_secret, onchain_game_id 
       FROM images 
       WHERE onchain_game_id = ? 
       LIMIT 1`,
      [gameId]
    );
    console.log("Query result:", games);

    if (games.length === 0) {
      console.log("Game not found for gameId:", gameId);
      return NextResponse.json(
        { error: "Game not found" },
        { status: 404 }
      );
    }

    const game = games[0];
    console.log("Game found:", { id: game.id, has_admin_secret: !!game.admin_secret });

    // Check if admin_secret exists
    if (!game.admin_secret) {
      console.log("Missing admin_secret for game:", game.id);
      return NextResponse.json(
        { error: "Game not properly configured (missing admin_secret)" },
        { status: 500 }
      );
    }

    // Normalize and check answer
    const correctAnswers = game.answer
      .split('|')
      .map((a: string) => a.trim().toLowerCase())
      .filter((a: string) => a.length > 0);
    
    const normalizedGuess = guess.trim().toLowerCase();
    console.log("Checking guess:", { normalizedGuess, correctAnswers });
    const isCorrect = correctAnswers.includes(normalizedGuess);
    console.log("Is correct:", isCorrect);

    if (isCorrect) {
      console.log("Correct answer! Returning admin_secret");
      // Correct answer! Return admin secret so player can claim win
      return NextResponse.json({
        correct: true,
        adminSecret: game.admin_secret,
        message: "Correct! You can now claim your prize."
      });
    } else {
      console.log("Wrong answer");
      // Wrong answer
      return NextResponse.json({
        correct: false,
        message: "Not quite right. Try again!"
      });
    }
  } catch (error) {
    console.error("Verify guess error:", error);
    return NextResponse.json(
      { error: "Failed to verify guess", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
