import { useState, useEffect } from 'react';
import type { ResearchPaper, Project, ChatMessage, ModelDefinition } from '@/types';
import * as extensionService from '@/services/extensionService';
import * as agentService from '@/services/agentService';

const PROJECT_COLORS = ['sky', 'green', 'yellow', 'red', 'purple', 'pink', 'indigo', 'teal'];

export const usePapers = () => {
    const [workspacePapers, setWorkspacePapers] = useState<ResearchPaper[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
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

    const updateWorkspacePaper = (paperId: string, updates: Partial<ResearchPaper>) => {
        setWorkspacePapers(prev => prev.map(p => p.id === paperId ? { ...p, ...updates } : p));
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

    const handleProjectChat = async (projectId: string, message: string, model: ModelDefinition) => {
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
                        // Search backwards for matching tool call
                         let found = false;
                         for (let i = lastMsgIndex; i >= 0; i--) {
                             if (newHistory[i]?.role === 'tool' && newHistory[i].parts[0].toolCall?.name === update.toolResponse.name && !newHistory[i].parts[0].toolResponse) {
                                 newHistory[i].parts[0].toolResponse = update.toolResponse;
                                 found = true;
                                 break;
                             }
                         }
                         if (!found) {
                             // Fallback if not found (shouldn't happen with correct stream order)
                             // console.warn("Could not find matching tool-start for tool-end", update);
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
        workspacePapers,
        setWorkspacePapers, // exposed for direct manipulation if needed (e.g., from App.tsx via updateGlobalPaper)
        projects,
        projectChats,
        handleToggleWorkspacePaper,
        handleCreateProject,
        handleDeleteProject,
        handleMovePaperToProject,
        handleUpdateProjectColor,
        handleIndexPaperForRag,
        handleProjectChat,
        updateWorkspacePaper
    };
};
