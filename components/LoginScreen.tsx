
import React, { useState, useEffect } from 'react';
import { UserIcon } from './icons/UserIcon';
import { ScholarIcon } from './icons/ScholarIcon';
import { authService } from '../services/authService';
import type { UserSession } from '../types';
import { ShieldCheck, GraduationCap, Award, Compass, KeyRound, ArrowRight } from 'lucide-react';

interface LoginScreenProps {
    isOpen: boolean;
    onClose: () => void;
    onLogin: (user: UserSession) => void;
    initialCode?: string;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ isOpen, onClose, onLogin, initialCode }) => {
    const [mode, setMode] = useState<'selection' | 'participant' | 'pi_researcher' | 'committee' | 'guest'>('selection');
    const [inputValue, setInputValue] = useState('');
    const [statusNote, setStatusNote] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && initialCode) {
            setMode('participant');
            setInputValue(initialCode);
        } else if (isOpen) {
            setMode('selection');
            setInputValue('');
            setStatusNote(null);
        }
    }, [isOpen, initialCode]);

    if (!isOpen) return null;

    const handleParticipantLogin = (e: React.FormEvent) => {
        e.preventDefault();
        const code = inputValue.trim();
        if (!code) return;
        const result = authService.redeemStudyInvite(code);
        onLogin(result.session);
        onClose();
    };

    const handlePiResearcherLogin = (e: React.FormEvent) => {
        e.preventDefault();
        const session = authService.loginAsResearcher(inputValue, 'pi_researcher');
        onLogin(session);
        onClose();
    };

    const handleCommitteeLogin = (e: React.FormEvent) => {
        e.preventDefault();
        const session = authService.loginAsCommitteeMember(inputValue);
        onLogin(session);
        onClose();
    };

    const handleGuestLogin = () => {
        const session = authService.loginAsGuest();
        onLogin(session);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="max-w-lg w-full bg-white p-7 sm:p-8 rounded-3xl shadow-2xl border border-slate-200/80 relative animate-fade-in">
                <button 
                    onClick={onClose}
                    className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                    aria-label="Close dialog"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                <div className="text-center mb-6">
                    <div className="mx-auto h-12 w-12 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mb-3.5 shadow-xs">
                        <ScholarIcon className="h-6 w-6" />
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Study Access & Roles</h2>
                    <p className="mt-1.5 text-xs text-slate-500 max-w-sm mx-auto">
                        {mode === 'selection' && "Select your access tier or redeem an anonymous doctoral study invite."}
                        {mode === 'participant' && "Enter your study invite token for de-identified participation."}
                        {mode === 'pi_researcher' && "Access study instrumentation and Yet SQL LRS telemetry."}
                        {mode === 'committee' && "Dissertation committee review mode for evaluation sessions."}
                    </p>
                </div>

                {mode === 'selection' && (
                    <div className="space-y-3 mt-4">
                        {/* 1. Participant (Redeem Code) */}
                        <button
                            onClick={() => { setMode('participant'); setInputValue(''); }}
                            className="w-full flex items-center justify-between p-3.5 sm:p-4 border-2 border-emerald-100 bg-emerald-50/40 rounded-2xl hover:border-emerald-500 hover:bg-emerald-50/80 transition-all group cursor-pointer text-left"
                        >
                            <div className="flex items-center gap-3.5">
                                <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl group-hover:scale-105 transition-transform">
                                    <KeyRound className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-black text-slate-900">Study Participant</h3>
                                        <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-emerald-200 text-emerald-900 rounded-md">Anonymous</span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">Redeem invite code with de-identified telemetry</p>
                                </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-emerald-600 group-hover:translate-x-0.5 transition-transform" />
                        </button>

                        {/* 2. PI / Researcher */}
                        <button
                            onClick={() => { setMode('pi_researcher'); setInputValue(''); }}
                            className="w-full flex items-center justify-between p-3.5 sm:p-4 border border-slate-200 rounded-2xl hover:border-indigo-400 hover:bg-indigo-50/40 transition-all group cursor-pointer text-left"
                        >
                            <div className="flex items-center gap-3.5">
                                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:scale-105 transition-transform">
                                    <GraduationCap className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-black text-slate-900">Principal Investigator (PI)</h3>
                                        <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 rounded-md">Admin</span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">Full LRS audit trail & instrumentation</p>
                                </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-transform" />
                        </button>

                        {/* 3. Committee Member */}
                        <button
                            onClick={() => { setMode('committee'); setInputValue('Dr. Young Baek'); }}
                            className="w-full flex items-center justify-between p-3.5 sm:p-4 border border-slate-200 rounded-2xl hover:border-amber-400 hover:bg-amber-50/40 transition-all group cursor-pointer text-left"
                        >
                            <div className="flex items-center gap-3.5">
                                <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl group-hover:scale-105 transition-transform">
                                    <Award className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-black text-slate-900">Committee Member</h3>
                                        <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 rounded-md">Reviewer</span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">e.g., Dr. Young Baek (Committee)</p>
                                </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-transform" />
                        </button>

                        {/* 4. Guest */}
                        <div className="pt-2 text-center">
                            <button
                                onClick={handleGuestLogin}
                                className="text-xs font-bold text-slate-500 hover:text-slate-900 hover:underline transition-colors"
                            >
                                Continue as Guest Scholar (Open Access)
                            </button>
                        </div>
                    </div>
                )}

                {/* Participant Form */}
                {mode === 'participant' && (
                    <form onSubmit={handleParticipantLogin} className="space-y-5 mt-4">
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label htmlFor="inviteCode" className="block text-[11px] font-black uppercase tracking-wider text-slate-700">
                                    Study Invite Token
                                </label>
                                <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                                    <ShieldCheck className="w-3.5 h-3.5" /> IRB De-Identified
                                </span>
                            </div>
                            <input
                                id="inviteCode"
                                type="text"
                                required
                                className="block w-full px-3.5 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm font-mono tracking-wider uppercase placeholder:normal-case placeholder:font-sans"
                                placeholder="e.g. COHORT-A or STUDY-2026-X"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value.toUpperCase())}
                                autoFocus
                            />
                            <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
                                Generates an anonymous UUID and identifier (e.g. <span className="font-mono font-bold text-slate-700">Participant #88A</span>). Real names and emails are never recorded in telemetry.
                            </p>
                        </div>
                        <div className="flex gap-2.5 pt-1">
                            <button 
                                type="button" 
                                onClick={() => setMode('selection')} 
                                className="flex-1 py-2.5 px-4 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                Back
                            </button>
                            <button 
                                type="submit" 
                                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition-all active:scale-98 cursor-pointer"
                            >
                                Redeem & Enter Study
                            </button>
                        </div>
                    </form>
                )}

                {/* PI Researcher Form */}
                {mode === 'pi_researcher' && (
                    <form onSubmit={handlePiResearcherLogin} className="space-y-5 mt-4">
                        <div>
                            <label htmlFor="piName" className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
                                Principal Investigator Name / Identifier
                            </label>
                            <input
                                id="piName"
                                type="text"
                                className="block w-full px-3.5 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                placeholder="e.g. Dr. Ashley Cribb (PI)"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div className="flex gap-2.5 pt-1">
                            <button 
                                type="button" 
                                onClick={() => setMode('selection')} 
                                className="flex-1 py-2.5 px-4 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                Back
                            </button>
                            <button 
                                type="submit" 
                                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all active:scale-98 cursor-pointer"
                            >
                                Login as PI
                            </button>
                        </div>
                    </form>
                )}

                {/* Committee Form */}
                {mode === 'committee' && (
                    <form onSubmit={handleCommitteeLogin} className="space-y-5 mt-4">
                        <div>
                            <label htmlFor="committeeName" className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
                                Committee Member Name
                            </label>
                            <input
                                id="committeeName"
                                type="text"
                                className="block w-full px-3.5 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm"
                                placeholder="e.g. Dr. Young Baek"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                autoFocus
                            />
                            <p className="mt-1.5 text-[11px] text-slate-500">
                                Will be displayed as <span className="font-semibold text-slate-700">{inputValue.trim() ? `${inputValue.trim()} (Committee)` : 'Dr. Young Baek (Committee)'}</span>
                            </p>
                        </div>
                        <div className="flex gap-2.5 pt-1">
                            <button 
                                type="button" 
                                onClick={() => setMode('selection')} 
                                className="flex-1 py-2.5 px-4 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                Back
                            </button>
                            <button 
                                type="submit" 
                                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-amber-600 hover:bg-amber-700 shadow-md shadow-amber-600/20 transition-all active:scale-98 cursor-pointer"
                            >
                                Enter Committee Mode
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

