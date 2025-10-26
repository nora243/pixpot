import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifyAdminAuth } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Verify admin authentication via signature
    const walletAddress = request.headers.get("x-wallet-address");
    const signature = request.headers.get("x-signature");
    const timestamp = request.headers.get("x-timestamp");

    const isAuthenticated = await verifyAdminAuth(walletAddress, signature, timestamp);
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized - Invalid signature" }, { status: 403 });
    }

    const body = await request.json();
    const { answer, status, original_name, hint_0, hint_1000, hint_2000, pool_amount, admin_secret, onchain_game_id } = body;

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];

    if (answer !== undefined) {
      updates.push("answer = ?");
      values.push(answer.trim());
    }
    if (status !== undefined) {
      updates.push("status = ?");
      values.push(status);
    }
    if (original_name !== undefined) {
      updates.push("original_name = ?");
      values.push(original_name.trim());
    }
    if (hint_0 !== undefined) {
      updates.push("hint_0 = ?");
      values.push(hint_0 ? hint_0.trim() : null);
    }
    if (hint_1000 !== undefined) {
      updates.push("hint_1000 = ?");
      values.push(hint_1000 ? hint_1000.trim() : null);
    }
    if (hint_2000 !== undefined) {
      updates.push("hint_2000 = ?");
      values.push(hint_2000 ? hint_2000.trim() : null);
    }
    if (pool_amount !== undefined) {
      updates.push("pool_amount = ?");
      values.push(pool_amount);
    }
    if (admin_secret !== undefined) {
      updates.push("admin_secret = ?");
      values.push(admin_secret);
    }
    if (onchain_game_id !== undefined) {
      updates.push("onchain_game_id = ?");
      values.push(onchain_game_id);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(parseInt(id));

    await query(
      `UPDATE images SET ${updates.join(", ")} WHERE id = ?`,
      values
    );

    return NextResponse.json({ success: true, message: "Image updated successfully" });
  } catch (error: any) {
    console.error("Update image error:", error);
    return NextResponse.json(
      { error: "Failed to update image", details: error.message },
      { status: 500 }
    );
  }
}
