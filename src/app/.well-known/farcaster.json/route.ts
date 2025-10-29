function withValidProperties(properties: Record<string, undefined | string | string[]>) {
    return Object.fromEntries(
        Object.entries(properties).filter(([_, value]) => (Array.isArray(value) ? value.length > 0 : !!value))
    );
}

export async function GET() {
    const URL = process.env.NEXT_PUBLIC_URL as string;
    return Response.json({
        "accountAssociation": {
            "header": "eyJmaWQiOjEzNDI0MTgsInR5cGUiOiJhdXRoIiwia2V5IjoiMHhhZDRCM2Q3MUI2YzgwRTkxOGRDZTdDRUFlYzdBMTlkODk1MUE3MzM1In0",
            "payload": "eyJkb21haW4iOiJwaXhwb3QuZnVuIn0",
            "signature": "XLIs1xD6LppyDKUAws03vOSNNS10TcWjM4qV807ZpGoh6gbYI/9nuSrkalSH10j8Cx3X4dZ5XEyXJwx/PcQyaxw="
        },
        "baseBuilder": {
            "allowedAddresses": ["0xCa2b01D0552A30F3619b53b2b59aA3d4358f1Fbf"] // add your Base Account address here
        },
        "miniapp": {
            "version": "1",
            "name": "PixPot",
            "homeUrl": "https://pixpot.fun/",
            "iconUrl": "https://pixpot.fun/icon.png",
            "imageUrl": "https://pixpot.fun/image.png",
            "buttonTitle": "Play PixPot",
            "splashImageUrl": "https://pixpot.fun/logo.png",
            "splashBackgroundColor": "#1E90FF",
            "webhookUrl": "https://pixpot.fun",
            "subtitle": "Reveal. Guess. Win!",
            "description": "PixPot is a social mini app where you can challenge your friends to solve pixel art puzzles in real time. Reveal pixels, guess the image, and win rewards together!",
            "screenshotUrls": [
                "https://pixpot.fun/ss1.png",
                "https://pixpot.fun/ss2.png",
                "https://pixpot.fun/ss1.png"
            ],
            "primaryCategory": "social",
            "tags": ["example", "miniapp", "baseapp"],
            "heroImageUrl": "https://pixpot.fun/logo.png",
            "tagline": "Play instantly",
            "ogTitle": "PixPot Mini App",
            "ogDescription": "Challenge friends in real time.",
            "ogImageUrl": "https://pixpot.fun/logo.png",
            "noindex": false
        }
    }); // see the next step for the manifest_json_object
}