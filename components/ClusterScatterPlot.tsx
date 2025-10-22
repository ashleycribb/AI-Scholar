import React from 'react';
import type { Cluster } from '../types';

interface ClusterScatterPlotProps {
  clusters: (Cluster & { x?: number; y?: number })[];
}

export const ClusterScatterPlot: React.FC<ClusterScatterPlotProps> = ({ clusters }) => {
  // In a real application, you would use a charting library like D3, Recharts, or Chart.js
  // to create an interactive scatter plot here. This is a placeholder visualization.

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
      <h3 className="text-xl font-semibold text-gray-800 mb-4">Cluster Visualization</h3>
      <p className="text-sm text-gray-500 mb-4">A spatial representation of thematic clusters. Proximity suggests similarity.</p>
      <div className="relative w-full h-80 bg-gray-50 rounded border border-dashed border-gray-300">
        {clusters.map((cluster) => (
          <div
            key={cluster.clusterName}
            className="absolute flex items-center justify-center p-2 text-xs font-bold text-white bg-blue-600 rounded-full shadow-lg transform -translate-x-1/2 -translate-y-1/2 cursor-pointer hover:scale-110 transition-transform"
            style={{
              width: `${cluster.paperTitles.length * 12 + 60}px`,
              height: `${cluster.paperTitles.length * 12 + 60}px`,
              minWidth: '70px',
              minHeight: '70px',
              left: `${cluster.x || 50}%`,
              top: `${cluster.y || 50}%`,
            }}
            title={`${cluster.clusterName} (${cluster.paperTitles.length} papers)`}
          >
            <span className="text-center leading-tight p-1">{cluster.clusterName}</span>
          </div>
        ))}
      </div>
    </div>
  );
};