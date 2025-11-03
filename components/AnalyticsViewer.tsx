import React, { useState, useEffect } from 'react';
import { analyticsService } from '../services/analyticsService';
import { firestoreService } from '../services/firestoreService';
import { ExportIcon } from './icons/ExportIcon';

const FirestoreStatusIndicator: React.FC = () => {
    const [statusInfo, setStatusInfo] = useState(firestoreService.getStatus());

    useEffect(() => {
        // Poll for status changes, as there's no subscription model in the simple service
        const interval = setInterval(() => {
            const newStatus = firestoreService.getStatus();
            if (newStatus.status !== statusInfo.status) {
                setStatusInfo(newStatus);
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [statusInfo.status]);

    let color = 'text-muted-foreground';
    let dotColor = 'bg-slate-400';
    if (statusInfo.status === 'connected') {
        color = 'text-green-600';
        dotColor = 'bg-green-500';
    } else if (statusInfo.status === 'error') {
        color = 'text-red-600';
        dotColor = 'bg-red-500';
    }
    
    return (
        <div className="flex items-center gap-2 text-xs font-medium" title={statusInfo.message}>
            <span className="relative flex h-2.5 w-2.5">
                {statusInfo.status === 'connected' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dotColor}`}></span>
            </span>
            <span className={color}>
                {statusInfo.status.charAt(0).toUpperCase() + statusInfo.status.slice(1)}
            </span>
        </div>
    );
};


export const AnalyticsViewer: React.FC = () => {
    const [events, setEvents] = useState<any[]>([]);

    useEffect(() => {
        // A simple way to re-render if events are added. In a real app, you might use a subscription model.
        const interval = setInterval(() => {
            const currentEvents = analyticsService.getEvents();
            if (currentEvents.length !== events.length) {
                setEvents(currentEvents);
            }
        }, 1000);
        
        setEvents(analyticsService.getEvents());

        return () => clearInterval(interval);
    }, [events.length]);

    const handleExport = () => {
        analyticsService.exportToCSV();
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold text-foreground">Event Log</h3>
                    <p className="text-sm text-muted-foreground">Events are automatically synced to Firestore. You can export the current session as a local CSV file.</p>
                </div>
                <div className="flex items-center gap-4">
                    <FirestoreStatusIndicator />
                    <button 
                        onClick={handleExport}
                        className="h-9 px-4 text-sm font-semibold rounded-md bg-secondary text-secondary-foreground hover:bg-accent flex items-center gap-2"
                        disabled={events.length === 0}
                    >
                        <ExportIcon className="w-4 h-4" /> Export Session CSV
                    </button>
                </div>
            </div>
            <div className="border rounded-lg max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 sticky top-0">
                        <tr>
                            <th className="p-2 w-1/4">Timestamp</th>
                            <th className="p-2 w-1/4">Event Name</th>
                            <th className="p-2 w-1/2">Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {events.length > 0 ? [...events].reverse().map((event, index) => (
                            <tr key={index} className="border-t">
                                <td className="p-2 align-top">
                                    <span className="font-mono text-xs">{new Date(event.data.timestamp).toLocaleString()}</span>
                                </td>
                                <td className="p-2 align-top">
                                    <span className="font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs">{event.eventName}</span>
                                </td>
                                <td className="p-2 align-top">
                                    <pre className="text-xs bg-background p-2 rounded-md whitespace-pre-wrap break-all max-w-full">
                                        {JSON.stringify(event.data, null, 2)}
                                    </pre>
                                </td>
                            </tr>
                        )) : (
                             <tr>
                                <td colSpan={3} className="p-8 text-center text-muted-foreground">No analytics events logged in this session yet.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};