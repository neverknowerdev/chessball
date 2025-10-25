"use client";

import { useMiniKit } from "@coinbase/onchainkit/minikit";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import {
  Name,
  Identity,
  Address,
  Avatar,
  EthBalance,
} from "@coinbase/onchainkit/identity";
import { useAccount, useSignMessage } from "wagmi";
import React, { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { authUserWithSignature } from "@/lib/auth";

function ConnectZealyContent() {
  const { setFrameReady, isFrameReady, context } = useMiniKit();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const searchParams = useSearchParams();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLinked, setIsLinked] = useState<boolean | null>(null);
  const [continueInWeb, setContinueInWeb] = useState(false);
  const [hasAttemptedLink, setHasAttemptedLink] = useState(false);

  const zealyUserId = searchParams.get("zealyUserId");
  const callbackUrl = searchParams.get("callbackUrl") || searchParams.get("callback");
  const zealySignature = searchParams.get("signature");

  useEffect(() => {
    console.log("🔍 URL Parameters:", {
      zealyUserId,
      callbackUrl,
      zealySignature: zealySignature ? "present" : "missing",
      allParams: Object.fromEntries(searchParams.entries()),
    });
  }, [zealyUserId, callbackUrl, zealySignature, searchParams]);

  const isMiniApp = useMemo(() => {
    return context !== null && context !== undefined;
  }, [context]);

  const verifyZealySignature = useCallback(
    async (url: string, signature: string | null) => {
      if (!signature) return false;

      try {
        const response = await fetch("/api/zealy/signature", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "verify",
            url,
            signature,
          }),
        });

        const result = await response.json();
        return result.success && result.isValid;
      } catch (err) {
        console.error("Error verifying signature:", err);
        return false;
      }
    },
    [],
  );

  const generateCallbackSignature = useCallback(
    async (url: string, identifier: string) => {
      try {
        const response = await fetch("/api/zealy/signature", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate",
            url,
            identifier,
          }),
        });

        const result = await response.json();
        if (result.success) {
          return result.signature;
        }
        throw new Error(result.error || "Failed to generate signature");
      } catch (err) {
        console.error("Error generating signature:", err);
        throw err;
      }
    },
    [],
  );

  const handleZealyConnect = useCallback(async () => {
    if (!address || !zealyUserId || !callbackUrl) {
      setError("Missing required parameters");
      return;
    }
    // Prevent duplicate calls
    if (hasAttemptedLink) {
      console.log("Already attempted to link, skipping...");
      return;
    }

    // Helper function for redirect logic
    const redirectToZealy = async () => {
      const platformUserId = address;
      const newSignature = await generateCallbackSignature(
        callbackUrl,
        platformUserId,
      );

      const finalCallbackUrl = new URL(callbackUrl);
      finalCallbackUrl.searchParams.append("identifier", platformUserId);
      finalCallbackUrl.searchParams.append("signature", newSignature);

      console.log("Redirecting to Zealy...");
      setTimeout(() => {
        window.location.href = finalCallbackUrl.toString();
      }, 1500);
    };

    // Check one more time if already linked before proceeding
    try {
      const checkResponse = await fetch("/api/zealy/check-zealy-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      const checkData = await checkResponse.json();

      if (checkData.isLinked) {
        console.log("Already linked (final check), redirecting...");
        setIsLinked(true);
        setSuccess(true);
        await redirectToZealy();
        return;
      }
    } catch (err) {
      console.error("Final link check failed:", err);
      // Continue with linking attempt
    }

    setHasAttemptedLink(true);
    setIsLoading(true);
    setError(null);

    try {
      console.log("Starting Zealy connection process...");

      const authSignature = await authUserWithSignature(
        address,
        signMessageAsync,
      );

      if (!authSignature) {
        throw new Error("Failed to authenticate wallet");
      }

      console.log("Wallet authenticated, linking to Zealy...");

      const response = await fetch("/api/zealy/link-zealy-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          zealyUserId: zealyUserId,
          signature: authSignature.signature,
          message: authSignature.message,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        // Check if it's a duplicate key error
        if (
          result.error &&
          (result.error.includes("23505") ||
            result.error.includes("duplicate key") ||
            result.error.includes("already exists") ||
            result.code === "23505")
        ) {
          console.log("Account already linked (duplicate key), treating as success");
          setSuccess(true);
          setIsLinked(true);
          await redirectToZealy();
          return;
        }

        throw new Error(result.error || "Failed to link account");
      }

      console.log("Successfully linked to Zealy!");
      setSuccess(true);
      setIsLinked(true);
      await redirectToZealy();

    } catch (err: any) {
      console.error("Zealy Connect error:", err);
      setError(err.message || "Failed to connect account");
      setHasAttemptedLink(false); // Allow retry on error
    } finally {
      setIsLoading(false);
    }
  }, [
    address,
    zealyUserId,
    callbackUrl,
    signMessageAsync,
    generateCallbackSignature,
    hasAttemptedLink,
  ]);

  // Check if already linked
  useEffect(() => {
    let isActive = true;

    const checkLink = async () => {
      if (!address || !isActive) return;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch("/api/zealy/check-zealy-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: address }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!isActive) return;

        if (!response.ok) {
          console.error("Check link response not OK:", response.status);
          setIsLinked(false); // Assume not linked if check fails
          return;
        }

        const data = await response.json();
        console.log("Link check result:", data);
        setIsLinked(data.isLinked);

        // If already linked and we have Zealy params, redirect back
        if (data.isLinked && zealyUserId && callbackUrl && address) {
          console.log("Already linked, preparing redirect...");
          setSuccess(true);
          const platformUserId = address;
          const newSignature = await generateCallbackSignature(
            callbackUrl,
            platformUserId,
          );

          const finalCallbackUrl = new URL(callbackUrl);
          finalCallbackUrl.searchParams.append("identifier", platformUserId);
          finalCallbackUrl.searchParams.append("signature", newSignature);

          setTimeout(() => {
            window.location.href = finalCallbackUrl.toString();
          }, 1500);
        }
      } catch (err: any) {
        if (!isActive) return;

        if (err.name === 'AbortError') {
          console.log("Check link request timeout - will retry");
        } else {
          console.error("Error checking Zealy link:", err);
        }
        setIsLinked(false); // Assume not linked on error
      }
    };

    if (address) {
      checkLink();
    }

    return () => {
      isActive = false;
    };
  }, [address, zealyUserId, callbackUrl, generateCallbackSignature]);

  // Verify Zealy signature (non-blocking for now)
  useEffect(() => {
    if (zealyUserId && callbackUrl && zealySignature) {
      if (typeof window !== "undefined") {
        const currentUrl = window.location.href;
        console.log("🔐 Verifying Zealy signature...", {
          url: currentUrl,
          hasSignature: !!zealySignature,
        });

        verifyZealySignature(currentUrl, zealySignature).then((isValid) => {
          console.log("🔐 Signature verification result:", isValid);
          if (!isValid) {
            console.warn("⚠️ Invalid Zealy signature detected - continuing anyway for testing");
            // TODO: Re-enable this once signature verification is working
            // setError("Invalid Zealy signature");
          } else {
            console.log("✅ Zealy signature is valid!");
          }
        });
      }
    }
  }, [zealyUserId, callbackUrl, zealySignature, verifyZealySignature]);

  // Auto-trigger connection when conditions are met
  useEffect(() => {
    console.log("Auto-trigger check:", {
      isConnected,
      hasAddress: !!address,
      hasZealyUserId: !!zealyUserId,
      hasCallbackUrl: !!callbackUrl,
      success,
      isLoading,
      error,
      hasAttemptedLink,
      isLinked,
    });

    if (
      isConnected &&
      address &&
      zealyUserId &&
      callbackUrl &&
      !success &&
      !isLoading &&
      !error &&
      !hasAttemptedLink &&
      isLinked === false // Only proceed if confirmed NOT linked
    ) {
      console.log("✅ All conditions met! Triggering Zealy connection...");
      handleZealyConnect();
    } else if (isConnected && address && zealyUserId && callbackUrl) {
      console.log("⏳ Waiting for conditions:", {
        needsNoSuccess: success,
        needsNotLoading: isLoading,
        needsNoError: error,
        needsNoAttempt: hasAttemptedLink,
        needsNotLinked: isLinked,
      });
    }
  }, [
    isConnected,
    address,
    zealyUserId,
    callbackUrl,
    success,
    isLoading,
    error,
    hasAttemptedLink,
    isLinked,
    handleZealyConnect,
  ]);

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  const zealyConnectUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const appUrl = "https://play.tactiball.fun/"
    return `https://base.org/mini-apps?url=${encodeURIComponent(appUrl)}`;
  }, []);

  const farcasterMiniAppUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const appId = "uOFpcGpLFeLD";
    const appSlug = "tactiball";

    const currentPath = window.location.pathname;
    const params = new URLSearchParams();
    if (zealyUserId) params.append("zealyUserId", zealyUserId);
    if (callbackUrl) params.append("callback", callbackUrl);
    if (zealySignature) params.append("signature", zealySignature);

    const queryString = params.toString() ? `?${params.toString()}` : "";
    const cleanPath = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;

    return `https://farcaster.xyz/miniapps/${appId}/${appSlug}/${cleanPath}${queryString}`;
  }, [zealyUserId, callbackUrl, zealySignature]);

  if (!isMiniApp && !continueInWeb) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center p-4 font-sans mini-app-theme">
        <div className="absolute top-4 right-4 z-20">
          <Wallet>
            <ConnectWallet className="bg-white text-black px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">
              <Name className="text-black" />
            </ConnectWallet>
            <WalletDropdown>
              <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                <Avatar />
                <Name />
                <Address />
                <EthBalance />
              </Identity>
              <WalletDropdownDisconnect />
            </WalletDropdown>
          </Wallet>
        </div>

        <div className="w-full flex justify-center items-center mb-8">
          <div className="flex flex-col items-center">
            <img src="/logo-white.png" alt="TactiBall Logo" className="h-42" />
          </div>
        </div>

        <div className="w-full max-w-md">
          <div className="mb-4 bg-blue-500 text-white rounded-lg shadow-sm border border-blue-600">
            <div className="p-4">
              <div className="flex items-start">
                <svg className="w-5 h-5 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div>
                  <h3 className="font-semibold text-sm mb-1">
                    Where do you usually play TactiBall?
                  </h3>
                  <p className="text-xs leading-relaxed">
                    You can play on <strong>Base App</strong>, <strong>Farcaster</strong>, or directly in your <strong>web browser</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Connect to Zealy</h3>
              </div>
              <div className="text-center mb-4">
                <div className="text-6xl mb-3">🔗</div>
                <h3 className="text-lg font-bold text-black mb-2">
                  Select Platform
                </h3>
                <p className="text-sm text-gray-600">
                  Choose where you want to complete the wallet connection
                </p>
              </div>

              <div className="space-y-3">
                <a
                  href={zealyConnectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-4 rounded-lg transition-all shadow-sm"
                >
                  <span className="text-2xl mr-3">🔵</span>
                  <div className="text-left">
                    <div className="text-base">Open in Base</div>
                    <div className="text-xs opacity-90">Base Mini-App</div>
                  </div>
                </a>

                <a
                  href={farcasterMiniAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-4 rounded-lg transition-all shadow-sm"
                >
                  <span className="text-2xl mr-3">🟣</span>
                  <div className="text-left">
                    <div className="text-base">Open in Farcaster</div>
                    <div className="text-xs opacity-90">Farcaster Mini-App</div>
                  </div>
                </a>

                <button
                  onClick={() => setContinueInWeb(true)}
                  className="w-full flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-4 rounded-lg transition-all shadow-sm"
                >
                  <span className="text-2xl mr-3">🌐</span>
                  <div className="text-left">
                    <div className="text-base">Continue in Browser</div>
                    <div className="text-xs opacity-90">Connect Wallet Here</div>
                  </div>
                </button>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-600 text-center leading-relaxed">
                  💡 <strong>Note:</strong> Mini-apps provide an integrated experience, but you can also connect your wallet directly in the browser.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-3">
              <p className="text-xs text-gray-700 text-center">
                <strong>Need help?</strong> Choose the browser option if you don't have Base or Farcaster apps installed.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center p-4 font-sans mini-app-theme">
      <div className="absolute top-4 right-4 z-20">
        <Wallet>
          <ConnectWallet className="bg-white text-black px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors shadow-md">
            <Name className="text-black" />
          </ConnectWallet>
          <WalletDropdown>
            <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
              <Avatar />
              <Name />
              <Address />
              <EthBalance />
            </Identity>
            <WalletDropdownDisconnect />
          </WalletDropdown>
        </Wallet>
      </div>

      <div className="w-full flex justify-center items-center mb-8">
        <div className="flex flex-col items-center">
          <img src="/logo-white.png" alt="TactiBall Logo" className="h-42" />
        </div>
      </div>

      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide text-center">Zealy Integration</h3>
            </div>
            <div className="text-center">
              {success || (isLinked && zealyUserId) ? (
                <React.Fragment>
                  <div className="text-6xl mb-4">✅</div>
                  <h3 className="text-xl font-bold text-black mb-3">
                    Successfully Linked!
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Your TactiBall account is now connected to Zealy!
                  </p>
                  <p className="text-xs text-gray-500">
                    Redirecting back to Zealy...
                  </p>
                </React.Fragment>
              ) : error ? (
                <React.Fragment>
                  <div className="text-6xl mb-4">❌</div>
                  <h3 className="text-xl font-bold text-black mb-3">
                    Connection Failed
                  </h3>
                  <p className="text-sm text-red-600 mb-4">{error}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="text-sm text-blue-600 hover:text-blue-700 underline"
                  >
                    Try Again
                  </button>
                </React.Fragment>
              ) : isConnected && address ? (
                <React.Fragment>
                  <div className="text-6xl mb-4">🔗</div>
                  <h3 className="text-xl font-bold text-black mb-3">
                    {isLinked === null ? "Checking Status..." : "Linking Account..."}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    {
                      isLinked === null
                        ? "Checking your Zealy connection status"

                        : "Verifying your wallet and connecting to Zealy"
                    }
                  </p >
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  </div>
                </React.Fragment >
              ) : (
                <React.Fragment>
                  <div className="text-6xl mb-4">👋</div>
                  <h3 className="text-xl font-bold text-black mb-3">
                    Connect Your Wallet
                  </h3>
                  <p className="text-sm text-gray-600 mb-6">
                    Connect your wallet to complete the Zealy account linking.
                  </p>
                  <ConnectWallet className="w-full bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg text-white font-medium transition-all">
                    Connect Wallet
                  </ConnectWallet>
                </React.Fragment>
              )
              }
            </div >
          </div >
        </div >
      </div >
    </div >
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center mini-app-theme">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
}

export default function ConnectZealyPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ConnectZealyContent />
    </Suspense>
  );
}