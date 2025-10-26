import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { query } from "@/lib/db";
import { isAdmin } from "@/lib/admin";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    
    console.log(`[Image API] Requesting: ${filename}`);
    
    // Get image info from database
    const images = await query<any[]>(
      `SELECT id, status, filename FROM images WHERE filename = ?`,
      [filename]
    );

    if (images.length === 0) {
      console.log(`[Image API] Not found in DB: ${filename}`);
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    const image = images[0];
    const walletAddress = request.headers.get("x-wallet-address") || "";

    console.log(`[Image API] Image status: ${image.status}, Wallet: ${walletAddress ? walletAddress.slice(0, 6) + '...' : 'none'}`);

    // Check access permissions:
    // 1. Admin can view all images
    // 2. Anyone can view completed images
    // 3. Active and archived images are protected
    const canView = isAdmin(walletAddress) || image.status === 'completed';

    if (!canView) {
      console.log(`[Image API] Access denied for ${filename}`);
      return NextResponse.json(
        { error: "Access denied. Image not yet completed." },
        { status: 403 }
      );
    }

    // Read and serve the image file
    const filepath = path.join(UPLOAD_DIR, filename);
    console.log(`[Image API] Reading from: ${filepath}`);
    const imageBuffer = await readFile(filepath);

    console.log(`[Image API] Successfully served: ${filename}`);
    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error: any) {
    console.error("Image serve error:", error);
    return NextResponse.json(
      { error: "Failed to load image", details: error.message },
      { status: 500 }
    );
  }
}
