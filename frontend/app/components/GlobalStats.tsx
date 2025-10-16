"use client";

import React, { useState, useEffect, useCallback } from 'react';

interface GlobalStatsData {
    total_teams: number;
    total_games: number;
    total_events : number;
}

interface GlobalStatsProps {
    className?: string;
}

export function GlobalStats({ className = "" }: GlobalStatsProps) {
    const [globalStats, setGlobalStats] = useState<GlobalStatsData | null>(null);
    const [loading, setLoading] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Local storage cache key
    const getCacheKey = () => 'global_stats';

    // Load data from local storage
    const loadFromCache = (): GlobalStatsData | null => {
        try {
            const cached = localStorage.getItem(getCacheKey());
            if (cached) {
                const parsed = JSON.parse(cached);
                // Check if cache is not too old (10 minutes)
                const cacheAge = Date.now() - (parsed.timestamp || 0);
                if (cacheAge < 10 * 60 * 1000) {
                    return parsed.data;
                }
            }
        } catch (error) {
            console.error('Error loading global stats from cache:', error);
        }
        return null;
    };

    // Save data to local storage
    const saveToCache = (data: GlobalStatsData) => {
        try {
            const cacheData = {
                data,
                timestamp: Date.now()
            };
            localStorage.setItem(getCacheKey(), JSON.stringify(cacheData));
        } catch (error) {
            console.error('Error saving global stats to cache:', error);
        }
    };

    // Fetch global stats
    const fetchGlobalStats = useCallback(async () => {
        // First, try to load from cache
        const cachedData = loadFromCache();
        if (cachedData) {
            setGlobalStats(cachedData);
            setLoading(false);
        } else {
            setLoading(true);
        }

        setError(null);
        setUpdating(true);

        try {
            const response = await fetch('/api/get-global-stat');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('globalStats', data);

            if (data.success) {
                setGlobalStats(data.data);
                saveToCache(data.data);
            } else {
                setError(data.error || 'Failed to fetch global statistics');
            }
        } catch (err) {
            console.error('Error fetching global stats:', err);
            setError('Failed to fetch global statistics');
        } finally {
            setLoading(false);
            setUpdating(false);
        }
    }, []);

    // Fetch data on mount
    useEffect(() => {
        fetchGlobalStats();
    }, [fetchGlobalStats]);

    if (loading) {
        return (
            <div className={`w-full max-w-md bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
                <div className="h-0.5 bg-gray-200 rounded-t-lg overflow-hidden">
                    <div className="h-full bg-blue-500 animate-pulse-loading"></div>
                </div>
                <div className="p-4">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-gray-400">—</div>
                            <div className="text-xs text-gray-600">Teams</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-gray-400">—</div>
                            <div className="text-xs text-gray-600">Games</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-gray-400">—</div>
                            <div className="text-xs text-gray-600">Transactions</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`w-full max-w-md bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
                <div className="p-4">
                    <div className="text-center text-red-500 text-sm">
                        {error}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`w-full max-w-md bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
            <div className="p-4">
                {updating && (
                    <div className="h-0.5 bg-gray-200 rounded-t-lg overflow-hidden mb-4">
                        <div className="h-full bg-blue-500 animate-pulse-loading"></div>
                    </div>
                )}
                <div className={`grid grid-cols-3 gap-4 transition-opacity duration-200 ${updating ? 'opacity-75' : 'opacity-100'}`}>
                    <div className="text-center">
                        <div className="text-2xl font-bold animate-number">{globalStats?.total_teams || 0}</div>
                        <div className="text-xs text-gray-600">Teams</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold animate-number">{globalStats?.total_games || 0}</div>
                        <div className="text-xs text-gray-600">Games</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold animate-number">{globalStats?.total_events || 0}</div>
                        <div className="text-xs text-gray-600">Transactions</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
