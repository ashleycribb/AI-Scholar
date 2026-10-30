import React, { useState } from 'react';
import type { UserSettings } from '../types';
import { ProxyIcon } from './icons/ProxyIcon';
import { Library, ShieldCheck, ExternalLink, Award, CheckCircle2 } from 'lucide-react';

interface ProxySettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: UserSettings;
    onSave: (settings: UserSettings) => void;
}

interface UniversityPreset {
    id: string;
    name: string;
    proxyUrl: string;
    description: string;
}

const UNIVERSITY_PRESETS: UniversityPreset[] = [
    {
        id: 'uncw',
        name: 'UNC Wilmington (Randall Library / UNCW SSO)',
        proxyUrl: 'https://login.microsoftonline.com/uncw.edu',
        description: 'Direct Microsoft SSO authentication for UNC Wilmington faculty, graduate students, and doctoral researchers.'
    },
    {
        id: 'harvard',
        name: 'Harvard University (HOLLIS / HarvardKey)',
        proxyUrl: 'https://ezp-prod1.hul.harvard.edu/login?url=',
        description: 'Harvard University Library EZProxy gateway for Harvard faculty and affiliates.'
    },
    {
        id: 'stanford',
        name: 'Stanford University (SearchWorks / StanfordPass)',
        proxyUrl: 'https://stanford.idm.oclc.org/login?url=',
        description: 'Stanford University Libraries authentication bridge.'
    },
    {
        id: 'mit',
        name: 'Massachusetts Institute of Technology (MIT Libraries)',
        proxyUrl: 'https://libproxy.mit.edu/login?url=',
        description: 'Touchstone authentication for MIT researchers and students.'
    },
    {
        id: 'oxford',
        name: 'University of Oxford (Bodleian Libraries / SOLO)',
        proxyUrl: 'https://ox.libguides.com/er.php?b=p',
        description: 'Oxford Single Sign-On for Bodleian subscription repositories.'
    },
    {
        id: 'cambridge',
        name: 'University of Cambridge (iDiscover / Raven)',
        proxyUrl: 'https://ezproxy.lib.cam.ac.uk/login?url=',
        description: 'University of Cambridge Raven authentication proxy.'
    },
    {
        id: 'columbia',
        name: 'Columbia University (CLIO EZProxy)',
        proxyUrl: 'https://ezproxy.cul.columbia.edu/login?url=',
        description: 'Columbia University Libraries electronic resource proxy.'
    },
    {
        id: 'berkeley',
        name: 'UC Berkeley (OskiCat / CalNet SSO)',
        proxyUrl: 'https://libproxy.berkeley.edu/login?url=',
        description: 'UC Berkeley CalNet authentication gateway.'
    },
    {
        id: 'custom',
        name: 'Custom Institutional Proxy / SSO Endpoint',
        proxyUrl: '',
        description: 'Enter your university or institution EZProxy URL or SSO login endpoint manually.'
    }
];

export const ProxySettingsModal: React.FC<ProxySettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
    const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
        const found = UNIVERSITY_PRESETS.find(p => p.name === settings.institutionName || p.proxyUrl === settings.institutionalProxy);
        return found ? found.id : 'uncw';
    });
    const [proxyUrl, setProxyUrl] = useState(settings.institutionalProxy || 'https://login.microsoftonline.com/uncw.edu');
    const [instName, setInstName] = useState(settings.institutionName || 'UNC Wilmington');
    const [oaiUrl, setOaiUrl] = useState(settings.oaiEndpoint || '');
    const [oaiEnabled, setOaiEnabled] = useState(settings.isOaiEnabled || false);

    // ORCID & Institutional Profile
    const [orcidId, setOrcidId] = useState(settings.orcidId || '');
    const [deptName, setDeptName] = useState(settings.departmentName || '');
    const [advisorName, setAdvisorName] = useState(settings.advisorName || '');
    const [grantNumber, setGrantNumber] = useState(settings.grantAwardNumber || '');
    
    // Scholar Bridge State
    const [scholarId, setScholarId] = useState(settings.scholarBridgeUserId || '');
    const [scholarKey, setScholarKey] = useState(settings.scholarBridgeApiKey || '');
    const [scholarEnabled, setScholarEnabled] = useState(settings.isScholarBridgeEnabled || false);

    // SerpApi State
    const [serpApiEnabled, setSerpApiEnabled] = useState(settings.isSerpApiEnabled || false);
    const [serpApiKey, setSerpApiKey] = useState(settings.serpApiKey || '');

    if (!isOpen) return null;

    const handlePresetChange = (presetId: string) => {
        setSelectedPresetId(presetId);
        const preset = UNIVERSITY_PRESETS.find(p => p.id === presetId);
        if (preset && preset.id !== 'custom') {
            setInstName(preset.name.split(' (')[0]);
            setProxyUrl(preset.proxyUrl);
        }
    };

    const handleSave = () => {
        onSave({
            ...settings,
            institutionalProxy: proxyUrl.trim(),
            institutionName: instName.trim(),
            orcidId: orcidId.trim(),
            departmentName: deptName.trim(),
            advisorName: advisorName.trim(),
            grantAwardNumber: grantNumber.trim(),
            oaiEndpoint: oaiUrl.trim(),
            isOaiEnabled: oaiEnabled,
            scholarBridgeUserId: scholarId.trim(),
            scholarBridgeApiKey: scholarKey.trim(),
            isScholarBridgeEnabled: scholarEnabled,
            isSerpApiEnabled: serpApiEnabled,
            serpApiKey: serpApiKey.trim()
        });
        onClose();
    };

    const isOrcidValid = orcidId.trim().length === 0 || /^\d{4}-\d{4}-\d{4}-[\dX]{4}$/.test(orcidId.trim());

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl border border-slate-200 flex flex-col overflow-hidden animate-fade-in">
                <header className="p-5 border-b border-slate-200 bg-slate-50/80 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-slate-900 text-white p-2.5 rounded-xl shadow-2xs">
                            <Library className="w-5 h-5 text-indigo-300" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">Institutional SSO & Library Gateway</h2>
                            <p className="text-xs text-slate-500 font-medium">Accredited EZProxy presets, ORCID researcher profile & indices</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </header>

                <main className="p-6 space-y-6 overflow-y-auto max-h-[72vh]">
                    {/* SECTION 1: Institutional Library Preset */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                <Library className="w-4 h-4 text-indigo-600" />
                                Institutional Library & EZProxy Configuration
                            </h3>
                            <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                                EZProxy / SSO
                            </span>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Select University Preset</label>
                            <select
                                value={selectedPresetId}
                                onChange={(e) => handlePresetChange(e.target.value)}
                                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-400"
                            >
                                {UNIVERSITY_PRESETS.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            <p className="text-[11px] text-slate-500 mt-1">
                                {UNIVERSITY_PRESETS.find(p => p.id === selectedPresetId)?.description}
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            <div>
                                <label className="block text-[11px] font-medium text-slate-600 mb-1">Institution Name</label>
                                <input 
                                    type="text"
                                    value={instName}
                                    onChange={(e) => setInstName(e.target.value)}
                                    className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium"
                                    placeholder="e.g. UNC Wilmington"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-medium text-slate-600 mb-1">Proxy / SSO Endpoint URL</label>
                                <input 
                                    type="text"
                                    value={proxyUrl}
                                    onChange={(e) => setProxyUrl(e.target.value)}
                                    className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-mono"
                                    placeholder="https://..."
                                />
                            </div>
                        </div>
                    </div>

                    <hr className="border-slate-100" />

                    {/* SECTION 2: ORCID & Researcher Credentials */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                <Award className="w-4 h-4 text-emerald-600" />
                                ORCID Researcher Identity & Department Provenance
                            </h3>
                            {orcidId && isOrcidValid && (
                                <a
                                    href={`https://orcid.org/${orcidId.trim()}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-emerald-700 font-semibold inline-flex items-center gap-1 hover:underline"
                                >
                                    <span>Verify ORCID</span>
                                    <ExternalLink className="w-3 h-3" />
                                </a>
                            )}
                        </div>

                        <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-xl text-xs text-emerald-900 leading-relaxed">
                            Connecting your verified ORCID iD ensures all literature snapshots, review protocols, and Local Lab session payloads are permanently attributed to your academic record.
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    ORCID iD <span className="text-slate-400 font-normal">(0000-000X-XXXX-XXXX)</span>
                                </label>
                                <input 
                                    type="text"
                                    value={orcidId}
                                    onChange={(e) => setOrcidId(e.target.value)}
                                    className={`w-full h-9 px-3 rounded-lg border bg-white text-xs font-mono ${
                                        isOrcidValid ? 'border-slate-200' : 'border-rose-300 bg-rose-50/50'
                                    }`}
                                    placeholder="0000-0002-1825-0097"
                                />
                                {!isOrcidValid && (
                                    <span className="text-[10px] text-rose-600 block mt-0.5">Format must match 0000-000X-XXXX-XXXX</span>
                                )}
                            </div>
                            <div>
                                <label className="block text-[11px] font-medium text-slate-600 mb-1">Academic Department</label>
                                <input 
                                    type="text"
                                    value={deptName}
                                    onChange={(e) => setDeptName(e.target.value)}
                                    className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs"
                                    placeholder="e.g. Department of Computer Science & HCI"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-medium text-slate-600 mb-1">Faculty Advisor / PI</label>
                                <input 
                                    type="text"
                                    value={advisorName}
                                    onChange={(e) => setAdvisorName(e.target.value)}
                                    className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs"
                                    placeholder="e.g. Dr. Young Baek"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-medium text-slate-600 mb-1">Grant / Award Number</label>
                                <input 
                                    type="text"
                                    value={grantNumber}
                                    onChange={(e) => setGrantNumber(e.target.value)}
                                    className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-mono"
                                    placeholder="e.g. NSF-2401928"
                                />
                            </div>
                        </div>
                    </div>

                    <hr className="border-slate-100" />

                    {/* SECTION 3: Google Scholar (SerpApi) */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                <ShieldCheck className="w-4 h-4 text-blue-600" />
                                Google Scholar Indexing (SerpApi)
                            </h3>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={serpApiEnabled} onChange={(e) => setSerpApiEnabled(e.target.checked)} className="sr-only peer" />
                                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-900"></div>
                            </label>
                        </div>
                        
                        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600 leading-relaxed">
                            Enables direct multi-index querying across Google Scholar index nodes.
                        </div>

                        {serpApiEnabled && (
                            <div>
                                <label className="block text-[11px] font-medium text-slate-600 mb-1">SerpApi Key</label>
                                <input 
                                    type="password"
                                    value={serpApiKey}
                                    onChange={(e) => setSerpApiKey(e.target.value)}
                                    className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-mono"
                                    placeholder="Enter your SerpApi Key"
                                />
                            </div>
                        )}
                    </div>
                </main>

                <footer className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5">
                    <button onClick={onClose} className="px-4 h-9 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg">
                        Cancel
                    </button>
                    <button 
                        onClick={handleSave}
                        className="px-5 h-9 rounded-lg bg-slate-900 text-white font-semibold text-xs hover:bg-slate-800 shadow-2xs transition-all"
                    >
                        Save & Apply Credentials
                    </button>
                </footer>
            </div>
        </div>
    );
};
