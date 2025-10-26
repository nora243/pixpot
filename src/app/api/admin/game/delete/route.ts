import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/auth";
import { query } from "@/lib/db";

// DELETE /api/admin/game/delete
// Delete game from database (call this after successful onchain deletion)
export async function DELETE(req: NextRequest) {
  try {
    // Verify admin authentication
    const walletAddress = req.headers.get("x-wallet-address");
    const signature = req.headers.get("x-signature");
    const timestamp = req.headers.get("x-timestamp");

    const isAuthenticated = await verifyAdminAuth(walletAddress, signature, timestamp);
    if (!isAuthenticated) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid signature" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const gameId = searchParams.get("gameId");
    const onchainGameId = searchParams.get("onchainGameId");

    if (!gameId && !onchainGameId) {
      return NextResponse.json(
        { error: "gameId or onchainGameId is required" },
        { status: 400 }
      );
    }

    // Find game in database
    let sqlQuery = "SELECT id, filename, status, winner_address, onchain_game_id FROM images WHERE ";
    let params: any[] = [];

    if (gameId) {
      sqlQuery += "id = ?";
      params.push(parseInt(gameId));
    } else {
      sqlQuery += "onchain_game_id = ?";
      params.push(parseInt(onchainGameId!));
    }

    const gameArray = await query<any[]>(sqlQuery, params);

    if (!gameArray || gameArray.length === 0) {
      return NextResponse.json(
        { error: "Game not found in database" },
        { status: 404 }
      );
    }

    const game = gameArray[0];

    // Safety check: don't delete games with winners
    if (game.winner_address) {
      return NextResponse.json(
        { error: "Cannot delete game with winner" },
        { status: 400 }
      );
    }

    // Delete game (CASCADE will delete revealed_pixels and guesses automatically)
    await query("DELETE FROM images WHERE id = ?", [game.id]);

    // TODO: Optionally delete image file from uploads folder
    // const fs = require('fs').promises;
    // const path = require('path');
    // try {
    //   await fs.unlink(path.join(process.cwd(), 'public/uploads', game.filename));
    // } catch (err) {
    //   console.error('Failed to delete image file:', err);
    // }

    return NextResponse.json({
      success: true,
      message: `Game #${game.id} deleted successfully`,
      deletedGameId: game.id,
      filename: game.filename,
    });
  } catch (error) {
    console.error("Error deleting game:", error);
    return NextResponse.json(
      { error: "Failed to delete game from database" },
      { status: 500 }
    );
  }
}
