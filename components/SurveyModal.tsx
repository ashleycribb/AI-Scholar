
import React, { useState } from 'react';
import { CustomDropdown } from './CustomDropdown';

interface SurveyModalProps {
    isOpen: boolean;
    taskId: string;
    onSubmit: (response: Record<string, any>) => void;
}

export const SurveyModal: React.FC<SurveyModalProps> = ({ isOpen, taskId, onSubmit }) => {
    const [answers, setAnswers] = useState<Record<string, string>>({});

    if (!isOpen) return null;

    const handleChange = (name: string, value: string) => {
        setAnswers(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(answers);
    };

    const renderLikert = (name: string, label: string, leftLabel: string, rightLabel: string, min = 1, max = 5) => (
        <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
            <div className="flex justify-between px-2 max-w-md">
                {Array.from({ length: max - min + 1 }, (_, i) => i + min).map(num => (
                    <label key={num} className="flex flex-col items-center cursor-pointer">
                        <input 
                            type="radio" 
                            name={name} 
                            value={num} 
                            checked={answers[name] === String(num)}
                            onChange={e => handleChange(name, e.target.value)}
                            className="h-4 w-4 text-primary focus:ring-primary"
                            required
                        />
                        <span className="text-xs mt-1 text-gray-500">{num}</span>
                    </label>
                ))}
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1 px-2 max-w-md">
                <span>{leftLabel}</span>
                <span>{rightLabel}</span>
            </div>
        </div>
    );

    const renderComparison = (name: string, label: string) => (
        <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
            <div className="flex justify-between px-2 max-w-md">
                {[1, 2, 3, 4, 5].map(num => (
                    <label key={num} className="flex flex-col items-center cursor-pointer">
                        <input 
                            type="radio" 
                            name={name} 
                            value={num} 
                            checked={answers[name] === String(num)}
                            onChange={e => handleChange(name, e.target.value)}
                            className="h-4 w-4 text-primary focus:ring-primary"
                            required
                        />
                        <span className="text-xs mt-1 text-gray-500">{num}</span>
                    </label>
                ))}
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1 px-2 max-w-md">
                <span className="w-20 text-center">Strongly prefer GS</span>
                <span className="w-20 text-center">Neutral</span>
                <span className="w-20 text-center">Strongly prefer App</span>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-background/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl border my-8">
                <header className="bg-primary px-6 py-4 sticky top-0 z-10 rounded-t-xl">
                    <h2 className="text-xl font-bold text-white">Study Session Survey</h2>
                    <p className="text-primary-foreground/80 text-sm">Please answer the following questions based on your experience.</p>
                </header>
                <form onSubmit={handleSubmit} className="p-6 space-y-8 max-h-[75vh] overflow-y-auto">
                    
                    <section>
                        <h3 className="text-lg font-bold text-gray-900 border-b pb-2 mb-4">Section 1 – Background</h3>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">1. What is your current stage in your doctoral program?</label>
                                <CustomDropdown
                                    value={answers.stage || ''}
                                    options={[
                                        { id: '1', name: '1 = First year coursework' },
                                        { id: '2', name: '2 = Advanced coursework' },
                                        { id: '3', name: '3 = Proposal stage' },
                                        { id: '4', name: '4 = Data collection/analysis' },
                                        { id: '5', name: '5 = Writing up / near completion' }
                                    ]}
                                    onChange={(val) => handleChange('stage', val)}
                                    formatLabel={(n) => n}
                                    className="w-full"
                                    triggerClassName="w-full h-11 px-4 bg-white border border-gray-300 rounded-md justify-between"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">2. How often do you currently use Google Scholar for your research?</label>
                                <CustomDropdown
                                    value={answers.gsFrequency || ''}
                                    options={[
                                        { id: '1', name: '1 = Never' },
                                        { id: '2', name: '2 = A few times per term' },
                                        { id: '3', name: '3 = Monthly' },
                                        { id: '4', name: '4 = Weekly' },
                                        { id: '5', name: '5 = Daily or almost daily' }
                                    ]}
                                    onChange={(val) => handleChange('gsFrequency', val)}
                                    formatLabel={(n) => n}
                                    className="w-full"
                                    triggerClassName="w-full h-11 px-4 bg-white border border-gray-300 rounded-md justify-between"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">3. Before this study, had you used AI‑enhanced tools (e.g., ChatGPT, Elicit, ResearchRabbit) to support your literature review?</label>
                                <CustomDropdown
                                    value={answers.aiUsage || ''}
                                    options={[
                                        { id: '0', name: '0 = No' },
                                        { id: '1', name: '1 = Yes, occasionally' },
                                        { id: '2', name: '2 = Yes, regularly' }
                                    ]}
                                    onChange={(val) => handleChange('aiUsage', val)}
                                    formatLabel={(n) => n}
                                    className="w-full"
                                    triggerClassName="w-full h-11 px-4 bg-white border border-gray-300 rounded-md justify-between"
                                />
                            </div>
                        </div>
                    </section>

                    <section className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                        <h3 className="text-md font-bold text-blue-900 mb-2">Section 2 – Task framing</h3>
                        <p className="text-sm text-blue-800">
                            You have just completed two literature tasks:<br/>
                            - <strong>Task A:</strong> Using Google Scholar as your primary tool.<br/>
                            - <strong>Task B:</strong> Using the doctoral research web app.<br/><br/>
                            Please keep both experiences in mind as you answer the following questions.
                        </p>
                    </section>

                    <section>
                        <h3 className="text-lg font-bold text-gray-900 border-b pb-2 mb-4">Section 3 – Perceived speed and efficiency</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {renderLikert('gsSpeed', 'Google Scholar: How efficiently were you able to find relevant literature?', 'Very inefficient', 'Very efficient')}
                            {renderLikert('appSpeed', 'Doctoral App: How efficiently were you able to find relevant literature?', 'Very inefficient', 'Very efficient')}
                        </div>
                    </section>

                    <section>
                        <h3 className="text-lg font-bold text-gray-900 border-b pb-2 mb-4">Section 4 – Perceived accuracy, trust, and citation quality</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {renderLikert('gsAccuracy', 'Google Scholar: How accurate and relevant were the top search results?', 'Not at all accurate', 'Highly accurate')}
                            {renderLikert('appAccuracy', 'Doctoral App: How accurate and relevant were the top search results?', 'Not at all accurate', 'Highly accurate')}
                            
                            {renderLikert('gsTrust', 'Google Scholar: How much did you trust the information provided?', 'Did not trust at all', 'Completely trusted')}
                            {renderLikert('appTrust', 'Doctoral App: How much did you trust the information provided?', 'Did not trust at all', 'Completely trusted')}
                            
                            {renderLikert('gsCitation', 'Google Scholar: How easy was it to evaluate the quality/impact of the sources?', 'Very difficult', 'Very easy')}
                            {renderLikert('appCitation', 'Doctoral App: How easy was it to evaluate the quality/impact of the sources?', 'Very difficult', 'Very easy')}
                        </div>
                    </section>

                    <section>
                        <h3 className="text-lg font-bold text-gray-900 border-b pb-2 mb-4">Section 5 – Perceived support for reasoning and gap finding</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {renderLikert('gsReasoning', 'Google Scholar: How well did the tool help you synthesize information across multiple papers?', 'Not at all well', 'Extremely well')}
                            {renderLikert('appReasoning', 'Doctoral App: How well did the tool help you synthesize information across multiple papers?', 'Not at all well', 'Extremely well')}
                            
                            {renderLikert('gsGaps', 'Google Scholar: How helpful was the tool in identifying research gaps or new directions?', 'Not at all helpful', 'Extremely helpful')}
                            {renderLikert('appGaps', 'Doctoral App: How helpful was the tool in identifying research gaps or new directions?', 'Not at all helpful', 'Extremely helpful')}
                        </div>
                    </section>

                    <section>
                        <h3 className="text-lg font-bold text-gray-900 border-b pb-2 mb-4">Section 6 – Transparency and explainability</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {renderLikert('gsTransparency', 'Google Scholar: Was it clear *why* specific papers were recommended to you?', 'Not at all clear', 'Completely clear')}
                            {renderLikert('appTransparency', 'Doctoral App: Was it clear *why* specific papers were recommended to you?', 'Not at all clear', 'Completely clear')}
                            
                            {renderLikert('gsUnderstanding', 'Google Scholar: Did the tool help you quickly understand the core methodology of the papers?', 'Not at all', 'Extremely well')}
                            {renderLikert('appUnderstanding', 'Doctoral App: Did the tool help you quickly understand the core methodology of the papers?', 'Not at all', 'Extremely well')}
                        </div>
                    </section>

                    <section>
                        <h3 className="text-lg font-bold text-gray-900 border-b pb-2 mb-4">Section 7 – Overall usability and preference</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {renderLikert('gsUsability', 'Google Scholar: How easy was the tool to use overall?', 'Very difficult', 'Very easy')}
                            {renderLikert('appUsability', 'Doctoral App: How easy was the tool to use overall?', 'Very difficult', 'Very easy')}
                            
                            {renderLikert('gsSatisfaction', 'Google Scholar: How satisfied were you with the tool for this specific task?', 'Very dissatisfied', 'Very satisfied')}
                            {renderLikert('appSatisfaction', 'Doctoral App: How satisfied were you with the tool for this specific task?', 'Very dissatisfied', 'Very satisfied')}
                        </div>
                    </section>

                    <section>
                        <h3 className="text-lg font-bold text-gray-900 border-b pb-2 mb-4">Section 8 – Direct comparison items</h3>
                        <p className="text-sm text-gray-600 mb-4">For the following questions, please compare your experience using both tools.</p>
                        <div className="space-y-6">
                            {renderComparison('compareSpeed', '1. Which tool allowed you to complete the task faster?')}
                            {renderComparison('compareQuality', '2. Which tool led you to higher quality or more relevant papers?')}
                            {renderComparison('compareTrust', '3. Which tool gave you more confidence in your findings?')}
                            {renderComparison('compareOverall', '4. Overall, which tool would you prefer to use for your daily doctoral research?')}
                        </div>
                    </section>

                    <section>
                        <h3 className="text-lg font-bold text-gray-900 border-b pb-2 mb-4">Section 9 – Open-ended questions</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">1. What specific features of the Doctoral App did you find most valuable compared to Google Scholar?</label>
                                <textarea 
                                    value={answers.openAppValue || ''}
                                    onChange={e => handleChange('openAppValue', e.target.value)}
                                    className="w-full border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-primary focus:border-transparent"
                                    rows={3}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">2. What features were missing from the Doctoral App, or what did Google Scholar do better?</label>
                                <textarea 
                                    value={answers.openAppMissing || ''}
                                    onChange={e => handleChange('openAppMissing', e.target.value)}
                                    className="w-full border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-primary focus:border-transparent"
                                    rows={3}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">3. Any other comments or suggestions for improving the Doctoral App?</label>
                                <textarea 
                                    value={answers.openGeneral || ''}
                                    onChange={e => handleChange('openGeneral', e.target.value)}
                                    className="w-full border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-primary focus:border-transparent"
                                    rows={3}
                                />
                            </div>
                        </div>
                    </section>

                    <div className="pt-6 border-t flex justify-end sticky bottom-0 bg-white pb-2">
                        <button type="submit" className="bg-primary text-primary-foreground px-8 py-3 rounded-lg font-bold hover:bg-primary/90 transition-colors shadow-lg">
                            Submit Survey & Return to Dashboard
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

