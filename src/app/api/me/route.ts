import { Errors, createClient } from '@farcaster/quick-auth';
import { NextRequest, NextResponse } from 'next/server';

const client = createClient();

// Resolve information about the authenticated Farcaster user
async function resolveUser(fid: number) {
  const primaryAddress = await (async () => {
    try {
      const res = await fetch(
        `https://api.farcaster.xyz/fc/primary-address?fid=${fid}&protocol=ethereum`,
      );
      
      if (res.ok) {
        const { result } = await res.json() as {
          result: {
            address: {
              fid: number;
              protocol: 'ethereum' | 'solana';
              address: string;
            };
          };
        };

        return result.address.address;
      }
    } catch (error) {
      console.error('Error fetching primary address:', error);
    }
    
    return undefined;
  })();

  return {
    fid,
    primaryAddress,
  };
}

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get('Authorization');
    
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing token' },
        { status: 401 }
      );
    }

    const token = authorization.split(' ')[1];
    
    // Get hostname from environment or request
    const hostname = process.env.NEXT_PUBLIC_HOSTNAME || 
                     process.env.VERCEL_URL || 
                     request.headers.get('host') || 
                     'localhost:3001';

    try {
      const payload = await client.verifyJwt({
        token,
        domain: hostname,
      });

      const user = await resolveUser(payload.sub); //payload.sub);
      
      return NextResponse.json(user);
    } catch (e) {
      if (e instanceof Errors.InvalidTokenError) {
        console.info('Invalid token:', e.message);
        return NextResponse.json(
          { error: 'Invalid token' },
          { status: 401 }
        );
      }

      throw e;
    }
  } catch (error: any) {
    console.error('Error in /api/me:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
