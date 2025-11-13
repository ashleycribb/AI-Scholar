import React, { useState } from 'react';
import * as apiService from '@/services/apiService';
import { useStore } from '@/src/store/useStore';

const SystematicReview: React.FC = () => {
    const { workspacePapers } = useStore();
    const [inclusionCriteria, setInclusionCriteria] = useState('');
    const [exclusionCriteria, setExclusionCriteria] = useState('');
    const [screenedPapers, setScreenedPapers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleStartScreening = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await apiService.startScreening(inclusionCriteria, exclusionCriteria, workspacePapers);
            setScreenedPapers(result.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-4 sm:p-6 lg:p-8">
            <h1 className="text-2xl font-bold mb-4">Systematic Review Screening</h1>
            <div className="space-y-4">
                <div>
                    <label htmlFor="inclusion-criteria" className="block text-sm font-medium text-gray-700">
                        Inclusion Criteria
                    </label>
                    <textarea
                        id="inclusion-criteria"
                        value={inclusionCriteria}
                        onChange={(e) => setInclusionCriteria(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        rows={4}
                    />
                </div>
                <div>
                    <label htmlFor="exclusion-criteria" className="block text-sm font-medium text-gray-700">
                        Exclusion Criteria
                    </label>
                    <textarea
                        id="exclusion-criteria"
                        value={exclusionCriteria}
                        onChange={(e) => setExclusionCriteria(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        rows={4}
                    />
                </div>
                <button
                    onClick={handleStartScreening}
                    disabled={isLoading}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                    {isLoading ? 'Screening...' : 'Start Screening'}
                </button>
            </div>
            {error && <p className="mt-4 text-red-500">{error}</p>}
            <div className="mt-8">
                <h2 className="text-xl font-bold mb-4">Screening Results</h2>
                {screenedPapers.length > 0 ? (
                    <ul>
                        {screenedPapers.map((paper) => (
                            <li key={paper.id} className="mb-4 p-4 border border-gray-200 rounded-md">
                                <h3 className="text-lg font-bold">{paper.title}</h3>
                                <p className="text-sm text-gray-600">{paper.authors}</p>
                                <p className={`text-sm font-semibold ${paper.screeningStatus === 'include' ? 'text-green-600' : 'text-red-600'}`}>
                                    {paper.screeningStatus}
                                </p>
                                <p className="text-sm">{paper.screeningRationale}</p>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p>Screening results will be displayed here.</p>
                )}
            </div>
        </div>
    );
};

export default SystematicReview;
