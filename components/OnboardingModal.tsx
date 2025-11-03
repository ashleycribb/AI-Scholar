
import React, { useState } from 'react';

interface OnboardingModalProps {
    onComplete: () => void;
    onSkip: () => void;
}

const onboardingSteps = [
    {
        title: "Welcome to the AI Research Explorer!",
        content: "This quick tour will guide you through the key features designed to accelerate your literature review process."
    },
    {
        title: "1. Ask Research Questions",
        content: "Instead of just keywords, you can ask full questions like 'What is the impact of LLMs on scientific writing?'. The AI will generate a hypothetical answer to find semantically related papers."
    },
    {
        title: "2. Understand Your Results",
        content: "Each paper has a 'Relevance' score indicating how closely it matches your query's meaning. Use this to quickly identify the most relevant articles."
    },
    {
        title: "3. Use the Workspace Panel",
        content: "Click on any paper to see its details here. You'll find the abstract, key concepts, and powerful AI tools for deeper analysis."
    },
    {
        title: "4. Leverage AI Tools",
        content: "For any selected paper, you can find connected literature, perform a structured analysis, or generate new search ideas—all with a single click."
    },
    {
        title: "5. Organize with Projects",
        content: "Use the 'Workspace' tab to save papers and organize them into colored projects. You can then run analysis on an entire project."
    }
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ onComplete, onSkip }) => {
    const [currentStep, setCurrentStep] = useState(0);

    const handleNext = () => {
        if (currentStep < onboardingSteps.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            handleComplete();
        }
    };

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleComplete = () => {
        localStorage.setItem('onboardingCompleted', 'true');
        onComplete();
    };
    
    const handleSkip = () => {
        localStorage.setItem('onboardingCompleted', 'true');
        onSkip();
    };

    const step = onboardingSteps[currentStep];

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-lg shadow-2xl w-full max-w-lg border transform transition-all">
                <div className="p-6">
                    <h2 className="text-2xl font-bold text-foreground">{step.title}</h2>
                    <p className="mt-4 text-muted-foreground">{step.content}</p>
                </div>

                <div className="p-4 bg-muted/50 border-t border-border flex justify-between items-center">
                    <button onClick={handleSkip} className="text-sm font-medium text-muted-foreground hover:text-foreground">
                        Skip Tour
                    </button>
                    <div className="flex items-center gap-2">
                         <div className="flex items-center gap-2">
                            {onboardingSteps.map((_, index) => (
                                <div
                                    key={index}
                                    className={`w-2 h-2 rounded-full transition-colors ${
                                        index === currentStep ? 'bg-primary' : 'bg-border'
                                    }`}
                                />
                            ))}
                        </div>
                        {currentStep > 0 && (
                            <button onClick={handlePrev} className="h-9 px-4 text-sm font-semibold rounded-md bg-secondary text-secondary-foreground hover:bg-accent">
                                Previous
                            </button>
                        )}
                        <button onClick={handleNext} className="h-9 px-4 text-sm font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                            {currentStep === onboardingSteps.length - 1 ? 'Finish' : 'Next'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
