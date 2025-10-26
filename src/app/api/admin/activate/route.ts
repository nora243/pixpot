import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifyAdminAuth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageId, onchainGameId, autoActivate, poolAmount } = body;

    // Check authorization (admin with signature OR auto-activate from blockchain sync)
    if (!autoActivate) {
      const walletAddress = request.headers.get("x-wallet-address");
      const signature = request.headers.get("x-signature");
      const timestamp = request.headers.get("x-timestamp");

      const isAuthenticated = await verifyAdminAuth(walletAddress, signature, timestamp);
      if (!isAuthenticated) {
        return NextResponse.json({ error: "Unauthorized - Invalid signature" }, { status: 403 });
      }
    }

    // Support both imageId (database ID) and onchainGameId (blockchain ID)
    let targetImageId: number;
    
    if (onchainGameId !== undefined) {
      // Find image by onchain_game_id
      const images = await query<any[]>(
        "SELECT id, status, onchain_game_id FROM images WHERE onchain_game_id = ?",
        [onchainGameId]
      );
      
      if (images.length === 0) {
        // If not found by onchain_game_id, find next available game and assign this onchain ID
        console.log(`⚠️ Game with onchain_game_id ${onchainGameId} not found in database.`);
        console.log(`This might mean the game was created onchain but not yet in database.`);
        
        const nextGames = await query<any[]>(
          `SELECT id, status, onchain_game_id, filename 
           FROM images 
           WHERE (status = 'uploaded' OR status = 'archived') 
           AND winner_address IS NULL
           AND (onchain_game_id IS NULL OR onchain_game_id = 0)
           ORDER BY id ASC
           LIMIT 1`
        );
        
        if (nextGames.length === 0) {
          return NextResponse.json({ 
            error: "No game found with onchain_game_id: " + onchainGameId,
            suggestion: "Please create the game in database first or sync from blockchain"
          }, { status: 404 });
        }
        
        targetImageId = nextGames[0].id;
        
        // Update onchain_game_id for this image
        await query(
          "UPDATE images SET onchain_game_id = ? WHERE id = ?",
          [onchainGameId, targetImageId]
        );
        
        console.log(`✅ Auto-assigned onchain_game_id ${onchainGameId} to database image ${targetImageId} (${nextGames[0].filename})`);
      } else {
        targetImageId = images[0].id;
        console.log(`✅ Found game in database: image ${targetImageId} with onchain_game_id ${onchainGameId}`);
      }
    } else if (imageId !== undefined) {
      // Use imageId directly
      const images = await query<any[]>(
        "SELECT id, status FROM images WHERE id = ?",
        [imageId]
      );
      
      if (images.length === 0) {
        return NextResponse.json({ error: "Image not found with id: " + imageId }, { status: 404 });
      }
      
      targetImageId = imageId;
    } else {
      return NextResponse.json({ error: "Either imageId or onchainGameId is required" }, { status: 400 });
    }

    // Deactivate all other images
    await query(
      "UPDATE images SET status = 'archived' WHERE status = 'active' AND id != ?",
      [targetImageId]
    );

    // Activate the selected image and update pool_amount if provided
    if (poolAmount !== undefined && poolAmount !== null) {
      await query(
        "UPDATE images SET status = 'active', pool_amount = ? WHERE id = ?",
        [poolAmount, targetImageId]
      );
      console.log(`✅ Activated image ${targetImageId} with pool amount: ${poolAmount} ETH`);
    } else {
      await query(
        "UPDATE images SET status = 'active' WHERE id = ?",
        [targetImageId]
      );
      console.log(`✅ Activated image ${targetImageId} (pool amount not updated)`);
    }

    return NextResponse.json({ 
      success: true, 
      message: "Image activated successfully",
      imageId: targetImageId,
      onchainGameId: onchainGameId,
      poolAmount: poolAmount
    });
  } catch (error: any) {
    console.error("Activate error:", error);
    return NextResponse.json(
      { error: "Failed to activate image", details: error.message },
      { status: 500 }
    );
  }
}
