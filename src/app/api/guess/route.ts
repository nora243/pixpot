import { query } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const guess = String(body?.guess ?? "").trim().toLowerCase();
    const walletAddress = String(body?.walletAddress ?? "").trim();
    const isCorrect = Boolean(body?.isCorrect ?? false);
    const gameId = body?.gameId ? Number(body.gameId) : null;
    const poolAmount = body?.poolAmount ? String(body.poolAmount) : null; // Pool amount from blockchain
    const txHash = body?.txHash ? String(body.txHash).trim() : null; // Transaction hash
    const adminSecret = body?.adminSecret ? String(body.adminSecret).trim() : null; // Admin secret for claiming
    
    if (!guess) {
      return new Response(JSON.stringify({ success: false, error: "empty guess" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!walletAddress) {
      return new Response(JSON.stringify({ success: false, error: "wallet address required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get image by gameId or active image
    let images;
    if (gameId) {
      images = await query<any[]>(
        `SELECT id, answer, pool_amount, onchain_game_id FROM images WHERE onchain_game_id = ? LIMIT 1`,
        [gameId]
      );
    } else {
      images = await query<any[]>(
        `SELECT id, answer, pool_amount, onchain_game_id FROM images WHERE status = 'active' LIMIT 1`
      );
    }

    if (images.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "No active game found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const image = images[0];

    // Record the guess with isCorrect from contract
    console.log("Recording guess:", { image_id: image.id, wallet_address: walletAddress, guess, isCorrect, txHash, has_adminSecret: !!adminSecret });
    
    try {
      await query(
        `INSERT INTO guesses (image_id, wallet_address, guess_text, is_correct, tx_hash, admin_secret) VALUES (?, ?, ?, ?, ?, ?)`,
        [image.id, walletAddress, guess, isCorrect, txHash, adminSecret]
      );
      console.log("Guess recorded successfully");
    } catch (insertError: any) {
      console.error("Failed to insert guess:", insertError);
      throw insertError;
    }

    if (isCorrect) {
      // Update game status to completed and set winner
      // This happens AFTER declareWinner is called onchain
      const updateFields = [
        'pool_amount = ?',
        'status = ?',
        'winner_address = ?'
      ];
      const updateValues: any[] = [
        poolAmount || image.pool_amount,
        'completed',
        walletAddress
      ];
      
      updateValues.push(image.id);
      
      await query(
        `UPDATE images SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );

      return new Response(
        JSON.stringify({ 
          success: true, 
          correct: true,
          payout: parseFloat(poolAmount || image.pool_amount || "0"),
          message: `🎉 You won! Claim your prize in Profile anytime.`
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, correct: false, message: "Not quite, try again." }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Guess error:", error);
    console.error("Error stack:", error.stack);
    console.error("Error code:", error.code);
    console.error("Error sqlMessage:", error.sqlMessage);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "Failed to process guess",
        details: error.message || String(error),
        sqlError: error.sqlMessage
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
