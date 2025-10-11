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

// Separate component that uses useSearchParams
function ConnectZealyContent() {
  const { setFrameReady, isFrameReady, context } = useMiniKit();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const searchParams = useSearchParams();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLinked, setIsLinked] = useState<boolean | null>(null);

  // Zealy parameters - these come FROM Zealy when user clicks "Connect" on a quest
  const zealyUserId = searchParams.get("zealyUserId");
  const callbackUrl = searchParams.get("callback");
  const zealySignature = searchParams.get("signature");

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

    setIsLoading(true);
    setError(null);

    try {
      const authSignature = await authUserWithSignature(
        address,
        signMessageAsync,
      );
      if (!authSignature) {
        throw new Error("Failed to authenticate wallet");
      }

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
        throw new Error(result.error || "Failed to link account");
      }

      setSuccess(true);
      setIsLinked(true);

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
    } catch (err: any) {
      console.error("Zealy Connect error:", err);
      setError(err.message || "Failed to connect account");
    } finally {
      setIsLoading(false);
    }
  }, [
    address,
    zealyUserId,
    callbackUrl,
    signMessageAsync,
    generateCallbackSignature,
  ]);

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
          return;
        }

        const data = await response.json();
        const wasLinked = isLinked;
        setIsLinked(data.isLinked);

        if (zealyUserId && callbackUrl && !wasLinked && data.isLinked) {
          setSuccess(true);
        }
      } catch (err: any) {
        if (!isActive) return;

        if (err.name === 'AbortError') {
          console.log("Check link request timeout - will retry");
        } else {
          console.error("Error checking Zealy link:", err);
        }
      }
    };

    if (address) {
      checkLink();

      if (zealyUserId && callbackUrl && !success) {
        const interval = setInterval(checkLink, 3000);
        return () => {
          isActive = false;
          clearInterval(interval);
        };
      }
    }

    return () => {
      isActive = false;
    };
  }, [address, zealyUserId, callbackUrl, success, isLinked]);

  useEffect(() => {
    if (zealyUserId && callbackUrl && zealySignature) {
      if (typeof window !== "undefined") {
        const currentUrl = window.location.href;
        verifyZealySignature(currentUrl, zealySignature).then((isValid) => {
          if (!isValid) {
            setError("Invalid Zealy signature");
          }
        });
      }
    }
  }, [zealyUserId, callbackUrl, zealySignature, verifyZealySignature]);

  useEffect(() => {
    if (
      isConnected &&
      address &&
      zealyUserId &&
      callbackUrl &&
      !success &&
      !isLoading &&
      !error &&
      isLinked === false
    ) {
      handleZealyConnect();
    }
  }, [
    isConnected,
    address,
    zealyUserId,
    callbackUrl,
    success,
    isLoading,
    error,
    isLinked,
    handleZealyConnect,
  ]);

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  // Generate Base Mini App URL with all Zealy parameters
  const zealyConnectUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const currentUrl = window.location.href;
    return `https://base.org/mini-apps?url=${encodeURIComponent(currentUrl)}`;
  }, []);

  // Generate Farcaster Mini App URL with all Zealy parameters
  const farcasterMiniAppUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const appId = "YOUR_FARCASTER_APP_ID";
    const appSlug = "chessball";
    
    const currentPath = window.location.pathname;
    const params = new URLSearchParams();
    if (zealyUserId) params.append("zealyUserId", zealyUserId);
    if (callbackUrl) params.append("callback", callbackUrl);
    if (zealySignature) params.append("signature", zealySignature);
    
    const queryString = params.toString() ? `?${params.toString()}` : "";
    const cleanPath = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
    
    return `https://farcaster.xyz/miniapps/${appId}/${appSlug}/${cleanPath}${queryString}`;
  }, [zealyUserId, callbackUrl, zealySignature]);

  // If NOT in mini app, show platform selection
  if (!isMiniApp) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center p-4 font-sans mini-app-theme">
        {/* Wallet connection - fixed to right corner */}
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

        {/* Logo */}
        <div className="w-full flex justify-center items-center mb-8">
          <div className="flex flex-col items-center">
            <img src="/logo-white.png" alt="ChessBall Logo" className="h-42" />
          </div>
        </div>

        <div className="w-full max-w-md">
          {/* Warning Banner */}
          <div className="mb-4 bg-yellow-500 text-yellow-900 rounded-lg shadow-sm border border-yellow-600">
            <div className="p-4">
              <div className="flex items-start">
                <svg className="w-5 h-5 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <h3 className="font-semibold text-sm mb-1">
                    Open in Mini-App Required
                  </h3>
                  <p className="text-xs leading-relaxed">
                    To connect your wallet and link to Zealy, you must open this page in either the <strong>Base App</strong> or <strong>Farcaster</strong> mini-app. Click one of the buttons below to continue.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Platform Selection Card */}
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
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-600 text-center leading-relaxed">
                  💡 <strong>Note:</strong> Wallet connection is only available within mini-apps. After clicking a button above, you'll be redirected to the respective platform where you can connect your wallet and complete the Zealy linking process.
                </p>
              </div>
            </div>
          </div>

          {/* Help Section */}
          <div className="mt-4 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-3">
              <p className="text-xs text-gray-700 text-center">
                <strong>Need help?</strong> Make sure you have the Base App or Farcaster installed on your device before clicking the buttons above.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If IN mini app, show the wallet connection flow
  return (
    <div className="min-h-screen w-full flex flex-col items-center p-4 font-sans mini-app-theme">
      {/* Wallet connection - fixed to right corner */}
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

      {/* Logo */}
      <div className="w-full flex justify-center items-center mb-8">
        <div className="flex flex-col items-center">
          <img src="/logo-white.png" alt="ChessBall Logo" className="h-42" />
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
                    Your ChessBall account is now connected to Zealy!
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
                    Linking Account...
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Verifying your wallet and connecting to Zealy
                  </p>
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  </div>
                </React.Fragment>
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
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Loading fallback component
function LoadingFallback() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center mini-app-theme">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
}

// Main component that wraps everything in Suspense
export default function ConnectZealyPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ConnectZealyContent />
    </Suspense>
  );
}