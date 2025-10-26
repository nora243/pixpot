import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const completedImages = await query<any[]>(
      `SELECT id, filename, original_name, answer, winner_address, 
              revealed_pixels, total_pixels, pool_amount, updated_at
       FROM images 
       WHERE status = 'completed' 
       ORDER BY updated_at DESC
       LIMIT 10`
    );

    return NextResponse.json({ images: completedImages });
  } catch (error: any) {
    console.error("Get history error:", error);
    return NextResponse.json(
      { error: "Failed to fetch history", details: error.message },
      { status: 500 }
    );
  }
}
