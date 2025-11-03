

import React, { useState } from 'react';
import type { GoldStandardPaper, TestHarnessResult, UserStudyData } from '../types';
import * as apiService from '../services/apiService';
import { analyticsService } from '../services/analyticsService';
import { AddIcon } from './icons/AddIcon';
import { DatabaseIcon } from './icons/DatabaseIcon';
import { RulerIcon } from './icons/RulerIcon';
import { ClipboardListIcon } from './icons/ClipboardListIcon';
import { AnalyticsIcon } from './icons/AnalyticsIcon';
import { AnnotationModal } from './AnnotationModal';
import { LoadingSpinner } from './LoadingSpinner';
import { AnalyticsViewer } from './AnalyticsViewer';

interface ResearcherDashboardProps {
    dataset: GoldStandardPaper[];
    setDataset: React.Dispatch<React.SetStateAction<GoldStandardPaper[]>>;
    testResults: TestHarnessResult[];
    runTestHarness: () => void;
    userStudyData: UserStudyData[];
    onStartUserStudy: () => void;
}

const TabButton: React.FC<{
    isActive: boolean;
    onClick: () => void;
    children: React.ReactNode;
}> = ({ isActive, onClick, children }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 ${
            isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
    >
        {children}
    </button>
);

const DatasetManager: React.FC<{
    dataset: GoldStandardPaper[];
    setDataset: React.Dispatch<React.SetStateAction<GoldStandardPaper[]>>;
}> = ({ dataset, setDataset }) => {
    const [doiInput, setDoiInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [annotatingPaper, setAnnotatingPaper] = useState<GoldStandardPaper | null>(null);

    const handleImport = async (e: React.FormEvent) => {
        e.preventDefault();
        const doi = doiInput.trim();
        if (!doi || dataset.some(p => p.paper_id.toLowerCase() === doi.toLowerCase())) {
            setError(dataset.some(p => p.paper_id.toLowerCase() === doi.toLowerCase()) ? "This DOI is already in the dataset." : "Please enter a valid DOI.");
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const paperMeta = await apiService.fetchMetadataByDOI(doi);
            if (!paperMeta) throw new Error("Paper not found for this DOI.");

            const newPaper: GoldStandardPaper = {
                paper_id: doi,
                title: paperMeta.title,
                abstract: paperMeta.abstract,
                authors: paperMeta.authors,
                year: paperMeta.year,
                source: paperMeta.journal,
                crossref_verified: false,
                peer_reviewed: true, // Default assumption
                open_access: !!paperMeta.pdfURL,
                author_verified: false,
                factual_accuracy_score: 0,
                notes: '',
                label: 'inconclusive',
            };
            setDataset(prev => [newPaper, ...prev]);
            analyticsService.logEvent('gold_standard_paper_imported', { doi });
            setDoiInput('');
        } catch (err) {
            setError(err instanceof Error ? err.message : "An error occurred.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSaveAnnotation = (updatedPaper: GoldStandardPaper) => {
        setDataset(prev => prev.map(p => p.paper_id === updatedPaper.paper_id ? updatedPaper : p));
        analyticsService.logEvent('gold_standard_paper_annotated', { paperId: updatedPaper.paper_id });
        setAnnotatingPaper(null);
    };
    
    const handleExport = () => {
        analyticsService.logEvent('gold_standard_dataset_exported', { datasetSize: dataset.length });
        const jsonString = JSON.stringify(dataset, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'gold_standard_dataset.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-4">
            <form onSubmit={handleImport} className="flex gap-2 p-3 border rounded-lg bg-card">
                <input
                    type="text"
                    value={doiInput}
                    onChange={e => setDoiInput(e.target.value)}
                    placeholder="Enter DOI to import paper (e.g., 10.1101/2023.05.24.542225)"
                    className="w-full h-10 px-3 bg-background border border-input rounded-md"
                    disabled={isLoading}
                />
                <button type="submit" className="h-10 px-4 font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2" disabled={isLoading}>
                    {isLoading ? 'Importing...' : 'Import'}
                </button>
            </form>
            {error && <p className="text-sm text-destructive">{error}</p>}
            
            <div className="flex justify-end">
                <button onClick={handleExport} disabled={dataset.length === 0} className="text-sm font-medium text-primary hover:underline">Export Dataset as JSON</button>
            </div>

            <div className="border rounded-lg max-h-[50vh] overflow-y-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 sticky top-0">
                        <tr>
                            <th className="p-2">Title</th>
                            <th className="p-2">Label</th>
                            <th className="p-2">Score</th>
                            <th className="p-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {dataset.map(paper => (
                            <tr key={paper.paper_id} className="border-t">
                                <td className="p-2 font-medium">{paper.title}</td>
                                <td className="p-2">
                                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                                        paper.label === 'verified' ? 'bg-green-100 text-green-800' :
                                        paper.label === 'refuted' ? 'bg-red-100 text-red-800' :
                                        'bg-yellow-100 text-yellow-800'
                                    }`}>
                                        {paper.label}
                                    </span>
                                </td>
                                <td className="p-2 text-center">{paper.factual_accuracy_score}</td>
                                <td className="p-2">
                                    <button onClick={() => setAnnotatingPaper(paper)} className="text-primary hover:underline">Annotate</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {dataset.length === 0 && <p className="text-center p-8 text-muted-foreground">Your dataset is empty. Import papers using their DOI.</p>}
            </div>
            {annotatingPaper && <AnnotationModal paper={annotatingPaper} onClose={() => setAnnotatingPaper(null)} onSave={handleSaveAnnotation} />}
        </div>
    );
};

const TestHarness: React.FC<{
    results: TestHarnessResult[],
    runTestHarness: () => void,
    isLoading: boolean,
}> = ({ results, runTestHarness, isLoading }) => {
    const accuracy = results.length > 0 ? (results.filter(r => r.isCorrect).length / results.length) * 100 : 0;

    return (
        <div>
            <button onClick={runTestHarness} disabled={isLoading} className="h-10 px-5 font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 mb-4">
                {isLoading ? 'Running Tests...' : 'Run VACS Algorithm on Dataset'}
            </button>
            {results.length > 0 && (
                <div>
                    <h3 className="font-bold text-lg">Test Results (Accuracy: {accuracy.toFixed(2)}%)</h3>
                    {/* Detailed results table could go here */}
                </div>
            )}
        </div>
    );
};


const UserStudyManager: React.FC<{
    studyData: UserStudyData[];
    onStart: () => void;
}> = ({ studyData, onStart }) => {
    const handleExport = () => {
        analyticsService.logEvent('user_study_data_exported', { recordCount: studyData.length });
        const jsonString = JSON.stringify(studyData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'user_study_results.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-4">
            <button onClick={onStart} className="h-10 px-5 font-semibold rounded-md bg-green-600 text-white hover:bg-green-700">
                Start New User Study Session
            </button>
             <div className="flex justify-end">
                <button onClick={handleExport} disabled={studyData.length === 0} className="text-sm font-medium text-primary hover:underline">Export Study Data as JSON</button>
            </div>
            <div>
                <h3 className="font-semibold">Completed Sessions: {studyData.length}</h3>
                {/* Table of user study results could go here */}
            </div>
        </div>
    );
};


export const ResearcherDashboard: React.FC<ResearcherDashboardProps> = (props) => {
    const [activeTab, setActiveTab] = useState<'dataset' | 'harness' | 'study' | 'analytics'>('dataset');
    const [isTestHarnessLoading, setIsTestHarnessLoading] = useState(false);

    const handleRunTests = async () => {
        setIsTestHarnessLoading(true);
        await props.runTestHarness();
        setIsTestHarnessLoading(false);
    };
    
    const handleStartUserStudy = () => {
        analyticsService.logEvent('user_study_session_started', { participantId: `participant_${Date.now()}` });
        props.onStartUserStudy();
    }

    return (
        <div className="container mx-auto p-4 sm:p-6 lg:p-8">
            <h1 className="text-3xl font-bold mb-4">Researcher Dashboard</h1>
            
            <div className="border-b mb-4">
                <nav className="-mb-px flex gap-4">
                    <TabButton isActive={activeTab === 'dataset'} onClick={() => setActiveTab('dataset')}>
                        <DatabaseIcon className="w-5 h-5" /> Dataset Management
                    </TabButton>
                    <TabButton isActive={activeTab === 'harness'} onClick={() => setActiveTab('harness')}>
                        <RulerIcon className="w-5 h-5" /> VACS Test Harness
                    </TabButton>
                    <TabButton isActive={activeTab === 'study'} onClick={() => setActiveTab('study')}>
                        <ClipboardListIcon className="w-5 h-5" /> User Study
                    </TabButton>
                    <TabButton isActive={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')}>
                        <AnalyticsIcon className="w-5 h-5" /> Analytics
                    </TabButton>
                </nav>
            </div>

            <div>
                {activeTab === 'dataset' && <DatasetManager dataset={props.dataset} setDataset={props.setDataset} />}
                {activeTab === 'harness' && <TestHarness results={props.testResults} runTestHarness={handleRunTests} isLoading={isTestHarnessLoading} />}
                {activeTab === 'study' && <UserStudyManager studyData={props.userStudyData} onStart={handleStartUserStudy} />}
                {activeTab === 'analytics' && <AnalyticsViewer />}
            </div>
        </div>
    );
};