import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const ZEALY_COMMUNITY_SECRET = process.env.ZEALY_COMMUNITY_SECRET;
if (!ZEALY_COMMUNITY_SECRET) {
    throw new Error("ZEALY_COMMUNITY_SECRET is not set");
}

/**
 * Verifies a Zealy signature against a URL
 * @param url - The URL to verify
 * @param signature - The signature to verify against
 * @returns boolean indicating if the signature is valid
 */
function verifyZealySignature(url: string, signature: string): boolean {
    if (!signature) return false;

    try {
        const fullUrl = new URL(url);
        fullUrl.searchParams.delete("signature");

        const hmac = crypto.createHmac("sha256", ZEALY_COMMUNITY_SECRET as string);
        hmac.update(fullUrl.toString());
        const generatedSignature = hmac.digest("hex");

        return generatedSignature === signature;
    } catch (err) {
        console.error("Error verifying signature:", err);
        return false;
    }
}

/**
 * Generates a callback signature for Zealy
 * @param url - The callback URL
 * @param identifier - The identifier to append
 * @returns The generated signature
 */
function generateCallbackSignature(url: string, identifier: string): string {
    const callbackWithParams = new URL(url);
    callbackWithParams.searchParams.append("identifier", identifier);

    const hmac = crypto.createHmac("sha256", ZEALY_COMMUNITY_SECRET as string);
    hmac.update(callbackWithParams.toString());
    return hmac.digest("hex");
}

export async function POST(req: NextRequest) {
    try {
        const { action, url, signature, identifier } = await req.json();

        if (!action || !url) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Missing required fields: action and url",
                },
                { status: 400 },
            );
        }

        switch (action) {
            case "verify":
                if (!signature) {
                    return NextResponse.json(
                        {
                            success: false,
                            error: "Missing signature for verification",
                        },
                        { status: 400 },
                    );
                }

                const isValid = verifyZealySignature(url, signature);
                return NextResponse.json({
                    success: true,
                    isValid,
                });

            case "generate":
                if (!identifier) {
                    return NextResponse.json(
                        {
                            success: false,
                            error: "Missing identifier for signature generation",
                        },
                        { status: 400 },
                    );
                }

                const generatedSignature = generateCallbackSignature(url, identifier);
                return NextResponse.json({
                    success: true,
                    signature: generatedSignature,
                });

            default:
                return NextResponse.json(
                    {
                        success: false,
                        error: "Invalid action. Must be 'verify' or 'generate'",
                    },
                    { status: 400 },
                );
        }
    } catch (error: any) {
        console.error("Zealy signature API error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || "Internal server error",
            },
            { status: 500 },
        );
    }
}
