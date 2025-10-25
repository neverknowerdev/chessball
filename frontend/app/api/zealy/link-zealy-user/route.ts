import { NextRequest, NextResponse } from "next/server";
import { checkAuthSignatureAndMessage } from "@/lib/auth";
import { createAnonClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, zealyUserId, signature, message } = await req.json();

    if (!walletAddress || !zealyUserId || !signature || !message) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields",
        },
        { status: 400 },
      );
    }

    // Verify wallet signature using checkAuthSignatureAndMessage
    const verificationResult = await checkAuthSignatureAndMessage(
      signature,
      message,
      walletAddress
    );

    if (!verificationResult.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: verificationResult.error || "Invalid wallet signature",
        },
        { status: 401 },
      );
    }

    const supabase = createAnonClient();

    // Check if team exists for this wallet using primary_wallet
    const { data: team, error: fetchError } = await supabase
      .from("teams")
      .select("id, name, zealy_user_id, primary_wallet")
      .eq("primary_wallet", walletAddress)
      .maybeSingle();

    if (fetchError) {
      console.error("Database error:", fetchError);
      return NextResponse.json(
        {
          success: false,
          error: "Database error",
        },
        { status: 500 },
      );
    }

    if (!team) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No team found. Please create a team at play.tactiball.fun first!",
        },
        { status: 404 },
      );
    }

    // Update team with Zealy user ID
    const { error: updateError } = await supabase
      .from("teams")
      .update({ zealy_user_id: zealyUserId })
      .eq("primary_wallet", walletAddress);

    if (updateError) {
      console.error("Update error:", updateError);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to link Zealy account",
        },
        { status: 500 },
      );
    }

    console.log(`✅ Successfully linked Zealy user ${zealyUserId} to team ${team.name} (${walletAddress})`);

    return NextResponse.json(
      {
        success: true,
        message: "Successfully linked Zealy account",
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error",
      },
      { status: 500 },
    );
  }
}