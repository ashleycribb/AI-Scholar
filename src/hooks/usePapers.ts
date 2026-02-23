import { useState, useEffect } from 'react';
import type { ResearchPaper, Project, AnalysisResult, ChatMessage, ModelDefinition } from '../../types';
import * as apiService from '../../services/apiService';
import * as agentService from '../../services/agentService';
import * as extensionService from '../../services/extensionService';

const PROJECT_COLORS = ['sky', 'green', 'yellow', 'red', 'purple', 'pink', 'indigo', 'teal'];

export const usePapers = (model: ModelDefinition) => {
    const [papers, setPapers] = useState<ResearchPaper[]>([]);
    const [workspacePapers, setWorkspacePapers] = useState<ResearchPaper[]>([]);
    const [selectedPaper, setSelectedPaper] = useState<ResearchPaper | null>(null);
    const [projects, setProjects] = useState<Project[]>([]);
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [projectChats, setProjectChats] = useState<{ [projectId: string]: { history: ChatMessage[], isLoading: boolean } }>({});

    useEffect(() => {
        const handlePaperReceived = (paper: ResearchPaper) => {
            setWorkspacePapers(prev => {
                if (prev.some(p => p.id === paper.id)) {
                    return prev; // Already in workspace
                }
                return [paper, ...prev];
            });
        };

        const cleanup = extensionService.listenForExtensionMessages(
            handlePaperReceived, // onPaperSaved (now used for adding to workspace)
            (paperId) => { // onPaperRemoved
                setWorkspacePapers(prev => prev.filter(p => p.id !== paperId));
            }
        );

        return cleanup;
    }, []);

    const updatePaperState = (paperId: string, updates: Partial<ResearchPaper>) => {
        const updater = (p: ResearchPaper) => p.id === paperId ? { ...p, ...updates } : p;
        setPapers(prev => prev.map(updater));
        setWorkspacePapers(prev => prev.map(updater));
        if (selectedPaper?.id === paperId) {
            setSelectedPaper(prev => prev ? { ...prev, ...updates } : null);
        }
    };

    const handleSelectPaper = async (paper: ResearchPaper) => {
        setSelectedPaper(paper);

        // Fetch open access PDF if DOI is available and not yet fetched
        if (paper.doi && !paper.openAccessState) {
            updatePaperState(paper.id, { openAccessState: 'loading' });
            try {
                const url = await apiService.findOpenAccessPdf(paper.doi);
                updatePaperState(paper.id, { openAccessPdfUrl: url || undefined, openAccessState: 'loaded' });
            } catch (error) {
                console.error("Failed to find open access PDF:", error);
                updatePaperState(paper.id, { openAccessState: 'error' });
            }
        }

        // Fetch Key Concepts if not already fetched
        if (!paper.keyConceptsState || paper.keyConceptsState === 'idle') {
            if (paper.abstract.length < 150) {
                 updatePaperState(paper.id, { keyConcepts: [], keyConceptsState: 'loaded' });
            } else {
                updatePaperState(paper.id, { keyConceptsState: 'loading' });
                try {
                    const concepts = await apiService.extractKeyConcepts(paper.abstract, model);
                    updatePaperState(paper.id, { keyConcepts: concepts, keyConceptsState: 'loaded' });
                } catch (error) {
                    console.error("Failed to extract key concepts:", error);
                    updatePaperState(paper.id, { keyConceptsState: 'error' });
                }
            }
        }

        // Fetch Knowledge Graph if not already fetched
        if (!paper.knowledgeGraphState || paper.knowledgeGraphState === 'idle') {
            if (paper.abstract.length < 150) {
                 updatePaperState(paper.id, { knowledgeGraph: { entities: [], relationships: [] }, knowledgeGraphState: 'loaded' });
            } else {
                updatePaperState(paper.id, { knowledgeGraphState: 'loading' });
                try {
                    const graph = await apiService.extractKnowledgeGraph(paper.abstract, model);
                    updatePaperState(paper.id, { knowledgeGraph: graph, knowledgeGraphState: 'loaded' });
                } catch (error) {
                    console.error("Failed to extract knowledge graph:", error);
                    updatePaperState(paper.id, { knowledgeGraphState: 'error' });
                }
            }
        }
    };

    const handleToggleWorkspacePaper = (paper: ResearchPaper) => {
        setWorkspacePapers(prev => {
            const exists = prev.some(p => p.id === paper.id);
            if (exists) {
                // If removing, also remove from any project it's in
                setProjects(projs => projs.map(p => ({...p, paperIds: p.paperIds.filter(id => id !== paper.id) })));
                return prev.filter(p => p.id !== paper.id);
            } else {
                return [...prev, paper];
            }
        });
    };

    const handleCreateProject = (name: string) => {
        const newProject: Project = {
            id: `proj_${Date.now()}`,
            name,
            paperIds: [],
            createdAt: Date.now(),
            color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
            paperStatuses: {},
        };
        setProjects(prev => [...prev, newProject]);
    };

    const handleDeleteProject = (projectId: string) => {
        setProjects(prev => prev.filter(p => p.id !== projectId));
        // Also remove any chat history associated with the project
        setProjectChats(prev => {
            const newChats = {...prev};
            delete newChats[projectId];
            return newChats;
        });
    };

    const handleMovePaperToProject = (paperId: string, projectId: string | null) => {
        setProjects(prevProjects => {
            const newProjects = prevProjects.map(p => ({
                ...p,
                paperIds: p.paperIds.filter(id => id !== paperId),
            }));

            if (projectId) {
                const targetProjectIndex = newProjects.findIndex(p => p.id === projectId);
                if (targetProjectIndex > -1) {
                    newProjects[targetProjectIndex].paperIds.push(paperId);
                }
            }
            return newProjects;
        });
    };

    const handleUpdateProjectColor = (projectId: string, color: string) => {
        setProjects(prev => prev.map(p => p.id === projectId ? { ...p, color } : p));
    };

    const handleIndexPaperForRag = (projectId: string, paperId: string) => {
        setProjects(prev => prev.map(p => {
            if (p.id === projectId) {
                const newStatuses = { ...p.paperStatuses, [paperId]: 'indexing' as const };
                return { ...p, paperStatuses: newStatuses };
            }
            return p;
        }));

        // Simulate indexing delay
        setTimeout(() => {
            setProjects(prev => prev.map(p => {
                if (p.id === projectId) {
                    const newStatuses = { ...p.paperStatuses, [paperId]: 'indexed' as const };
                    return { ...p, paperStatuses: newStatuses };
                }
                return p;
            }));
        }, 2000 + Math.random() * 1000);
    };

    const handleProjectChat = async (projectId: string, message: string) => {
        const project = projects.find(p => p.id === projectId);
        if (!project) return;

        const userMessage: ChatMessage = { role: 'user', parts: [{ text: message }] };

        setProjectChats(prev => ({
            ...prev,
            [projectId]: {
                history: [...(prev[projectId]?.history || []), userMessage],
                isLoading: true,
            }
        }));

        try {
            const projectPapers = project.paperIds.map(id => workspacePapers.find(p => p.id === id)).filter((p): p is ResearchPaper => !!p);

            // The agent service now streams updates. We'll handle them one by one.
            const agentStream = agentService.runAgentTask(message, project, projectPapers, model);

            for await (const update of agentStream) {
                setProjectChats(prev => {
                    const currentHistory = prev[projectId]?.history || [];
                    let newHistory = [...currentHistory];

                    if (update.type === 'tool-start') {
                        newHistory.push({ role: 'tool', parts: [{ toolCall: update.toolCall }] });
                    } else if (update.type === 'tool-end') {
                        // Find the corresponding tool-start message and add the result
                        const lastMsgIndex = newHistory.length - 1;
                        if (newHistory[lastMsgIndex]?.role === 'tool' && newHistory[lastMsgIndex].parts[0].toolCall?.name === update.toolResponse.name) {
                            newHistory[lastMsgIndex].parts[0].toolResponse = update.toolResponse;
                        }
                    } else if (update.type === 'final-answer') {
                        newHistory.push({ role: 'model', parts: [{ text: update.text }] });
                    }

                    return {
                        ...prev,
                        [projectId]: {
                            ...prev[projectId],
                            history: newHistory,
                        },
                    };
                });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "An error occurred.";
            const modelMessage: ChatMessage = { role: 'model', parts: [{ text: `Error: ${errorMessage}` }] };
            setProjectChats(prev => ({
                ...prev,
                [projectId]: {
                    history: [...(prev[projectId]?.history || []), modelMessage],
                    isLoading: false,
                }
            }));
        } finally {
            setProjectChats(prev => ({
                ...prev,
                [projectId]: {
                    ...prev[projectId],
                    isLoading: false,
                }
            }));
        }
    };

    return {
        papers,
        setPapers,
        workspacePapers,
        setWorkspacePapers,
        selectedPaper,
        setSelectedPaper,
        projects,
        setProjects,
        analysis,
        setAnalysis,
        projectChats,
        setProjectChats,
        updatePaperState,
        handleSelectPaper,
        handleToggleWorkspacePaper,
        handleCreateProject,
        handleDeleteProject,
        handleMovePaperToProject,
        handleUpdateProjectColor,
        handleIndexPaperForRag,
        handleProjectChat
    };
};
