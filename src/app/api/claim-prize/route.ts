import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json(
        { error: "Wallet address is required" },
        { status: 400 }
      );
    }

    // Get all correct guesses with admin_secret (unclaimed prizes)
    const prizes = await query<any[]>(
      `SELECT 
        g.*, 
        i.answer, 
        i.onchain_game_id,
        i.filename,
        i.original_name
       FROM guesses g
       JOIN images i ON g.image_id = i.id
       WHERE g.wallet_address = ? 
         AND g.is_correct = true
         AND g.admin_secret IS NOT NULL
         AND i.status = 'completed'
       ORDER BY g.created_at DESC`,
      [address]
    );

    return NextResponse.json({
      success: true,
      prizes: prizes,
    });
  } catch (error) {
    console.error("Get prizes error:", error);
    return NextResponse.json(
      { error: "Failed to get prizes" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { walletAddress, gameId } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Wallet address is required" },
        { status: 400 }
      );
    }

    if (!gameId) {
      return NextResponse.json(
        { error: "Game ID is required" },
        { status: 400 }
      );
    }

    // Get correct guess with admin_secret
    const guesses = await query<any[]>(
      `SELECT g.*, i.answer, i.onchain_game_id 
       FROM guesses g
       JOIN images i ON g.image_id = i.id
       WHERE g.wallet_address = ? 
         AND i.onchain_game_id = ? 
         AND g.is_correct = true
         AND g.admin_secret IS NOT NULL
       LIMIT 1`,
      [walletAddress, gameId]
    );

    if (guesses.length === 0) {
      return NextResponse.json(
        { error: "No claimable prize found for this game" },
        { status: 404 }
      );
    }

    const guess = guesses[0];

    // Return the data needed to claim prize onchain
    return NextResponse.json({
      success: true,
      gameId: guess.onchain_game_id,
      answer: guess.guess_text,
      adminSecret: guess.admin_secret,
      message: "Prize claim data retrieved successfully"
    });
  } catch (error) {
    console.error("Claim prize error:", error);
    return NextResponse.json(
      { error: "Failed to get claim data" },
      { status: 500 }
    );
  }
}
