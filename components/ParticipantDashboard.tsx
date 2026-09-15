
import React, { useState, useEffect } from 'react';
import type { StudyTask, User, SurveyResponse } from '../types';
import { CheckIcon } from './icons/CheckIcon';
import { analyticsService } from '../services/analyticsService';

interface ParticipantDashboardProps {
    user: User;
    onStartTask: (task: StudyTask) => void;
    onTakeSurvey: () => void;
    completedTasks: string[];
    onMarkCompleted: (taskId: string) => void;
    sessionFinished: boolean;
}

const MOCK_TASKS: StudyTask[] = [
    { 
        id: 'task_a', 
        title: 'Task A: Google Scholar', 
        description: 'Use Google Scholar as your primary tool to find 3 relevant papers for your doctoral research topic.',
        status: 'pending',
        type: 'external'
    },
    { 
        id: 'task_b', 
        title: 'Task B: Doctoral Research App', 
        description: 'Use this web app as your primary tool to find 3 relevant papers for your doctoral research topic.',
        status: 'pending',
        type: 'internal'
    }
];

export const ParticipantDashboard: React.FC<ParticipantDashboardProps> = ({ user, onStartTask, onTakeSurvey, completedTasks, onMarkCompleted, sessionFinished }) => {
    const [tasks, setTasks] = useState<StudyTask[]>(MOCK_TASKS);

    const handleTaskStart = (task: StudyTask) => {
        analyticsService.logEvent('participant_task_started', { 
            taskId: task.id, 
            participantId: user.id,
            timestamp: Date.now() 
        });
        onStartTask(task);
    };

    const allCompleted = tasks.every(task => completedTasks.includes(task.id));

    if (sessionFinished) {
        return (
            <div className="container mx-auto px-4 py-16 max-w-4xl text-center">
                <div className="bg-green-50 rounded-2xl p-12 border border-green-200 shadow-sm">
                    <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckIcon className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-4xl font-bold text-gray-900 mb-4">Thank You!</h1>
                    <p className="text-xl text-gray-600">
                        You have successfully completed all tasks and the final survey. Your responses have been recorded.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8 max-w-4xl">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Welcome, {user.name}</h1>
                <p className="text-gray-500 mt-2">Please complete the following tasks in order. Your interactions are being recorded for research purposes.</p>
            </header>

            <div className="space-y-4 mb-8">
                {tasks.map((task, index) => {
                    const isCompleted = completedTasks.includes(task.id);
                    return (
                        <div key={task.id} className={`p-6 rounded-xl border-2 transition-all ${isCompleted ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 shadow-sm'}`}>
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${isCompleted ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                            {isCompleted ? <CheckIcon className="w-5 h-5" /> : index + 1}
                                        </span>
                                        <h3 className="text-xl font-bold text-gray-900">{task.title}</h3>
                                    </div>
                                    <p className="text-gray-600 ml-11">{task.description}</p>
                                </div>
                                {!isCompleted && task.type === 'external' && (
                                    <button 
                                        onClick={() => onMarkCompleted(task.id)}
                                        className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-shadow shadow-md hover:shadow-lg"
                                    >
                                        Mark as Complete
                                    </button>
                                )}
                                {!isCompleted && task.type === 'internal' && (
                                    <button 
                                        onClick={() => handleTaskStart(task)}
                                        className="px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-shadow shadow-md hover:shadow-lg"
                                    >
                                        Start Task
                                    </button>
                                )}
                                {isCompleted && (
                                    <span className="px-4 py-2 bg-green-100 text-green-700 font-bold rounded-lg text-sm">Completed</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {allCompleted && (
                <div className="flex justify-center mt-12">
                    <button 
                        onClick={onTakeSurvey}
                        className="px-8 py-4 bg-purple-600 text-white text-lg font-bold rounded-xl hover:bg-purple-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1"
                    >
                        Take Final Survey
                    </button>
                </div>
            )}
        </div>
    );
};
