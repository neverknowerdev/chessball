function withValidProperties(
  properties: Record<string, undefined | string | string[]>,
) {
  return Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return !!value;
    }),
  );
}

export async function GET() {
  const URL = "https://play.tactiball.fun";

  return Response.json({
    accountAssociation: {
      header: "eyJmaWQiOjk2OTIwNiwidHlwZSI6ImF1dGgiLCJrZXkiOiIweGY4NDlCYUUwMDU1MzE4OUMwZUJEOUY1MzQyYjZlMDIyMUMyNDBEZjcifQ",
      payload: "eyJkb21haW4iOiJwbGF5LnRhY3RpYmFsbC5mdW4ifQ",
      signature: "TnXWOcZfDPSWjG9UGnv6JfuYUFDW4kOSCXZcO+NzcloknViNq7cT+WsYxxSgOvhV+KY71ld/sJShXGubfsIi3Rw="
    },
    frame: withValidProperties({
      version: "1",
      name: "TactiBall",
      subtitle: "Play. Bet. Earn.",
      description: "Play tactical football - 2D board game, where tactic meets probability. Build your own team, play against friends and earn rewards.",
      screenshotUrls: [],
      iconUrl: "https://play.tactiball.fun/icon.png",
      splashImageUrl: "https://play.tactiball.fun/splash.png",
      splashBackgroundColor: "#efe7d4",
      homeUrl: URL,
      webhookUrl: `${URL}/api/webhook`,
      primaryCategory: "games",
      tags: ["chess", "football", "tactiball", "tactical"],
      heroImageUrl: "https://play.tactiball.fun/hero.png",
      tagline: "Play now",
      ogTitle: "TactiBall",
      ogDescription: "Play TactiBall with your friends",
      ogImageUrl: "https://play.tactiball.fun/hero.png",
    }),
    baseBuilder: {
      allowedAddresses: ["0x810E57D64D4Bd3D92560dF5E82f01f654359F89B"]
    }
  });
}
