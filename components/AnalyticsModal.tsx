import React, { useState, useEffect } from 'react';
import { analyticsService } from '../services/analyticsService';
import { ExportIcon } from './icons/ExportIcon';

interface GlobalStat {
    label: string;
    value: string | number;
    description: string;
}

export const AnalyticsDashboard: React.FC = () => {
    const [stats, setStats] = useState<GlobalStat[]>([]);
    const allEvents = analyticsService.getEvents();

    useEffect(() => {
        // Calculate stats from all events
        const sessions = new Set(allEvents.map(e => e.data.sessionId)).size;
        const searches = allEvents.filter(e => e.eventName === 'search_started').length;
        const favorites = allEvents.filter(e => e.eventName === 'paper_favorited').length;
        
        const topQueries = allEvents
            .filter(e => e.eventName === 'search_started' && e.data.query)
            .reduce((acc, e) => {
                const query = e.data.query.toLowerCase().trim();
                acc[query] = (acc[query] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

        const mostFrequentQuery = Object.entries(topQueries).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

        setStats([
            { label: 'Total Sessions', value: sessions, description: 'Unique user sessions recorded.' },
            { label: 'Total Searches', value: searches, description: 'Number of search queries initiated.' },
            { label: 'Papers Favorited', value: favorites, description: 'Total papers added to literature lists.' },
            { label: 'Most Frequent Query', value: mostFrequentQuery, description: 'The most popular search term.' },
        ]);
    }, [allEvents.length]);


  const handleExport = () => {
    analyticsService.exportToCSV();
  };

  return (
    <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map(stat => (
                <div key={stat.label} className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                    <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                    <p className="text-3xl font-bold text-gray-800 my-2 truncate" title={String(stat.value)}>{stat.value}</p>
                    <p className="text-xs text-gray-500">{stat.description}</p>
                </div>
            ))}
        </div>
        <div className="mt-8 text-center">
            <p className="text-gray-600 mb-3">Export all historical analytics data as a CSV file for detailed analysis.</p>
            <button
                onClick={handleExport}
                disabled={allEvents.length === 0}
                className="w-full max-w-xs mx-auto flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 text-white text-md font-semibold rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
                aria-label="Export all analytics data as CSV"
            >
                <ExportIcon className="w-5 h-5" />
                <span>Export All Data</span>
            </button>
        </div>
    </div>
  );
};