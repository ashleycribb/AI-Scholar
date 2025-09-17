import React from 'react';
import type { Cluster } from '../types';

interface ClusterResultsProps {
  clusters: Cluster[];
}

export const ClusterResults: React.FC<ClusterResultsProps> = ({ clusters }) => {
  if (!clusters || clusters.length === 0) {
    return <p className="text-gray-600">No clusters were identified.</p>;
  }

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-gray-800">Topic Clusters</h3>
      {clusters.map((cluster, index) => (
        <div key={index} className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
          <h4 className="text-lg font-bold text-blue-700 mb-3">{cluster.theme}</h4>
          <ul className="list-disc list-inside space-y-1 text-gray-700">
            {cluster.papers.map((title, paperIndex) => (
              <li key={paperIndex}>{title}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};
