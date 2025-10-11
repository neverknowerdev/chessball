import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    let walletAddress;

    try {
      const body = await req.json();
      walletAddress = body.walletAddress;
    } catch (jsonError) {
      console.error("Error parsing request body:", jsonError);
      return NextResponse.json(
        {
          isLinked: false,
          error: "Invalid request body",
        },
        { status: 400 },
      );
    }

    if (!walletAddress) {
      return NextResponse.json(
        {
          isLinked: false,
          error: "No wallet address provided",
        },
        { status: 400 },
      );
    }

    const supabase = createAnonClient();

    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000);
    });

    const queryPromise = supabase
      .from("teams")
      .select("zealy_user_id")
      .eq("primary_wallet", walletAddress.toLowerCase())
      .maybeSingle();

    const result = await Promise.race([
      queryPromise,
      timeoutPromise
    ]).catch((err) => {
      console.error("Query error or timeout:", err);
      return { data: null, error: err };
    });

    const { data: team, error } = result as { data: any; error: any };

    if (error) {
      console.error("Error checking Zealy link:", error);
      return NextResponse.json(
        {
          isLinked: false,
          error: "Database error",
        },
        { status: 500 },
      );
    }

    const isLinked = !!(team && team.zealy_user_id);

    console.log(`Zealy link check for ${walletAddress}: ${isLinked ? 'linked' : 'not linked'}`);

    return NextResponse.json(
      {
        isLinked,
        zealyUserId: team?.zealy_user_id || null,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        isLinked: false,
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}