

import React, { useState, useEffect, useMemo } from 'react';
import type { GoldStandardPaper, UserStudyData, ResearchPaper, VerificationResult } from '../types';
import * as verificationService from '../services/verificationService';
import { LoadingSpinner } from './LoadingSpinner';
import { VerificationModal } from './VerificationModal'; // Re-using parts of this for display

interface PaperVerificationAppProps {
    dataset: GoldStandardPaper[];
    onComplete: (data: UserStudyData) => void;
}

// Helper to map the new flat GoldStandardPaper to the ResearchPaper type needed for some UI components
const goldStandardToResearchPaper = (gsPaper: GoldStandardPaper): ResearchPaper => {
    const paperData = {
        title: gsPaper.title,
        authors: gsPaper.authors,
        year: gsPaper.year,
        abstract: gsPaper.abstract,
        sourceURL: `https://doi.org/${gsPaper.paper_id}`,
        pdfURL: gsPaper.open_access ? `https://doi.org/${gsPaper.paper_id}` : undefined,
        citations: undefined, // This info is not in the new gold standard model
        doi: gsPaper.paper_id,
        journal: gsPaper.source,
    };
    // Re-use createPaperId logic from extensionService for consistency
    const createPaperId = (paper: Partial<ResearchPaper>): string => {
        if (paper.doi) return `doi:${paper.doi}`;
        if (paper.sourceURL) {
            const arxivIdMatch = paper.sourceURL.match(/arxiv\.org\/(?:abs|pdf)\/([^/]+)/);
            if (arxivIdMatch) return `arxiv:${arxivIdMatch[1].replace(/v\d+$/, '')}`;
            return `url:${paper.sourceURL}`;
        }
        return `title:${paper.title?.toLowerCase().replace(/\s+/g, '-') || Math.random().toString()}`;
    };
    return {
        ...paperData,
        id: createPaperId(paperData),
    };
};


export const PaperVerificationApp: React.FC<PaperVerificationAppProps> = ({ dataset, onComplete }) => {
    const [currentTask, setCurrentTask] = useState<{ paper: ResearchPaper; claim: string; } | null>(null);
    const [group, setGroup] = useState<'A' | 'B'>('A');
    const [vacsResult, setVacsResult] = useState<VerificationResult | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [startTime, setStartTime] = useState(0);

    // User responses
    const [userVerdict, setUserVerdict] = useState<'Correct' | 'Incorrect' | null>(null);
    const [isAdequate, setIsAdequate] = useState<'Yes' | 'No' | null>(null);
    const [usefulness, setUsefulness] = useState<number>(0);

    useEffect(() => {
        if (dataset.length > 0) {
            // Select a random paper for the task
            const randomPaper = dataset[Math.floor(Math.random() * dataset.length)];
            
            const task = {
                paper: goldStandardToResearchPaper(randomPaper),
                claim: randomPaper.title, // Use the paper's title as the claim to verify
            };
            setCurrentTask(task);
            
            // Randomly assign to group A (Control) or B (Treatment)
            const assignedGroup = Math.random() < 0.5 ? 'A' : 'B';
            setGroup(assignedGroup);
            
            if (assignedGroup === 'B' && task.paper.doi) {
                // Fetch VACS result for the treatment group
                verificationService.verifyPaper(task.paper.doi, task.claim)
                    .then(setVacsResult)
                    .finally(() => setIsLoading(false));
            } else {
                setIsLoading(false);
            }
            setStartTime(performance.now());
        }
    }, [dataset]);

    const handleSubmit = () => {
        if (!currentTask || !userVerdict || !isAdequate || usefulness === 0) {
            alert("Please complete all fields.");
            return;
        }

        const endTime = performance.now();
        const timeToVerify = Math.round(endTime - startTime);
        
        const data: UserStudyData = {
            participantId: `participant_${Date.now()}`,
            task: currentTask,
            group,
            vacsResult: group === 'B' ? vacsResult || undefined : undefined,
            userVerdict,
            isAdequate,
            usefulness,
            timeToVerify,
        };

        onComplete(data);
    };

    if (dataset.length === 0) {
        return <div className="p-8 text-center">No papers in the Gold Standard dataset to create an evaluation task.</div>;
    }

    if (isLoading || !currentTask) {
        return <LoadingSpinner message="Setting up evaluation task..." />;
    }

    return (
        <div className="container mx-auto p-8 max-w-4xl">
            <h1 className="text-2xl font-bold mb-2">Evaluation Task</h1>
            <p className="text-muted-foreground mb-6">Please evaluate the following claim based on the provided paper abstract.</p>

            <div className="p-4 border rounded-lg bg-card mb-6">
                <h2 className="font-semibold text-lg">{currentTask.paper.title} ({currentTask.paper.year})</h2>
                <p className="text-sm text-muted-foreground">{currentTask.paper.authors}</p>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{currentTask.paper.abstract}</p>
            </div>
            
            <div className="p-4 border-2 border-primary rounded-lg bg-primary/5 mb-6">
                <p className="text-sm text-muted-foreground mb-1">Claim to evaluate:</p>
                <p className="font-semibold text-foreground">{currentTask.claim}</p>
            </div>

            {group === 'B' && vacsResult && (
                <details className="mb-6">
                    <summary className="cursor-pointer text-primary font-medium">Show VACS Analysis</summary>
                    <div className="mt-2 border p-4 rounded-lg">
                        {/* A simplified display reusing some logic/styles from VerificationModal */}
                        <div className="flex justify-between items-center bg-muted/50 p-4 rounded-lg border">
                            <div><h3 className="text-lg font-bold text-foreground">VACS Result</h3></div>
                            <div className="text-right">
                                <div className={`text-4xl font-bold ${ vacsResult.verdict === 'Verified' ? 'text-green-600' : 'text-yellow-600'}`}>{vacsResult.vacs}</div>
                            </div>
                        </div>
                    </div>
                </details>
            )}

            <div className="space-y-6">
                <div>
                    <label className="font-semibold block mb-2">1. Based on the abstract, is the claim correct?</label>
                    <div className="flex gap-2">
                        <button onClick={() => setUserVerdict('Correct')} className={`px-4 py-2 rounded-md ${userVerdict === 'Correct' ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>Correct</button>
                        <button onClick={() => setUserVerdict('Incorrect')} className={`px-4 py-2 rounded-md ${userVerdict === 'Incorrect' ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>Incorrect</button>
                    </div>
                </div>

                 <div>
                    <label className="font-semibold block mb-2">2. Is the provided information (abstract {group === 'B' && 'and VACS analysis'}) adequate to make this judgment?</label>
                    <div className="flex gap-2">
                        <button onClick={() => setIsAdequate('Yes')} className={`px-4 py-2 rounded-md ${isAdequate === 'Yes' ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>Yes</button>
                        <button onClick={() => setIsAdequate('No')} className={`px-4 py-2 rounded-md ${isAdequate === 'No' ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>No</button>
                    </div>
                </div>

                <div>
                    <label className="font-semibold block mb-2">3. How useful was the provided information for the task? (1=Not useful, 5=Very useful)</label>
                    <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map(val => (
                            <button key={val} onClick={() => setUsefulness(val)} className={`w-10 h-10 rounded-md ${usefulness === val ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>{val}</button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-8 pt-4 border-t text-right">
                <button onClick={handleSubmit} className="h-10 px-6 font-semibold rounded-md bg-green-600 text-white hover:bg-green-700">Submit Evaluation</button>
            </div>
        </div>
    );
};