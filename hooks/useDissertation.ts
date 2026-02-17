import { useState } from 'react';
import type {
    GoldStandardPaper,
    TestHarnessResult,
    UserStudyData
} from '../types';
import * as verificationService from '../services/verificationService';
import { analyticsService } from '../services/analyticsService';

export const useDissertation = () => {
    const [goldStandardDataset, setGoldStandardDataset] = useState<GoldStandardPaper[]>([]);
    const [testHarnessResults, setTestHarnessResults] = useState<TestHarnessResult[]>([]);
    const [userStudyData, setUserStudyData] = useState<UserStudyData[]>([]);

    const handleUpdateGoldStandardPaper = (updatedPaper: GoldStandardPaper) => {
        setGoldStandardDataset(prev => prev.map(p => p.paper_id === updatedPaper.paper_id ? updatedPaper : p));
    };

    const handleRunTestHarness = async () => {
        analyticsService.logEvent('test_harness_run_started', { datasetSize: goldStandardDataset.length });
        const results: TestHarnessResult[] = [];
        for (const paper of goldStandardDataset) {
            try {
                const vacsResult = await verificationService.verifyPaper(paper.paper_id, paper.title);

                // Map VACS verdict to our label system for comparison
                const vacsLabel = vacsResult.verdict === 'Verified' ? 'verified'
                                : vacsResult.verdict === 'Questionable' ? 'refuted'
                                : 'inconclusive';

                const isCorrect = vacsLabel === paper.label;

                results.push({
                    paperId: paper.paper_id,
                    vacsResult,
                    groundTruth: paper,
                    isCorrect,
                    precisionAt1: isCorrect ? 1 : 0,
                });
            } catch (error) {
                console.error(`Failed to verify paper ${paper.paper_id}`, error);
            }
        }
        setTestHarnessResults(results);
        const accuracy = results.length > 0 ? (results.filter(r => r.isCorrect).length / results.length) * 100 : 0;
        analyticsService.logEvent('test_harness_run_completed', {
            testCount: results.length,
            accuracy: parseFloat(accuracy.toFixed(2))
        });
    };

    const handleSaveUserStudyData = (data: UserStudyData) => {
        analyticsService.logEvent('user_study_task_completed', { studyData: data });
        setUserStudyData(prev => [...prev, data]);
    };

    return {
        goldStandardDataset, setGoldStandardDataset,
        testHarnessResults, setTestHarnessResults,
        userStudyData, setUserStudyData,
        handleUpdateGoldStandardPaper,
        handleRunTestHarness,
        handleSaveUserStudyData
    };
};
