import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase";

const ZEALY_API_KEY =
  process.env.ZEALY_API_KEY;

// Handle GET requests - return 405
export async function GET(req: NextRequest) {
  return NextResponse.json(
    {
      message: "This endpoint only accepts POST requests from Zealy webhooks",
    },
    { status: 405 },
  );
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Zealy verification request received`);

  if (!ZEALY_API_KEY) {
    throw new Error("ZEALY_API_KEY is not set");
  }

  try {
    // Verify API key from Zealy
    const apiKey = req.headers.get("x-api-key");

    if (!apiKey) {
      console.error(`[${requestId}] No API key provided`);
      return NextResponse.json(
        {
          message: "Missing API key",
        },
        { status: 401 },
      );
    }

    if (apiKey !== ZEALY_API_KEY) {
      console.error(`[${requestId}] Invalid API key`);
      return NextResponse.json(
        {
          message: "Invalid API key",
        },
        { status: 401 },
      );
    }

    const body = await req.json();
    console.log(`[${requestId}] Request body:`, JSON.stringify(body, null, 2));

    const {
      userId, // Zealy user ID
      communityId,
      subdomain,
      questId,
      requestId: zealyRequestId,
      accounts,
    } = body;

    // Get the Zealy Connect identifier (wallet address)
    const zealyConnectIdentifier = accounts?.["zealy-connect"];
    console.log(`[${requestId}] Wallet identifier:`, zealyConnectIdentifier);

    if (!zealyConnectIdentifier) {
      console.log(`[${requestId}] No Zealy Connect identifier`);
      return NextResponse.json(
        {
          message:
            "Account not connected. Please visit play.tactiball.fun/connect-zealy to connect your account!",
        },
        { status: 400 },
      );
    }

    const supabase = createAnonClient();

    // Query using primary_wallet (the actual column name)
    const { data: team, error } = await supabase
      .from("teams")
      .select("id, name, primary_wallet, zealy_user_id")
      .eq("primary_wallet", zealyConnectIdentifier.toLowerCase())
      .maybeSingle();

    if (error) {
      console.error(`[${requestId}] Database error:`, error);
      return NextResponse.json(
        {
          message: `Database error. Request ID: ${requestId}`,
        },
        { status: 400 },
      );
    }

    if (!team) {
      console.log(`[${requestId}] No team found for wallet:`, zealyConnectIdentifier);
      return NextResponse.json(
        {
          message: `No TactiBall team found. Please create a team at play.tactiball.fun first!`,
        },
        { status: 400 },
      );
    }

    console.log(`[${requestId}] Team found:`, {
      id: team.id,
      name: team.name,
      zealyUserId: team.zealy_user_id,
      requestUserId: userId
    });

    // If zealy_user_id is not set, this shouldn't happen (user should link first)
    if (!team.zealy_user_id) {
      console.error(`[${requestId}] Team has no zealy_user_id set`);
      return NextResponse.json(
        {
          message: `Please connect your account at play.tactiball.fun/connect-zealy first!`,
        },
        { status: 400 },
      );
    }

    // Verify the Zealy user ID matches
    if (team.zealy_user_id !== userId) {
      console.log(`[${requestId}] Zealy user ID mismatch. Expected: ${team.zealy_user_id}, Got: ${userId}`);
      return NextResponse.json(
        {
          message: `Account mismatch. Please reconnect at play.tactiball.fun/connect-zealy`,
        },
        { status: 400 },
      );
    }

    // Quest completed successfully!
    console.log(`[${requestId}] ✅ Quest verified for team: ${team.name}`);
    return NextResponse.json(
      {
        message: `✅ Quest completed! Welcome, Team ${team.name}!`,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error(`[${requestId}] Unexpected error:`, error);
    return NextResponse.json(
      {
        message: "An unexpected error occurred. Please try again later.",
      },
      { status: 400 },
    );
  }
}