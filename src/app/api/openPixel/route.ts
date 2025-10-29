import { GRID_SIZE } from "@/lib/constants";
import { query } from "@/lib/db";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { PIXPOT_CONTRACT_ADDRESS } from "@/lib/contract";

const publicClient = process.env.NEXT_PUBLIC_ENV === 'development'
  ? (() => {
      return createPublicClient({
        chain: baseSepolia,
        transport: http(),
      });
    })()
  : createPublicClient({
      chain: base,
      transport: http(),
    });

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const index = Number(body?.index);
    const walletAddress = body?.walletAddress;
    const txHash = body?.txHash; // Transaction hash from onchain reveal

    if (!Number.isInteger(index) || index < 0 || index >= GRID_SIZE * GRID_SIZE) {
      return new Response(JSON.stringify({ success: false, error: "invalid index" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!txHash) {
      return new Response(JSON.stringify({ success: false, error: "Transaction hash required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify transaction onchain with retry logic
    try {
      // Wait for transaction to be mined (with timeout)
      const receipt = await publicClient.waitForTransactionReceipt({ 
        hash: txHash as `0x${string}`,
        timeout: 20_000, // 20 seconds timeout
      });

      // Check transaction succeeded
      if (receipt.status !== 'success') {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "Transaction failed onchain" 
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Verify transaction was sent to correct contract
      if (receipt.to?.toLowerCase() !== PIXPOT_CONTRACT_ADDRESS?.toLowerCase()) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "Transaction was not sent to PixPot contract" 
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      //Verify caller matches walletAddress
      if (walletAddress && receipt.from.toLowerCase() !== walletAddress.toLowerCase()) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "Transaction sender does not match wallet address" 
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Verify the transaction called revealPixels function
      const txData = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
      
      if (!txData.input || txData.input === '0x') {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "Transaction did not call any contract function" 
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Get function selector from transaction input (first 4 bytes = 8 hex chars + '0x')
      // const functionSelector = txData.input.slice(0, 10);
      
      // Calculate expected function selector for revealPixels(uint256,uint256)
      // revealPixels function signature
      // const revealPixelsAbi = PIXPOT_CONTRACT_ABI.find(
      //   (item: any) => item.type === 'function' && item.name === 'revealPixels'
      // );
      
      // if (!revealPixelsAbi) {
      //   return new Response(JSON.stringify({ 
      //     success: false, 
      //     error: "Contract ABI not configured correctly" 
      //   }), {
      //     status: 500,
      //     headers: { "Content-Type": "application/json" },
      //   });
      // }

      // The function selector should match revealPixels(uint256,uint256)
      // Expected selector: 0x9e9e4f3a (this is keccak256("revealPixels(uint256,uint256)")[:4])
      // We'll verify by decoding the transaction input
      // const expectedFunctionName = 'revealPixels';
      
      // Simple check: function selector should be consistent
      // For stronger validation, decode the parameters
      // try {
      //   const { decodeFunctionData } = await import('viem');
      //   const decoded = decodeFunctionData({
      //     abi: PIXPOT_CONTRACT_ABI,
      //     data: txData.input as `0x${string}`,
      //   });

      //   // Verify it's the revealPixels function
      //   if (decoded.functionName !== expectedFunctionName) {
      //     return new Response(JSON.stringify({ 
      //       success: false, 
      //       error: "Transaction did not call revealPixels function",
      //       details: `Function called: ${decoded.functionName}`
      //     }), {
      //       status: 400,
      //       headers: { "Content-Type": "application/json" },
      //     });
      //   }
      // } catch (decodeError) {
      //   console.error("Error decoding transaction:", decodeError);
      //   return new Response(JSON.stringify({ 
      //     success: false, 
      //     error: "Failed to decode transaction data",
      //     details: "Transaction may not be a valid revealPixels call"
      //   }), {
      //     status: 400,
      //     headers: { "Content-Type": "application/json" },
      //   });
      // }

    } catch (verifyError: any) {
      console.error("Transaction verification error:", verifyError);
      
      // Check if it's a timeout error
      if (verifyError.message?.includes('timeout') || verifyError.message?.includes('timed out')) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "Transaction verification timeout. Please try again.",
          details: "Transaction is taking longer than expected to be mined."
        }), {
          status: 408, // Request Timeout
          headers: { "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Failed to verify transaction onchain",
        details: verifyError.message 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check if this txHash has already been used
    const existingTx = await query<any[]>(
      `SELECT pixel_index, image_id FROM revealed_pixels WHERE tx_hash = ?`,
      [txHash]
    );

    if (existingTx.length > 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "This transaction has already been used to reveal a pixel",
        details: `Transaction ${txHash} was already used for pixel ${existingTx[0].pixel_index}`
      }), {
        status: 409, // Conflict
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get active image with pixel data
    const images = await query<any[]>(
      `SELECT id, width, height, pixel_data FROM images WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`
    );

    if (images.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No active game" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const image = images[0];

    // Extract color from pixel_data blob first (before any DB operations)
    const pixelData = image.pixel_data;
    const pixelOffset = index * 3; // 3 bytes per pixel (RGB)
    const r = pixelData[pixelOffset];
    const g = pixelData[pixelOffset + 1];
    const b = pixelData[pixelOffset + 2];
    const color = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

    // Try to insert - will fail if pixel already revealed (UNIQUE constraint)
    try {
      await query(
        `INSERT INTO revealed_pixels (image_id, pixel_index, revealed_by, tx_hash) VALUES (?, ?, ?, ?)`,
        [image.id, index, walletAddress || null, txHash]
      );

      // Successfully inserted - this client won the race
      // Update revealed count
      await query(
        `UPDATE images SET revealed_pixels = revealed_pixels + 1 WHERE id = ?`,
        [image.id]
      );

      return new Response(
        JSON.stringify({
          success: true,
          index,
          color,
          txHash,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (insertError: any) {
      // Check if it's a duplicate key error (pixel already revealed by another user)
      if (insertError.code === 'ER_DUP_ENTRY' || insertError.errno === 1062) {
        // Pixel was already revealed by someone else - return error
        return new Response(
          JSON.stringify({
            success: false,
            alreadyRevealed: true,
            error: "Pixel was just revealed by another player",
            index,
            color,
          }),
          { 
            status: 409, // Conflict
            headers: { "Content-Type": "application/json" } 
          }
        );
      }
      // Other database error - rethrow
      throw insertError;
    }
  } catch (error: any) {
    console.error("Open pixel error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Server error", details: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
