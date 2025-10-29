# Farcaster Authentication API

## Overview
This API verifies Farcaster authentication tokens and returns user information.

## Endpoint

### GET `/api/me`

Verifies a Farcaster JWT token and returns authenticated user information.

## Request

### Headers
```
Authorization: Bearer <farcaster_jwt_token>
```

### Example
```bash
curl -X GET http://localhost:3001/api/me \
  -H "Authorization: Bearer eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9..."
```

## Response

### Success (200)
```json
{
  "fid": 12345,
  "primaryAddress": "0x1234567890abcdef1234567890abcdef12345678"
}
```

- `fid`: Farcaster ID of the authenticated user
- `primaryAddress`: Primary Ethereum address linked to the Farcaster account (optional)

### Error Responses

#### 401 Unauthorized - Missing Token
```json
{
  "error": "Missing token"
}
```

#### 401 Unauthorized - Invalid Token
```json
{
  "error": "Invalid token"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "details": "Error message"
}
```

## Environment Variables

Add to `.env.local`:

```env
# Farcaster Authentication
NEXT_PUBLIC_HOSTNAME=localhost:3001  # or your production domain (e.g., pixpot.xyz)
```

## Implementation Details

### Token Verification Flow

1. Extract `Authorization` header from request
2. Parse Bearer token
3. Verify JWT using `@farcaster/quick-auth` client
4. Extract Farcaster ID (fid) from token payload
5. Resolve primary Ethereum address from Farcaster API
6. Return user information

### Dependencies

- `@farcaster/quick-auth` - Farcaster authentication library
- Farcaster API endpoint: `https://api.farcaster.xyz/fc/primary-address`

## Usage in Frontend

```typescript
// Example: Fetch authenticated user info
async function getAuthenticatedUser(token: string) {
  const response = await fetch('/api/me', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Authentication failed');
  }

  const user = await response.json();
  // { fid: number, primaryAddress?: string }
  return user;
}

// Use with Farcaster SDK
import { sdk } from '@farcaster/miniapp-sdk';

const token = await sdk.actions.getToken();
const user = await getAuthenticatedUser(token);
console.log('Authenticated user:', user);
```

## Security Notes

- Tokens are verified against the configured `NEXT_PUBLIC_HOSTNAME` domain
- JWT signature is validated using Farcaster's public keys
- Invalid or expired tokens return 401 Unauthorized
- Primary address lookup failures are handled gracefully (returns undefined)

## Testing

### Local Development
```bash
# 1. Set environment variable
echo "NEXT_PUBLIC_HOSTNAME=localhost:3001" >> .env.local

# 2. Start dev server
npm run dev

# 3. Get token from Farcaster Miniapp SDK
# 4. Test endpoint
curl -X GET http://localhost:3001/api/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Production
Update `NEXT_PUBLIC_HOSTNAME` to your production domain:
```env
NEXT_PUBLIC_HOSTNAME=pixpot.xyz
```

## Error Handling

The endpoint handles the following error cases:

1. **Missing Authorization header**: Returns 401 with "Missing token"
2. **Invalid token format**: Returns 401 with "Missing token"
3. **Token signature verification fails**: Returns 401 with "Invalid token"
4. **Token expired**: Returns 401 with "Invalid token"
5. **Primary address API failure**: Returns 200 with `primaryAddress: undefined`
6. **Unexpected errors**: Returns 500 with error details

## Related Files

- `src/app/api/me/route.ts` - API endpoint implementation
- `.env.example` - Environment configuration template
- `package.json` - Dependencies (@farcaster/quick-auth)
