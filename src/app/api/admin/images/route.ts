import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { query } from "@/lib/db";
import { verifyAdminAuth } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// Store images OUTSIDE public directory for security
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication via signature
    const walletAddress = request.headers.get("x-wallet-address");
    const signature = request.headers.get("x-signature");
    const timestamp = request.headers.get("x-timestamp");

    const isAuthenticated = await verifyAdminAuth(walletAddress, signature, timestamp);
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized - Invalid signature" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("image") as File;
    const answer = formData.get("answer") as string;
    const hint_0 = formData.get("hint_0") as string | null;
    const hint_1000 = formData.get("hint_1000") as string | null;
    const hint_2000 = formData.get("hint_2000") as string | null;

    if (!file || !answer) {
      return NextResponse.json(
        { error: "Image and answer are required" },
        { status: 400 }
      );
    }

    // Read file buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Process image with sharp - resize to 128x128
    const processedImage = await sharp(buffer)
      .resize(128, 128, { fit: "fill" })
      .png()
      .toBuffer();

    // Get raw pixel data (RGB format, 3 bytes per pixel)
    const { data, info } = await sharp(processedImage)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;

    // Save processed image
    await mkdir(UPLOAD_DIR, { recursive: true });
    const filename = `${Date.now()}-${file.name.replace(/[^a-z0-9.-]/gi, "_")}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    await writeFile(filepath, processedImage);

    // Store raw RGB data as blob (already in perfect format from sharp)
    const pixelData = Buffer.from(data);

    // Insert image record with pixel data blob and hints
    const imageResult = await query<any>(
      `INSERT INTO images (filename, original_name, width, height, answer, pixel_data, total_pixels, status, hint_0, hint_1000, hint_2000) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'archived', ?, ?, ?)`,
      [
        filename,
        file.name,
        width,
        height,
        answer.trim(),
        pixelData,
        width * height,
        hint_0?.trim() || null,
        hint_1000?.trim() || null,
        hint_2000?.trim() || null,
      ]
    );

    const imageId = imageResult.insertId;

    return NextResponse.json({
      success: true,
      imageId,
      filename,
      totalPixels: width * height,
      message: "Image uploaded and processed successfully",
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to process image", details: error.message },
      { status: 500 }
    );
  }
}

// Get all images
export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication via signature
    const walletAddress = request.headers.get("x-wallet-address");
    const signature = request.headers.get("x-signature");
    const timestamp = request.headers.get("x-timestamp");

    const isAuthenticated = await verifyAdminAuth(walletAddress, signature, timestamp);
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized - Invalid signature" }, { status: 403 });
    }

    const images = await query<any[]>(
      `SELECT id, filename, original_name, width, height, answer, status, 
              total_pixels, revealed_pixels, pool_amount, winner_address, created_at,
              hint_0, hint_1000, hint_2000
       FROM images 
       ORDER BY created_at DESC`
    );

    return NextResponse.json({ images });
  } catch (error: any) {
    console.error("Get images error:", error);
    return NextResponse.json(
      { error: "Failed to fetch images", details: error.message },
      { status: 500 }
    );
  }
}
